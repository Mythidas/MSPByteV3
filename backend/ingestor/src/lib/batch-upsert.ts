import type { UpsertPayload } from "@workspace/core/types/contracts/adapter";
import { getSupabaseHelper } from "../supabase";

export async function batchUpsert(
  payload: UpsertPayload,
  schema: string,
): Promise<number> {
  if (payload.rows.length === 0) return 0;

  const helper = getSupabaseHelper();
  const conflictCols = payload.onConflict.split(",").map((s) => s.trim());

  const result = await helper.batchUpsert(
    schema as any,
    payload.table as any,
    payload.rows as any,
    100,
    conflictCols as any,
  );

  if (!result.data) {
    throw new Error(`batchUpsert failed for ${schema}.${payload.table}`);
  }

  return result.data.length;
}
