<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { ExternalLink } from '@lucide/svelte';

  const { data } = $props();

  type RunRow = {
    id: string;
    workflow_id: string | null;
    tenant_id: string;
    triggered_by: string;
    triggered_by_user: string | null;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    created_at: string;
  };

  let runs = $state<RunRow[]>(data.runs);
  let workflowNames = $state<Record<string, string>>(data.workflowNames);
  let filterMine = $state(data.filterMine);
  let statusFilter = $state<string[]>([]);
  let isLoading = $state(false);

  const ALL_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled', 'partial'];

  async function fetchRuns() {
    isLoading = true;
    try {
      let query = (supabase.from('task_runs' as any) as any)
        .select(
          'id, workflow_id, tenant_id, triggered_by, triggered_by_user, status, started_at, completed_at, duration_ms, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(50);

      if (filterMine) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id) {
          query = query.eq('triggered_by_user', authData.user.id);
        }
      }

      if (statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }

      const { data: rows } = await query;
      runs = rows ?? [];

      const allIds: string[] = (rows ?? [])
        .map((r: any) => r.workflow_id)
        .filter((id: any) => typeof id === 'string');
      const newIds = [...new Set(allIds)];
      const missingIds = newIds.filter((id) => !workflowNames[id]);
      if (missingIds.length > 0) {
        const { data: wfs } = await (supabase.from('workflows' as any) as any)
          .select('id, name')
          .in('id', missingIds);
        const next = { ...workflowNames };
        for (const wf of wfs ?? []) next[wf.id] = wf.name;
        workflowNames = next;
      }
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    const params = new URLSearchParams(page.url.search);
    const newFilter = params.get('filter') !== 'all';
    if (newFilter !== filterMine) {
      filterMine = newFilter;
    }
  });

  $effect(() => {
    // Reactive re-fetch whenever filter or status changes
    filterMine;
    statusFilter;
    fetchRuns();
  });

  function toggleFilter() {
    const newFilter = !filterMine;
    filterMine = newFilter;
    const params = new URLSearchParams(page.url.search);
    if (newFilter) {
      params.delete('filter');
    } else {
      params.set('filter', 'all');
    }
    goto(`?${params.toString()}`, { replaceState: true, keepFocus: true });
  }

  function toggleStatus(s: string) {
    if (statusFilter.includes(s)) {
      statusFilter = statusFilter.filter((x) => x !== s);
    } else {
      statusFilter = [...statusFilter, s];
    }
  }

  function formatDuration(ms: number | null): string {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  function formatRelative(iso: string | null): string {
    if (!iso) return '—';
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMs = now - then;
    if (diffMs < 60000) return 'just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return `${Math.floor(diffMs / 86400000)}d ago`;
  }

  const STATUS_CONFIG: Record<string, { classes: string; dot?: string }> = {
    pending: { classes: 'bg-muted text-muted-foreground border-border' },
    running: {
      classes: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
      dot: 'animate-pulse bg-blue-500',
    },
    completed: { classes: 'bg-green-500/15 text-green-600 border-green-500/30' },
    partial: { classes: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
    failed: { classes: 'bg-destructive/15 text-destructive border-destructive/30' },
    cancelled: { classes: 'bg-muted text-muted-foreground border-border line-through' },
  };
</script>

<div class="flex flex-col gap-4 p-4 size-full overflow-auto">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Task Runs</h1>
    <div class="flex items-center gap-2">
      <Button variant={filterMine ? 'default' : 'outline'} size="sm" onclick={toggleFilter}>
        {filterMine ? 'My Runs' : 'All Runs'}
      </Button>
    </div>
  </div>

  <!-- Status filter chips -->
  <div class="flex flex-wrap gap-1.5">
    {#each ALL_STATUSES as s}
      {@const cfg = STATUS_CONFIG[s] ?? { classes: 'bg-muted text-muted-foreground border-border' }}
      <button
        class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity {statusFilter.length >
          0 && !statusFilter.includes(s)
          ? 'opacity-40'
          : ''} {cfg.classes}"
        onclick={() => toggleStatus(s)}
      >
        {s}
      </button>
    {/each}
    {#if statusFilter.length > 0}
      <button
        class="text-xs text-muted-foreground hover:text-foreground underline"
        onclick={() => (statusFilter = [])}
      >
        clear
      </button>
    {/if}
  </div>

  {#if isLoading}
    <div class="text-sm text-muted-foreground py-4">Loading...</div>
  {:else if runs.length === 0}
    <div class="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
      No task runs found. Run a workflow from the Microsoft 365 → Users page to get started.
    </div>
  {:else}
    <div class="rounded-lg border bg-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
            <th class="px-4 py-2.5 text-left font-medium">Workflow</th>
            <th class="px-4 py-2.5 text-left font-medium">Triggered By</th>
            <th class="px-4 py-2.5 text-left font-medium">Status</th>
            <th class="px-4 py-2.5 text-left font-medium">Started</th>
            <th class="px-4 py-2.5 text-left font-medium">Duration</th>
            <th class="px-4 py-2.5 text-left font-medium"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each runs as run (run.id)}
            {@const cfg = STATUS_CONFIG[run.status] ?? {
              classes: 'bg-muted text-muted-foreground border-border',
            }}
            <tr class="hover:bg-muted/20 transition-colors">
              <td class="px-4 py-3 font-medium">
                {workflowNames[run.workflow_id ?? ''] ?? '—'}
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                <span class="capitalize">{run.triggered_by}</span>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium {cfg.classes}"
                >
                  {#if cfg.dot}
                    <span class="size-1.5 rounded-full {cfg.dot}"></span>
                  {/if}
                  {run.status}
                </span>
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                {formatRelative(run.started_at ?? run.created_at)}
              </td>
              <td class="px-4 py-3 text-muted-foreground tabular-nums">
                {formatDuration(run.duration_ms)}
              </td>
              <td class="px-4 py-3">
                <a
                  href="/task-list/{run.id}"
                  class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View <ExternalLink class="size-3" />
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
