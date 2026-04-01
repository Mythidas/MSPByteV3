import { INTEGRATIONS } from '@workspace/core/config/integrations';
import type { AppNotification } from '$lib/stores/notifications.svelte';

type SyncIssueRow = {
  integration_id: string;
  last_error_class: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
};

type ExpiryRow = {
  id: string;
  credential_expiration: string | null;
};

// ─── Health notifications ─────────────────────────────────────────────────────

export function deriveNotificationsFromHealth(syncIssues: SyncIssueRow[]): AppNotification[] {
  // Group by integration_id — pick the worst error per integration
  const byIntegration = new Map<string, SyncIssueRow[]>();
  for (const row of syncIssues) {
    const existing = byIntegration.get(row.integration_id) ?? [];
    existing.push(row);
    byIntegration.set(row.integration_id, existing);
  }

  const notifications: AppNotification[] = [];

  for (const [integrationId, rows] of byIntegration) {
    const name = INTEGRATIONS[integrationId as keyof typeof INTEGRATIONS]?.name ?? integrationId;

    // Auth errors take priority
    const authError = rows.find((r) => r.last_error_class === 'auth');
    if (authError) {
      notifications.push({
        id: `health:${integrationId}`,
        severity: 'error',
        title: `${name} — Authentication Failed`,
        message:
          authError.last_error_message ??
          'Authentication failed — please reconnect this integration.',
        link: `/integrations/${integrationId}`,
      });
      continue;
    }

    // Repeated failures (3+) → warning
    const repeatedFailure = rows.find((r) => r.consecutive_failures >= 3);
    if (repeatedFailure) {
      notifications.push({
        id: `health:${integrationId}`,
        severity: 'warning',
        title: `${name} — Sync Degraded`,
        message:
          repeatedFailure.last_error_message ??
          'Sync is failing repeatedly — check integration status.',
        link: `/integrations/${integrationId}`,
      });
    }
    // Single failures are too noisy — skip
  }

  return notifications;
}

// ─── Credential expiration notifications ─────────────────────────────────────

export function deriveNotificationsFromExpiry(integrations: ExpiryRow[]): AppNotification[] {
  const notifications: AppNotification[] = [];
  const now = Date.now();

  for (const integration of integrations) {
    if (!integration.credential_expiration) continue;

    const expiresAt = new Date(integration.credential_expiration).getTime();
    const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    const name =
      INTEGRATIONS[integration.id as keyof typeof INTEGRATIONS]?.name ?? integration.id;

    if (daysRemaining <= 0) {
      notifications.push({
        id: `expiry:${integration.id}`,
        severity: 'error',
        title: `${name} — Credentials Expired`,
        message: 'API credentials have expired. Please update them in the integration settings.',
        link: `/integrations/${integration.id}`,
      });
    } else if (daysRemaining <= 30) {
      notifications.push({
        id: `expiry:${integration.id}`,
        severity: 'warning',
        title: `${name} — Credentials Expiring Soon`,
        message: `API credentials expire in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
        link: `/integrations/${integration.id}`,
      });
    } else {
      // 30–90 days: info level
      notifications.push({
        id: `expiry:${integration.id}`,
        severity: 'info',
        title: `${name} — Credentials Expiring`,
        message: `API credentials expire in ${daysRemaining} days.`,
        link: `/integrations/${integration.id}`,
      });
    }
  }

  return notifications;
}

// ─── Per-card health status (for the list page badges) ───────────────────────

export type IntegrationHealthStatus = 'healthy' | 'degraded' | 'action_required' | 'unknown';

export type CredentialExpirationStatus = 'ok' | 'expiring_soon' | 'expiring_urgent' | 'expired';

export function deriveIntegrationHealthStatus(syncStates: SyncIssueRow[]): IntegrationHealthStatus {
  if (syncStates.length === 0) return 'unknown';
  if (syncStates.some((s) => s.last_error_class === 'auth')) return 'action_required';
  if (syncStates.some((s) => s.consecutive_failures >= 3)) return 'degraded';
  return 'healthy';
}

export function getCredentialExpirationStatus(
  expiresAt: string | null,
): CredentialExpirationStatus {
  if (!expiresAt) return 'ok';
  const now = Date.now();
  const ts = new Date(expiresAt).getTime();
  const daysRemaining = (ts - now) / (1000 * 60 * 60 * 24);
  if (daysRemaining <= 0) return 'expired';
  if (daysRemaining <= 30) return 'expiring_urgent';
  if (daysRemaining <= 90) return 'expiring_soon';
  return 'ok';
}

export function getCredentialDaysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
