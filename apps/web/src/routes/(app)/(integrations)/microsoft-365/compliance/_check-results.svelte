<script lang="ts">
  import { ChevronDown, ChevronRight, ExternalLink } from '@lucide/svelte';

  type Check = {
    id: string;
    name: string;
    severity: string;
    description: string | null;
    check_config: Record<string, unknown>;
    framework_id: string;
  };

  type Result = {
    id: string;
    framework_check_id: string;
    link_id: string;
    status: string;
    detail: Record<string, unknown> | null;
    evaluated_at: string;
  };

  const TABLE_ROUTES: Record<string, string> = {
    'vendors.m365_policies': '/microsoft-365/policies',
    m365_policies: '/microsoft-365/policies',
    'vendors.m365_identities': '/microsoft-365/identities',
    m365_identities: '/microsoft-365/identities',
    'vendors.m365_groups': '/microsoft-365/groups',
    m365_groups: '/microsoft-365/groups',
    'vendors.m365_roles': '/microsoft-365/roles',
    m365_roles: '/microsoft-365/roles',
    'vendors.m365_licenses': '/microsoft-365/licenses',
    m365_licenses: '/microsoft-365/licenses',
    'vendors.m365_exchange_configs': '/microsoft-365/exchange',
    m365_exchange_configs: '/microsoft-365/exchange',
  };

  function getSourceRoute(check: Check): string | null {
    const t = check.check_config?.table as string | undefined;
    return t ? (TABLE_ROUTES[t] ?? null) : null;
  }

  function renderDetail(detail: Record<string, unknown> | null): string {
    if (!detail) return '—';
    if (detail.error) return `Error: ${String(detail.error)}`;
    if (typeof detail.count === 'number' && typeof detail.threshold === 'number')
      return `${detail.count} of ${detail.threshold} matched`;
    return JSON.stringify(detail);
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const SEVERITY_CLASSES: Record<string, string> = {
    critical: 'bg-destructive/15 text-destructive border border-destructive/30',
    high: 'bg-warning/15 text-warning border border-warning/30',
    medium: 'bg-amber-500/15 text-amber-500 border border-amber-500/30',
    low: 'bg-muted text-muted-foreground border border-border',
    info: 'bg-muted text-muted-foreground border border-border',
  };

  const STATUS_CLASSES: Record<string, string> = {
    pass: 'bg-success/15 text-success border border-success/30',
    fail: 'bg-destructive/15 text-destructive border border-destructive/30',
    unknown: 'bg-muted text-muted-foreground border border-border',
  };

  const {
    check,
    statusFilter,
    results,
    linkMap,
    linkSelected = false,
  }: {
    check: Check;
    statusFilter: 'pass' | 'fail' | 'all';
    results: Result[];
    linkMap: Map<string, string>;
    linkSelected?: boolean;
  } = $props();

  let expandedRows = $state<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedRows = next;
  }

  let collapsed = $state(true);

  const sourceRoute = $derived(getSourceRoute(check));
  const failCount = $derived(results.filter((r) => r.status === 'fail').length);
  const passCount = $derived(results.filter((r) => r.status === 'pass').length);
  const checkStatusClass = $derived(
    failCount > 0
      ? 'bg-destructive/15 text-destructive border border-destructive/30'
      : passCount > 0
        ? 'bg-success/15 text-success border border-success/30'
        : 'bg-muted text-muted-foreground border border-border',
  );
  const checkStatusLabel = $derived(
    failCount > 0 ? `${failCount} failing` : passCount > 0 ? 'passing' : 'unknown',
  );
  const filteredResults = $derived(
    results.filter((r) => {
      if (statusFilter === 'all') return true;

      const value = Array.isArray(r.detail?.failed_conditions)
        ? (
            r.detail!.failed_conditions as {
              field: string;
              op: string;
              value: unknown;
              matched_count: number;
            }[]
          ).length
        : null;

      if (statusFilter === 'pass') return value === null || value === 0;
      else if (statusFilter === 'fail') return !!value && value > 0;
      else return true;
    })
  );
</script>

<div class="rounded-lg border bg-card overflow-hidden">
  <!-- Check header (clickable to collapse/expand) -->
  <button
    class="w-full flex items-center justify-between gap-2 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
    onclick={() => (collapsed = !collapsed)}
  >
    <div class="flex items-center gap-2 flex-1 min-w-0">
      {#if collapsed}
        <ChevronRight class="size-3.5 shrink-0 text-muted-foreground" />
      {:else}
        <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
      {/if}
      <span
        class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0 {checkStatusClass}"
      >
        {checkStatusLabel}
      </span>
      <span class="font-medium text-sm truncate">{check.name}</span>
    </div>
    {#if sourceRoute}
      <a
        href={sourceRoute}
        class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title="View data source"
        onclick={(e) => e.stopPropagation()}
      >
        <ExternalLink class="size-3.5" />
      </a>
    {/if}
  </button>

  {#if !collapsed}
    {#if check.description}
      <div class="px-4 py-2 border-b text-xs text-muted-foreground">{check.description}</div>
    {/if}

    <!-- Results -->
    {#if results.length === 0}
      <div class="px-4 py-3 text-xs text-muted-foreground">No results for this check.</div>
    {:else}
      <div class="divide-y border-t">
      {#each filteredResults as result (result.id)}
        {@const failedConditions = Array.isArray(result.detail?.failed_conditions)
          ? (result.detail!.failed_conditions as {
              field: string;
              op: string;
              value: unknown;
              matched_count: number;
            }[])
          : null}
        {@const hasExpand =
          result.status === 'fail' && failedConditions && failedConditions.length > 0}
        {@const isExpanded = expandedRows.has(result.id)}

        <div>
          <div class="flex items-center gap-3 px-4 py-2 text-sm">
            {#if hasExpand}
              <button
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                onclick={() => toggleExpanded(result.id)}
              >
                {#if isExpanded}
                  <ChevronDown class="size-3.5" />
                {:else}
                  <ChevronRight class="size-3.5" />
                {/if}
              </button>
            {:else}
              <span class="size-3.5 shrink-0"></span>
            {/if}

            {#if !linkSelected}
              <span class="flex-1 min-w-0 truncate text-muted-foreground text-xs">
                {linkMap.get(result.link_id) ?? result.link_id}
              </span>
            {/if}

            <span
              class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium uppercase shrink-0 {STATUS_CLASSES[
                result.status
              ] ?? STATUS_CLASSES['unknown']}"
            >
              {result.status}
            </span>

            <span class="text-xs text-muted-foreground flex-1 min-w-0 truncate">
              {renderDetail(result.detail)}
            </span>

            <span class="text-xs text-muted-foreground shrink-0">
              {relativeTime(result.evaluated_at)}
            </span>
          </div>

          {#if isExpanded && failedConditions}
            <div class="px-4 py-2 flex flex-col gap-1">
              {#each failedConditions as cond}
                <div class="text-xs text-muted-foreground flex items-center gap-1">
                  <span class="font-mono bg-muted px-1 py-0.5 rounded">{cond.field}</span>
                  <span>{cond.op}</span>
                  <span class="font-mono bg-muted px-1 py-0.5 rounded">{String(cond.value)}</span>
                  <span class="text-muted-foreground/60">— {cond.matched_count} matched</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      </div>
    {/if}
  {/if}
</div>
