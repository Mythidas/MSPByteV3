import type { Job } from "bullmq";
import { queueManager, QueueNames } from "../lib/queue.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { getSupabase } from "../supabase.js";
import type { ComplianceJobData } from "../types.js";
import { resolveAssignments } from "../compliance/resolveAssignments.js";
import { getCheckType } from "../compliance/checkTypeRegistry.js";
import type { EvalContext } from "../compliance/checkTypeRegistry.js";

export class ComplianceWorker {
  start(): void {
    queueManager.createWorker<ComplianceJobData>(
      QueueNames.compliance(),
      this.handleJob.bind(this),
      { concurrency: 2 },
    );

    Logger.info({
      module: "ComplianceWorker",
      context: "start",
      message: "ComplianceWorker started",
    });
  }

  private async handleJob(job: Job<ComplianceJobData>): Promise<void> {
    const { tenantId, linkId, integrationId } = job.data;
    const supabase = getSupabase();
    const ctx: EvalContext = { tenantId, linkId, supabase: supabase as any };

    Logger.info({
      module: "ComplianceWorker",
      context: "handleJob",
      message: `Evaluating compliance for link ${linkId}`,
    });

    const frameworkIds = await resolveAssignments(
      supabase as any,
      tenantId,
      linkId,
      integrationId,
    );

    if (frameworkIds.length === 0) {
      Logger.info({
        module: "ComplianceWorker",
        context: "handleJob",
        message: `No compliance frameworks assigned for link ${linkId}`,
      });
      return;
    }

    // Fetch all checks for the resolved frameworks
    const { data: checks, error: checksError } = await (supabase as any)
      .from("compliance_framework_checks")
      .select("*")
      .in("framework_id", frameworkIds);

    if (checksError)
      throw new Error(`Failed to fetch checks: ${checksError.message}`);
    if (!checks || checks.length === 0) return;

    for (const check of checks) {
      await this.evaluateCheck(check, ctx, tenantId, linkId, integrationId);
    }
  }

  private async evaluateCheck(
    check: {
      id: string;
      framework_id: string;
      check_type_id: string;
      check_config: unknown;
      name: string;
      description: string | null;
      severity: string;
    },
    ctx: EvalContext,
    tenantId: string,
    linkId: string,
    integrationId: string,
  ): Promise<void> {
    const supabase = ctx.supabase;
    let result: { passed: boolean; detail?: Record<string, unknown> };

    try {
      const checkTypeDef = getCheckType(check.check_type_id);
      console.log(checkTypeDef.id);
      result = await checkTypeDef.evaluator.evaluate(check.check_config, ctx);
      console.log(result);
    } catch (err) {
      Logger.error({
        module: "ComplianceWorker",
        context: "evaluateCheck",
        message: `Check ${check.id} evaluation error: ${err}`,
      });
      result = { passed: false, detail: { error: String(err) } };
    }

    const status = result.passed ? "pass" : "fail";

    // Upsert compliance_result
    const { error: upsertError } = await (supabase as any)
      .from("compliance_results")
      .upsert(
        {
          framework_check_id: check.id,
          link_id: linkId,
          tenant_id: tenantId,
          status,
          detail: result.detail ?? null,
          evaluated_at: new Date().toISOString(),
        },
        { onConflict: "framework_check_id,link_id" },
      );

    if (upsertError) {
      Logger.error({
        module: "ComplianceWorker",
        context: "evaluateCheck",
        message: `Failed to upsert compliance result for check ${check.id}: ${upsertError.message}`,
      });
    }
  }
}
