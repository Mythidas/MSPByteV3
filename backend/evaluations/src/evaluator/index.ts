import { Logger } from "@workspace/shared/lib/utils/logger";
import { supabase } from "../lib/supabase";
import { getChecks } from "../checks/registry";
import { upsertAlerts } from "./writer";

const MODULE = "evaluations";
const CONTEXT = "evaluator";

export async function evaluateLink(
  tenantId: string,
  linkId: string,
  integrationId: string,
): Promise<void> {
  const checks = getChecks(integrationId);

  if (checks.length === 0) {
    Logger.trace({
      module: MODULE,
      context: CONTEXT,
      message: `no checks registered for ${integrationId}`,
      meta: { tenantId, linkId },
    });
    return;
  }

  // Pre-fetch severities for all registered definition IDs in one query
  const definitionIds = checks.map((c) => c.definitionId);
  const { data: definitions, error: defError } = await supabase
    .from("alert_definitions" as any)
    .select("id, severity")
    .in("id", definitionIds);

  if (defError) throw new Error(`evaluateLink: failed to fetch definitions: ${defError.message}`);

  const severityMap = new Map<string, number>(
    ((definitions as any[]) ?? []).map((d: any) => [d.id as string, d.severity as number]),
  );

  Logger.info({
    module: MODULE,
    context: CONTEXT,
    message: `running ${checks.length} check(s) for ${integrationId}`,
    meta: { tenantId, linkId },
  });

  const results = await Promise.allSettled(
    checks.map((check) => check.fn({ tenantId, linkId, supabase })),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const check = checks[i];

    if (result.status === "rejected") {
      Logger.error({
        module: MODULE,
        context: CONTEXT,
        message: `check ${check.definitionId} failed: ${String(result.reason)}`,
        meta: { tenantId, linkId, integrationId },
      });
      continue;
    }

    const hits = result.value;
    const severity = severityMap.get(check.definitionId) ?? 50;
    await upsertAlerts(hits, tenantId, linkId, check.definitionId, severity);
  }
}
