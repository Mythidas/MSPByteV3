import { BaseAnalyzer } from '../BaseAnalyzer.js';
import { Logger } from '../../lib/logger.js';
import type { AnalysisContext, AnalyzerResult } from '../../types.js';
import { isAdminUser } from '../helpers/M365Helper.js';

const STALE_THRESHOLD_DAYS = 91;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * StaleUserAnalyzer - Detects identities with logins older than 90 days.
 *
 * Severity:
 * - critical: admin users
 * - high: licensed users
 * - low: unlicensed users
 */
export class StaleUserAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'StaleUserAnalyzer';
  }

  async analyze(context: AnalysisContext): Promise<AnalyzerResult> {
    const result = this.createEmptyResult();

    if (context.integrationId !== 'microsoft-365') return result;

    for (const identity of context.entities.identities) {
      const data = identity.raw_data;
      const lastLogin = new Date(
        data.signInActivity?.lastSignInDateTime ||
          data.signInActivity?.lastNonInteractiveSignInDateTime ||
          0,
      ).getTime();

      const staleThreshold = Date.now() - STALE_THRESHOLD_DAYS * MS_PER_DAY;

      if (lastLogin <= staleThreshold) {
        const isAdmin = isAdminUser(identity, context);
        const hasLicense = (data.assignedLicenses?.length || 0) > 0;
        const daysSinceLogin = lastLogin > 0 ? Math.floor((Date.now() - lastLogin) / MS_PER_DAY) : 0;

        const alert = this.createAlert(
          identity.id,
          'stale-user',
          isAdmin ? 'critical' : hasLicense ? 'high' : 'low',
          daysSinceLogin > 0
            ? `User '${data.displayName}' last logged in ${daysSinceLogin} days ago`
            : `User '${data.displayName}' has never logged in`,
          {
            userPrincipalName: identity.raw_data.userPrincipalName,
            isAdmin,
            hasLicense,
            lastLogin: lastLogin > 0 ? new Date(lastLogin).toISOString() : 'Never',
          },
        );

        result.alerts.push(alert);
        this.setState(result, identity.id, isAdmin ? 'critical' : hasLicense ? 'warn' : 'low');
        this.addTags(result, identity.id, [
          { tag: 'Stale', category: 'status', source: 'stale-user-analyzer' },
        ]);
      } else {
        this.setState(result, identity.id, 'normal');
      }
    }

    Logger.log({
      module: 'StaleUserAnalyzer',
      context: 'analyze',
      message: `Complete: ${result.alerts.length} alerts, ${result.entityTags.size} tagged, ${result.entityStates.size} states`,
      level: 'info',
    });

    return result;
  }
}
