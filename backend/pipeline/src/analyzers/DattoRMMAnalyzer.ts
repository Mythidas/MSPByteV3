import { BaseAnalyzer } from './BaseAnalyzer.js';
import type { AnalysisContext, AnalyzerResult } from '../types.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class DattoRMMAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'dattormm';
  }

  async analyze(context: AnalysisContext): Promise<AnalyzerResult> {
    const result = this.createEmptyResult();

    this.analyzeOfflineDevices(context, result);
    this.analyzeEmptySites(context, result);

    return result;
  }

  /**
   * Flag endpoints whose lastSeen is >30 days ago.
   */
  private analyzeOfflineDevices(context: AnalysisContext, result: AnalyzerResult): void {
    const now = Date.now();

    for (const endpoint of context.entities.endpoints) {
      const lastSeen = endpoint.raw_data?.lastSeen;
      const online: boolean = endpoint.raw_data?.online || false;
      if (!lastSeen) continue;

      const lastSeenDate = new Date(lastSeen);
      if (isNaN(lastSeenDate.getTime())) continue;

      const daysSince = Math.floor((now - lastSeenDate.getTime()) / (24 * 60 * 60 * 1000));

      if (now - lastSeenDate.getTime() > THIRTY_DAYS_MS && !online) {
        result.alerts.push(
          this.createAlert(
            endpoint,
            'device-offline',
            'medium',
            `Device "${endpoint.display_name}" has been offline for ${daysSince} days`
          )
        );
        this.addTags(result, endpoint.id, [
          { tag: 'offline', category: 'status', source: 'dattormm' },
        ]);
        this.setState(result, endpoint.id, 'warn');
      }
    }
  }

  /**
   * Flag companies with no child entities (empty sites).
   */
  private analyzeEmptySites(context: AnalysisContext, result: AnalyzerResult): void {
    for (const site of context.entities.companies) {
      const children = context.getChildEntities(site.id);

      if (children.length === 0) {
        result.alerts.push(
          this.createAlert(
            site,
            'site-empty',
            'low',
            `Site "${site.display_name}" has no devices`
          )
        );
        this.addTags(result, site.id, [{ tag: 'empty', category: 'status', source: 'dattormm' }]);
        this.setState(result, site.id, 'low');
      }
    }
  }
}
