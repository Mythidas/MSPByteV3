<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import { supabase } from '$lib/utils/supabase.js';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import CheckResults from './_check-results.svelte';

  type Framework = { id: string; name: string };
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
  type Link = { id: string; name: string };

  const SEVERITY_ORDER: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  let loading = $state(true);
  let frameworks = $state<Framework[]>([]);
  let checks = $state<Check[]>([]);
  let results = $state<Result[]>([]);
  let links = $state<Link[]>([]);
  let selectedFrameworkId = $state<string | null>(null);
  let statusFilter = $state<'fail' | 'pass' | 'all'>('fail');

  $effect(() => {
    const tenantId = authStore.currentTenant?.id ?? '';
    if (!tenantId) return;

    const load = async () => {
      loading = true;

      const [fwRes, checkRes, resultRes, linkRes] = await Promise.all([
        (supabase as any)
          .from('compliance_frameworks' as any)
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('integration_id', 'microsoft-365'),
        (supabase as any)
          .from('compliance_framework_checks' as any)
          .select('id, name, description, severity, check_config, framework_id')
          .eq('tenant_id', tenantId),
        (supabase as any)
          .from('compliance_results' as any)
          .select('id, framework_check_id, link_id, status, detail, evaluated_at')
          .eq('tenant_id', tenantId)
          .order('evaluated_at', { ascending: false }),
        (supabase as any)
          .from('integration_links' as any)
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('integration_id', 'microsoft-365'),
      ]);

      frameworks = (fwRes.data ?? []) as Framework[];
      checks = (checkRes.data ?? []) as Check[];
      results = (resultRes.data ?? []) as Result[];
      links = (linkRes.data ?? []) as Link[];

      // Auto-select first framework
      if (frameworks.length > 0 && !selectedFrameworkId) {
        selectedFrameworkId = frameworks[0].id;
      }

      loading = false;
    };

    load();
  });

  // Build lookup maps
  const checkMap = $derived(new Map(checks.map((c) => [c.id, c])));
  const linkMap = $derived(new Map(links.map((l) => [l.id, l.name])));
  const frameworkMap = $derived(new Map(frameworks.map((f) => [f.id, f])));

  // Dedup results: latest per (linkId, checkId)
  const latestResults = $derived.by(() => {
    const link = scopeStore.currentLink;
    const map = new Map<string, Result>();
    for (const r of results) {
      const key = `${r.link_id}::${r.framework_check_id}`;
      if (!map.has(key)) {
        map.set(key, r);
      }
    }
    // Filter by scope if a link is selected
    if (link) {
      for (const [key, r] of map) {
        if (r.link_id !== link) map.delete(key);
      }
    }
    return map;
  });

  // All visible results as array
  const visibleResults = $derived(Array.from(latestResults.values()));

  // Summary counts (across all frameworks)
  const summaryPass = $derived(visibleResults.filter((r) => r.status === 'pass').length);
  const summaryFail = $derived(visibleResults.filter((r) => r.status === 'fail').length);
  const summaryUnknown = $derived(
    visibleResults.filter((r) => r.status !== 'pass' && r.status !== 'fail').length
  );
  const summaryTotal = $derived(visibleResults.length);
  const summaryPassRate = $derived(
    summaryTotal > 0 ? Math.round((summaryPass / summaryTotal) * 100) : 0
  );

  // Per-framework summary for selector cards
  const frameworkSummaries = $derived.by(() => {
    const summaries = new Map<
      string,
      { passCount: number; failCount: number; unknownCount: number }
    >();
    for (const fw of frameworks) {
      summaries.set(fw.id, { passCount: 0, failCount: 0, unknownCount: 0 });
    }
    for (const r of visibleResults) {
      const check = checkMap.get(r.framework_check_id);
      if (!check) continue;
      const s = summaries.get(check.framework_id);
      if (!s) continue;
      if (r.status === 'pass') s.passCount++;
      else if (r.status === 'fail') s.failCount++;
      else s.unknownCount++;
    }
    return summaries;
  });

  // Checks for selected framework, sorted by severity
  const selectedFrameworkChecks = $derived.by(() => {
    if (!selectedFrameworkId) return [];
    return checks
      .filter((c) => c.framework_id === selectedFrameworkId)
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));
  });

  // Results for the selected framework, grouped by check
  const resultsByCheck = $derived.by(() => {
    const map = new Map<string, Result[]>();
    for (const r of visibleResults) {
      const check = checkMap.get(r.framework_check_id);
      if (!check || check.framework_id !== selectedFrameworkId) continue;
      const arr = map.get(r.framework_check_id) ?? [];
      arr.push(r);
      map.set(r.framework_check_id, arr);
    }
    return map;
  });

  // Checks to show after status filter
  const filteredChecks = $derived.by(() => {
    if (statusFilter === 'all') return selectedFrameworkChecks;
    const values = selectedFrameworkChecks.filter((c) => {
      const checkResults = resultsByCheck.get(c.id) ?? [];
      if (statusFilter === 'fail') return checkResults.some((r) => r.status === 'fail');
      if (statusFilter === 'pass') return checkResults.some((r) => r.status === 'pass');
    });

    return values;
  });

  // Selected framework pass rate
  const selectedFrameworkSummary = $derived(
    selectedFrameworkId ? (frameworkSummaries.get(selectedFrameworkId) ?? null) : null
  );
  const selectedFrameworkPassRate = $derived.by(() => {
    if (!selectedFrameworkSummary) return 0;
    const total =
      selectedFrameworkSummary.passCount +
      selectedFrameworkSummary.failCount +
      selectedFrameworkSummary.unknownCount;
    return total > 0 ? Math.round((selectedFrameworkSummary.passCount / total) * 100) : 0;
  });

  const linkSelected = $derived(!!scopeStore.currentLink);
</script>

<div class="flex flex-col gap-6 p-1">
  <h1 class="text-2xl font-bold">Compliance</h1>

  <!-- Summary cards -->
  {#if !loading}
    <FadeIn>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Pass Rate</span>
            <span
              class="text-2xl font-bold {summaryPassRate >= 80
                ? 'text-success'
                : summaryPassRate >= 50
                  ? 'text-warning'
                  : 'text-destructive'}"
            >
              {summaryPassRate}%
            </span>
          </div>
        </Card.Root>
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Passing</span>
            <span class="text-2xl font-bold text-success">{summaryPass}</span>
          </div>
        </Card.Root>
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Failing</span>
            <span class="text-2xl font-bold {summaryFail > 0 ? 'text-destructive' : ''}"
              >{summaryFail}</span
            >
          </div>
        </Card.Root>
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Unknown</span>
            <span class="text-2xl font-bold {summaryUnknown > 0 ? 'text-muted-foreground' : ''}"
              >{summaryUnknown}</span
            >
          </div>
        </Card.Root>
      </div>
    </FadeIn>
  {:else}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {#each Array(4) as _}
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">—</span>
            <span class="text-2xl font-bold text-muted-foreground/30">—</span>
          </div>
        </Card.Root>
      {/each}
    </div>
  {/if}

  <!-- Two-panel layout -->
  {#if !loading}
    <FadeIn>
      {#if frameworks.length === 0}
        <div class="text-sm text-muted-foreground">
          No compliance frameworks found for this integration.
        </div>
      {:else}
        <div class="flex gap-4 items-start">
          <!-- Left: framework selector -->
          <div class="flex flex-col gap-2 w-52 shrink-0">
            {#each frameworks as fw (fw.id)}
              {@const summary = frameworkSummaries.get(fw.id)}
              {@const isActive = selectedFrameworkId === fw.id}
              <button
                class="text-left rounded-lg border p-3 transition-colors {isActive
                  ? 'bg-primary/10 border-primary/30'
                  : 'bg-card hover:border-primary/20 hover:bg-primary/5'}"
                onclick={() => {
                  selectedFrameworkId = fw.id;
                  statusFilter = 'fail';
                }}
              >
                <div class="font-medium text-sm leading-tight">{fw.name}</div>
                {#if summary}
                  <div class="flex items-center gap-1.5 mt-1.5">
                    <span
                      class="text-xs px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30"
                    >
                      {summary.passCount} pass
                    </span>
                    {#if summary.failCount > 0}
                      <span
                        class="text-xs px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30"
                      >
                        {summary.failCount} fail
                      </span>
                    {/if}
                  </div>
                {/if}
              </button>
            {/each}
          </div>

          <!-- Right: checks + results -->
          <div class="flex-1 min-w-0 flex flex-col gap-3">
            {#if selectedFrameworkId}
              {@const fw = frameworkMap.get(selectedFrameworkId)}
              <!-- Framework header -->
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="font-semibold">{fw?.name}</span>
                  {#if selectedFrameworkSummary}
                    <span class="text-sm text-muted-foreground">
                      {selectedFrameworkPassRate}% pass rate
                    </span>
                  {/if}
                </div>

                <!-- Status filter pills -->
                <div class="flex items-center rounded-md border overflow-hidden text-xs shrink-0">
                  <button
                    class="px-3 py-1.5 transition-colors {statusFilter === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'}"
                    onclick={() => (statusFilter = 'all')}
                  >
                    All
                  </button>
                  <button
                    class="px-3 py-1.5 transition-colors border-x {statusFilter === 'fail'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'}"
                    onclick={() => (statusFilter = 'fail')}
                  >
                    Failures
                  </button>
                  <button
                    class="px-3 py-1.5 transition-colors {statusFilter === 'pass'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'}"
                    onclick={() => (statusFilter = 'pass')}
                  >
                    Passing
                  </button>
                </div>
              </div>

              {#if filteredChecks.length === 0}
                <div class="text-sm text-muted-foreground py-4">
                  {statusFilter === 'fail'
                    ? 'No failing checks for this framework.'
                    : statusFilter === 'pass'
                      ? 'No passing checks for this framework.'
                      : 'No checks configured for this framework.'}
                </div>
              {:else}
                {#each filteredChecks as check (check.id)}
                  <CheckResults
                    {statusFilter}
                    {check}
                    results={resultsByCheck.get(check.id) ?? []}
                    {linkMap}
                    {linkSelected}
                  />
                {/each}
              {/if}
            {/if}
          </div>
        </div>
      {/if}
    </FadeIn>
  {:else}
    <div class="flex gap-4">
      <div class="w-52 shrink-0 flex flex-col gap-2">
        {#each Array(3) as _}
          <Card.Root class="p-3 h-16" />
        {/each}
      </div>
      <div class="flex-1 flex flex-col gap-3">
        {#each Array(4) as _}
          <Card.Root class="p-4 h-20" />
        {/each}
      </div>
    </div>
  {/if}
</div>
