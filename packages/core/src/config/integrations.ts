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
        scopeLevel: "tenant",
        db: {
          schema: "vendors",
          table: "sophos_sites",
          shape: {},
        },
      },
      {
        type: IngestType.SophosEndpoints,
        freshnessMinutes: DAILY,
        priority: 3,
        workerConcurrency: 1,
        scopeLevel: "link",
        hasLinker: true,
        linkerDependencies: [IngestType.SophosSites],
        db: {
          schema: "vendors",
          table: "sophos_endpoints",
          shape: {},
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
      {
        type: IngestType.DattoSites,
        scopeLevel: "tenant",
        freshnessMinutes: DAILY,
        priority: 5,
      },
      {
        type: IngestType.DattoEndpoints,
        freshnessMinutes: DAILY,
        priority: 3,
        workerConcurrency: 1,
        scopeLevel: "link",
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
      {
        type: IngestType.CoveSites,
        scopeLevel: "tenant",
        freshnessMinutes: DAILY,
        priority: 5,
      },
      {
        scopeLevel: "link",
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
        type: IngestType.M365Roles,
        freshnessMinutes: DAILY,
        priority: 5,
        scopeLevel: "link",
        db: {
          schema: "vendors",
          table: "m365_roles",
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
          shape: {
            name: {
              label: "Name",
              type: "string",
              modality: "single",
              trackable: true,
              ingestPath: "name",
              required: true,
            },
            description: {
              label: "Description",
              type: "string",
              modality: "single",
              trackable: false,
              ingestPath: "description",
              required: false,
            },
            policy_state: {
              label: "State",
              type: "enum",
              modality: "single",
              trackable: true,
              ingestPath: "policy_state",
              required: true,
              options: [
                { label: "Enabled", value: "enabled" },
                { label: "Disabled", value: "disabled" },
                {
                  label: "Reporting Only",
                  value: "enabledForReportingButNotEnforced",
                },
              ],
            },
            requires_mfa: {
              label: "Requires MFA",
              type: "boolean",
              modality: "single",
              trackable: true,
              ingestPath: "requires_mfa",
              required: true,
            },
            grant_controls: {
              label: "Grant Controls",
              type: "object",
              modality: "single",
              trackable: false,
              ingestPath: "grant_controls",
              required: true,
              fields: {
                operator: {
                  label: "Operator",
                  type: "string",
                  modality: "single",
                  trackable: true,
                  ingestPath: "grant_controls.operator",
                  required: true,
                },
                builtInControls: {
                  label: "Built-In Controls",
                  type: "string",
                  modality: "array",
                  trackable: true,
                  ingestPath: "grant_controls.builtInControls",
                  required: true,
                  options: [
                    { value: "block", label: "Block Sign-In" },
                    { value: "mfa", label: "Require MFA" },
                    {
                      value: "compliantDevice",
                      label: "Require Compliant Device",
                    },
                    {
                      value: "domainJoinedDevice",
                      label: "Require Hybrid Azure AD Join",
                    },
                    {
                      value: "approvedApplication",
                      label: "Require Approved Client App",
                    },
                    {
                      value: "compliantApplication",
                      label: "Require App Protection Policy",
                    },
                    {
                      value: "passwordChange",
                      label: "Require Password Change",
                    },
                  ],
                },
              },
            },
            conditions: {
              label: "Conditions",
              type: "object",
              modality: "single",
              trackable: false,
              ingestPath: "conditions",
              required: true,
              fields: {
                users: {
                  label: "Users",
                  type: "object",
                  modality: "single",
                  trackable: false,
                  ingestPath: "conditions.users",
                  required: true,
                  fields: {
                    includeUsers: {
                      label: "Include Users",
                      type: "string",
                      modality: "array",
                      trackable: true,
                      ingestPath: "conditions.users.includeUsers",
                      required: true,
                      reference: {
                        table: "vendors.m365_identities",
                        valueColumn: "external_id",
                        labelColumn: "name",
                        specialValues: [{ value: "All", label: "All Users" }],
                      },
                    },
                    excludeUsers: {
                      label: "Exclude Users",
                      type: "string",
                      modality: "array",
                      trackable: true,
                      ingestPath: "conditions.users.excludeUsers",
                      required: false,
                      reference: {
                        table: "vendors.m365_identities",
                        valueColumn: "external_id",
                        labelColumn: "name",
                        specialValues: [
                          {
                            value: "GuestsOrExternalUsers",
                            label: "Guests / External Users",
                          },
                        ],
                      },
                    },
                    includeGroups: {
                      label: "Include Groups",
                      type: "string",
                      modality: "array",
                      trackable: true,
                      ingestPath: "conditions.users.includeGroups",
                      required: false,
                      reference: {
                        table: "vendors.m365_groups",
                        valueColumn: "external_id",
                        labelColumn: "name",
                      },
                    },
                    excludeGroups: {
                      label: "Exclude Groups",
                      type: "string",
                      modality: "array",
                      trackable: true,
                      ingestPath: "conditions.users.excludeGroups",
                      required: false,
                      reference: {
                        table: "vendors.m365_groups",
                        valueColumn: "external_id",
                        labelColumn: "name",
                      },
                    },
                    includeRoles: {
                      label: "Include Roles",
                      type: "string",
                      modality: "array",
                      trackable: true,
                      ingestPath: "conditions.users.includeRoles",
                      required: false,
                      reference: {
                        table: "vendors.m365_roles",
                        valueColumn: "external_id",
                        labelColumn: "name",
                      },
                    },
                    excludeRoles: {
                      label: "Exclude Roles",
                      type: "string",
                      modality: "array",
                      trackable: true,
                      ingestPath: "conditions.users.excludeRoles",
                      required: false,
                      reference: {
                        table: "vendors.m365_roles",
                        valueColumn: "external_id",
                        labelColumn: "name",
                      },
                    },
                    includeGuestsOrExternalUsers: {
                      label: "Include Guests/External",
                      type: "string",
                      modality: "single",
                      trackable: false,
                      ingestPath:
                        "conditions.users.includeGuestsOrExternalUsers",
                      required: false,
                    },
                    excludeGuestsOrExternalUsers: {
                      label: "Exclude Guests/External",
                      type: "string",
                      modality: "single",
                      trackable: false,
                      ingestPath:
                        "conditions.users.excludeGuestsOrExternalUsers",
                      required: false,
                    },
                  },
                },

                applications: {
                  label: "Applications",
                  type: "object",
                  modality: "single",
                  trackable: false,
                  ingestPath: "conditions.applications",
                  required: true,
                  fields: {
                    includeApplications: {
                      label: "Include Applications",
                      type: "string",
                      modality: "array",
                      trackable: true,
                      ingestPath: "conditions.applications.includeApplications",
                      required: true,
                    },
                    excludeApplications: {
                      label: "Exclude Applications",
                      type: "string",
                      modality: "array",
                      trackable: true,
                      ingestPath: "conditions.applications.excludeApplications",
                      required: false,
                    },
                    includeUserActions: {
                      label: "Include User Actions",
                      type: "string",
                      modality: "array",
                      trackable: false,
                      ingestPath: "conditions.applications.includeUserActions",
                      required: false,
                    },
                    includeAuthenticationContextClassReferences: {
                      label: "Auth Context References",
                      type: "string",
                      modality: "array",
                      trackable: false,
                      ingestPath:
                        "conditions.applications.includeAuthenticationContextClassReferences",
                      required: false,
                    },
                    applicationFilter: {
                      label: "Application Filter",
                      type: "string",
                      modality: "single",
                      trackable: false,
                      ingestPath: "conditions.applications.applicationFilter",
                      required: false,
                    },
                  },
                },

                clientAppTypes: {
                  label: "Client App Types",
                  type: "string",
                  modality: "array",
                  trackable: true,
                  ingestPath: "conditions.clientAppTypes",
                  required: false,
                },

                userRiskLevels: {
                  label: "User Risk Levels",
                  type: "string",
                  modality: "array",
                  trackable: true,
                  ingestPath: "conditions.userRiskLevels",
                  required: false,
                },

                signInRiskLevels: {
                  label: "Sign-in Risk Levels",
                  type: "string",
                  modality: "array",
                  trackable: true,
                  ingestPath: "conditions.signInRiskLevels",
                  required: false,
                },

                servicePrincipalRiskLevels: {
                  label: "Service Principal Risk Levels",
                  type: "string",
                  modality: "array",
                  trackable: false,
                  ingestPath: "conditions.servicePrincipalRiskLevels",
                  required: false,
                },

                // Nullable / not always present — still useful to model
                devices: {
                  label: "Devices",
                  type: "object",
                  modality: "single",
                  trackable: false,
                  ingestPath: "conditions.devices",
                  required: false,
                  fields: {},
                },

                locations: {
                  label: "Locations",
                  type: "object",
                  modality: "single",
                  trackable: false,
                  ingestPath: "conditions.locations",
                  required: false,
                  fields: {},
                },

                platforms: {
                  label: "Platforms",
                  type: "object",
                  modality: "single",
                  trackable: false,
                  ingestPath: "conditions.platforms",
                  required: false,
                  fields: {},
                },

                insiderRiskLevels: {
                  label: "Insider Risk Levels",
                  type: "string",
                  modality: "array",
                  trackable: false,
                  ingestPath: "conditions.insiderRiskLevels",
                  required: false,
                },

                clientApplications: {
                  label: "Client Applications",
                  type: "string",
                  modality: "array",
                  trackable: false,
                  ingestPath: "conditions.clientApplications",
                  required: false,
                },

                authenticationFlows: {
                  label: "Authentication Flows",
                  type: "string",
                  modality: "array",
                  trackable: false,
                  ingestPath: "conditions.authenticationFlows",
                  required: false,
                },
              },
            },
          },
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
