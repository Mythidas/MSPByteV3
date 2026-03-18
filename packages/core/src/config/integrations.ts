import { IngestType } from "@workspace/core/types/ingest";
import { IntegrationId, Integration } from "@workspace/core/types/integrations";

const DAILY = 60 * 24;

export const INTEGRATIONS: Record<IntegrationId, Integration> = {
  "sophos-partner": {
    id: "sophos-partner",
    name: "Sophos Partner",
    category: "security",
    scope: "site",
    supportedTypes: [
      {
        type: IngestType.SophosSites,
        freshnessMinutes: DAILY,
        priority: 5,
        db: {
          schema: "vendors",
          table: "sophos_sites",
        },
      },
      {
        type: IngestType.SophosEndpoints,
        freshnessMinutes: DAILY,
        priority: 3,
        workerConcurrency: 1,
        db: {
          schema: "vendors",
          table: "sophos_endpoints",
        },
      },
    ],
    navigation: [{ label: "Endpoints", route: "/endpoints", isNullable: true }],
  },

  dattormm: {
    id: "dattormm",
    name: "DattoRMM",
    category: "rmm",
    scope: "site",
    supportedTypes: [
      { type: IngestType.DattoSites, freshnessMinutes: DAILY, priority: 5 },
      {
        type: IngestType.DattoEndpoints,
        freshnessMinutes: DAILY,
        priority: 3,
        workerConcurrency: 1,
      },
    ],
    navigation: [{ label: "Endpoints", route: "/endpoints", isNullable: true }],
  },

  cove: {
    id: "cove",
    name: "Cove Backups",
    category: "recovery",
    scope: "site",
    supportedTypes: [
      { type: IngestType.CoveSites, freshnessMinutes: DAILY, priority: 5 },
      {
        type: IngestType.CoveEndpoints,
        freshnessMinutes: DAILY,
        priority: 3,
        workerConcurrency: 1,
      },
    ],
    navigation: [{ label: "Endpoints", route: "/endpoints", isNullable: true }],
  },

  "microsoft-365": {
    id: "microsoft-365",
    name: "Microsoft 365",
    category: "security",
    scope: "link",
    supportedTypes: [
      {
        type: IngestType.M365Identities,
        freshnessMinutes: DAILY,
        priority: 3,
        db: {
          schema: "vendors",
          table: "m365_identities",
        },
      },
      {
        type: IngestType.M365Groups,
        freshnessMinutes: DAILY,
        priority: 5,
        db: {
          schema: "vendors",
          table: "m365_groups",
        },
      },
      {
        type: IngestType.M365Licenses,
        freshnessMinutes: DAILY,
        priority: 7,
        db: {
          schema: "vendors",
          table: "m365_licenses",
        },
      },
      {
        type: IngestType.M365Roles,
        freshnessMinutes: DAILY,
        priority: 5,
      },
      {
        type: IngestType.M365ConditionalAccess,
        freshnessMinutes: DAILY,
        priority: 5,
        db: {
          schema: "vendors",
          table: "m365_policies",
        },
      },
      {
        type: IngestType.M365ExchangeConfig,
        freshnessMinutes: DAILY,
        priority: 9,
        db: {
          schema: "vendors",
          table: "m365_exchange_configs",
        },
      },
    ],
    navigation: [
      { label: "Identities", route: "/identities", isNullable: true },
      { label: "Roles", route: "/roles", isNullable: true },
      { label: "Groups", route: "/groups", isNullable: true },
      { label: "Licenses", route: "/licenses", isNullable: true },
      { label: "Policies", route: "/policies", isNullable: true },
      { label: "Exchange", route: "/exchange", isNullable: true },
    ],
  },

  halopsa: {
    id: "halopsa",
    name: "HaloPSA",
    category: "psa",
    scope: "site",
    supportedTypes: [],
    navigation: [],
  },

  mspagent: {
    id: "mspagent",
    name: "MSPAgent",
    category: "other",
    scope: "site",
    supportedTypes: [],
    navigation: [
      { label: "Agents", route: "/agents", isNullable: true },
      { label: "Tickets", route: "/tickets", isNullable: true },
    ],
  },
};
