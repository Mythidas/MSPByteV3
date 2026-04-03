import type { SchemaFields } from "@workspace/shared/types/jobs/contracts/schema-registry";
import z from "zod";

export const M365PoliciesShape: SchemaFields = {
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
  session_controls: {
    label: "Session Controls",
    type: "object",
    modality: "single",
    trackable: false,
    ingestPath: "session_controls",
    required: false,
    fields: {
      signInFrequency: {
        label: "Sign In Frequency",
        type: "object",
        modality: "single",
        trackable: false,
        ingestPath: "session_controls.signInFrequency",
        required: false,
        fields: {
          isEnabled: {
            label: "Enabled",
            type: "boolean",
            modality: "single",
            trackable: true,
            ingestPath: "session_controls.signInFrequency.isEnabled",
            required: true,
          },
          type: {
            label: "Type",
            type: "enum",
            modality: "single",
            trackable: true,
            ingestPath: "session_controls.signInFrequency.type",
            required: true,
            options: [
              { label: "Days", value: "days" },
              { label: "Hours", value: "hours" },
            ],
          },
          value: {
            label: "Value",
            type: "number",
            modality: "single",
            trackable: true,
            ingestPath: "session_controls.signInFrequency.value",
            required: true,
          },
          frequencyInterval: {
            label: "Interval",
            type: "enum",
            modality: "single",
            trackable: true,
            ingestPath: "session_controls.signInFrequency.frequencyInterval",
            required: true,
            options: [
              { label: "Time Based", value: "timeBased" },
              { label: "Every Time", value: "everyTime" },
            ],
          },
        },
      },
      persistentBrowser: {
        label: "Persistent Browser",
        type: "object",
        modality: "single",
        trackable: false,
        ingestPath: "session_controls.persistentBrowser",
        required: false,
        fields: {
          mode: {
            label: "Mode",
            type: "enum",
            modality: "single",
            trackable: true,
            ingestPath: "session_controls.persistentBrowser.mode",
            required: false,
            options: [
              { label: "Always", value: "always" },
              { label: "Never", value: "never" },
            ],
          },
          isEnabled: {
            label: "Enabled",
            type: "boolean",
            modality: "single",
            trackable: true,
            ingestPath: "session_controls.persistentBrowser.isEnabled",
            required: true,
          },
        },
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
              labelColumn: "email",
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
              table: "definitions.m365_roles",
              valueColumn: "template_id",
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
              table: "definitions.m365_roles",
              valueColumn: "template_id",
              labelColumn: "name",
            },
          },
          includeGuestsOrExternalUsers: {
            label: "Include Guests/External",
            type: "string",
            modality: "single",
            trackable: false,
            ingestPath: "conditions.users.includeGuestsOrExternalUsers",
            required: false,
          },
          excludeGuestsOrExternalUsers: {
            label: "Exclude Guests/External",
            type: "string",
            modality: "single",
            trackable: false,
            ingestPath: "conditions.users.excludeGuestsOrExternalUsers",
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
            type: "enum",
            modality: "array",
            trackable: true,
            ingestPath: "conditions.applications.includeApplications",
            required: true,
            options: [{ label: "All", value: "All" }],
          },
          excludeApplications: {
            label: "Exclude Applications",
            type: "string",
            modality: "array",
            trackable: false,
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
            options: [
              {
                label: "Register Device",
                value: "urn:user:registerdevice",
              },
            ],
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
        options: [
          {
            label: "Mobile Apps and Desktop Clients",
            value: "mobileAppsAndDesktopClients",
          },
          {
            label: "Exchange Active Sync",
            value: "exchangeActiveSync",
          },
          { label: "Browser", value: "browser" },
          { label: "Other", value: "other" },
        ],
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
        fields: {
          includeLocations: {
            label: "Include Locations",
            type: "string",
            modality: "array",
            trackable: true,
            ingestPath: "conditions.locations.includeLocations",
            required: true,
          },
          excludeLocations: {
            label: "Exclude Locations",
            type: "string",
            modality: "array",
            trackable: true,
            ingestPath: "conditions.locations.excludeLocations",
            required: false,
          },
        },
      },

      platforms: {
        label: "Platforms",
        type: "object",
        modality: "single",
        trackable: false,
        ingestPath: "conditions.platforms",
        required: false,
        fields: {
          includePlatforms: {
            label: "Include Platforms",
            type: "string",
            modality: "array",
            trackable: true,
            ingestPath: "conditions.platforms.includePlatforms",
            required: true,
            options: [
              { label: "Windows", value: "windows" },
              { label: "MacOS", value: "macOS" },
              { label: "Linux", value: "linux" },
              { label: "Windows", value: "android" },
              { label: "iOS", value: "iOS" },
              { label: "Windows Phone", value: "windowsPhone" },
            ],
          },
          excludePlatforms: {
            label: "Exclude Platforms",
            type: "string",
            modality: "array",
            trackable: true,
            ingestPath: "conditions.platforms.excludePlatforms",
            required: false,
            options: [
              { label: "Windows", value: "windows" },
              { label: "MacOS", value: "macOS" },
              { label: "Linux", value: "linux" },
              { label: "Windows", value: "android" },
              { label: "iOS", value: "iOS" },
              { label: "Windows Phone", value: "windowsPhone" },
            ],
          },
        },
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
};

export const M365PoliciesConditionsSchema = z.object({
  users: z
    .object({
      includeUsers: z.array(z.string()),
      excludeUsers: z.array(z.string()),
      includeGroups: z.array(z.string()),
      excludeGroups: z.array(z.string()),
      includeRoles: z.array(z.string()),
      excludeRoles: z.array(z.string()),
    })
    .optional(),
  applications: z
    .object({
      includeApplications: z.array(z.string()).optional(),
      excludeApplications: z.array(z.string()).optional(),
    })
    .optional(),
  platforms: z
    .object({
      includePlatforms: z.array(z.string()).optional(),
    })
    .optional(),
  locations: z
    .object({
      includeLocations: z.array(z.string()).optional(),
      excludeLocations: z.array(z.string()).optional(),
    })
    .optional(),
  clientAppTypes: z.array(z.string()).optional(),
  userRiskLevels: z.array(z.string()).optional(),
  signInRiskLevels: z.array(z.string()).optional(),
});
export const M365PoliciesGrantConrolsSchema = z
  .object({
    operator: z.enum(["AND", "OR"]),
    builtInControls: z.array(z.string()).optional(),
    termsOfUse: z.array(z.string()).optional(),
    customAuthenticationFactors: z.array(z.string()).optional(),
  })
  .optional();
export const M365PoliciesSessionConrolsSchema = z
  .object({
    applicationEnforcedRestrictions: z.unknown().optional(),
    cloudAppSecurity: z.unknown().optional(),
    signInFrequency: z.unknown().optional(),
    persistentBrowser: z.unknown().optional(),
  })
  .optional();

export const M365PoliciesSchema = z
  .array(
    z.object({
      id: z.string(),
      state: z.enum([
        "enabled",
        "disabled",
        "enabledForReportingButNotEnforced",
      ]),
      displayName: z.string(),
      templateId: z.string().optional(),
      createdDateTime: z.string(),
      modifiedDateTime: z.string(),
      conditions: M365PoliciesConditionsSchema,
      grantControls: M365PoliciesGrantConrolsSchema,
      sessionControls: M365PoliciesSessionConrolsSchema,
    }),
  )
  .catch([]);
