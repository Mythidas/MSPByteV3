import { M365_INTEGRATION_CONFIG } from "@workspace/shared/config/integrations/microsoft-365";
import type {
  IntegrationId,
  Integration,
  DbRoute,
  IngestTypeConfig,
} from "@workspace/shared/types/integrations";
import { IngestType } from "@workspace/shared/types/jobs/ingest";

const DAILY_MINUTES = 60 * 24;

export const INTEGRATIONS: Record<IntegrationId, Integration> = {
  "sophos-partner": {
    id: "sophos-partner",
    name: "Sophos Partner",
    category: "security",
    scope: "site",
    supportedTypes: [
      {
        type: IngestType.SophosEndpoints,
        freshnessMinutes: DAILY_MINUTES,
        priority: 3,
        workerConcurrency: 2,
        scopeLevel: "link",
        hasLinker: true,
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
        type: IngestType.DattoEndpoints,
        freshnessMinutes: DAILY_MINUTES,
        priority: 3,
        workerConcurrency: 5,
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
        scopeLevel: "link",
        type: IngestType.CoveEndpoints,
        freshnessMinutes: DAILY_MINUTES,
        priority: 3,
        workerConcurrency: 5,
      },
    ],
    navigation: [{ label: "Endpoints", route: "/endpoints", isNullable: true }],
  },

  "microsoft-365": M365_INTEGRATION_CONFIG,

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

export function getIntegration(id: IntegrationId): Integration {
  return INTEGRATIONS[id];
}

export function getIngestTypeConfig(
  integrationId: IntegrationId,
  type: IngestType,
): IngestTypeConfig | undefined {
  return INTEGRATIONS[integrationId]?.supportedTypes.find(
    (t) => t.type === type,
  );
}

// Returns all (integration, ingestType) pairs that have a DB route —
// used by the compliance schema registry to know what's queryable.
export function getAllDbRoutedTypes(): {
  integrationId: IntegrationId;
  ingestType: IngestType;
  db: DbRoute;
}[] {
  return Object.values(INTEGRATIONS).flatMap((integration) =>
    integration.supportedTypes
      .filter((t) => t.db != null)
      .map((t) => ({
        integrationId: integration.id,
        ingestType: t.type,
        db: t.db!,
      })),
  );
}

export function getTypeMap() {
  const map = new Map<
    IngestType,
    {
      integration: string;
      schema: string;
      table: string;
      ingestType: IngestType;
    }
  >();
  for (const integration of Object.values(INTEGRATIONS)) {
    for (const t of integration.supportedTypes) {
      if (t.type && t.db?.schema && t.db.table) {
        map.set(t.type, {
          integration: integration.id,
          schema: t.db.schema,
          table: t.db.table,
          ingestType: t.type,
        });
      }
    }
  }
  return map;
}
