import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { WorkflowRow } from './types.js';

const RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_CRON = '0 2 * * *'; // daily at 2am

/**
 * TaskReconciler
 *
 * Mirrors QueryJobReconciler. On startup and every 10 minutes:
 *   1. SELECT built-in workflows (is_built_in=true, tenant_id IS NULL)
 *   2. For each workflow, find tenants that have the matching integration
 *   3. INSERT INTO tasks ON CONFLICT (workflow_id, tenant_id) DO NOTHING
 *
 * This ensures every tenant with a relevant integration automatically gets
 * a scheduled task for each built-in workflow — without manual setup.
 */
export class TaskReconciler {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.reconcile();
    this.timer = setInterval(() => this.reconcile(), RECONCILE_INTERVAL_MS);
    Logger.info({
      module: 'TaskReconciler',
      context: 'start',
      message: `Reconciler started (every ${RECONCILE_INTERVAL_MS / 60000}m)`,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reconcile(): Promise<void> {
    try {
      const supabase = getSupabase();

      // Fetch all built-in platform-wide workflows
      const { data: workflows, error: wfError } = await (supabase.from('workflows' as any) as any)
        .select('*')
        .eq('is_built_in', true)
        .is('tenant_id', null);

      if (wfError || !workflows) {
        Logger.error({
          module: 'TaskReconciler',
          context: 'reconcile',
          message: `Error fetching built-in workflows: ${wfError?.message}`,
        });
        return;
      }

      if (workflows.length === 0) {
        Logger.trace({
          module: 'TaskReconciler',
          context: 'reconcile',
          message: 'No built-in workflows found — skipping',
        });
        return;
      }

      let seeded = 0;

      for (const workflow of workflows as WorkflowRow[]) {
        seeded += await this.reconcileWorkflow(workflow);
      }

      if (seeded > 0) {
        Logger.info({
          module: 'TaskReconciler',
          context: 'reconcile',
          message: `Reconcile pass complete — seeded ${seeded} new task(s)`,
        });
      } else {
        Logger.trace({
          module: 'TaskReconciler',
          context: 'reconcile',
          message: 'Reconcile pass complete — no new tasks needed',
        });
      }
    } catch (err) {
      Logger.error({
        module: 'TaskReconciler',
        context: 'reconcile',
        message: `Reconcile error: ${err}`,
      });
    }
  }

  private async reconcileWorkflow(workflow: WorkflowRow): Promise<number> {
    const supabase = getSupabase();

    // Find all tenants that have this integration configured
    const { data: integrationRows, error: intError } = await supabase
      .from('integrations')
      .select('tenant_id')
      .eq('id', workflow.integration_id);

    if (intError || !integrationRows) {
      Logger.error({
        module: 'TaskReconciler',
        context: 'reconcileWorkflow',
        message: `Error fetching integrations for ${workflow.integration_id}: ${intError?.message}`,
      });
      return 0;
    }

    if (integrationRows.length === 0) return 0;

    let seeded = 0;

    for (const row of integrationRows) {
      const tenantId = row.tenant_id;
      if (!tenantId) continue;

      const created = await this.ensureTaskExists(workflow, tenantId);
      if (created) seeded++;
    }

    return seeded;
  }

  private async ensureTaskExists(workflow: WorkflowRow, tenantId: string): Promise<boolean> {
    const supabase = getSupabase();

    const nextRunAt = new Date();
    nextRunAt.setHours(2, 0, 0, 0); // default: 2am today
    // If 2am already passed today, schedule for 2am tomorrow
    if (nextRunAt <= new Date()) {
      nextRunAt.setDate(nextRunAt.getDate() + 1);
    }

    // upsert with ignoreDuplicates=true implements ON CONFLICT DO NOTHING
    // select('id') returns the inserted row only; empty result = already existed
    const { data: inserted, error } = await (supabase.from('tasks' as any) as any)
      .upsert(
        {
          tenant_id: tenantId,
          name: workflow.name,
          workflow_id: workflow.id,
          scope: { level: 'tenant' },
          schedule: { type: 'recurring', cron: DEFAULT_CRON },
          retry_config: { max_attempts: 3, initial_delay_ms: 2000, backoff_type: 'exponential' },
          next_run_at: nextRunAt.toISOString(),
          enabled: true,
        },
        { onConflict: 'workflow_id,tenant_id', ignoreDuplicates: true },
      )
      .select('id');

    if (error) {
      Logger.error({
        module: 'TaskReconciler',
        context: 'ensureTaskExists',
        message: `Error upserting task for workflow ${workflow.id} / tenant ${tenantId}: ${error.message}`,
      });
      return false;
    }

    const wasCreated = Array.isArray(inserted) && inserted.length > 0;
    if (wasCreated) {
      Logger.info({
        module: 'TaskReconciler',
        context: 'ensureTaskExists',
        message: `Created task for workflow "${workflow.name}" (tenant ${tenantId})`,
      });
    }

    return wasCreated;
  }
}
