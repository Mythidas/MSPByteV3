import { getSupabase, getSupabaseHelper } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import type {
  LinkerContract,
  LinkerDependency,
} from "@workspace/core/types/contracts/linker";
import { IngestType } from "@workspace/core/types/ingest";

export class M365PoliciesLinker implements LinkerContract {
  readonly linkerType = "m365-link-policies";
  readonly dependencies: LinkerDependency[] = [
    { integrationId: "microsoft-365", ingestType: IngestType.M365Identities },
    { integrationId: "microsoft-365", ingestType: IngestType.M365Groups },
    { integrationId: "microsoft-365", ingestType: IngestType.M365Policies },
  ];

  async run(scope: {
    tenantId: string;
    siteId?: string;
    linkId: string;
  }): Promise<void> {
    const { tenantId, linkId } = scope;
    const supabase = getSupabase();
    const helper = getSupabaseHelper();
    const syncStartTime = new Date().toISOString();

    const { data: policies, error } = await supabase
      .schema("vendors")
      .from("m365_policies")
      .select("id,conditions")
      .eq("link_id", linkId)
      .eq("tenant_id", tenantId);

    if (error) {
      Logger.error({
        module: "M365PoliciesLinker",
        context: "run",
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

    let identityIdMap = new Map<string, string>();
    if (allUserExtIds.length > 0) {
      const result = await helper.batchSelect(
        "vendors",
        "m365_identities",
        allUserExtIds,
        "external_id",
        500,
        (q: any) => q.eq("link_id", linkId).eq("tenant_id", tenantId),
      );
      identityIdMap = new Map(
        (result.data ?? []).map((r: any) => [r.external_id, r.id]),
      );
    }

    let groupIdMap = new Map<string, string>();
    if (allGroupExtIds.length > 0) {
      const result = await helper.batchSelect(
        "vendors",
        "m365_groups",
        allGroupExtIds,
        "external_id",
        500,
        (q: any) => q.eq("link_id", linkId).eq("tenant_id", tenantId),
      );
      groupIdMap = new Map(
        (result.data ?? []).map((r: any) => [r.external_id, r.id]),
      );
    }

    let roleIdMap = new Map<string, string>();
    if (allRoleTemplateIds.length > 0) {
      const result = await helper.batchSelect(
        "definitions",
        "m365_roles",
        allRoleTemplateIds,
        "template_id",
        500,
      );
      roleIdMap = new Map(
        (result.data ?? []).map((r: any) => [r.template_id, r.id]),
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

    for (const policy of policies) {
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
        .upsert(userRows, { onConflict: "tenant_id,policy_id,identity_id" });
      if (error) {
        Logger.error({
          module: "M365PoliciesLinker",
          context: "run",
          message: `Failed to upsert policy_identities: ${error.message}`,
        });
      }
    }
    if (groupRows.length > 0) {
      const { error } = await supabase
        .schema("vendors")
        .from("m365_policy_groups")
        .upsert(groupRows, { onConflict: "tenant_id,policy_id,group_id" });
      if (error) {
        Logger.error({
          module: "M365PoliciesLinker",
          context: "run",
          message: `Failed to upsert policy_groups: ${error.message}`,
        });
      }
    }
    if (roleRows.length > 0) {
      const { error } = await supabase
        .schema("vendors")
        .from("m365_policy_roles")
        .upsert(roleRows, { onConflict: "tenant_id,policy_id,role_id" });
      if (error) {
        Logger.error({
          module: "M365PoliciesLinker",
          context: "run",
          message: `Failed to upsert policy_roles: ${error.message}`,
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
      module: "M365PoliciesLinker",
      context: "run",
      message: `Policy linking complete for link ${linkId}: ${userRows.length} users, ${groupRows.length} groups, ${roleRows.length} roles`,
    });
  }
}
