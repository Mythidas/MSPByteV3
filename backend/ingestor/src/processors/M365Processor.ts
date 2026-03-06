import crypto from 'crypto';
import { getSupabase, getORM } from '../supabase.js';
import { PipelineTracker } from '../lib/tracker.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { RawM365Entity, M365ProcessedRow, M365EntityType } from '../types.js';
import { TablesInsert } from '@workspace/shared/types/database.js';

/**
 * M365Processor — typed hash-based upsert for vendors.m365_* tables.
 * Routes per entity type. No raw blob stored.
 */
export class M365Processor {
  async process(
    entities: RawM365Entity[],
    entityType: M365EntityType,
    tenantId: string,
    ingestId: string,
    tracker: PipelineTracker
  ): Promise<M365ProcessedRow[]> {
    Logger.info({
      module: 'M365Processor',
      context: 'process',
      message: `Processing ${entities.length} ${entityType} entities`,
    });

    const chunks = chunkArray(entities, 100);
    const allProcessed: M365ProcessedRow[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkRows = await tracker.trackSpan(`processor:chunk:${i}`, async () => {
        return this.processChunk(chunks[i], entityType, tenantId, ingestId, tracker);
      });
      allProcessed.push(...chunkRows);
    }

    const c = tracker.getCounters();
    Logger.info({
      module: 'M365Processor',
      context: 'process',
      message: `Completed: ${c.entities_created} created, ${c.entities_updated} updated, ${c.entities_unchanged} unchanged`,
    });

    return allProcessed;
  }

  async pruneStale(
    processedRows: M365ProcessedRow[],
    entityType: M365EntityType,
    tenantId: string,
    linkId: string | null,
    tracker: PipelineTracker
  ): Promise<number> {
    const survivingIds = new Set(processedRows.map((r) => r.external_id));
    const supabase = getSupabase();
    const tableName = getTableName(entityType);

    const staleIds: string[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;

    while (true) {
      tracker.trackQuery();
      let query = (supabase.schema('vendors').from(tableName as any) as any)
        .select('id, external_id')
        .eq('tenant_id', tenantId)
        .range(offset, offset + PAGE_SIZE - 1);

      if (linkId !== null) {
        query = query.eq('link_id', linkId);
      } else {
        query = query.is('link_id', null);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Fetch ${tableName} for prune failed: ${error.message}`);
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

    const { error } = await getORM().batchDelete('vendors', tableName as any, staleIds);
    if (error) throw new Error(`Delete stale ${tableName} failed: ${error}`);

    tracker.trackEntityDeleted(staleIds.length);
    Logger.info({
      module: 'M365Processor',
      context: 'pruneStale',
      message: `Deleted ${staleIds.length} stale ${entityType} rows`,
    });

    return staleIds.length;
  }

  private async processChunk(
    entities: RawM365Entity[],
    entityType: M365EntityType,
    tenantId: string,
    ingestId: string,
    tracker: PipelineTracker
  ): Promise<M365ProcessedRow[]> {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const tableName = getTableName(entityType);

    // Group by linkId for scoped lookup
    const linkIds = [...new Set(entities.map((e) => getLinkId(e)))];
    const externalIds = entities.map((e) => e.externalId);

    tracker.trackQuery();
    let lookupQuery = supabase
      .schema('vendors')
      .from(tableName as any)
      .select('*')
      .eq('tenant_id', tenantId)
      .in('external_id', externalIds);

    // If all entities share a single linkId, scope the lookup
    if (linkIds.length === 1) {
      const lid = linkIds[0];
      lookupQuery = lid === null ? lookupQuery.is('link_id', null) : lookupQuery.eq('link_id', lid);
    }

    const { data: existing } = await lookupQuery;
    const existingMap = new Map<string, any>(
      (existing ?? []).map((r: any) => [`${r.external_id}:${r.link_id ?? ''}`, r])
    );

    const toCreate: any[] = [];
    const toUpsert: any[] = [];
    const toTouch: string[] = [];
    const result: M365ProcessedRow[] = [];

    for (const entity of entities) {
      const linkId = getLinkId(entity);
      const dataHash = calculateHash(getHashableFields(entity));
      const mapped = mapToDbRow(entity, tenantId, ingestId, now, dataHash);
      const key = `${entity.externalId}:${linkId ?? ''}`;
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
        result.push({ id: ex.id, external_id: ex.external_id, link_id: ex.link_id ?? null });
      }
    }

    // CREATE
    if (toCreate.length > 0) {
      tracker.trackUpsert();
      const { data: created, error } = await supabase
        .schema('vendors')
        .from(tableName as any)
        .insert(toCreate)
        .select('id, external_id, link_id');
      if (error) throw new Error(`Insert ${tableName} failed: ${error.message}`);
      tracker.trackEntityCreated(toCreate.length);
      if (created) {
        result.push(
          ...(created as any[]).map((r: any) => ({
            id: r.id,
            external_id: r.external_id,
            link_id: r.link_id ?? null,
          }))
        );
      }
    }

    // UPDATE (hash changed)
    if (toUpsert.length > 0) {
      for (let i = 0; i < toUpsert.length; i += 100) {
        const chunk = toUpsert.slice(i, i + 100);
        tracker.trackUpsert();
        const { data: updated, error } = await supabase
          .schema('vendors')
          .from(tableName as any)
          .upsert(chunk, { onConflict: 'id' })
          .select('id, external_id, link_id');
        if (error) throw new Error(`Upsert ${tableName} failed: ${error.message}`);
        if (updated) {
          result.push(
            ...(updated as any[]).map((r: any) => ({
              id: r.id,
              external_id: r.external_id,
              link_id: r.link_id ?? null,
            }))
          );
        }
      }
      tracker.trackEntityUpdated(toUpsert.length);
    }

    // TOUCH (unchanged — bump last_seen_at)
    if (toTouch.length > 0) {
      tracker.trackUpsert();
      const { error } = await getORM().batchUpdate('vendors' as any, tableName as any, toTouch, {
        last_seen_at: now,
        ingest_id: ingestId,
        updated_at: now,
      } as any);
      if (error) throw new Error(`Touch ${tableName} failed: ${error}`);
      tracker.trackEntityUnchanged(toTouch.length);
    }

    return result;
  }
}

// ============================================================================
// TABLE ROUTING
// ============================================================================

function getTableName(entityType: M365EntityType): string {
  switch (entityType) {
    case 'identity':
      return 'm365_identities';
    case 'group':
      return 'm365_groups';
    case 'role':
      return 'm365_roles';
    case 'policy':
      return 'm365_policies';
    case 'license':
      return 'm365_licenses';
    case 'exchange-config':
      return 'm365_exchange_configs';
  }
}

function getLinkId(entity: RawM365Entity): string | null {
  return entity.linkId;
}

// ============================================================================
// DB ROW MAPPING — typed columns only, no raw blob
// ============================================================================

function mapToDbRow(
  entity: RawM365Entity,
  tenantId: string,
  ingestId: string,
  now: string,
  dataHash: string
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
    case 'identity': {
      const u = entity.data;
      return {
        ...base,
        site_id: entity.siteId,
        enabled: u.accountEnabled ?? false,
        name: u.displayName ?? null,
        email: u.userPrincipalName ?? null,
        type: u.userType ?? 'Member',
        last_sign_in_at: u.signInActivity?.lastSignInDateTime ?? null,
        last_non_interactive_sign_in_at: u.signInActivity?.lastNonInteractiveSignInDateTime ?? null,
        assigned_licenses: (u.assignedLicenses ?? []).map((l) => l.skuId),
      } as TablesInsert<'vendors', 'm365_identities'>;
    }
    case 'group': {
      const g = entity.data;
      return {
        ...base,
        name: g.displayName ?? null,
        description: g.description ?? null,
        mail_enabled: g.mailEnabled ?? null,
        security_enabled: g.securityEnabled ?? null,
      } as TablesInsert<'vendors', 'm365_groups'>;
    }
    case 'role': {
      const r = entity.data;
      return {
        ...base,
        name: r.displayName ?? null,
        description: r.description ?? null,
        role_template_id: r.roleTemplateId ?? null,
      } as TablesInsert<'vendors', 'm365_roles'>;
    }
    case 'policy': {
      const p = entity.data;
      const requiresMfa =
        (p.grantControls?.builtInControls ?? []).includes('mfa') ||
        (p.grantControls?.builtInControls ?? []).includes('multiFactorAuthentication');
      return {
        ...base,
        name: p.displayName ?? null,
        policy_state: p.state ?? null,
        requires_mfa: requiresMfa,
        grant_controls: p.grantControls ?? null,
        conditions: p.conditions ?? null,
      } as TablesInsert<'vendors', 'm365_policies'>;
    }
    case 'license': {
      const s = entity.data;
      return {
        ...base,
        enabled: s.capabilityStatus === 'Enabled',
        friendly_name: (s as any)?.friendlyName ?? null,
        sku_id: s.skuId,
        sku_part_number: s.skuPartNumber ?? '',
        total_units: s.prepaidUnits?.enabled ?? 0,
        consumed_units: s.consumedUnits ?? 0,
        suspended_units: s.prepaidUnits?.suspended ?? 0,
        warning_units: s.prepaidUnits?.warning ?? 0,
        locked_out_units: s.prepaidUnits?.lockedOut ?? 0,
        service_plan_names: (s.servicePlans ?? []).map((s) => s.servicePlanName),
      } as TablesInsert<'vendors', 'm365_licenses'>;
    }
    case 'exchange-config': {
      return {
        ...base,
        reject_direct_send: entity.rejectDirectSend,
      } as TablesInsert<'vendors', 'm365_exchange_configs'>;
    }
  }
}

// ============================================================================
// HASH — only over typed stored columns
// ============================================================================

function getHashableFields(entity: RawM365Entity): Record<string, any> {
  switch (entity.type) {
    case 'identity': {
      const u = entity.data;
      return {
        enabled: u.accountEnabled,
        name: u.displayName,
        email: u.userPrincipalName,
        type: u.userType,
        last_sign_in_at: u.signInActivity?.lastSignInDateTime ?? null,
        assigned_licenses: (u.assignedLicenses ?? []).map((l) => l.skuId).sort(),
        site_id: entity.siteId,
      };
    }
    case 'group': {
      const g = entity.data;
      return {
        name: g.displayName,
        description: g.description,
        mail_enabled: g.mailEnabled,
        security_enabled: g.securityEnabled,
      };
    }
    case 'role': {
      const r = entity.data;
      return {
        name: r.displayName,
        description: r.description,
        role_template_id: r.roleTemplateId,
      };
    }
    case 'policy': {
      const p = entity.data;
      return {
        name: p.displayName,
        policy_state: p.state,
        template_id: p.templateId,
        grant_controls: p.grantControls,
        conditions: p.conditions,
      };
    }
    case 'license': {
      const s = entity.data;
      return {
        friendly_name: (s as any)?.friendlyName ?? null,
        sku_part_number: s.skuPartNumber,
        total_units: s.prepaidUnits?.enabled,
        consumed_units: s.consumedUnits,
        suspended_units: s.prepaidUnits?.suspended,
        warning_units: s.prepaidUnits?.warning,
        locked_out_units: s.prepaidUnits?.lockedOut,
        service_plan_names: s.servicePlans,
      };
    }
    case 'exchange-config': {
      return {
        reject_direct_send: entity.rejectDirectSend,
      };
    }
  }
}

function calculateHash(data: Record<string, any>): string {
  const jsonString = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
