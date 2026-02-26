import { BaseJob } from '../BaseJob.js';
import type { AlertType } from '@workspace/shared/config/integrations/alerts.js';
import type { JobContext, JobResult } from '../types.js';

export class DirectSendJob extends BaseJob {
  getName(): string {
    return 'direct-send';
  }

  getIntegrationId(): string {
    return 'microsoft-365';
  }

  getScheduleHours(): number {
    return 24;
  }

  getScope(): 'connection' | 'site' {
    return 'connection';
  }

  getDependsOn(): string[] {
    return ['exchange-config'];
  }

  getAlertTypes(): AlertType[] {
    return ['policy-gap'];
  }

  async execute(ctx: JobContext): Promise<JobResult> {
    const result = this.createEmptyResult();

    for (const exchangeConfig of ctx.entities.exchange_configs) {
      const rejectDirectSend: boolean = exchangeConfig.raw_data?.RejectDirectSend ?? true;

      if (rejectDirectSend === false) {
        result.alerts.push(
          this.createAlert(
            exchangeConfig,
            'policy-gap',
            'high',
            'Exchange Online DirectSend is open — unauthenticated external mail is accepted',
          ),
        );
        this.addTags(result, exchangeConfig.id, [
          { tag: 'direct-send-open', category: 'security', source: 'microsoft-365' },
        ]);
        this.setState(result, exchangeConfig.id, 'warn');
      }
    }

    return result;
  }
}
