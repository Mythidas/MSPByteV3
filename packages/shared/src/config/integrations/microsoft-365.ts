import { M365PoliciesShape } from "@workspace/shared/config/integrations/microsoft-365/policies";
import type { Integration } from "@workspace/shared/types/integrations";
import type { MSCapabilityKey } from "@workspace/shared/types/integrations/microsoft/capabilities.js";
import { IngestType } from "@workspace/shared/types/jobs/ingest";

const DAILY = 60 * 24;

export const CONSENT_VERSION = 2;

export const REQUIRED_DIRECTORY_ROLES: Record<string, string> = {
  "Exchange Administrator": "29232cdf-9323-42fd-ade2-1d097af3e4de",
};

export const MS_CAPABILITIES: Record<
  MSCapabilityKey,
  {
    label: string;
    description: string;
    requiredLicense: string;
    servicePlans: string[];
  }
> = {
  signInActivity: {
    label: "Sign-in Activity",
    description: "Last sign-in timestamps per user",
    requiredLicense: "Azure AD P1 or P2",
    servicePlans: ["AAD_PREMIUM", "AAD_PREMIUM_P2"],
  },
  conditionalAccess: {
    label: "Conditional Access",
    description: "Conditional Access policy retrieval",
    requiredLicense: "Azure AD P1 or P2",
    servicePlans: ["AAD_PREMIUM", "AAD_PREMIUM_P2"],
  },
};

export const M365_INTEGRATION_CONFIG: Integration = {
  id: "microsoft-365",
  name: "Microsoft 365",
  category: "security",
  scope: "link",
  supportedTypes: [
    {
      type: IngestType.M365Identities,
      freshnessMinutes: DAILY,
      priority: 3,
      scopeLevel: "link",
      db: {
        schema: "vendors",
        table: "m365_identities",
        shape: {},
      },
    },
    {
      type: IngestType.M365Groups,
      freshnessMinutes: DAILY,
      priority: 5,
      scopeLevel: "link",
      db: {
        schema: "vendors",
        table: "m365_groups",
        shape: {},
      },
    },
    {
      type: IngestType.M365Licenses,
      freshnessMinutes: DAILY,
      priority: 7,
      scopeLevel: "link",
      db: {
        schema: "vendors",
        table: "m365_licenses",
        shape: {},
      },
    },
    {
      type: IngestType.M365Policies,
      freshnessMinutes: DAILY,
      priority: 5,
      scopeLevel: "link",
      db: {
        schema: "vendors",
        table: "m365_policies",
        shape: M365PoliciesShape,
      },
    },
    {
      type: IngestType.M365ExchangeConfig,
      freshnessMinutes: DAILY,
      priority: 9,
      scopeLevel: "link",
      db: {
        schema: "vendors",
        table: "m365_exchange_configs",
        shape: {},
      },
    },
  ],
  navigation: [
    { label: "Identities", route: "/identities", isNullable: true },
    { label: "Roles", route: "/roles", isNullable: false },
    { label: "Groups", route: "/groups", isNullable: true },
    { label: "Licenses", route: "/licenses", isNullable: true },
    { label: "Policies", route: "/policies", isNullable: true },
    { label: "Exchange", route: "/exchange", isNullable: true },
    { label: "Compliance", route: "/compliance", isNullable: true },
  ],
};
