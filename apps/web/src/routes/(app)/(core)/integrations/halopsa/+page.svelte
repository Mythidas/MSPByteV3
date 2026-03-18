<script lang="ts">
  import { INTEGRATIONS } from '@workspace/core/config/integrations';
  import IntegrationHeader from '../_helpers/integration-header.svelte';
  import type { PageProps } from './$types';
  import type { Tables, TablesInsert } from '@workspace/shared/types/database';
  import type { HaloPSASite } from '@workspace/shared/types/integrations/halopsa/sites.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import SearchBar from '$lib/components/search-bar.svelte';
  import SingleSelect from '$lib/components/single-select.svelte';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import Loader from '$lib/components/transition/loader.svelte';
  import {
    Settings,
    TriangleAlert,
    Building2,
    CircleCheck,
    CircleX,
    Wand2,
    Save,
  } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import PermissionGaurd from '$lib/components/auth/permission-gaurd.svelte';
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { HaloPSAConfig } from '@workspace/shared/types/integrations/halopsa/index.js';

  const { data, form }: PageProps = $props();

  const integration = INTEGRATIONS['halopsa'];

  let dbIntegration = $state<Tables<'public', 'integrations'> | null>(null);
  let dbLinks = $state<Tables<'public', 'integration_links'>[]>([]);
  let dbSites = $state<Tables<'public', 'sites'>[]>([]);
  let halopsaSites = $state<HaloPSASite[]>([]);
  let loading = $state(true);
  let loadingHaloSites = $state(true);
  let pendingMappings = $state<Record<string, string | undefined>>({});
  let saving = $state(false);
  let siteSearch = $state('');
  let activeFilter = $state<'All' | 'Linked' | 'Unlinked'>('All');
  let configSheetOpen = $state(false);
  let testingConnection = $state(false);
  let savingConfig = $state(false);

  const committedMappings = $derived(
    Object.fromEntries(dbLinks.filter((l) => l.site_id).map((l) => [l.site_id!, l.external_id]))
  );

  const isDirty = $derived(
    dbSites.some((s) => (pendingMappings[s.id] ?? null) !== (committedMappings[s.id] ?? null))
  );

  const linkedSiteIds = $derived(
    new Set(Object.keys(pendingMappings).filter((k) => !!pendingMappings[k]))
  );

  const filteredSites = $derived(
    dbSites
      .filter((s) => s.name.toLowerCase().includes(siteSearch.toLowerCase()))
      .filter((s) => {
        if (activeFilter === 'Linked') return linkedSiteIds.has(s.id);
        if (activeFilter === 'Unlinked') return !linkedSiteIds.has(s.id);
        return true;
      })
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  );

  const metrics = $derived({
    total: dbSites.length,
    linked: linkedSiteIds.size,
    unlinked: dbSites.length - linkedSiteIds.size,
    isConfigured: !!dbIntegration,
  });

  $effect(() => {
    const load = async () => {
      dbIntegration = (await data.getIntegration) ?? null;
      dbLinks = (await data.getLinks) ?? [];
      dbSites = (await data.getSites) ?? [];
      loading = false;
    };
    load();
  });

  $effect(() => {
    if (form?.error) {
      toast.error(`Action failed: ${form.error}`);
    } else if ((form as any)?.success && savingConfig === false) {
      toast.success('Settings saved successfully!');
      configSheetOpen = false;
    }
  });

  // Sync pendingMappings when dbLinks or dbSites change
  $effect(() => {
    const next: Record<string, string | undefined> = {};
    for (const site of dbSites) {
      const link = dbLinks.find((l) => l.site_id === site.id);
      next[site.id] = link?.external_id ?? undefined;
    }
    pendingMappings = next;
  });

  $effect(() => {
    data.getHalopSites.then((result) => {
      halopsaSites = result ?? [];
      loadingHaloSites = false;
    });
  });

  const loadLinks = async () => {
    const { data: links } = await supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'halopsa')
      .eq('tenant_id', authStore.currentTenant?.id ?? '');
    dbLinks = links ?? [];
  };

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
    const taken = new Set(
      Object.entries(pendingMappings)
        .filter(([, v]) => !!v)
        .map(([, v]) => v as string)
    );
    const next = { ...pendingMappings };

    for (const site of dbSites) {
      if (next[site.id]) continue; // already mapped

      let bestScore = 0.3; // threshold
      let bestHaloId: string | undefined;

      for (const halo of halopsaSites) {
        const haloId = String(halo.id);
        if (taken.has(haloId)) continue;
        const score = jaccardSimilarity(site.name, halo.clientsite_name);
        if (score > bestScore) {
          bestScore = score;
          bestHaloId = haloId;
        }
      }

      if (bestHaloId) {
        next[site.id] = bestHaloId;
        taken.add(bestHaloId);
      }
    }

    pendingMappings = next;
  }

  async function handleSaveAll() {
    saving = true;
    try {
      const tenantId = authStore.currentTenant?.id ?? '';

      const toUpsert: TablesInsert<'public', 'integration_links'>[] = [];
      const toDeleteIds: string[] = [];

      for (const site of dbSites) {
        const pending = pendingMappings[site.id];
        const committed = committedMappings[site.id];

        if (pending === committed) continue;

        if (pending) {
          const haloSite = halopsaSites.find((h) => String(h.id) === pending);
          toUpsert.push({
            integration_id: 'halopsa',
            tenant_id: tenantId,
            site_id: site.id,
            external_id: pending,
            name: haloSite?.clientsite_name ?? pending,
            status: 'active',
            meta: haloSite ? { siteName: haloSite.clientsite_name } : {},
          });
        } else if (committed) {
          const link = dbLinks.find((l) => l.site_id === site.id);
          if (link) toDeleteIds.push(link.id);
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
      toast.error(`Failed to save mappings: ${err}`);
    } finally {
      saving = false;
    }
  }

  const existingConfig = $derived((dbIntegration?.config as HaloPSAConfig) ?? null);
</script>

<!-- Configuration Sheet -->
<Sheet.Root bind:open={configSheetOpen}>
  <Sheet.Portal>
    <Sheet.Overlay />
    <Sheet.Content side="right" class="w-105 flex flex-col gap-0 p-0">
      <Sheet.Header class="p-4 border-b">
        <Sheet.Title>Configure HaloPSA</Sheet.Title>
        <Sheet.Description>Enter your HaloPSA API credentials.</Sheet.Description>
      </Sheet.Header>

      <form
        id="halo-config-form"
        method="POST"
        action="?/save"
        class="flex flex-col flex-1 overflow-hidden"
        use:enhance={({ submitter }) => {
          const isTesting = submitter?.getAttribute('formaction') === '?/testConnection';
          if (isTesting) testingConnection = true;
          else savingConfig = true;

          return async ({ result, update }) => {
            if (isTesting) {
              testingConnection = false;
              if (result.type === 'failure') {
                toast.error(`Connection test failed: ${(result.data as any)?.error}`);
              } else {
                toast.success('Connection test successful!');
              }
            } else {
              savingConfig = false;
              await update();
            }
          };
        }}
      >
        <div class="flex flex-col p-4 flex-1 overflow-y-auto gap-4">
          <Card.Root class="bg-primary/5 border-primary/20">
            <Card.Header class="pb-2">
              <Card.Title class="text-base">API Credentials</Card.Title>
            </Card.Header>
            <Card.Content class="flex flex-col gap-3">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium" for="halo-url">URL</label>
                <input
                  id="halo-url"
                  name="url"
                  type="url"
                  placeholder="https://your-instance.halopsa.com"
                  class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  value={existingConfig?.url ?? ''}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium" for="halo-client-id">Client ID</label>
                <input
                  id="halo-client-id"
                  name="clientId"
                  type="text"
                  placeholder="Client ID"
                  class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  value={existingConfig?.clientId ?? ''}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium" for="halo-client-secret">Client Secret</label>
                <input
                  id="halo-client-secret"
                  name="clientSecret"
                  type="password"
                  placeholder={existingConfig ? 'Leave blank to keep current' : 'Client Secret'}
                  class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </Card.Content>
          </Card.Root>

          <Button
            type="submit"
            formaction="?/testConnection"
            variant="outline"
            size="sm"
            disabled={testingConnection}
          >
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>

        <Sheet.Footer class="flex justify-between p-4 border-t gap-2">
          <PermissionGaurd permission="Integrations.Write">
            <AlertDialog.Root>
              <AlertDialog.Trigger>
                {#snippet child({ props })}
                  {#if !!dbIntegration}
                    <Button variant="destructive" size="sm" {...props}>Delete Integration</Button>
                  {:else}
                    <div></div>
                  {/if}
                {/snippet}
              </AlertDialog.Trigger>
              <AlertDialog.Content>
                <AlertDialog.Header>
                  <AlertDialog.Title>Delete HaloPSA Integration?</AlertDialog.Title>
                  <AlertDialog.Description>
                    This will remove the HaloPSA integration and all associated site mappings. This
                    action can be undone within 30 days.
                  </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                  <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
                  <form method="POST" action="?/deleteIntegration">
                    <AlertDialog.Action type="submit" class="bg-red-500 hover:bg-red-500/70">
                      Delete Integration
                    </AlertDialog.Action>
                  </form>
                </AlertDialog.Footer>
              </AlertDialog.Content>
            </AlertDialog.Root>
            <Button size="sm" type="submit" disabled={savingConfig}>
              {savingConfig ? 'Saving...' : 'Save'}
            </Button>
          </PermissionGaurd>
        </Sheet.Footer>
      </form>
    </Sheet.Content>
  </Sheet.Portal>
</Sheet.Root>

<!-- Main Layout -->
<div class="flex flex-col size-full p-4 gap-4 overflow-hidden">
  <div class="flex items-start justify-between shrink-0">
    <IntegrationHeader {integration} active={!!dbIntegration} {loading} />
    <Button variant="outline" size="sm" onclick={() => (configSheetOpen = true)} class="gap-2">
      <Settings class="size-4" />
      Configure
    </Button>
  </div>

  {#if !!dbIntegration}
    <!-- Metrics -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
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
          <span class="text-xs text-muted-foreground">Unlinked</span>
          <span class="text-2xl font-bold text-destructive">{loading ? '—' : metrics.unlinked}</span
          >
        </div>
      </Card.Root>
      <Card.Root class="p-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Connection Health</span>
          {#if loading}
            <span class="text-2xl font-bold">—</span>
          {:else if metrics.isConfigured}
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
        {#each ['All', 'Linked', 'Unlinked'] as filter}
          <button
            class="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
              {activeFilter === filter
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:border-foreground/30'}"
            onclick={() => (activeFilter = filter as typeof activeFilter)}
          >
            {filter}
          </button>
        {/each}
      </div>
      <div class="flex gap-2 ml-auto shrink-0">
        <PermissionGaurd permission="Integrations.Write">
          <Button
            variant="outline"
            size="sm"
            class="gap-2"
            disabled={loadingHaloSites || halopsaSites.length === 0}
            onclick={runAutoMap}
          >
            <Wand2 class="size-4" />
            AutoMap
          </Button>
          <Button size="sm" class="gap-2" disabled={!isDirty || saving} onclick={handleSaveAll}>
            <Save class="size-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </PermissionGaurd>
      </div>
    </div>

    <!-- Flat list -->
    <div class="flex-1 overflow-hidden flex flex-col min-h-0">
      {#if loading}
        <Loader />
      {:else if filteredSites.length === 0}
        <FadeIn
          class="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground"
        >
          <Building2 class="size-8 opacity-40" />
          <span class="text-sm">No sites found</span>
        </FadeIn>
      {:else}
        <!-- Header row -->
        <div
          class="grid grid-cols-[1fr_1fr] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground border-b shrink-0"
        >
          <span>Site</span>
          <span>HaloPSA Site</span>
        </div>

        <!-- Rows -->
        <div class="flex-1 overflow-y-auto">
          <FadeIn class="flex flex-col divide-y">
            {#each filteredSites as site (site.id)}
              {@const isLinked = !!pendingMappings[site.id]}
              {@const takenByOthers = new Set(
                Object.entries(pendingMappings)
                  .filter(([k, v]) => k !== site.id && !!v)
                  .map(([, v]) => v as string)
              )}
              {@const rowOptions = halopsaSites
                .filter((h) => !takenByOthers.has(String(h.id)))
                .map((h) => ({ label: h.clientsite_name, value: String(h.id) }))}
              <div class="grid grid-cols-[1fr_1fr] gap-4 px-4 py-3 items-center hover:bg-muted/30">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-medium text-sm truncate">{site.name}</span>
                  {#if isLinked}
                    <Badge
                      class="text-xs shrink-0 bg-primary/15 text-primary border-primary/30"
                      variant="outline"
                    >
                      LINKED
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
                <SingleSelect
                  options={rowOptions}
                  selected={pendingMappings[site.id]}
                  onchange={(v) => (pendingMappings[site.id] = v || undefined)}
                  placeholder={loadingHaloSites ? 'Loading...' : 'Select a HaloPSA site...'}
                  disabled={loadingHaloSites}
                />
              </div>
            {/each}
          </FadeIn>
        </div>
      {/if}
    </div>
  {:else if loading}
    <Loader />
  {:else}
    <FadeIn class="flex flex-col size-full justify-center items-center">
      <div
        class="flex items-center gap-3 px-4 py-3 w-fit rounded bg-warning/10 text-warning border border-warning/30"
      >
        <TriangleAlert class="size-4" />
        <span class="text-sm">
          HaloPSA is not configured yet. Click <strong>Configure</strong> to set up your credentials.
        </span>
      </div>
    </FadeIn>
  {/if}
</div>
