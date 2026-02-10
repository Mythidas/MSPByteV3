import { BaseAnalyzer } from '../BaseAnalyzer.js';
import { Logger } from '../../lib/logger.js';
import type { AnalysisContext, AnalyzerResult } from '../../types.js';
import {
  checkSecurityDefaults,
  getMFAPolicies,
  checkIdentityMFACoverage,
  isAdminUser,
  getDisplayName,
} from '../helpers/M365Helper.js';

/**
 * MFAAnalyzer - Detects identities without MFA enforcement.
 *
 * Coverage Levels:
 * - None: No MFA → critical alert
 * - Partial: Incomplete MFA → high alert
 * - Full: Complete MFA → normal state
 */
export class MFAAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'MFAAnalyzer';
  }

  async analyze(context: AnalysisContext): Promise<AnalyzerResult> {
    const result = this.createEmptyResult();

    if (context.integrationId !== 'microsoft-365') return result;

    const securityDefaultsEnabled = checkSecurityDefaults(context);
    const mfaPolicies = getMFAPolicies(context);

    Logger.log({
      module: 'MFAAnalyzer',
      context: 'analyze',
      message: `Found ${mfaPolicies.length} MFA policies, Security Defaults: ${securityDefaultsEnabled}`,
      level: 'trace',
    });

    for (const identity of context.entities.identities) {
      const { coverage, reason } = checkIdentityMFACoverage(
        identity,
        context,
        mfaPolicies,
        securityDefaultsEnabled,
      );

      const isAdmin = isAdminUser(identity, context);
      const displayName = getDisplayName(identity);

      if (coverage === 'none') {
        const alert = this.createAlert(
          identity.id,
          'mfa-not-enforced',
          'critical',
          isAdmin
            ? `Admin user '${displayName}' does not have MFA enforced`
            : `User '${displayName}' does not have MFA enforced`,
          {
            userPrincipalName: identity.raw_data.userPrincipalName,
            isAdmin,
            securityDefaultsEnabled,
            mfaPoliciesCount: mfaPolicies.length,
            coverage,
          },
        );
        result.alerts.push(alert);
        this.addTags(result, identity.id, [
          { tag: 'MFA None', category: 'security', source: 'mfa-analyzer' },
        ]);
        this.setState(result, identity.id, 'critical');
      } else if (coverage === 'partial') {
        const alert = this.createAlert(
          identity.id,
          'mfa-partial-enforced',
          'high',
          isAdmin
            ? `Admin user '${displayName}' has partial MFA coverage`
            : `User '${displayName}' has partial MFA coverage`,
          {
            userPrincipalName: identity.raw_data.userPrincipalName,
            isAdmin,
            securityDefaultsEnabled,
            mfaPoliciesCount: mfaPolicies.length,
            coverage,
            reason,
          },
        );
        result.alerts.push(alert);
        this.addTags(result, identity.id, [
          { tag: 'MFA Partial', category: 'security', source: 'mfa-analyzer' },
        ]);
        this.setState(result, identity.id, 'warn');
      } else {
        this.addTags(result, identity.id, [
          { tag: 'MFA Full', category: 'security', source: 'mfa-analyzer' },
        ]);
        this.setState(result, identity.id, 'normal');
      }
    }

    Logger.log({
      module: 'MFAAnalyzer',
      context: 'analyze',
      message: `Complete: ${result.alerts.length} alerts, ${result.entityTags.size} tagged, ${result.entityStates.size} states`,
      level: 'info',
    });

    return result;
  }
}
