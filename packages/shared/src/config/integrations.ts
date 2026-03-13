const DAILY = 60 * 24;

export const INTEGRATIONS: Record<IntegrationId, Integration> = {
  "sophos-partner": {
    id: "sophos-partner",
    name: "Sophos Partner",
    type: "security",
    supportedTypes: [
      { type: "companies", rateMinutes: DAILY, priority: 5 },
      {
        type: "endpoints",
        rateMinutes: DAILY,
        priority: 3,
        fanOut: true,
        concurrency: 1,
      },
    ],
    scope: "site",
    navigation: [],
  },
  dattormm: {
    id: "dattormm",
    name: "DattoRMM",
    type: "rmm",
    supportedTypes: [
      { type: "companies", rateMinutes: DAILY, priority: 5 },
      {
        type: "endpoints",
        rateMinutes: DAILY,
        priority: 3,
        fanOut: true,
        concurrency: 1,
      },
    ],
    scope: "site",
    navigation: [],
  },
  cove: {
    id: "cove",
    name: "Cove Backups",
    type: "recovery",
    supportedTypes: [
      { type: "companies", rateMinutes: DAILY, priority: 5 },
      {
        type: "endpoints",
        rateMinutes: DAILY,
        priority: 3,
        fanOut: true,
        concurrency: 1,
      },
    ],
    scope: "site",
    navigation: [],
  },
  "microsoft-365": {
    id: "microsoft-365",
    name: "Microsoft 365",
    type: "security",
    supportedTypes: [
      {
        type: "identities",
        rateMinutes: DAILY,
        priority: 3,
        entityKey: "m365_identity",
        schema: "vendors",
        table: "m365_identities",
      },
      {
        type: "groups",
        rateMinutes: DAILY,
        priority: 5,
        entityKey: "m365_group",
        schema: "vendors",
        table: "m365_groups",
      },
      {
        type: "licenses",
        rateMinutes: DAILY,
        priority: 7,
        entityKey: "m365_license",
        schema: "vendors",
        table: "m365_licenses",
      },
      { type: "roles", rateMinutes: DAILY, priority: 5 },
      {
        type: "policies",
        rateMinutes: DAILY,
        priority: 5,
        entityKey: "m365_policy",
        schema: "vendors",
        table: "m365_policies",
      },
      {
        type: "exchange-config",
        rateMinutes: DAILY,
        priority: 9,
        entityKey: "m365_exchange_config",
        schema: "vendors",
        table: "m365_exchange_configs",
      },
    ],
    scope: "link",
    navigation: [
      {
        label: "Identities",
        route: "/identities",
        isNullable: true,
      },
      {
        label: "Roles",
        route: "/roles",
        isNullable: true,
      },
      {
        label: "Groups",
        route: "/groups",
        isNullable: true,
      },
      {
        label: "Licenses",
        route: "/licenses",
        isNullable: true,
      },
      {
        label: "Policies",
        route: "/policies",
        isNullable: true,
      },
      {
        label: "Exchange",
        route: "/exchange",
        isNullable: true,
      },
    ],
  },
  halopsa: {
    id: "halopsa",
    name: "HaloPSA",
    type: "psa",
    supportedTypes: [],
    scope: "site",
    navigation: [],
  },
  mspagent: {
    id: "mspagent",
    name: "MSPAgent",
    type: "other",
    supportedTypes: [],
    scope: "site",
    navigation: [
      {
        label: "Agents",
        route: "/agents",
        isNullable: true,
      },
      {
        label: "Tickets",
        route: "/tickets",
        isNullable: true,
      },
    ],
  },
};

export type IntegrationId =
  | "sophos-partner"
  | "dattormm"
  | "cove"
  | "microsoft-365"
  | "halopsa"
  | "mspagent";

export type EntityType =
  | "companies"
  | "contracts"
  | "contract_services"
  | "endpoints"
  | "firewalls"
  | "licenses"
  | "identities"
  | "groups"
  | "roles"
  | "policies"
  | "tickets"
  | "exchange-config";

export type EntityTypeConfig = {
  type: EntityType;
  rateMinutes: number;
  priority: number;
  fanOut?: boolean; // true = created by linker fan-out; reconciler skips these
  concurrency?: number; // max parallel BullMQ workers for this entity type (default: 5)
  // Optional DB routing (only set for types that are workflow entity targets)
  entityKey?: string; // e.g. "m365_identity" — the key used in alerts.entity_type
  schema?: string; // e.g. "vendors"
  table?: string; // e.g. "m365_identities"
};

export type IntegrationNavigationConfig = {
  label: string;
  route: string;
  isNullable: boolean;
};

export type Integration = {
  id: IntegrationId;
  name: string;
  type: "psa" | "rmm" | "recovery" | "security" | "identity" | "other";
  supportedTypes: EntityTypeConfig[];
  scope: "link" | "site";
  navigation: IntegrationNavigationConfig[];
};
