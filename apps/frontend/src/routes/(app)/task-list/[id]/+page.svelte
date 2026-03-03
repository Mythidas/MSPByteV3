<script lang="ts">
  import { ArrowLeft, ChevronDown, ChevronRight } from '@lucide/svelte';
  import DisplayResultView from '$lib/components/pipeline/DisplayResultView.svelte';
  import type {
    DisplaySection,
    EntityLogEntry,
  } from '$lib/components/pipeline/DisplayResultView.svelte';

  const { data } = $props();

  type StageRow = {
    id: string;
    run_id: string;
    stage_node_id: string;
    stage_index: number;
    label: string;
    stage_type: string;
    ref: string | null;
    tenant_id: string;
    integration: string | null;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    resolved_input: Record<string, unknown> | null;
    output: unknown;
    affected_entity_ids: string[] | null;
    error: string | null;
  };

  const run = data.run as any;
  const stages = data.stages as StageRow[];
  const workflowName = data.workflowName as string | null;

  // Build entity log: stored as array on task_runs
  const entityLog: EntityLogEntry[] = Array.isArray(run.entity_log) ? run.entity_log : [];

  // Build stage_outputs map for DisplayResultView
  const stageOutputs = $derived.by(() => {
    const map: Record<string, unknown> = {};
    for (const stage of stages) {
      if (stage.output !== null && stage.output !== undefined) {
        map[stage.stage_node_id] = stage.output;
      }
    }
    return map;
  });

  // Detect display stage in workflow_snapshot
  const displayStage = $derived.by(() => {
    const snapshot = run.workflow_snapshot as any[] | null;
    if (!Array.isArray(snapshot)) return null;
    return snapshot.find((s: any) => s.type === 'display') ?? null;
  });

  const displaySections = $derived.by((): DisplaySection[] => {
    if (!displayStage?.display_config?.sections) return [];
    return displayStage.display_config.sections;
  });

  // Expanded state for stage detail
  let expandedStages = $state<Set<string>>(new Set());

  function toggleStage(id: string) {
    const next = new Set(expandedStages);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedStages = next;
  }

  function formatDuration(ms: number | null): string {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
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
    cancelled: { classes: 'bg-muted text-muted-foreground border-border' },
    skipped: { classes: 'bg-muted text-muted-foreground border-border' },
  };

  function statusCfg(status: string) {
    return STATUS_CONFIG[status] ?? { classes: 'bg-muted text-muted-foreground border-border' };
  }

  // Entity map for resolving IDs in stage detail
  const entityMap = $derived.by(() => {
    const m = new Map<string, string>();
    for (const entry of entityLog) {
      m.set(entry.entity_id, entry.display_name ?? entry.entity_id);
    }
    return m;
  });

  const runStatusCfg = $derived(statusCfg(run.status));

  const nonDisplayStages = $derived(stages.filter((s) => s.stage_type !== 'display'));

  let detailsSearch = $state('');
  let resultsOpen = $state(true);
  let detailsOpen = $state(false);

  $effect(() => {
    if (detailsOpen) resultsOpen = false;
  });

  $effect(() => {
    if (resultsOpen) detailsOpen = false;
  });

  function filterJson(data: unknown, query: string): unknown {
    if (!query) return data;
    const q = query.toLowerCase();
    if (Array.isArray(data)) {
      return data.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
    }
    if (data !== null && typeof data === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        out[k] = filterJson(v, q);
      }
      return out;
    }
    return data;
  }

  function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function syntaxHighlightJson(data: unknown): string {
    if (data === null || data === undefined) return '<span style="color:#6b7280">null</span>';
    const str = JSON.stringify(data, null, 2);
    return str.replace(
      /("(?:[^"\\]|\\.)*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (m) => {
        const e = escHtml(m);
        if (m.trimEnd().endsWith(':')) return `<span style="color:#c084fc">${e}</span>`;
        if (m.startsWith('"')) return `<span style="color:#86efac">${e}</span>`;
        if (m === 'true' || m === 'false') return `<span style="color:#fbbf24">${e}</span>`;
        if (m === 'null') return `<span style="color:#6b7280">${e}</span>`;
        return `<span style="color:#7dd3fc">${e}</span>`;
      }
    );
  }
</script>

<div class="flex flex-col gap-6 p-4 size-full overflow-auto mx-auto">
  <!-- Back nav -->
  <a
    href="/task-list"
    class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft class="size-4" />
    Back to Task Runs
  </a>

  <!-- Header -->
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">{workflowName ?? 'Workflow Run'}</h1>
      <span
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium {runStatusCfg.classes}"
      >
        {#if runStatusCfg.dot}
          <span class="size-1.5 rounded-full {runStatusCfg.dot}"></span>
        {/if}
        {run.status}
      </span>
    </div>

    <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-1">
      <span>Started: {formatDateTime(run.started_at)}</span>
      <span>Completed: {formatDateTime(run.completed_at)}</span>
      <span>Duration: {formatDuration(run.duration_ms)}</span>
      <span>Triggered by: {run.triggered_by}</span>
      {#if entityLog.length > 0}
        <span>Entities: {entityLog.length}</span>
      {/if}
    </div>
  </div>

  <!-- Display result view (if display stage present) -->
  {#if displaySections.length > 0}
    <details bind:open={resultsOpen} class="group rounded border bg-card">
      <summary
        class="flex cursor-pointer items-center justify-between px-5 py-3 text-sm font-semibold select-none"
      >
        Results
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div class="border-t p-5">
        <DisplayResultView sections={displaySections} {stageOutputs} {entityLog} />
      </div>
    </details>

    <!-- Collapsible execution details -->
    <details bind:open={detailsOpen} class="group rounded border bg-card">
      <summary
        class="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium select-none"
      >
        Execution Details
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div class="border-t px-4 py-3 flex flex-col gap-3">
        <input
          type="search"
          bind:value={detailsSearch}
          placeholder="Search stage data…"
          class="w-full rounded border border-border bg-muted/20 px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div class="flex flex-col gap-3">
          {#each nonDisplayStages as stage (stage.id)}
            {@render stageCard(stage)}
          {/each}
        </div>
      </div>
    </details>
  {:else}
    <!-- Generic timeline (no display stage) -->
    <div class="flex flex-col gap-3">
      {#each stages as stage (stage.id)}
        {@render stageCard(stage)}
      {/each}
    </div>
  {/if}
</div>

{#snippet stageCard(stage: StageRow)}
  {@const cfg = statusCfg(stage.status)}
  {@const isExpanded = expandedStages.has(stage.id)}
  <div
    class="rounded border bg-card overflow-hidden {stage.status === 'failed'
      ? 'border-l-4 border-l-destructive'
      : ''}"
  >
    <!-- Stage header -->
    <button
      class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      onclick={() => toggleStage(stage.id)}
    >
      <span class="shrink-0 text-muted-foreground">
        {#if isExpanded}
          <ChevronDown class="size-4" />
        {:else}
          <ChevronRight class="size-4" />
        {/if}
      </span>

      <span class="flex-1 font-medium text-sm">{stage.label}</span>

      {#if stage.integration}
        <span
          class="rounded border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground"
        >
          {stage.integration}
        </span>
      {/if}

      <span
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium {cfg.classes}"
      >
        {#if cfg.dot}
          <span class="size-1.5 rounded-full {cfg.dot}"></span>
        {/if}
        {stage.status}
      </span>

      <span class="text-xs text-muted-foreground tabular-nums min-w-12 text-right">
        {formatDuration(stage.duration_ms)}
      </span>

      {#if stage.affected_entity_ids && stage.affected_entity_ids.length > 0}
        <span class="text-xs text-muted-foreground">
          {stage.affected_entity_ids.length} entities
        </span>
      {/if}
    </button>

    <!-- Expanded body -->
    {#if isExpanded}
      <div class="border-t bg-muted/10 px-4 py-3 flex flex-col gap-4 text-xs">
        {#if stage.error}
          <div
            class="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive font-mono"
          >
            {stage.error}
          </div>
        {/if}

        {#if stage.resolved_input && Object.keys(stage.resolved_input).length > 0}
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Inputs
            </p>
            <pre
              class="text-xs font-mono overflow-x-auto rounded border bg-muted/20 p-3 leading-relaxed">{@html syntaxHighlightJson(
                filterJson(stage.resolved_input, detailsSearch)
              )}</pre>
          </div>
        {/if}

        {#if stage.output !== null && stage.output !== undefined}
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Output
            </p>
            <pre
              class="text-xs font-mono overflow-x-auto rounded border bg-muted/20 p-3 leading-relaxed">{@html syntaxHighlightJson(
                filterJson(stage.output, detailsSearch)
              )}</pre>
          </div>
        {/if}

        {#if stage.affected_entity_ids && stage.affected_entity_ids.length > 0}
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Affected Entities ({stage.affected_entity_ids.length})
            </p>
            <div class="flex flex-col gap-1">
              {#each stage.affected_entity_ids as id}
                <div class="flex items-center gap-2">
                  <span class="font-medium">{entityMap.get(id) ?? id}</span>
                  {#if entityMap.has(id)}
                    <span class="text-muted-foreground font-mono">{id}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}
