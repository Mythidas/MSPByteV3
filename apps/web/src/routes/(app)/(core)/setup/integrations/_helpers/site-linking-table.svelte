<script lang="ts">
  import type { Tables, TablesInsert } from '@workspace/shared/types/database';
  import type { Database } from '@workspace/shared/types/schema';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import SearchBar from '$lib/components/search-bar.svelte';
  import SingleSelect from '$lib/components/single-select.svelte';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import Loader from '$lib/components/transition/loader.svelte';
  import {
    Building2,
    CircleCheck,
    CircleX,
    Wand2,
    Save,
    TriangleAlert,
    ChevronDown,
    X,
    MessageSquare,
  } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';

  type DispositionType = Database['public']['Enums']['IntegrationLinkDispositions'];
  type FilterType = 'All' | 'Linked' | 'Unlinked' | 'Dispositioned';

  export type ExternalOption = {
    id: string;
    name: string;
    meta?: Record<string, unknown>;
  };

  let {
    integrationId,
    externalLabel,
    externalOptions,
    loadingExternal,
    initialLinks,
    dbSites,
    canWrite,
    isConfigured,
    loading = false,
  }: {
    integrationId: string;
    externalLabel: string;
    externalOptions: ExternalOption[];
    loadingExternal: boolean;
    initialLinks: Tables<'public', 'integration_links'>[];
    dbSites: Tables<'public', 'sites'>[];
    canWrite: boolean;
    isConfigured: boolean;
    loading?: boolean;
  } = $props();

  let dbLinks = $state(initialLinks);
  let pendingMappings = $state<Record<string, string | undefined>>({});
  let pendingDispositions = $state<Record<string, DispositionType | undefined>>({});
  let pendingNotes = $state<Record<string, string | undefined>>({});
  let saving = $state(false);
  let siteSearch = $state('');
  let activeFilter = $state<FilterType>('All');
  let bannerOpen = $state(false);
  let bannerDismissed = $state(false);

  // Sync internal links when parent reloads
  $effect(() => {
    dbLinks = initialLinks;
  });

  // Initialize pending state from committed DB state
  $effect(() => {
    const nextM: Record<string, string | undefined> = {};
    const nextD: Record<string, DispositionType | undefined> = {};
    const nextN: Record<string, string | undefined> = {};
    for (const site of dbSites) {
      const link = dbLinks.find((l) => l.site_id === site.id);
      nextM[site.id] = link?.external_id ?? undefined;
      nextD[site.id] = (link?.disposition as DispositionType | null) ?? undefined;
      nextN[site.id] = link?.note ?? undefined;
    }
    pendingMappings = nextM;
    pendingDispositions = nextD;
    pendingNotes = nextN;
  });

  // Committed state derived from DB
  const committedMappings = $derived(
    Object.fromEntries(
      dbLinks.filter((l) => l.site_id && l.external_id).map((l) => [l.site_id!, l.external_id!])
    )
  );
  const committedDispositions = $derived(
    Object.fromEntries(
      dbLinks
        .filter((l) => l.site_id && l.disposition)
        .map((l) => [l.site_id!, l.disposition! as DispositionType])
    )
  );
  const committedNotes = $derived(
    Object.fromEntries(dbLinks.filter((l) => l.site_id && l.note).map((l) => [l.site_id!, l.note!]))
  );

  const isDirty = $derived(
    dbSites.some((s) => {
      const mappingDiff = (pendingMappings[s.id] ?? null) !== (committedMappings[s.id] ?? null);
      const dispositionDiff =
        (pendingDispositions[s.id] ?? null) !== (committedDispositions[s.id] ?? null);
      const noteDiff = (pendingNotes[s.id] || null) !== (committedNotes[s.id] || null);
      return mappingDiff || dispositionDiff || noteDiff;
    })
  );

  const linkedSiteIds = $derived(
    new Set(Object.keys(pendingMappings).filter((k) => !!pendingMappings[k]))
  );
  const dispositionedSiteIds = $derived(
    new Set(Object.keys(pendingDispositions).filter((k) => !!pendingDispositions[k]))
  );

  const metrics = $derived({
    total: dbSites.length,
    linked: linkedSiteIds.size,
    dispositioned: dispositionedSiteIds.size,
    unlinked: dbSites.length - linkedSiteIds.size - dispositionedSiteIds.size,
  });

  const filteredSites = $derived(
    dbSites
      .filter((s) => s.name.toLowerCase().includes(siteSearch.toLowerCase()))
      .filter((s) => {
        if (activeFilter === 'Linked') return linkedSiteIds.has(s.id);
        if (activeFilter === 'Unlinked')
          return !linkedSiteIds.has(s.id) && !dispositionedSiteIds.has(s.id);
        if (activeFilter === 'Dispositioned') return dispositionedSiteIds.has(s.id);
        return true;
      })
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  );

  const mappedExternalIds = $derived(
    new Set(Object.values(pendingMappings).filter(Boolean) as string[])
  );
  const unmappedExternal = $derived(externalOptions.filter((o) => !mappedExternalIds.has(o.id)));

  function setMapping(siteId: string, externalId: string | undefined) {
    pendingMappings[siteId] = externalId || undefined;
    if (externalId) pendingDispositions[siteId] = undefined;
  }

  function setDisposition(siteId: string, value: DispositionType | undefined) {
    pendingDispositions[siteId] = value;
    if (value) pendingMappings[siteId] = undefined;
  }

  function normalize(s: string): string[] {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
  }

  function jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(normalize(a));
    const setB = new Set(normalize(b));
    if (setA.size === 0 && setB.size === 0) return 1;
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  function runAutoMap() {
    const taken = new Set(Object.values(pendingMappings).filter(Boolean) as string[]);
    const next = { ...pendingMappings };
    for (const site of dbSites) {
      if (next[site.id] || pendingDispositions[site.id]) continue;
      let bestScore = 0.3;
      let bestId: string | undefined;
      for (const opt of externalOptions) {
        if (taken.has(opt.id)) continue;
        const score = jaccardSimilarity(site.name, opt.name);
        if (score > bestScore) {
          bestScore = score;
          bestId = opt.id;
        }
      }
      if (bestId) {
        next[site.id] = bestId;
        taken.add(bestId);
      }
    }
    pendingMappings = next;
  }

  const loadLinks = async () => {
    const { data: links } = await supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', integrationId)
      .eq('tenant_id', authStore.currentTenant?.id ?? '');
    dbLinks = links ?? [];
  };

  async function handleSaveAll() {
    saving = true;
    try {
      const tenantId = authStore.currentTenant?.id ?? '';
      const toUpsert: TablesInsert<'public', 'integration_links'>[] = [];
      const toDeleteIds: string[] = [];

      for (const site of dbSites) {
        const pendingExtId = pendingMappings[site.id];
        const pendingDisp = pendingDispositions[site.id];
        const pendingNote = pendingNotes[site.id] || null;
        const committedExtId = committedMappings[site.id] ?? null;
        const committedDisp = committedDispositions[site.id] ?? null;
        const committedNote = committedNotes[site.id] || null;

        const changed =
          (pendingExtId ?? null) !== committedExtId ||
          (pendingDisp ?? null) !== committedDisp ||
          pendingNote !== committedNote;
        if (!changed) continue;

        const existingLink = dbLinks.find((l) => l.site_id === site.id);

        if (pendingExtId) {
          const extObj = externalOptions.find((o) => o.id === pendingExtId);
          toUpsert.push({
            integration_id: integrationId,
            tenant_id: tenantId,
            site_id: site.id,
            external_id: pendingExtId,
            name: extObj?.name ?? pendingExtId,
            status: 'active',
            meta: (extObj?.meta ?? {}) as any,
            disposition: null,
            note: pendingNote,
          });
        } else if (pendingDisp) {
          toUpsert.push({
            integration_id: integrationId,
            tenant_id: tenantId,
            site_id: site.id,
            external_id: null,
            name: site.name,
            status: pendingDisp ? 'dispositioned' : 'active',
            meta: {},
            disposition: pendingDisp,
            note: pendingNote,
          });
        } else if (existingLink && (committedExtId || committedDisp)) {
          // Note-only change on an existing link
          toUpsert.push({
            integration_id: integrationId,
            tenant_id: tenantId,
            site_id: site.id,
            external_id: committedExtId,
            name: existingLink.name ?? site.name,
            status: (existingLink.status ?? pendingDisp) ? 'dispositioned' : 'active',
            meta: existingLink.meta as any,
            disposition: committedDisp,
            note: pendingNote,
          });
        } else if (existingLink) {
          toDeleteIds.push(existingLink.id);
        }
      }

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from('integration_links')
          .upsert(toUpsert, { onConflict: 'tenant_id,integration_id,site_id,external_id' });
        if (error) throw error.message;
      }
      if (toDeleteIds.length > 0) {
        const { error } = await supabase.from('integration_links').delete().in('id', toDeleteIds);
        if (error) throw error.message;
      }

      await loadLinks();
      toast.success('Mappings saved!');
    } catch (err) {
      toast.error(`Failed to save: ${err}`);
    } finally {
      saving = false;
    }
  }

  const FILTERS: FilterType[] = ['All', 'Linked', 'Unlinked', 'Dispositioned'];
</script>

<!-- Metrics -->
<div class="grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
  <Card.Root class="p-4">
    <div class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">Total Sites</span>
      <span class="text-2xl font-bold">{loading ? '—' : metrics.total}</span>
    </div>
  </Card.Root>
  <Card.Root class="p-4">
    <div class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">Linked</span>
      <span class="text-2xl font-bold text-primary">{loading ? '—' : metrics.linked}</span>
    </div>
  </Card.Root>
  <Card.Root class="p-4">
    <div class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">Dispositioned</span>
      <span class="text-2xl font-bold text-warning">{loading ? '—' : metrics.dispositioned}</span>
    </div>
  </Card.Root>
  <Card.Root class="p-4">
    <div class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">Unlinked</span>
      <span class="text-2xl font-bold text-destructive">{loading ? '—' : metrics.unlinked}</span>
    </div>
  </Card.Root>
  <Card.Root class="p-4">
    <div class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">Connection Health</span>
      {#if loading}
        <span class="text-2xl font-bold">—</span>
      {:else if isConfigured}
        <span class="text-sm font-medium text-primary flex items-center gap-1">
          <CircleCheck class="size-4" /> Connected
        </span>
      {:else}
        <span class="text-sm font-medium text-destructive flex items-center gap-1">
          <CircleX class="size-4" /> Not set up
        </span>
      {/if}
    </div>
  </Card.Root>
</div>

<!-- Toolbar -->
<div class="flex gap-2 items-center shrink-0 w-full">
  <div class="flex w-96!">
    <SearchBar bind:value={siteSearch} placeholder="Search sites..." />
  </div>
  <div class="flex gap-1.5 shrink-0">
    {#each FILTERS as filter}
      <button
        class="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
          {activeFilter === filter
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:border-foreground/30'}"
        onclick={() => (activeFilter = filter)}
      >
        {filter}
      </button>
    {/each}
  </div>
  {#if canWrite}
    <div class="flex gap-2 ml-auto shrink-0">
      <Button
        variant="outline"
        size="sm"
        class="gap-2"
        disabled={loadingExternal || externalOptions.length === 0}
        onclick={runAutoMap}
      >
        <Wand2 class="size-4" />
        AutoMap
      </Button>
      <Button size="sm" class="gap-2" disabled={!isDirty || saving} onclick={handleSaveAll}>
        <Save class="size-4" />
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  {/if}
</div>

<!-- Unmapped external banner -->
{#if !bannerDismissed && !loadingExternal && unmappedExternal.length > 0}
  <div class="flex flex-col rounded border border-warning/30 bg-warning/10 shrink-0">
    <div class="flex items-center gap-2 px-3 py-2 text-warning text-sm">
      <TriangleAlert class="size-4 shrink-0" />
      <span>
        {unmappedExternal.length}
        {externalLabel}{unmappedExternal.length !== 1 ? 's' : ''} not linked to any site
      </span>
      <button
        class="flex items-center"
        onclick={() => (bannerOpen = !bannerOpen)}
        aria-label="Toggle list"
      >
        <ChevronDown
          class="size-4 transition-transform duration-200 {bannerOpen ? 'rotate-180' : ''}"
        />
      </button>
      <button
        class="ml-auto flex items-center"
        onclick={() => (bannerDismissed = true)}
        aria-label="Dismiss"
      >
        <X class="size-4" />
      </button>
    </div>
    {#if bannerOpen}
      <div class="flex flex-wrap gap-1.5 px-3 pb-2">
        {#each unmappedExternal as opt (opt.id)}
          <Badge variant="outline" class="text-xs bg-warning/10 text-warning border-warning/30">
            {opt.name}
          </Badge>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- Table -->
<div class="flex-1 overflow-hidden flex flex-col min-h-0">
  {#if loading}
    <Loader />
  {:else if filteredSites.length === 0}
    <FadeIn class="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
      <Building2 class="size-8 opacity-40" />
      <span class="text-sm">No sites found</span>
    </FadeIn>
  {:else}
    <!-- Header row -->
    <div
      class="grid grid-cols-[1fr_1fr_11rem] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground border-b shrink-0"
    >
      <span>Site</span>
      <span>{externalLabel}</span>
      <span>Disposition / Note</span>
    </div>

    <!-- Rows -->
    <div class="flex-1 overflow-y-auto">
      <FadeIn class="flex flex-col divide-y">
        {#each filteredSites as site (site.id)}
          {@const isLinked = !!pendingMappings[site.id]}
          {@const isDispositioned = !!pendingDispositions[site.id]}
          {@const disposition = pendingDispositions[site.id]}
          {@const hasNote = !!pendingNotes[site.id]}
          {@const takenByOthers = new Set(
            Object.entries(pendingMappings)
              .filter(([k, v]) => k !== site.id && !!v)
              .map(([, v]) => v as string)
          )}
          {@const rowOptions = externalOptions
            .filter((o) => !takenByOthers.has(o.id))
            .map((o) => ({ label: o.name, value: o.id }))}
          <div
            class="grid grid-cols-[1fr_1fr_11rem] gap-4 px-4 py-3 items-center hover:bg-muted/30"
          >
            <!-- Site name + badge -->
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-medium text-sm truncate">{site.name}</span>
              {#if isLinked}
                <Badge
                  class="text-xs shrink-0 bg-primary/15 text-primary border-primary/30"
                  variant="outline"
                >
                  LINKED
                </Badge>
              {:else if isDispositioned}
                <Badge
                  class="text-xs shrink-0 bg-warning/15 text-warning border-warning/30"
                  variant="outline"
                >
                  {disposition === 'third_party' ? 'THIRD PARTY' : 'NOT MANAGED'}
                </Badge>
              {:else}
                <Badge
                  class="text-xs shrink-0 bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30"
                  variant="outline"
                >
                  NOT LINKED
                </Badge>
              {/if}
            </div>

            <!-- External mapping select -->
            <SingleSelect
              options={rowOptions}
              selected={pendingMappings[site.id]}
              onchange={(v) => setMapping(site.id, v || undefined)}
              placeholder={loadingExternal ? 'Loading...' : `Select a ${externalLabel}...`}
              disabled={loadingExternal || !canWrite || isDispositioned}
            />

            <!-- Disposition + Note -->
            <div class="flex items-center gap-1">
              <!-- Disposition select -->
              <select
                value={pendingDispositions[site.id] ?? ''}
                onchange={(e) => {
                  const val = (e.target as HTMLSelectElement).value;
                  setDisposition(site.id, val ? (val as DispositionType) : undefined);
                }}
                disabled={!canWrite || isLinked}
                class="flex-1 min-w-0 h-7 text-xs rounded border bg-background px-2 appearance-none
                  text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-1 focus:ring-primary truncate"
              >
                <option value="">—</option>
                <option value="third_party">Third Party</option>
                <option value="not_managed">Not Managed</option>
              </select>

              <!-- Note popover -->
              <Popover.Root>
                <Popover.Trigger>
                  {#snippet child({ props })}
                    <button
                      {...props}
                      class="flex size-7 shrink-0 items-center justify-center rounded hover:bg-muted/50
                        {hasNote ? 'text-primary' : 'text-muted-foreground'}"
                      aria-label="Edit note"
                    >
                      <MessageSquare class="size-3.5 {hasNote ? 'fill-primary/20' : ''}" />
                    </button>
                  {/snippet}
                </Popover.Trigger>
                <Popover.Content align="end" class="w-64 p-3 flex flex-col gap-2">
                  <span class="text-xs font-medium text-muted-foreground">Note</span>
                  <Textarea
                    value={pendingNotes[site.id] ?? ''}
                    oninput={(e) => {
                      pendingNotes[site.id] = (e.target as HTMLTextAreaElement).value || undefined;
                    }}
                    placeholder="Add a note..."
                    class="text-sm resize-none min-h-20"
                    disabled={!canWrite}
                  />
                  <span class="text-xs text-muted-foreground">
                    Changes are saved with the Save button.
                  </span>
                </Popover.Content>
              </Popover.Root>
            </div>
          </div>
        {/each}
      </FadeIn>
    </div>
  {/if}
</div>
