import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { ConfigError } from "@workspace/shared/lib/errors.js";
import { Microsoft365Connector } from "@workspace/shared/lib/integrations/microsoft-365/connector";
import type { MSCapabilities } from "@workspace/shared/types/integrations/microsoft/capabilities.js";
import type { MSGraphIdentity } from "@workspace/shared/types/integrations/microsoft/identity.js";
import {
  AdapterContract,
  UpsertPayload,
} from "@workspace/shared/types/jobs/contracts/adapter.js";
import type { JobContext } from "@workspace/shared/types/jobs/job.js";
import { IngestType as IT } from "@workspace/shared/types/jobs/ingest.js";
import { SkuCatalogService } from "@workspace/shared/lib/integrations/microsoft-365/sku-catalog-service.js";
import { PowerShellRunnerService } from "@workspace/shared/lib/integrations/microsoft-365/powershell-runner-service.js";
import { isJson, isRecord } from "@workspace/shared/lib/utils/validators.js";
import z from "zod";
import { TablesInsert } from "@workspace/shared/types/database.js";

const MSCapabilitiesSchema = z
  .object({
    signInActivity: z.boolean(),
    conditionalAccess: z.boolean(),
  })
  .catch({ signInActivity: false, conditionalAccess: false });

export class Microsoft365Adapter implements AdapterContract {
  readonly integrationId = "microsoft-365";

  async fetch(ctx: JobContext): Promise<UpsertPayload[]> {
    if (!ctx.linkId) {
      throw new ConfigError(
        "M365 Adapter requires Job to include link_id to tenant information",
        { integrationId: this.integrationId, tenantId: ctx.tenantId },
      );
    }

    const supabase = getSupabase();
    const now = new Date().toISOString();
    const { tenantId, linkId, ingestType } = ctx;

    // Load domain map (domain → site_id) from site-scoped links
    const { data: siteLinks } = await supabase
      .from("integration_links")
      .select("site_id, meta")
      .eq("integration_id", "microsoft-365")
      .eq("tenant_id", tenantId)
      .not("site_id", "is", null);

    const domainMap = new Map<string, string | null>();
    for (const l of siteLinks ?? []) {
      const domains =
        isRecord(l.meta) && Array.isArray(l.meta.domains)
          ? l.meta.domains.map((d) => (typeof d === "string" ? d : ""))
          : [];
      for (const domain of domains) {
        domainMap.set(domain.toLowerCase(), l.site_id);
      }
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const certPem = process.env.MICROSOFT_CERT_PEM
      ? Buffer.from(process.env.MICROSOFT_CERT_PEM, "base64").toString("utf8")
      : undefined;

    if (!clientId || !clientSecret) {
      throw new ConfigError(
        "Microsoft365Adapter: MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are required",
        { integrationId: this.integrationId, tenantId: ctx.tenantId, linkId: ctx.linkId },
      );
    }

    const mspTenantId = ctx.credentials?.tenantId ?? "";
    const gdapTenantId =
      ctx.metadata?.externalId && typeof ctx.metadata?.externalId === "string"
        ? ctx.metadata?.externalId
        : "";
    const capabilities = MSCapabilitiesSchema.parse(ctx.metadata?.capabilities);
    const defaultDomain =
      ctx.metadata?.defaultDomain &&
      typeof ctx.metadata?.defaultDomain === "string"
        ? ctx.metadata?.defaultDomain
        : "";

    const baseConnector = new Microsoft365Connector(
      {
        tenantId: mspTenantId,
        clientId,
        clientSecret,
      },
      tenantId,
    );

    const connector = baseConnector.forTenant(gdapTenantId);

    switch (ingestType) {
      case IT.M365Identities:
        return this.fetchIdentities(
          connector,
          gdapTenantId,
          linkId,
          domainMap,
          capabilities,
          tenantId,
          now,
          ctx.trackSpan,
        );

      case IT.M365Groups:
        return this.fetchGroups(connector, linkId, tenantId, now, ctx.trackSpan);

      case IT.M365Policies:
        return this.fetchPolicies(
          connector,
          linkId,
          capabilities,
          tenantId,
          now,
          ctx.trackSpan,
        );

      case IT.M365Licenses:
        return this.fetchLicenses(connector, linkId, tenantId, now, ctx.trackSpan);

      case IT.M365ExchangeConfig: {
        const roles = Array.isArray(ctx.metadata?.roles)
          ? ctx.metadata?.roles.map((r) => (typeof r === "string" ? r : ""))
          : [];
        if (!roles.includes("Exchange Administrator")) {
          Logger.warn({
            module: "Microsoft365Adapter",
            context: "fetchExchangeConfig",
            message:
              "Skipping m365-exchange-config: Exchange Administor rights required to run",
          });
          return [];
        }

        return this.fetchExchangeConfig(
          certPem,
          gdapTenantId,
          defaultDomain,
          linkId,
          tenantId,
          now,
          ctx.trackSpan,
        );
      }
      default:
        throw new ConfigError(
          `Microsoft365Adapter: unknown ingestType "${ingestType}"`,
          { integrationId: this.integrationId, tenantId: ctx.tenantId, ingestType },
        );
    }
  }

  private async fetchIdentities(
    connector: Microsoft365Connector,
    gdapTenantId: string,
    linkId: string,
    domainMap: Map<string, string | null>,
    capabilities: MSCapabilities,
    tenantId: string,
    now: string,
    trackSpan?: JobContext["trackSpan"],
  ): Promise<UpsertPayload[]> {
    const selectFields: (keyof MSGraphIdentity)[] = [
      "id",
      "displayName",
      "userType",
      "userPrincipalName",
      "accountEnabled",
      "assignedLicenses",
      "assignedPlans",
      "proxyAddresses",
      "companyName",
      "jobTitle",
    ];

    if (capabilities.signInActivity) {
      selectFields.push("signInActivity");
    } else {
      Logger.warn({
        module: "Microsoft365Adapter",
        context: "fetchIdentities",
        message: `signInActivity skipped for tenant ${gdapTenantId} — Azure AD P1 not available`,
      });
    }

    const span = trackSpan ?? (<T>(_n: string, f: () => Promise<T>) => f());
    const identities = await span("m365:list_identities", () =>
      connector.users.listAll({ $select: selectFields.join(",") }),
    );

    Logger.info({
      module: "Microsoft365Adapter",
      context: "fetchIdentities",
      message: `Fetched ${identities.length} identities`,
    });

    const rows = identities.map((u: MSGraphIdentity) => {
      const domain = u.userPrincipalName?.split("@")[1]?.toLowerCase();
      const siteId = domain ? (domainMap.get(domain) ?? null) : null;
      return {
        tenant_id: tenantId,
        external_id: u.id,
        link_id: linkId,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
        site_id: siteId,
        enabled: u.accountEnabled ?? false,
        name: u.displayName ?? null,
        email: u.userPrincipalName ?? null,
        type: u.userType ?? "Member",
        last_sign_in_at: u.signInActivity?.lastSignInDateTime ?? null,
        last_non_interactive_sign_in_at:
          u.signInActivity?.lastNonInteractiveSignInDateTime ?? null,
        assigned_licenses: (u.assignedLicenses ?? []).map((l) => l.skuId),
      } satisfies TablesInsert<"vendors", "m365_identities">;
    });

    return [
      {
        table: "m365_identities",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }

  private async fetchGroups(
    connector: Microsoft365Connector,
    linkId: string,
    tenantId: string,
    now: string,
    trackSpan?: JobContext["trackSpan"],
  ): Promise<UpsertPayload[]> {
    const span = trackSpan ?? (<T>(_n: string, f: () => Promise<T>) => f());
    const groups = await span("m365:list_groups", () => connector.groups.listAll());

    Logger.info({
      module: "Microsoft365Adapter",
      context: "fetchGroups",
      message: `Fetched ${groups.length} groups`,
    });

    const rows = groups.map(
      (g) =>
        ({
          tenant_id: tenantId,
          external_id: g.id,
          link_id: linkId,
          last_seen_at: now,
          created_at: now,
          updated_at: now,
          name: g.displayName ?? null,
          description: g.description ?? null,
          mail_enabled: g.mailEnabled ?? null,
          security_enabled: g.securityEnabled ?? null,
        }) satisfies TablesInsert<"vendors", "m365_groups">,
    );

    return [
      {
        table: "m365_groups",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }

  private async fetchPolicies(
    connector: Microsoft365Connector,
    linkId: string,
    capabilities: MSCapabilities,
    tenantId: string,
    now: string,
    trackSpan?: JobContext["trackSpan"],
  ): Promise<UpsertPayload[]> {
    if (!capabilities.conditionalAccess) {
      Logger.warn({
        module: "Microsoft365Adapter",
        context: "fetchPolicies",
        message: "Conditional Access skipped — tenant lacks Azure AD P1",
      });
      return [];
    }

    const span = trackSpan ?? (<T>(_n: string, f: () => Promise<T>) => f());
    const policies = await span("m365:list_policies", () =>
      connector.identity.conditionalAccess.policies.listAll(),
    );

    Logger.info({
      module: "Microsoft365Adapter",
      context: "fetchPolicies",
      message: `Fetched ${policies.length} conditional access policies`,
    });

    const rows = policies.map((p) => {
      return {
        tenant_id: tenantId,
        external_id: p.id,
        link_id: linkId,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
        name: p.displayName ?? null,
        policy_state: p.state ?? null,
        grant_controls: p.grantControls ?? null,
        session_controls: isJson(p.sessionControls) ? p.sessionControls : null,
        conditions: p.conditions ?? null,
      } satisfies TablesInsert<"vendors", "m365_policies">;
    });

    return [
      {
        table: "m365_policies",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }

  private async fetchLicenses(
    connector: Microsoft365Connector,
    linkId: string,
    tenantId: string,
    now: string,
    trackSpan?: JobContext["trackSpan"],
  ): Promise<UpsertPayload[]> {
    const span = trackSpan ?? (<T>(_n: string, f: () => Promise<T>) => f());
    const skus = await span("m365:list_licenses", () => connector.subscribedSkus.listAll());
    const skuNames = await SkuCatalogService.resolve();

    Logger.info({
      module: "Microsoft365Adapter",
      context: "fetchLicenses",
      message: `Fetched ${skus.length} subscribed SKUs`,
    });

    const rows = skus.map((sku) => {
      const friendlyName =
        skuNames.get(sku.skuPartNumber) || sku.skuPartNumber || sku.skuId;
      return {
        tenant_id: tenantId,
        external_id: sku.skuId,
        link_id: linkId,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
        enabled: sku.capabilityStatus === "Enabled",
        friendly_name: friendlyName,
        sku_id: sku.skuId,
        sku_part_number: sku.skuPartNumber ?? "",
        total_units: sku.prepaidUnits?.enabled ?? 0,
        consumed_units: sku.consumedUnits ?? 0,
        suspended_units: sku.prepaidUnits?.suspended ?? 0,
        warning_units: sku.prepaidUnits?.warning ?? 0,
        locked_out_units: sku.prepaidUnits?.lockedOut ?? 0,
        service_plan_names: (sku.servicePlans ?? []).map(
          (s) => s.servicePlanName,
        ),
      } satisfies TablesInsert<"vendors", "m365_licenses">;
    });

    return [
      {
        table: "m365_licenses",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }

  private async fetchExchangeConfig(
    certPem: string | undefined,
    gdapTenantId: string,
    defaultDomain: string,
    linkId: string,
    tenantId: string,
    now: string,
    trackSpan?: JobContext["trackSpan"],
  ): Promise<UpsertPayload[]> {
    if (!certPem) {
      Logger.warn({
        module: "Microsoft365Adapter",
        context: "fetchExchangeConfig",
        message: "Skipping exchange-config: no certificate PEM configured",
      });
      return [];
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      throw new ConfigError(
        "Microsoft365Adapter: MICROSOFT_CLIENT_ID required for exchange-config",
        { integrationId: this.integrationId, tenantId, linkId },
      );
    }

    const span = trackSpan ?? (<T>(_n: string, f: () => Promise<T>) => f());
    const orgConfig = await span("m365:exchange_config", () =>
      PowerShellRunnerService.runExchangeOnline(
        clientId,
        certPem,
        defaultDomain || gdapTenantId,
        "Get-OrganizationConfig",
      ),
    );

    Logger.info({
      module: "Microsoft365Adapter",
      context: "fetchExchangeConfig",
      message: `Fetched Exchange org config for tenant ${gdapTenantId}`,
    });

    const exchangeConfig = z
      .object({ RejectDirectSend: z.boolean().default(false) })
      .parse(orgConfig);
    const externalId = `org-config-${linkId ?? gdapTenantId}`;

    return [
      {
        table: "m365_exchange_configs",
        rows: [
          {
            tenant_id: tenantId,
            external_id: externalId,
            link_id: linkId,
            last_seen_at: now,
            created_at: now,
            updated_at: now,
            reject_direct_send: exchangeConfig.RejectDirectSend,
          } satisfies TablesInsert<"vendors", "m365_exchange_configs">,
        ],
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }
}
