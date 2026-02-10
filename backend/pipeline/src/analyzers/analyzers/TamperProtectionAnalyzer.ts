import { BaseAnalyzer } from '../BaseAnalyzer.js';
import { Logger } from '../../lib/logger.js';
import type { AnalysisContext, AnalyzerResult } from '../../types.js';

/**
 * TamperProtectionAnalyzer - Sophos-specific.
 * Detects endpoints with tamper protection disabled.
 */
export class TamperProtectionAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'TamperProtectionAnalyzer';
  }

  async analyze(context: AnalysisContext): Promise<AnalyzerResult> {
    const result = this.createEmptyResult();

    if (context.integrationId !== 'sophos-partner') return result;

    for (const endpoint of context.entities.endpoints) {
      const data = endpoint.raw_data;
      const tamperEnabled = data?.tamperProtectionEnabled ?? data?.tamperProtection?.enabled;

      if (tamperEnabled === false) {
        const hostname = data?.hostname || endpoint.display_name || endpoint.external_id;

        const alert = this.createAlert(
          endpoint.id,
          'tamper-disabled',
          'high',
          `Endpoint '${hostname}' has tamper protection disabled`,
          {
            hostname,
            os: data?.os?.name,
            health: data?.health?.overall,
          },
        );

        result.alerts.push(alert);
        this.addTags(result, endpoint.id, [
          { tag: 'Tamper Protection Disabled', category: 'security', source: 'tamper-analyzer' },
        ]);
        this.setState(result, endpoint.id, 'warn');
      } else {
        this.setState(result, endpoint.id, 'normal');
      }
    }

    Logger.log({
      module: 'TamperProtectionAnalyzer',
      context: 'analyze',
      message: `Complete: ${result.alerts.length} alerts, ${result.entityTags.size} tagged`,
      level: 'info',
    });

    return result;
  }
}
