import { BaseAnalyzer } from './BaseAnalyzer.js';
import type { AnalysisContext, AnalyzerResult } from '../types.js';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export class Microsoft365Analyzer extends BaseAnalyzer {
  getName(): string {
    return 'microsoft-365';
  }

  async analyze(context: AnalysisContext): Promise<AnalyzerResult> {
    const result = this.createEmptyResult();

    this.analyzeStaleUsers(context, result);
    this.analyzeLicenseWaste(context, result);
    this.analyzeMFACoverage(context, result);
    this.analyzeDirectSend(context, result);

    return result;
  }

  /**
   * Flag users who haven't signed in for more than 90 days.
   */
  private analyzeStaleUsers(context: AnalysisContext, result: AnalyzerResult): void {
    const now = Date.now();

    for (const identity of context.entities.identities) {
      const lastSignIn = identity.raw_data?.signInActivity?.lastSignInDateTime;
      if (!lastSignIn) continue;

      const lastSignInDate = new Date(lastSignIn);
      if (isNaN(lastSignInDate.getTime())) continue;

      const daysSince = Math.floor((now - lastSignInDate.getTime()) / (24 * 60 * 60 * 1000));

      if (now - lastSignInDate.getTime() > NINETY_DAYS_MS) {
        result.alerts.push(
          this.createAlert(
            identity,
            'stale-user',
            'medium',
            `User "${identity.display_name}" has not signed in for ${daysSince} days`,
          ),
        );
        this.addTags(result, identity.id, [
          { tag: 'stale', category: 'activity', source: 'microsoft-365' },
        ]);
        this.setState(result, identity.id, 'warn');
      }
    }
  }

  /**
   * Flag disabled users who still have active license assignments.
   */
  private analyzeLicenseWaste(context: AnalysisContext, result: AnalyzerResult): void {
    for (const identity of context.entities.identities) {
      const accountEnabled: boolean = identity.raw_data?.accountEnabled ?? true;
      const assignedLicenses: any[] = identity.raw_data?.assignedLicenses ?? [];

      if (!accountEnabled && assignedLicenses.length > 0) {
        result.alerts.push(
          this.createAlert(
            identity,
            'license-waste',
            'high',
            `Disabled user "${identity.display_name}" has ${assignedLicenses.length} license(s) assigned`,
          ),
        );
        this.addTags(result, identity.id, [
          { tag: 'license-waste', category: 'cost', source: 'microsoft-365' },
          { tag: 'disabled', category: 'status', source: 'microsoft-365' },
        ]);
        this.setState(result, identity.id, 'warn');
      }
    }
  }

  /**
   * Analyze MFA enforcement via Conditional Access policies and Security Defaults.
   * - No CA policies and security defaults off → mfa-not-enforced
   * - CA policies exist but don't target all identities → mfa-partial-enforced
   */
  private analyzeMFACoverage(context: AnalysisContext, result: AnalyzerResult): void {
    const policies = context.entities.policies;
    const identities = context.entities.identities;

    if (identities.length === 0) return;

    // Find CA policies that require MFA
    const mfaPolicies = policies.filter((p) => {
      const grantControls: any[] = p.raw_data?.grantControls?.builtInControls ?? [];
      const state: string = p.raw_data?.state ?? 'disabled';
      return state === 'enabled' && grantControls.includes('mfa');
    });

    if (mfaPolicies.length === 0) {
      // No MFA CA policies — flag each identity
      for (const identity of identities) {
        result.alerts.push(
          this.createAlert(
            identity,
            'mfa-not-enforced',
            'critical',
            `No MFA policy targets user "${identity.display_name}"`,
          ),
        );
        this.addTags(result, identity.id, [
          { tag: 'mfa-none', category: 'security', source: 'microsoft-365' },
        ]);
        this.setState(result, identity.id, 'critical');
      }
      return;
    }

    // Collect user IDs covered by at least one MFA CA policy
    const coveredUserIds = new Set<string>();

    for (const policy of mfaPolicies) {
      const includeUsers: string[] = policy.raw_data?.conditions?.users?.includeUsers ?? [];
      const includeGroups: string[] = policy.raw_data?.conditions?.users?.includeGroups ?? [];

      if (includeUsers.includes('All') || includeGroups.includes('All')) {
        // Policy covers all users — all identities are covered
        return;
      }

      for (const uid of includeUsers) {
        coveredUserIds.add(uid);
      }
    }

    // Flag identities not covered by any MFA policy
    for (const identity of identities) {
      if (!coveredUserIds.has(identity.external_id)) {
        result.alerts.push(
          this.createAlert(
            identity,
            'mfa-partial-enforced',
            'high',
            `User "${identity.display_name}" is not targeted by any MFA Conditional Access policy`,
          ),
        );
        this.addTags(result, identity.id, [
          { tag: 'mfa-partial', category: 'security', source: 'microsoft-365' },
        ]);
        this.setState(result, identity.id, 'warn');
      }
    }
  }

  /**
   * Flag tenants where Exchange Online DirectSend is open (RejectDirectSend === false).
   */
  private analyzeDirectSend(context: AnalysisContext, result: AnalyzerResult): void {
    for (const exchangeConfig of context.entities.exchange_configs) {
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
  }
}
