<script lang="ts">
  export type DisplaySectionType = 'entity_list' | 'stat' | 'summary_text';

  export interface DisplaySection {
    type: DisplaySectionType;
    label?: string;
    source?: string;
    aggregate?: 'count';
    template?: string;
  }

  export interface EntityLogEntry {
    entity_id: string;
    entity_type: string;
    integration: string;
    display_name: string | null;
    site_id: string | null;
    connection_id: string | null;
    raw_data: Record<string, unknown>;
    actions_applied: string[];
    stage_node_ids: string[];
  }

  interface Props {
    sections: DisplaySection[];
    stageOutputs: Record<string, unknown>;
    entityLog: EntityLogEntry[];
  }

  const { sections, stageOutputs, entityLog }: Props = $props();

  let listSearch = $state<Record<string, string>>({});

  function resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
    return path
      .split('.')
      .reduce(
        (acc: unknown, key) =>
          acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
        obj
      );
  }

  const entityMap = $derived.by(() => {
    const m = new Map<string, string>();
    for (const entry of entityLog) {
      m.set(entry.entity_id, entry.display_name ?? entry.entity_id);
    }
    return m;
  });

  function interpolate(template: string): string {
    let result = template;

    // Count helpers across all stage outputs
    let inCount = 0;
    let outCount = 0;
    for (const output of Object.values(stageOutputs)) {
      if (output && typeof output === 'object') {
        const o = output as Record<string, unknown>;
        if (Array.isArray(o['in_ids'])) inCount += (o['in_ids'] as unknown[]).length;
        if (Array.isArray(o['out_ids'])) outCount += (o['out_ids'] as unknown[]).length;
      }
    }

    const uniqueSites = new Set(entityLog.map((e) => e.site_id).filter(Boolean));

    result = result.replace(/\{\{in_count\}\}/g, String(inCount));
    result = result.replace(/\{\{out_count\}\}/g, String(outCount));
    result = result.replace(/\{\{entity_count\}\}/g, String(entityLog.length));
    result = result.replace(/\{\{site_count\}\}/g, String(uniqueSites.size));
    return result;
  }

  function resolveIds(source: string | undefined): string[] {
    if (!source) return [];
    const ctx = { stage_outputs: stageOutputs };
    const value = resolveDotPath(ctx as Record<string, unknown>, source);
    if (Array.isArray(value)) return value as string[];
    return [];
  }
</script>

<div class="flex flex-col gap-6">
  {#each sections as section (section.label ?? section.type)}
    {#if section.type === 'summary_text' && section.template}
      <div class="rounded border border-primary/20 bg-primary/5 px-4 py-3">
        <p class="text-base font-medium">{interpolate(section.template)}</p>
      </div>
    {:else if section.type === 'stat' && section.source}
      {@const ids = resolveIds(section.source)}
      {@const value = section.aggregate === 'count' ? ids.length : ids.length}
      <div
        class="rounded border border-primary/20 bg-primary/5 px-6 py-4 inline-flex flex-col items-start gap-1 w-fit min-w-32"
      >
        <span class="text-3xl font-bold tabular-nums">{value}</span>
        {#if section.label}
          <span class="text-sm text-muted-foreground">{section.label}</span>
        {/if}
      </div>
    {:else if section.type === 'entity_list' && section.source}
      {@const ids = resolveIds(section.source)}
      {@const sectionKey = section.label ?? section.source ?? 'list'}
      {@const q = (listSearch[sectionKey] ?? '').toLowerCase()}
      {@const visibleIds = q
        ? ids.filter(
            (id) =>
              (entityMap.get(id) ?? id).toLowerCase().includes(q) || id.toLowerCase().includes(q)
          )
        : ids}
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {section.label ?? 'Entities'} ({q ? `${visibleIds.length} of ${ids.length}` : ids.length})
        </h3>
        {#if ids.length === 0}
          <p class="text-sm text-muted-foreground italic">No entities in this group</p>
        {:else}
          <input
            type="search"
            value={listSearch[sectionKey] ?? ''}
            oninput={(e) => {
              listSearch[sectionKey] = (e.target as HTMLInputElement).value;
            }}
            placeholder="Search entities…"
            class="w-full rounded border border-border bg-muted/20 px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div class="rounded border bg-card divide-y divide-border max-h-52 overflow-y-auto">
            {#each visibleIds as id}
              <div class="flex items-center justify-between px-3 py-2 text-sm">
                <span class="font-medium">{entityMap.get(id) ?? id}</span>
                <span class="text-xs text-muted-foreground font-mono">{id}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>
