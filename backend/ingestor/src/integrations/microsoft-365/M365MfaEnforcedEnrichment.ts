import {
  M365PoliciesConditionsSchema,
  M365PoliciesGrantConrolsSchema,
} from "@workspace/shared/config/integrations/microsoft-365/policies.js";
import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { toAppError } from "@workspace/shared/lib/errors.js";
import {
  EnrichmentContract,
  EnrichmentDependency,
} from "@workspace/shared/types/jobs/contracts/enrichment.js";
import { IngestType } from "@workspace/shared/types/jobs/ingest.js";

const CHUNK = 500;

export class M365MfaEnforcedEnrichment implements EnrichmentContract {
  readonly enrichmentType = "m365-mfa-enforced";
  readonly dependencies: EnrichmentDependency[] = [
    { integrationId: "microsoft-365", ingestType: IngestType.M365Identities },
    { integrationId: "microsoft-365", ingestType: IngestType.M365Policies },
  ];

  async run(scope: {
    tenantId: string;
    siteId?: string;
    linkId?: string;
  }): Promise<void> {
    const { tenantId, linkId } = scope;
    if (!linkId) return;

    const supabase = getSupabase();

    try {
      const { data: policyRows } = await supabase
        .schema("vendors")
        .from("m365_policies")
        .select("id, policy_state, conditions, grant_controls")
        .eq("tenant_id", tenantId)
        .eq("link_id", linkId);

      const { data: identityRows } = await supabase
        .schema("vendors")
        .from("m365_identities")
        .select("id, external_id")
        .eq("tenant_id", tenantId)
        .eq("link_id", linkId);

      const { data: groupRows } = await supabase
        .schema("vendors")
        .from("m365_groups")
        .select("id, external_id")
        .eq("tenant_id", tenantId)
        .eq("link_id", linkId);

      const { data: roleRows } = await supabase
        .schema("definitions")
        .from("m365_roles")
        .select("id, template_id");

      const { data: identityGroupRows } = await supabase
        .schema("vendors")
        .from("m365_identity_groups")
        .select("identity_id, group_id")
        .eq("tenant_id", tenantId)
        .eq("link_id", linkId);

      const { data: identityRoleRows } = await supabase
        .schema("vendors")
        .from("m365_identity_roles")
        .select("identity_id, role_id")
        .eq("tenant_id", tenantId)
        .eq("link_id", linkId);

      // Filter to MFA + all-apps policies
      const mfaPolicies = (policyRows ?? [])
        .filter((r) => {
          if (r.policy_state !== "enabled") return false;
          const grantControls = M365PoliciesGrantConrolsSchema.safeParse(
            r.grant_controls,
          );
          if (!grantControls.success) return false;

          if (!grantControls.data?.builtInControls?.includes("mfa")) return false;
          const conditions = M365PoliciesConditionsSchema.safeParse(r.conditions);
          return (
            conditions?.data?.applications?.includeApplications?.includes(
              "All",
            ) ?? false
          );
        })
        .map((r) => M365PoliciesConditionsSchema.parse(r.conditions));

      // Build lookup maps
      const groupIdToExternal = new Map<string, string>(
        (groupRows ?? []).map((g) => [g.id, g.external_id ?? ""]),
      );
      const roleIdToTemplate = new Map<string, string>(
        (roleRows ?? []).map((r) => [r.id, r.template_id ?? ""]),
      );

      const identityGroups = new Map<string, Set<string>>();
      for (const row of identityGroupRows ?? []) {
        const extId = groupIdToExternal.get(row.group_id);
        if (!extId) continue;
        if (!identityGroups.has(row.identity_id))
          identityGroups.set(row.identity_id, new Set());
        identityGroups.get(row.identity_id)!.add(extId);
      }

      const identityRoles = new Map<string, Set<string>>();
      for (const row of identityRoleRows ?? []) {
        const templateId = roleIdToTemplate.get(row.role_id);
        if (!templateId) continue;
        if (!identityRoles.has(row.identity_id))
          identityRoles.set(row.identity_id, new Set());
        identityRoles.get(row.identity_id)!.add(templateId);
      }

      // Evaluate MFA enforcement per identity
      const trueIds: string[] = [];
      const falseIds: string[] = [];

      for (const identity of identityRows ?? []) {
        const userExternalId = identity.external_id ?? "";
        const groupExtIds = identityGroups.get(identity.id) ?? new Set<string>();
        const roleExtIds = identityRoles.get(identity.id) ?? new Set<string>();

        let mfaEnforced = false;
        for (const cond of mfaPolicies) {
          const u = cond?.users;
          if (!u) continue;

          const included =
            u.includeUsers.includes("All") ||
            u.includeUsers.includes(userExternalId) ||
            u.includeGroups.some((g) => groupExtIds.has(g)) ||
            u.includeRoles.some((r) => roleExtIds.has(r));

          const excluded =
            u.excludeUsers.includes(userExternalId) ||
            u.excludeGroups.some((g) => groupExtIds.has(g)) ||
            u.excludeRoles.some((r) => roleExtIds.has(r));

          if (included && !excluded) {
            mfaEnforced = true;
            break;
          }
        }

        if (mfaEnforced) trueIds.push(identity.id);
        else falseIds.push(identity.id);
      }

      for (let i = 0; i < trueIds.length; i += CHUNK) {
        await supabase
          .schema("vendors")
          .from("m365_identities")
          .update({ mfa_enforced: true })
          .in("id", trueIds.slice(i, i + CHUNK));
      }

      for (let i = 0; i < falseIds.length; i += CHUNK) {
        await supabase
          .schema("vendors")
          .from("m365_identities")
          .update({ mfa_enforced: false })
          .in("id", falseIds.slice(i, i + CHUNK));
      }

      const total = trueIds.length + falseIds.length;
      Logger.info({
        module: "M365MfaEnforcedEnrichment",
        context: "run",
        message: `Enriched ${total} identities (${trueIds.length} MFA enforced, ${falseIds.length} not) for linkId ${linkId}`,
      });
    } catch (err) {
      const appErr = toAppError(err, "MFA enrichment failed", { tenantId, linkId });
      Logger.error({
        module: "M365MfaEnforcedEnrichment",
        context: "run",
        message: appErr.userMessage,
        err: appErr,
      });
      throw appErr;
    }
  }
}
