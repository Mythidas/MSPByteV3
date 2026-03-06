import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../lib/tracker.js';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import type { IngestContext } from '../types.js';

/**
 * Microsoft365Linker — writes m365_identity_groups + m365_identity_roles junction tables.
 * Called only after the identity ingest type completes.
 */
export class Microsoft365Linker {
  async linkAndReconcile(ctx: IngestContext, tracker: PipelineTracker): Promise<void> {
    Logger.info({
      module: 'Microsoft365Linker',
      context: 'linkAndReconcile',
      message: `Starting relationship linking for tenant ${ctx.tenantId}`,
    });

    const supabase = getSupabase();
    const syncStartTime = new Date().toISOString();

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      Logger.warn({
        module: 'Microsoft365Linker',
        context: 'linkAndReconcile',
        message: 'MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set — skipping linking',
      });
      return;
    }

    // Load integration config for MSP tenant ID
    tracker.trackQuery();
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', 'microsoft-365')
      .eq('tenant_id', ctx.tenantId)
      .single();

    const config = (integration?.config as any) ?? {};
    const mspTenantId = config?.tenantId ?? '';

    const baseConnector = new Microsoft365Connector({
      tenantId: mspTenantId,
      clientId,
      clientSecret,
      mode: 'partner',
    });

    // Load all integration_links to resolve gdap tenant IDs
    tracker.trackQuery();
    const { data: links } = await supabase
      .from('integration_links')
      .select('id, external_id')
      .eq('integration_id', 'microsoft-365')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'active');

    const gdapTenantByLinkId = new Map<string, string>(
      (links ?? []).map((l: any) => [l.id, l.external_id])
    );

    // Load typed rows from vendor tables
    tracker.trackQuery();
    const { data: identityRows } = await supabase
      .schema('vendors')
      .from('m365_identities')
      .select('id, external_id, link_id')
      .eq('tenant_id', ctx.tenantId);

    tracker.trackQuery();
    const { data: groupRows } = await supabase
      .schema('vendors')
      .from('m365_groups')
      .select('id, external_id, link_id')
      .eq('tenant_id', ctx.tenantId);

    tracker.trackQuery();
    const { data: roleRows } = await supabase
      .schema('vendors')
      .from('m365_roles')
      .select('id, external_id, link_id')
      .eq('tenant_id', ctx.tenantId);

    // Build lookup maps: external_id → row id (per link_id scope)
    const identityMap = new Map<string, string>(); // `${externalId}:${linkId}` → id
    for (const row of identityRows ?? []) {
      identityMap.set(`${row.external_id}:${row.link_id ?? ''}`, row.id);
    }

    // Group groups and roles by link_id
    const groupsByLink = new Map<string, typeof groupRows>();
    for (const row of groupRows ?? []) {
      const key = row.link_id ?? '__unknown__';
      if (!groupsByLink.has(key)) groupsByLink.set(key, []);
      groupsByLink.get(key)!.push(row);
    }

    const rolesByLink = new Map<string, typeof roleRows>();
    for (const row of roleRows ?? []) {
      const key = row.link_id ?? '__unknown__';
      if (!rolesByLink.has(key)) rolesByLink.set(key, []);
      rolesByLink.get(key)!.push(row);
    }

    const linkIds = new Set([...groupsByLink.keys(), ...rolesByLink.keys()]);

    for (const linkId of linkIds) {
      if (linkId === '__unknown__') continue;

      const gdapTenantId = gdapTenantByLinkId.get(linkId);
      if (!gdapTenantId) continue;

      const connector = baseConnector.forTenant(gdapTenantId);
      const siteGroups = groupsByLink.get(linkId) ?? [];
      const siteRoles = rolesByLink.get(linkId) ?? [];

      // Link group memberships → m365_identity_groups
      const groupRows: any[] = [];
      for (const group of siteGroups) {
        const { data, error } = await connector.getGroupMembers(group.external_id, undefined, true);

        if (error) {
          Logger.warn({
            module: 'Microsoft365Linker',
            context: 'linkAndReconcile',
            message: `Failed to get members for group ${group.external_id}: ${error.message}`,
          });
          continue;
        }

        for (const member of data?.members ?? []) {
          const identityId = identityMap.get(`${member.id}:${linkId}`);
          if (!identityId) continue;

          groupRows.push({
            tenant_id: ctx.tenantId,
            link_id: linkId,
            identity_id: identityId,
            group_id: group.id,
            last_seen_at: syncStartTime,
          });
        }
      }

      if (groupRows.length > 0) {
        Logger.info({
          module: 'Microsoft365Linker',
          context: 'linkAndReconcile',
          message: `Upserting ${groupRows.length} idenity > groups relationships`,
        });

        tracker.trackUpsert();
        const { error } = await supabase
          .schema('vendors')
          .from('m365_identity_groups')
          .upsert(groupRows, {
            onConflict: 'tenant_id,identity_id,group_id',
          });

        if (error) {
          Logger.error({
            module: 'Microsoft365Linker',
            context: 'linkAndReconcile',
            message: `Failed to upsert idenity > groups relationships: ${error.message}`,
          });
        }
      }

      // Link role assignments → m365_identity_roles
      const roleRows: any[] = [];
      for (const role of siteRoles) {
        const { data, error } = await connector.getRoleMembers(role.external_id, undefined, true);

        if (error) {
          Logger.warn({
            module: 'Microsoft365Linker',
            context: 'linkAndReconcile',
            message: `Failed to get members for role ${role.external_id}: ${error.message}`,
          });
          continue;
        }

        for (const member of data?.members ?? []) {
          const identityId = identityMap.get(`${member.id}:${linkId}`);
          if (!identityId) continue;

          roleRows.push({
            tenant_id: ctx.tenantId,
            link_id: linkId,
            identity_id: identityId,
            role_id: role.id,
            last_seen_at: syncStartTime,
          });
        }
      }

      if (roleRows.length > 0) {
        Logger.info({
          module: 'Microsoft365Linker',
          context: 'linkAndReconcile',
          message: `Upserting ${roleRows.length} idenity > roles relationships`,
        });

        tracker.trackUpsert();
        const { error } = await supabase
          .schema('vendors')
          .from('m365_identity_roles')
          .upsert(roleRows, {
            onConflict: 'tenant_id,identity_id,role_id',
          });

        if (error) {
          Logger.error({
            module: 'Microsoft365Linker',
            context: 'linkAndReconcile',
            message: `Failed to upsert idenity > roles relationships: ${error.message}`,
          });
        }
      }

      // Prune stale memberships via seen_at for this link
      tracker.trackUpsert();
      await supabase
        .schema('vendors')
        .from('m365_identity_groups')
        .delete()
        .eq('tenant_id', ctx.tenantId)
        .eq('link_id', linkId)
        .lt('last_seen_at', syncStartTime);

      tracker.trackUpsert();
      await supabase
        .schema('vendors')
        .from('m365_identity_roles')
        .delete()
        .eq('tenant_id', ctx.tenantId)
        .eq('link_id', linkId)
        .lt('last_seen_at', syncStartTime);
    }

    Logger.info({
      module: 'Microsoft365Linker',
      context: 'linkAndReconcile',
      message: 'Relationship linking complete',
    });
  }
}
