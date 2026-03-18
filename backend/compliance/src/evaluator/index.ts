import { Logger } from "@workspace/core/lib/utils/logger";
import { loadAssignmentsForLink, loadAssignmentsForTenant } from "./loader";
import { runCheck } from "./runner";
import { writeResults, type EvalRecord } from "./writer";

const MODULE = "compliance";
const CONTEXT = "evaluator";

export async function evaluateLink(tenantId: string, linkId: string): Promise<void> {
  const groups = await loadAssignmentsForLink(tenantId, linkId);

  if (groups.length === 0) {
    Logger.trace({ module: MODULE, context: CONTEXT, message: `no assignments for link ${linkId}` });
    return;
  }

  const allResults: EvalRecord[] = [];

  for (const group of groups) {
    const results = await Promise.all(
      group.checks.map((check) => runCheck(check, linkId, tenantId)),
    );

    const pass = results.filter((r) => r.status === "pass").length;
    const fail = results.filter((r) => r.status === "fail").length;
    const unknown = results.filter((r) => r.status === "unknown").length;

    Logger.info({
      module: MODULE,
      context: CONTEXT,
      message: `${group.frameworkName}: ${pass} pass, ${fail} fail, ${unknown} unknown`,
      meta: { tenantId, linkId, frameworkId: group.frameworkId },
    });

    allResults.push(...results.map((r) => ({ ...r, linkId })));
  }

  await writeResults(allResults, tenantId);
}

export async function evaluateTenant(tenantId: string): Promise<void> {
  const linkMap = await loadAssignmentsForTenant(tenantId);

  for (const [linkId] of linkMap) {
    await evaluateLink(tenantId, linkId);
  }
}
