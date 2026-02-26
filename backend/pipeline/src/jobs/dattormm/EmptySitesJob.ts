import { BaseJob } from '../BaseJob.js';
import type { AlertType } from '@workspace/shared/config/integrations/alerts.js';
import type { JobContext, JobResult } from '../types.js';

export class DattoRMMEmptySitesJob extends BaseJob {
  getName(): string {
    return 'empty-sites';
  }

  getIntegrationId(): string {
    return 'dattormm';
  }

  getScheduleHours(): number {
    return 24;
  }

  getScope(): 'connection' | 'site' {
    return 'connection';
  }

  getDependsOn(): string[] {
    return ['company'];
  }

  getAlertTypes(): AlertType[] {
    return ['site-empty'];
  }

  async execute(ctx: JobContext): Promise<JobResult> {
    const result = this.createEmptyResult();

    for (const site of ctx.entities.companies) {
      const children = ctx.getChildEntities(site.id);

      if (children.length === 0) {
        result.alerts.push(
          this.createAlert(
            site,
            'site-empty',
            'low',
            `Site "${site.display_name}" has no devices`,
          ),
        );
        this.addTags(result, site.id, [
          { tag: 'empty', category: 'status', source: 'dattormm' },
        ]);
        this.setState(result, site.id, 'low');
      }
    }

    return result;
  }
}
