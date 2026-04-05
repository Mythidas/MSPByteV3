import type { CheckDefinition } from "./types";
import { tamperProtectionDisabled } from "./sophos-partner/tamper-protection-disabled";
import { mdrNotLicensed } from "./sophos-partner/mdr-not-licensed";

export const checkRegistry = new Map<string, CheckDefinition[]>([
  ["sophos-partner", [tamperProtectionDisabled, mdrNotLicensed]],
]);

export function getChecks(integrationId: string): CheckDefinition[] {
  return checkRegistry.get(integrationId) ?? [];
}
