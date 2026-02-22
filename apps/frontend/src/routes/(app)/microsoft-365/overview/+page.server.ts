import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const scope = url.searchParams.get('scope');
  const scopeId = url.searchParams.get('scopeId');
  const connectionId = scope === 'connection' && scopeId ? scopeId : null;

  const baseEntityQuery = () => {
    let q = locals.supabase
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .eq('integration_id', 'microsoft-365');
    if (connectionId) q = q.eq('connection_id', connectionId);
    return q;
  };

  const baseAlertQuery = () => {
    let q = locals.supabase
      .from('entity_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('integration_id', 'microsoft-365')
      .eq('status', 'active');
    return q;
  };

  const [
    identityCount,
    groupCount,
    roleCount,
    policyCount,
    licenseCount,
    exchangeCount,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    topAlertsResult,
    mfaRiskCount,
    staleUsersCount,
    licenseWasteCount,
  ] = await Promise.all([
    baseEntityQuery().eq('entity_type', 'identity'),
    baseEntityQuery().eq('entity_type', 'group'),
    baseEntityQuery().eq('entity_type', 'role'),
    baseEntityQuery().eq('entity_type', 'policy'),
    baseEntityQuery().eq('entity_type', 'license'),
    baseEntityQuery().eq('entity_type', 'exchange-config'),
    baseAlertQuery().eq('severity', 'critical'),
    baseAlertQuery().eq('severity', 'high'),
    baseAlertQuery().eq('severity', 'medium'),
    baseAlertQuery().eq('severity', 'low'),
    locals.supabase
      .from('entity_alerts')
      .select('id, message, severity, alert_type, entities(display_name, connection_id)')
      .eq('integration_id', 'microsoft-365')
      .eq('status', 'active')
      .order('severity', { ascending: true })
      .limit(5),
    baseAlertQuery().in('alert_type', ['mfa-not-enforced', 'mfa-partial-enforced']),
    baseAlertQuery().eq('alert_type', 'stale-user'),
    baseAlertQuery().eq('alert_type', 'license-waste'),
  ]);

  return {
    entityCounts: {
      identity: identityCount.count ?? 0,
      group: groupCount.count ?? 0,
      role: roleCount.count ?? 0,
      policy: policyCount.count ?? 0,
      license: licenseCount.count ?? 0,
      exchange: exchangeCount.count ?? 0,
    },
    alertCounts: {
      critical: criticalCount.count ?? 0,
      high: highCount.count ?? 0,
      medium: mediumCount.count ?? 0,
      low: lowCount.count ?? 0,
    },
    topAlerts: topAlertsResult.data ?? [],
    identityHealth: {
      mfaRisk: mfaRiskCount.count ?? 0,
      staleUsers: staleUsersCount.count ?? 0,
      licenseWaste: licenseWasteCount.count ?? 0,
    },
  };
};
