import { Logger } from "@workspace/shared/lib/utils/logger";
import { evaluationsRunQueue } from "../queues";
import { JobOptions } from "@workspace/shared/config/job-options";
import { checkRegistry } from "../checks/registry";

const MODULE = "evaluations";
const CONTEXT = "scheduler";

// Default interval: 6 hours
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Periodically enqueues evaluation jobs for all active integration links that
 * have registered checks. Complements the reactive listener — useful for checks
 * where the trigger is time-based rather than tied to a specific ingest cycle.
 *
 * Call start() once at boot and stop() on shutdown.
 */
export class EvaluationScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  constructor(intervalMs = DEFAULT_INTERVAL_MS) {
    this.intervalMs = intervalMs;
  }

  start(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    Logger.info({
      module: MODULE,
      context: CONTEXT,
      message: `started — interval ${this.intervalMs / 1000}s`,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    Logger.info({ module: MODULE, context: CONTEXT, message: "stopped" });
  }

  private async tick(): Promise<void> {
    Logger.trace({ module: MODULE, context: CONTEXT, message: "tick" });

    const integrationIds = [...checkRegistry.keys()];

    for (const integrationId of integrationIds) {
      await this.enqueueForIntegration(integrationId);
    }
  }

  private async enqueueForIntegration(integrationId: string): Promise<void> {
    // TODO: query integration_links where integration_id = integrationId and status = 'active'
    // For each active link, enqueue an evaluation job.
    //
    // Example shape once implemented:
    //   const links = await fetchActiveLinks(integrationId);
    //   for (const link of links) {
    //     const dedupKey = `evaluations-scheduled|${link.tenantId}|${link.id}|${integrationId}`;
    //     await evaluationsRunQueue.add("evaluate", { tenantId: link.tenantId, linkId: link.id, integrationId }, { ...JobOptions.evaluationsRun, jobId: dedupKey });
    //   }

    Logger.trace({
      module: MODULE,
      context: CONTEXT,
      message: `scheduled tick for ${integrationId} — not yet implemented`,
    });

    void evaluationsRunQueue; // referenced to satisfy import
    void JobOptions; // referenced to satisfy import
  }
}
