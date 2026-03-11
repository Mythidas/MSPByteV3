import { getSupabase } from "../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { PipelineTracker } from "../lib/tracker.js";
import { Microsoft365Connector } from "@workspace/shared/lib/connectors/Microsoft365Connector";
import type { IngestContext } from "../types.js";

/**
 * Microsoft365Linker — writes junction tables for identities, groups, roles, and policies.
 * Called only after the identity ingest type completes, scoped to a single link.
 */
export class Microsoft365Linker {
  async linkForLink(
    ctx: IngestContext,
    tracker: PipelineTracker,
  ): Promise<void> {
    if (!ctx.linkId) {
      Logger.warn({
        module: "Microsoft365Linker",
        context: "linkForLink",
        message: `Missing linkId — skipping for tenant ${ctx.tenantId}`,
      });
      return;
    }

    Logger.info({
      module: "Microsoft365Linker",
      context: "linkForLink",
      message: `Starting relationship linking for link ${ctx.linkId} tenant ${ctx.tenantId}`,
    });

    const supabase = getSupabase();
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      Logger.warn({
        module: "Microsoft365Linker",
        context: "linkForLink",
        message:
          "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set — skipping linking",
      });
      return;
    }

    // Load integration config for MSP tenant ID
    tracker.trackQuery();
    const { data: integration } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", "microsoft-365")
      .eq("tenant_id", ctx.tenantId)
      .single();

    const config = (integration?.config as any) ?? {};
    const mspTenantId = config?.tenantId ?? "";

    // Look up the GDAP tenant ID from integration_links.external_id
    tracker.trackQuery();
    const { data: linkRow } = await supabase
      .from("integration_links" as any)
      .select("external_id")
      .eq("id", ctx.linkId)
      .single();

    const gdapTenantId = (linkRow as any)?.external_id ?? "";
    if (!gdapTenantId) {
      Logger.warn({
        module: "Microsoft365Linker",
        context: "linkForLink",
        message: `No external_id on integration_link ${ctx.linkId} — skipping`,
      });
      return;
    }

    const syncStartTime = new Date().toISOString();

    await this.linkIdentityGroups(
      ctx.linkId,
      ctx.tenantId,
      gdapTenantId,
      mspTenantId,
      clientId,
      clientSecret,
      syncStartTime,
      tracker,
    );
    await this.linkIdentityRoles(
      ctx.linkId,
      ctx.tenantId,
      gdapTenantId,
      mspTenantId,
      clientId,
      clientSecret,
      syncStartTime,
      tracker,
    );
    await this.linkPolicies(ctx.linkId, ctx.tenantId, syncStartTime);

    Logger.info({
      module: "Microsoft365Linker",
      context: "linkForLink",
      message: `Relationship linking complete for link ${ctx.linkId}`,
    });
  }

  private async linkIdentityGroups(
    linkId: string,
    tenantId: string,
    gdapTenantId: string,
    mspTenantId: string,
    clientId: string,
    clientSecret: string,
    syncStartTime: string,
    tracker: PipelineTracker,
  ): Promise<void> {
    const supabase = getSupabase();

    // Load identities scoped to this link
    tracker.trackQuery();
    const { data: identityRows } = await supabase
      .schema("vendors")
      .from("m365_identities")
      .select("id, external_id")
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId);

    const identityMap = new Map<string, string>(
      (identityRows ?? []).map((r: any) => [r.external_id, r.id]),
    );

    // Load groups scoped to this link
    tracker.trackQuery();
    const { data: groupRows } = await supabase
      .schema("vendors")
      .from("m365_groups")
      .select("id, external_id")
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId);

    const connector = new Microsoft365Connector({
      tenantId: mspTenantId,
      clientId,
      clientSecret,
      mode: "partner",
    }).forTenant(gdapTenantId);

    const rows: any[] = [];
    for (const group of groupRows ?? []) {
      const { data, error } = await connector.getGroupMembers(
        group.external_id,
        undefined,
        true,
      );

      if (error) {
        Logger.warn({
          module: "Microsoft365Linker",
          context: "linkIdentityGroups",
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
        module: "Microsoft365Linker",
        context: "linkIdentityGroups",
        message: `Upserting ${rows.length} identity > group relationships for link ${linkId}`,
      });

      tracker.trackUpsert();
      const { error } = await supabase
        .schema("vendors")
        .from("m365_identity_groups")
        .upsert(rows, { onConflict: "tenant_id,identity_id,group_id" });

      if (error) {
        Logger.error({
          module: "Microsoft365Linker",
          context: "linkIdentityGroups",
          message: `Failed to upsert identity > group relationships for link ${linkId}: ${error.message}`,
        });
      }
    }

    // Prune stale memberships for this link
    tracker.trackUpsert();
    await supabase
      .schema("vendors")
      .from("m365_identity_groups")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId)
      .lt("last_seen_at", syncStartTime);
  }

  private async linkIdentityRoles(
    linkId: string,
    tenantId: string,
    gdapTenantId: string,
    mspTenantId: string,
    clientId: string,
    clientSecret: string,
    syncStartTime: string,
    tracker: PipelineTracker,
  ): Promise<void> {
    const supabase = getSupabase();

    // Load identities scoped to this link
    tracker.trackQuery();
    const { data: identityRows } = await supabase
      .schema("vendors")
      .from("m365_identities")
      .select("id, external_id")
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId);

    const identityMap = new Map<string, string>(
      (identityRows ?? []).map((r: any) => [r.external_id, r.id]),
    );

    // Load roles scoped to this link
    tracker.trackQuery();
    const { data: roleRows } = await supabase
      .schema("vendors")
      .from("m365_roles")
      .select("id, external_id")
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId);

    const connector = new Microsoft365Connector({
      tenantId: mspTenantId,
      clientId,
      clientSecret,
      mode: "partner",
    }).forTenant(gdapTenantId);

    const rows: any[] = [];
    for (const role of roleRows ?? []) {
      const { data, error } = await connector.getRoleMembers(
        role.external_id,
        undefined,
        true,
      );

      if (error) {
        Logger.warn({
          module: "Microsoft365Linker",
          context: "linkIdentityRoles",
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
        module: "Microsoft365Linker",
        context: "linkIdentityRoles",
        message: `Upserting ${rows.length} identity > role relationships for link ${linkId}`,
      });

      tracker.trackUpsert();
      const { error } = await supabase
        .schema("vendors")
        .from("m365_identity_roles")
        .upsert(rows, { onConflict: "tenant_id,identity_id,role_id" });

      if (error) {
        Logger.error({
          module: "Microsoft365Linker",
          context: "linkIdentityRoles",
          message: `Failed to upsert identity > role relationships for link ${linkId}: ${error.message}`,
        });
      }
    }

    // Prune stale role memberships for this link
    tracker.trackUpsert();
    await supabase
      .schema("vendors")
      .from("m365_identity_roles")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId)
      .lt("last_seen_at", syncStartTime);
  }

  private async linkPolicies(
    linkId: string,
    tenantId: string,
    syncStartTime: string,
  ): Promise<void> {
    const supabase = getSupabase();

    const { data: policies, error } = await supabase
      .schema("vendors")
      .from("m365_policies")
      .select("id,conditions")
      .eq("link_id", linkId)
      .eq("tenant_id", tenantId);
    if (error) {
      Logger.error({
        module: "Microsoft365Linker",
        context: "linkPolicies",
        message: `Failed to fetch policies for link ${linkId}: ${error.message}`,
      });
      return;
    }

    // Collect all external IDs referenced in policy conditions
    const includeUserExtIds: string[] = [];
    const excludeUserExtIds: string[] = [];
    const includeGroupExtIds: string[] = [];
    const excludeGroupExtIds: string[] = [];
    const includeRoleTemplateIds: string[] = [];
    const excludeRoleTemplateIds: string[] = [];

    for (const policy of policies ?? []) {
      const users = (policy.conditions as any)?.users ?? {};
      for (const uid of users.includeUsers ?? []) {
        if (uid !== "All") includeUserExtIds.push(uid);
      }
      for (const uid of users.excludeUsers ?? []) excludeUserExtIds.push(uid);
      for (const gid of users.includeGroups ?? []) includeGroupExtIds.push(gid);
      for (const gid of users.excludeGroups ?? []) excludeGroupExtIds.push(gid);
      for (const rid of users.includeRoles ?? [])
        includeRoleTemplateIds.push(rid);
      for (const rid of users.excludeRoles ?? [])
        excludeRoleTemplateIds.push(rid);
    }

    const allUserExtIds = [
      ...new Set([...includeUserExtIds, ...excludeUserExtIds]),
    ];
    const allGroupExtIds = [
      ...new Set([...includeGroupExtIds, ...excludeGroupExtIds]),
    ];
    const allRoleTemplateIds = [
      ...new Set([...includeRoleTemplateIds, ...excludeRoleTemplateIds]),
    ];

    // Bulk-resolve external IDs → internal FKs
    let identityIdMap = new Map<string, string>(); // external_id → identity.id
    if (allUserExtIds.length > 0) {
      const { data } = await supabase
        .schema("vendors")
        .from("m365_identities")
        .select("id, external_id")
        .in("external_id", allUserExtIds)
        .eq("link_id", linkId)
        .eq("tenant_id", tenantId);
      identityIdMap = new Map(
        (data ?? []).map((r: any) => [r.external_id, r.id]),
      );
    }

    let groupIdMap = new Map<string, string>(); // external_id → group.id
    if (allGroupExtIds.length > 0) {
      const { data } = await supabase
        .schema("vendors")
        .from("m365_groups")
        .select("id, external_id")
        .in("external_id", allGroupExtIds)
        .eq("link_id", linkId)
        .eq("tenant_id", tenantId);
      groupIdMap = new Map((data ?? []).map((r: any) => [r.external_id, r.id]));
    }

    let roleIdMap = new Map<string, string>(); // role_template_id → role.id
    if (allRoleTemplateIds.length > 0) {
      const { data } = await supabase
        .schema("vendors")
        .from("m365_roles")
        .select("id, role_template_id")
        .in("role_template_id", allRoleTemplateIds)
        .eq("link_id", linkId)
        .eq("tenant_id", tenantId);
      roleIdMap = new Map(
        (data ?? []).map((r: any) => [r.role_template_id, r.id]),
      );
    }

    const userRows: any[] = [];
    const groupRows: any[] = [];
    const roleRows: any[] = [];
    const base = {
      tenant_id: tenantId,
      link_id: linkId,
      last_seen_at: syncStartTime,
    };

    for (const policy of policies ?? []) {
      const users = (policy.conditions as any)?.users ?? {};

      for (const uid of users.includeUsers ?? []) {
        if (uid === "All") continue;
        const identityId = identityIdMap.get(uid);
        if (!identityId) continue;
        userRows.push({
          ...base,
          policy_id: policy.id,
          identity_id: identityId,
          included: true,
        });
      }
      for (const uid of users.excludeUsers ?? []) {
        const identityId = identityIdMap.get(uid);
        if (!identityId) continue;
        userRows.push({
          ...base,
          policy_id: policy.id,
          identity_id: identityId,
          included: false,
        });
      }
      for (const gid of users.includeGroups ?? []) {
        const groupId = groupIdMap.get(gid);
        if (!groupId) continue;
        groupRows.push({
          ...base,
          policy_id: policy.id,
          group_id: groupId,
          included: true,
        });
      }
      for (const gid of users.excludeGroups ?? []) {
        const groupId = groupIdMap.get(gid);
        if (!groupId) continue;
        groupRows.push({
          ...base,
          policy_id: policy.id,
          group_id: groupId,
          included: false,
        });
      }
      for (const rid of users.includeRoles ?? []) {
        const roleId = roleIdMap.get(rid);
        if (!roleId) continue;
        roleRows.push({
          ...base,
          policy_id: policy.id,
          role_id: roleId,
          included: true,
        });
      }
      for (const rid of users.excludeRoles ?? []) {
        const roleId = roleIdMap.get(rid);
        if (!roleId) continue;
        roleRows.push({
          ...base,
          policy_id: policy.id,
          role_id: roleId,
          included: false,
        });
      }
    }

    if (userRows.length > 0) {
      const { error } = await supabase
        .schema("vendors")
        .from("m365_policy_identities")
        .upsert(userRows, {
          onConflict: "tenant_id,policy_id,identity_id",
        });
      if (error) {
        Logger.error({
          module: "Microsoft365Linker",
          context: "linkPolicies",
          message: `Failed to upsert policy_identities for link ${linkId}: ${error.message}`,
        });
      }
    }
    if (groupRows.length > 0) {
      const { error } = await supabase
        .schema("vendors")
        .from("m365_policy_groups")
        .upsert(groupRows, {
          onConflict: "tenant_id,policy_id,group_id",
        });
      if (error) {
        Logger.error({
          module: "Microsoft365Linker",
          context: "linkPolicies",
          message: `Failed to upsert policy_groups for link ${linkId}: ${error.message}`,
        });
      }
    }
    if (roleRows.length > 0) {
      const { error } = await supabase
        .schema("vendors")
        .from("m365_policy_roles")
        .upsert(roleRows, {
          onConflict: "tenant_id,policy_id,role_id",
        });
      if (error) {
        Logger.error({
          module: "Microsoft365Linker",
          context: "linkPolicies",
          message: `Failed to upsert policy_roles for link ${linkId}: ${error.message}`,
        });
      }
    }

    await Promise.all([
      supabase
        .schema("vendors")
        .from("m365_policy_identities")
        .delete()
        .eq("link_id", linkId)
        .eq("tenant_id", tenantId)
        .lt("last_seen_at", syncStartTime),
      supabase
        .schema("vendors")
        .from("m365_policy_groups")
        .delete()
        .eq("link_id", linkId)
        .eq("tenant_id", tenantId)
        .lt("last_seen_at", syncStartTime),
      supabase
        .schema("vendors")
        .from("m365_policy_roles")
        .delete()
        .eq("link_id", linkId)
        .eq("tenant_id", tenantId)
        .lt("last_seen_at", syncStartTime),
    ]);

    Logger.info({
      module: "Microsoft365Linker",
      context: "linkPolicies",
      message: `Policy linking complete for link ${linkId}: ${userRows.length} users, ${groupRows.length} groups, ${roleRows.length} roles`,
    });
  }
}
