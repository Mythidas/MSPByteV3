export const ALERT_TYPE_GUIDANCE: Record<string, string> = {
  'tamper-disabled':
    'Re-enable Tamper Protection via the Sophos Central Partner portal. Ensure the endpoint has not been compromised before re-enabling.',
  'device-offline':
    'Check device connectivity, power state, and verify the monitoring agent service is running. Investigate network or firewall changes that may block communication.',
  'backup-failed':
    'Review backup job logs for errors. Common causes include insufficient storage, locked files, or connectivity issues with the backup target.',
  'mfa-not-enforced':
    'Enable multi-factor authentication in your identity provider. All user accounts should have MFA enforced to meet security baselines.',
  'mfa-partial-enforced':
    'Some users are missing MFA enforcement. Review your identity provider and ensure MFA is required for all accounts.',
  'policy-gap':
    'Review the integration portal policies and ensure all devices/entities are covered by the expected policy assignments.',
  'license-waste':
    'Review license assignments and reclaim unused or duplicate licenses to reduce unnecessary costs.',
  'stale-user':
    'This user account has been inactive for an extended period. Consider disabling or removing the account if it is no longer needed.',
  'site-empty':
    'This site has no mapped entities. Verify entity-to-site mapping in the integration configuration.',
};

export function severityClass(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'high':
      return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
    case 'medium':
      return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
    case 'low':
      return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function alertStatusClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'resolved':
      return 'bg-green-500/15 text-green-600 border-green-500/30';
    case 'suppressed':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
