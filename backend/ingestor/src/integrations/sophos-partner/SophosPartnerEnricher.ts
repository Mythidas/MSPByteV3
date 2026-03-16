import { PipelineTracker } from '../../lib/tracker.js';
import type { EnrichJobData } from '../../types.js';
import type { IEnricher } from '../../interfaces.js';

export class SophosPartnerEnricher implements IEnricher {
  async enrich(job: EnrichJobData, _tracker: PipelineTracker): Promise<void> {
    throw new Error(`SophosPartnerEnricher: unknown enrichOpType "${job.enrichOpType}"`);
  }
}
