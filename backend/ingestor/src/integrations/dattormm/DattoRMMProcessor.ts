import crypto from "crypto";
import { getSupabase, getSupabaseHelper } from "../../supabase.js";
import { PipelineTracker } from "../../lib/tracker.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import type { IngestJobData } from "../../types.js";
import type { RawDattoEntity } from "./types.js";
import type { IProcessor, ProcessedRow } from "../../interfaces.js";

type DattoTableName = "datto_sites" | "datto_endpoints";

function getTableName(ingestType: string): DattoTableName {
  if (ingestType === "sites") return "datto_sites";
  if (ingestType === "endpoints") return "datto_endpoints";
  throw new Error(`DattoRMMProcessor: unknown ingestType "${ingestType}"`);
}

/**
 * DattoRMMProcessor — typed hash-based upsert for vendors.datto_* tables.
 */
export class DattoRMMProcessor implements IProcessor<RawDattoEntity> {
  async process(
    entities: RawDattoEntity[],
    job: IngestJobData,
    tracker: PipelineTracker,
  ): Promise<ProcessedRow[]> {
    const { ingestType, tenantId, ingestId } = job;

    Logger.info({
      module: "DattoRMMProcessor",
      context: "process",
      message: `Processing ${entities.length} ${ingestType} entities`,
    });

    const chunks = chunkArray(entities, 100);
    const allProcessed: ProcessedRow[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkRows = await tracker.trackSpan(
        `processor:chunk:${i}`,
        async () => {
          return this.processChunk(
            chunks[i],
            ingestType,
            tenantId,
            ingestId,
            tracker,
          );
        },
      );
      allProcessed.push(...chunkRows);
    }

    const c = tracker.getCounters();
    Logger.info({
      module: "DattoRMMProcessor",
      context: "process",
      message: `Completed: ${c.entities_created} created, ${c.entities_updated} updated, ${c.entities_unchanged} unchanged`,
    });

    return allProcessed;
  }

  async pruneStale(
    processedRows: ProcessedRow[],
    job: IngestJobData,
    tracker: PipelineTracker,
  ): Promise<number> {
    const { ingestType, tenantId, linkId } = job;
    const survivingIds = new Set(processedRows.map((r) => r.external_id));
    const supabase = getSupabase();
    const tableName = getTableName(ingestType);

    const staleIds: string[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;

    while (true) {
      tracker.trackQuery();
      let query = supabase
        .schema("vendors")
        .from(tableName)
        .select("id, external_id")
        .eq("tenant_id", tenantId)
        .range(offset, offset + PAGE_SIZE - 1);

      if (linkId !== null) {
        query = query.eq("link_id", linkId);
      }

      const { data, error } = await query;
      if (error)
        throw new Error(
          `Fetch ${tableName} for prune failed: ${error.message}`,
        );
      if (!data || data.length === 0) break;

      for (const row of data) {
        if (!survivingIds.has(row.external_id)) {
          staleIds.push(row.id);
        }
      }

      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (staleIds.length === 0) return 0;

    const { error } = await getSupabaseHelper().batchDelete(
      "vendors",
      tableName,
      staleIds,
    );
    if (error) throw new Error(`Delete stale ${tableName} failed: ${error}`);

    tracker.trackEntityDeleted(staleIds.length);
    Logger.info({
      module: "DattoRMMProcessor",
      context: "pruneStale",
      message: `Deleted ${staleIds.length} stale ${ingestType} rows`,
    });

    return staleIds.length;
  }

  private async processChunk(
    entities: RawDattoEntity[],
    ingestType: string,
    tenantId: string,
    ingestId: string,
    tracker: PipelineTracker,
  ): Promise<ProcessedRow[]> {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const tableName = getTableName(ingestType);

    const linkIds = [...new Set(entities.map((e) => e.linkId))];
    const externalIds = entities.map((e) => e.externalId);

    tracker.trackQuery();
    let lookupQuery = supabase
      .schema("vendors")
      .from(tableName)
      .select("*")
      .eq("tenant_id", tenantId)
      .in("external_id", externalIds);

    if (linkIds.length === 1) {
      const lid = linkIds[0];
      lookupQuery =
        lid === null
          ? lookupQuery.is("link_id", null)
          : lookupQuery.eq("link_id", lid);
    }

    const { data: existing } = await lookupQuery;
    const existingMap = new Map<string, any>(
      (existing ?? []).map((r: any) => [
        `${r.external_id}:${r.link_id ?? ""}`,
        r,
      ]),
    );

    const toCreate: any[] = [];
    const toUpsert: any[] = [];
    const toTouch: string[] = [];
    const result: ProcessedRow[] = [];

    for (const entity of entities) {
      const linkId = entity.linkId;
      const dataHash = calculateHash(getHashableFields(entity));
      const mapped = mapToDbRow(entity, tenantId, ingestId, now, dataHash);
      const key = `${entity.externalId}:${linkId ?? ""}`;
      const ex = existingMap.get(key);

      if (!ex) {
        toCreate.push({ ...mapped, data_hash: dataHash });
      } else if (ex.data_hash !== dataHash) {
        toUpsert.push({
          ...ex,
          ...mapped,
          id: ex.id,
          data_hash: dataHash,
          created_at: ex.created_at,
          updated_at: now,
        });
      } else {
        toTouch.push(ex.id);
        result.push({
          id: ex.id,
          external_id: ex.external_id,
          link_id: ex.link_id ?? null,
        });
      }
    }

    // CREATE
    if (toCreate.length > 0) {
      tracker.trackUpsert();
      const { data: created, error } = await supabase
        .schema("vendors")
        .from(tableName)
        .insert(toCreate as any)
        .select("id, external_id, link_id");
      if (error)
        throw new Error(`Insert ${tableName} failed: ${error.message}`);
      tracker.trackEntityCreated(toCreate.length);
      if (created) {
        result.push(
          ...(created as any[]).map((r: any) => ({
            id: r.id,
            external_id: r.external_id,
            link_id: r.link_id ?? null,
          })),
        );
      }
    }

    // UPDATE (hash changed)
    if (toUpsert.length > 0) {
      for (let i = 0; i < toUpsert.length; i += 100) {
        const chunk = toUpsert.slice(i, i + 100);
        tracker.trackUpsert();
        const { data: updated, error } = await supabase
          .schema("vendors")
          .from(tableName)
          .upsert(chunk as any, { onConflict: "id" })
          .select("id, external_id, link_id");
        if (error)
          throw new Error(`Upsert ${tableName} failed: ${error.message}`);
        if (updated) {
          result.push(
            ...(updated as any[]).map((r: any) => ({
              id: r.id,
              external_id: r.external_id,
              link_id: r.link_id ?? null,
            })),
          );
        }
      }
      tracker.trackEntityUpdated(toUpsert.length);
    }

    // TOUCH (unchanged — bump last_seen_at)
    if (toTouch.length > 0) {
      tracker.trackUpsert();
      const { error } = await getSupabaseHelper().batchUpdate(
        "vendors" as any,
        tableName as any,
        toTouch,
        { last_seen_at: now, ingest_id: ingestId, updated_at: now } as any,
      );
      if (error) throw new Error(`Touch ${tableName} failed: ${error}`);
      tracker.trackEntityUnchanged(toTouch.length);
    }

    return result;
  }
}

// ============================================================================
// DB ROW MAPPING
// ============================================================================

function mapToDbRow(
  entity: RawDattoEntity,
  tenantId: string,
  ingestId: string,
  now: string,
  dataHash: string,
): Record<string, any> {
  const base = {
    tenant_id: tenantId,
    external_id: entity.externalId,
    link_id: entity.linkId,
    ingest_id: ingestId,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    data_hash: dataHash,
  };

  switch (entity.type) {
    case "sites": {
      const s = entity.data;
      return {
        ...base,
        site_id: entity.siteId,
        uid: s.uid,
        name: s.name,
        status: "active",
        site_variables: s.siteVariables ?? {},
      };
    }
    case "endpoints": {
      const d = entity.data;
      return {
        ...base,
        site_id: entity.siteId,
        hostname: d.hostname,
        online: d.online,
        category: d.deviceType.category,
        os: d.operatingSystem || "",
        ip_address: d.intIpAddress,
        ext_address: d.extIpAddress || "",
        last_reboot_at: new Date(d.lastReboot || 0).toISOString(),
        last_heartbeat_at: d.lastSeen
          ? new Date(d.lastSeen).toISOString()
          : null,
        udfs: d.udf,
      };
    }
  }
}

// ============================================================================
// HASH — only over typed stored columns
// ============================================================================

function getHashableFields(entity: RawDattoEntity): Record<string, any> {
  switch (entity.type) {
    case "sites": {
      const s = entity.data;
      return {
        uid: s.uid,
        name: s.name,
        status: "active",
        site_variables: s.siteVariables ?? {},
        site_id: entity.siteId,
      };
    }
    case "endpoints": {
      const d = entity.data;
      return {
        hostname: d.hostname,
        online: d.online,
        category: d.deviceType.category,
        os: d.operatingSystem || "",
        ip_address: d.intIpAddress,
        ext_address: d.extIpAddress || "",
        last_reboot_at: new Date(d.lastReboot || 0).toISOString(),
        last_heartbeat_at: d.lastSeen
          ? new Date(d.lastSeen).toISOString()
          : null,
        udfs: d.udf,
      };
    }
  }
}

function calculateHash(data: Record<string, any>): string {
  const jsonString = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash("sha256").update(jsonString).digest("hex");
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
