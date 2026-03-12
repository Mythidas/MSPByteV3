import { getSupabase, getSupabaseHelper } from '../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../../lib/tracker.js';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import type { LinkJobData } from '../../types.js';
import type { LinkRecord, ILinker } from '../../interfaces.js';

type M365TenantConnector = ReturnType<Microsoft365Connector['forTenant']>;

/**
 * Microsoft365Linker — writes junction tables for identities, groups, roles, and policies.
 * Routes on job.linkOpType. No dep checking or job tracking — those live in LinkWorker.
 */
export class Microsoft365Linker implements ILinker {
  async link(job: LinkJobData, linkRecord: LinkRecord, tracker: PipelineTracker): Promise<void> {
    const { tenantId, linkId, integrationId, linkOpType } = job;
    const gdapTenantId = linkRecord.external_id ?? '';

    if (!gdapTenantId) {
      Logger.warn({
        module: 'Microsoft365Linker',
        context: 'link',
        message: `Missing external_id on linkRecord ${linkId}`,
      });
      return;
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      Logger.warn({
        module: 'Microsoft365Linker',
        context: 'link',
        message: 'MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set — skipping linking',
      });
      return;
    }

    const supabase = getSupabase();

    // Load integration config for MSP tenant ID
    tracker.trackQuery();
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', integrationId)
      .eq('tenant_id', tenantId)
      .single();

    const config = (integration?.config as any) ?? {};
    const mspTenantId = config?.tenantId ?? '';

    const connector = new Microsoft365Connector({
      tenantId: mspTenantId,
      clientId,
      clientSecret,
      mode: 'partner',
    }).forTenant(gdapTenantId);

    const syncStartTime = new Date().toISOString();

    switch (linkOpType) {
      case 'link-identity-groups':
        return this.linkIdentityGroups(linkId, tenantId, connector, syncStartTime, tracker);
      case 'link-identity-roles':
        return this.linkIdentityRoles(linkId, tenantId, connector, syncStartTime, tracker);
      case 'link-policies':
        return this.linkPolicies(linkId, tenantId, syncStartTime);
      default:
        throw new Error(`Microsoft365Linker: unknown linkOpType "${linkOpType}"`);
    }
  }

  private async linkIdentityGroups(
    linkId: string,
    tenantId: string,
    connector: M365TenantConnector,
    syncStartTime: string,
    tracker: PipelineTracker,
  ): Promise<void> {
    const supabase = getSupabase();

    // Load identities scoped to this link
    tracker.trackQuery();
    const { data: identityRows } = await supabase
      .schema('vendors')
      .from('m365_identities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    const identityMap = new Map<string, string>(
      (identityRows ?? []).map((r: any) => [r.external_id, r.id]),
    );

    // Load groups scoped to this link
    tracker.trackQuery();
    const { data: groupRows } = await supabase
      .schema('vendors')
      .from('m365_groups')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    const rows: any[] = [];
    for (const group of groupRows ?? []) {
      const { data, error } = await connector.getGroupMembers(
        group.external_id,
        undefined,
        true,
      );

      if (error) {
        Logger.warn({
          module: 'Microsoft365Linker',
          context: 'linkIdentityGroups',
          message: `Failed to get members for group ${group.external_id} link ${linkId}: ${error.message}`,
        });
        continue;
      }

      for (const member of data?.members ?? []) {
        const identityId = identityMap.get(member.id);
        if (!identityId) continue;

        rows.push({
          tenant_id: tenantId,
          link_id: linkId,
          identity_id: identityId,
          group_id: group.id,
          last_seen_at: syncStartTime,
        });
      }
    }

    if (rows.length > 0) {
      Logger.info({
        module: 'Microsoft365Linker',
        context: 'linkIdentityGroups',
        message: `Upserting ${rows.length} identity > group relationships for link ${linkId}`,
      });

      tracker.trackUpsert();
      const { error } = await supabase
        .schema('vendors')
        .from('m365_identity_groups')
        .upsert(rows, { onConflict: 'tenant_id,identity_id,group_id' });

      if (error) {
        Logger.error({
          module: 'Microsoft365Linker',
          context: 'linkIdentityGroups',
          message: `Failed to upsert identity > group relationships for link ${linkId}: ${error.message}`,
        });
      }
    }

    // Prune stale memberships for this link
    tracker.trackUpsert();
    await supabase
      .schema('vendors')
      .from('m365_identity_groups')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId)
      .lt('last_seen_at', syncStartTime);
  }

  private async linkIdentityRoles(
    linkId: string,
    tenantId: string,
    connector: M365TenantConnector,
    syncStartTime: string,
    tracker: PipelineTracker,
  ): Promise<void> {
    const supabase = getSupabase();

    // Load identities scoped to this link
    tracker.trackQuery();
    const { data: identityRows } = await supabase
      .schema('vendors')
      .from('m365_identities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    const identityMap = new Map<string, string>(
      (identityRows ?? []).map((r: any) => [r.external_id, r.id]),
    );

    // Load roles scoped to this link
    tracker.trackQuery();
    const { data: roleRows } = await supabase
      .schema('vendors')
      .from('m365_roles')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    const rows: any[] = [];
    for (const role of roleRows ?? []) {
      const { data, error } = await connector.getRoleMembers(role.external_id, undefined, true);

      if (error) {
        Logger.warn({
          module: 'Microsoft365Linker',
          context: 'linkIdentityRoles',
          message: `Failed to get members for role ${role.external_id} link ${linkId}: ${error.message}`,
        });
        continue;
      }

      for (const member of data?.members ?? []) {
        const identityId = identityMap.get(member.id);
        if (!identityId) continue;

        rows.push({
          tenant_id: tenantId,
          link_id: linkId,
          identity_id: identityId,
          role_id: role.id,
          last_seen_at: syncStartTime,
        });
      }
    }

    if (rows.length > 0) {
      Logger.info({
        module: 'Microsoft365Linker',
        context: 'linkIdentityRoles',
        message: `Upserting ${rows.length} identity > role relationships for link ${linkId}`,
      });

      tracker.trackUpsert();
      const { error } = await supabase
        .schema('vendors')
        .from('m365_identity_roles')
        .upsert(rows, { onConflict: 'tenant_id,identity_id,role_id' });

      if (error) {
        Logger.error({
          module: 'Microsoft365Linker',
          context: 'linkIdentityRoles',
          message: `Failed to upsert identity > role relationships for link ${linkId}: ${error.message}`,
        });
      }
    }

    // Prune stale role memberships for this link
    tracker.trackUpsert();
    await supabase
      .schema('vendors')
      .from('m365_identity_roles')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId)
      .lt('last_seen_at', syncStartTime);
  }

  private async linkPolicies(
    linkId: string,
    tenantId: string,
    syncStartTime: string,
  ): Promise<void> {
    const supabase = getSupabase();
    const helper = getSupabaseHelper();

    const { data: policies, error } = await supabase
      .schema('vendors')
      .from('m365_policies')
      .select('id,conditions')
      .eq('link_id', linkId)
      .eq('tenant_id', tenantId);

    if (error) {
      Logger.error({
        module: 'Microsoft365Linker',
        context: 'linkPolicies',
        message: `Failed to fetch policies for link ${linkId}: ${error.message}`,
      });
      return;
    }

    if (!policies || policies.length === 0) return;

    // Collect all external IDs referenced in policy conditions
    const includeUserExtIds: string[] = [];
    const excludeUserExtIds: string[] = [];
    const includeGroupExtIds: string[] = [];
    const excludeGroupExtIds: string[] = [];
    const includeRoleTemplateIds: string[] = [];
    const excludeRoleTemplateIds: string[] = [];

    for (const policy of policies) {
      const users = (policy.conditions as any)?.users ?? {};
      for (const uid of users.includeUsers ?? []) {
        if (uid !== 'All') includeUserExtIds.push(uid);
      }
      for (const uid of users.excludeUsers ?? []) excludeUserExtIds.push(uid);
      for (const gid of users.includeGroups ?? []) includeGroupExtIds.push(gid);
      for (const gid of users.excludeGroups ?? []) excludeGroupExtIds.push(gid);
      for (const rid of users.includeRoles ?? []) includeRoleTemplateIds.push(rid);
      for (const rid of users.excludeRoles ?? []) excludeRoleTemplateIds.push(rid);
    }

    const allUserExtIds = [...new Set([...includeUserExtIds, ...excludeUserExtIds])];
    const allGroupExtIds = [...new Set([...includeGroupExtIds, ...excludeGroupExtIds])];
    const allRoleTemplateIds = [...new Set([...includeRoleTemplateIds, ...excludeRoleTemplateIds])];

    // Bulk-resolve external IDs → internal FKs using batchSelect
    let identityIdMap = new Map<string, string>(); // external_id → identity.id
    if (allUserExtIds.length > 0) {
      const result = await helper.batchSelect(
        'vendors',
        'm365_identities',
        allUserExtIds,
        'external_id',
        500,
        (q: any) => q.eq('link_id', linkId).eq('tenant_id', tenantId),
      );
      identityIdMap = new Map((result.data ?? []).map((r: any) => [r.external_id, r.id]));
    }

    let groupIdMap = new Map<string, string>(); // external_id → group.id
    if (allGroupExtIds.length > 0) {
      const result = await helper.batchSelect(
        'vendors',
        'm365_groups',
        allGroupExtIds,
        'external_id',
        500,
        (q: any) => q.eq('link_id', linkId).eq('tenant_id', tenantId),
      );
      groupIdMap = new Map((result.data ?? []).map((r: any) => [r.external_id, r.id]));
    }

    let roleIdMap = new Map<string, string>(); // role_template_id → role.id
    if (allRoleTemplateIds.length > 0) {
      const result = await helper.batchSelect(
        'vendors',
        'm365_roles',
        allRoleTemplateIds,
        'role_template_id',
        500,
        (q: any) => q.eq('link_id', linkId).eq('tenant_id', tenantId),
      );
      roleIdMap = new Map((result.data ?? []).map((r: any) => [r.role_template_id, r.id]));
    }

    const userRows: any[] = [];
    const groupRows: any[] = [];
    const roleRows: any[] = [];
    const base = {
      tenant_id: tenantId,
      link_id: linkId,
      last_seen_at: syncStartTime,
    };

    for (const policy of policies) {
      const users = (policy.conditions as any)?.users ?? {};

      for (const uid of users.includeUsers ?? []) {
        if (uid === 'All') continue;
        const identityId = identityIdMap.get(uid);
        if (!identityId) continue;
        userRows.push({ ...base, policy_id: policy.id, identity_id: identityId, included: true });
      }
      for (const uid of users.excludeUsers ?? []) {
        const identityId = identityIdMap.get(uid);
        if (!identityId) continue;
        userRows.push({ ...base, policy_id: policy.id, identity_id: identityId, included: false });
      }
      for (const gid of users.includeGroups ?? []) {
        const groupId = groupIdMap.get(gid);
        if (!groupId) continue;
        groupRows.push({ ...base, policy_id: policy.id, group_id: groupId, included: true });
      }
      for (const gid of users.excludeGroups ?? []) {
        const groupId = groupIdMap.get(gid);
        if (!groupId) continue;
        groupRows.push({ ...base, policy_id: policy.id, group_id: groupId, included: false });
      }
      for (const rid of users.includeRoles ?? []) {
        const roleId = roleIdMap.get(rid);
        if (!roleId) continue;
        roleRows.push({ ...base, policy_id: policy.id, role_id: roleId, included: true });
      }
      for (const rid of users.excludeRoles ?? []) {
        const roleId = roleIdMap.get(rid);
        if (!roleId) continue;
        roleRows.push({ ...base, policy_id: policy.id, role_id: roleId, included: false });
      }
    }

    if (userRows.length > 0) {
      const { error } = await supabase
        .schema('vendors')
        .from('m365_policy_identities')
        .upsert(userRows, { onConflict: 'tenant_id,policy_id,identity_id' });
      if (error) {
        Logger.error({
          module: 'Microsoft365Linker',
          context: 'linkPolicies',
          message: `Failed to upsert policy_identities for link ${linkId}: ${error.message}`,
        });
      }
    }
    if (groupRows.length > 0) {
      const { error } = await supabase
        .schema('vendors')
        .from('m365_policy_groups')
        .upsert(groupRows, { onConflict: 'tenant_id,policy_id,group_id' });
      if (error) {
        Logger.error({
          module: 'Microsoft365Linker',
          context: 'linkPolicies',
          message: `Failed to upsert policy_groups for link ${linkId}: ${error.message}`,
        });
      }
    }
    if (roleRows.length > 0) {
      const { error } = await supabase
        .schema('vendors')
        .from('m365_policy_roles')
        .upsert(roleRows, { onConflict: 'tenant_id,policy_id,role_id' });
      if (error) {
        Logger.error({
          module: 'Microsoft365Linker',
          context: 'linkPolicies',
          message: `Failed to upsert policy_roles for link ${linkId}: ${error.message}`,
        });
      }
    }

    await Promise.all([
      supabase
        .schema('vendors')
        .from('m365_policy_identities')
        .delete()
        .eq('link_id', linkId)
        .eq('tenant_id', tenantId)
        .lt('last_seen_at', syncStartTime),
      supabase
        .schema('vendors')
        .from('m365_policy_groups')
        .delete()
        .eq('link_id', linkId)
        .eq('tenant_id', tenantId)
        .lt('last_seen_at', syncStartTime),
      supabase
        .schema('vendors')
        .from('m365_policy_roles')
        .delete()
        .eq('link_id', linkId)
        .eq('tenant_id', tenantId)
        .lt('last_seen_at', syncStartTime),
    ]);

    Logger.info({
      module: 'Microsoft365Linker',
      context: 'linkPolicies',
      message: `Policy linking complete for link ${linkId}: ${userRows.length} users, ${groupRows.length} groups, ${roleRows.length} roles`,
    });
  }
}
