<script lang="ts">
  import { INTEGRATIONS } from '@workspace/core/config/integrations';
  import IntegrationHeader from '../_helpers/integration-header.svelte';
  import type { PageProps } from './$types';
  import type { Tables } from '@workspace/shared/types/database';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import SearchBar from '$lib/components/search-bar.svelte';
  import SingleSelect from '$lib/components/single-select.svelte';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import Loader from '$lib/components/transition/loader.svelte';
  import { Settings, TriangleAlert, Building2 } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import PermissionGaurd from '$lib/components/auth/permission-gaurd.svelte';
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { MSPAgentConfig } from '@workspace/shared/types/integrations/mspagent/index.js';

  const { data, form }: PageProps = $props();

  const integration = INTEGRATIONS['mspagent'];

  let dbIntegration = $state<Tables<'public', 'integrations'> | null>(null);
  let dbSites = $state<Tables<'public', 'sites'>[]>([]);
  let dattoLinks = $state<Tables<'public', 'integration_links'>[]>([]);
  let psaOptions = $state<{ label: string; value: string }[]>([]);
  let loading = $state(true);
  let siteSearch = $state('');
  let activeFilter = $state<'All' | 'Linked' | 'Unlinked'>('All');
  let configSheetOpen = $state(false);
  let savingConfig = $state(false);
  let pushing = $state<Set<string>>(new Set());
  let pushingAll = $state(false);

  $effect(() => {
    const load = async () => {
      dbIntegration = (await data.getIntegration) ?? null;
      dbSites = (await data.getSites) ?? [];
      loading = false;
    };
    load();
  });

  $effect(() => {
    if (form?.pushResult) {
      const { pushed, failed, errors } = form.pushResult;
      if (failed > 0) toast.error(`Pushed ${pushed}, failed ${failed}: ${errors?.join(', ')}`);
      else toast.success(`Successfully pushed ${pushed} site variable${pushed !== 1 ? 's' : ''}`);
    } else if (form?.error) {
      toast.error(`Action failed: ${form.error}`);
    } else if ((form as any)?.success && savingConfig === false) {
      toast.success('Settings saved successfully!');
      configSheetOpen = false;
    }
  });

  $effect(() => {
    loadDattoLinks();
    loadPsaOptions();
  });

  async function loadDattoLinks() {
    const { data: links } = await supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'dattormm')
      .eq('tenant_id', authStore.currentTenant?.id ?? '');
    dattoLinks = links ?? [];
  }

  async function loadPsaOptions() {
    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('tenant_id', authStore.currentTenant?.id ?? '')
      .is('deleted_at', null);

    psaOptions = (integrations ?? [])
      .filter((i) => INTEGRATIONS[i.id as keyof typeof INTEGRATIONS]?.type === 'psa')
      .map((i) => ({
        label: INTEGRATIONS[i.id as keyof typeof INTEGRATIONS]?.name ?? i.id,
        value: i.id,
      }));
  }

  const linkedSiteIds = $derived(
    new Set(dattoLinks.filter((l) => l.site_id).map((l) => l.site_id!))
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

  const allLinkedSiteIds = $derived([...linkedSiteIds]);

  function makePushEnhance(siteId: string) {
    return () => {
      pushing = new Set([...pushing, siteId]);
      return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
        const next = new Set(pushing);
        next.delete(siteId);
        pushing = next;
        await update({ reset: false });
      };
    };
  }

  const existingConfig = $derived((dbIntegration?.config as MSPAgentConfig) ?? null);
</script>

<!-- Configuration Sheet -->
<Sheet.Root bind:open={configSheetOpen}>
  <Sheet.Portal>
    <Sheet.Overlay />
    <Sheet.Content side="right" class="w-105 flex flex-col gap-0 p-0">
      <Sheet.Header class="p-4 border-b">
        <Sheet.Title>Configure MSPAgent</Sheet.Title>
        <Sheet.Description>Set up your MSPAgent integration settings.</Sheet.Description>
      </Sheet.Header>

      <form
        id="mspagent-config-form"
        method="POST"
        action="?/save"
        class="flex flex-col flex-1 overflow-hidden"
        use:enhance={() => {
          savingConfig = true;
          return async ({ update }) => {
            savingConfig = false;
            await update();
          };
        }}
      >
        <div class="flex flex-col p-4 flex-1 overflow-y-auto gap-4">
          <Card.Root class="bg-primary/5 border-primary/20">
            <Card.Header class="pb-2">
              <Card.Title class="text-base">Configuration</Card.Title>
            </Card.Header>
            <Card.Content class="flex flex-col gap-3">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium" for="mspagent-psa">Primary PSA</label>
                <SingleSelect
                  options={psaOptions}
                  selected={existingConfig?.primaryPsa}
                  onchange={(v) => {
                    const input = document.getElementById(
                      'mspagent-psa-hidden'
                    ) as HTMLInputElement;
                    if (input) input.value = v ?? '';
                  }}
                  placeholder="Select a PSA integration..."
                />
                <input
                  id="mspagent-psa-hidden"
                  type="hidden"
                  name="primaryPsa"
                  value={existingConfig?.primaryPsa ?? ''}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium" for="mspagent-var-name">
                  Site Variable Name
                </label>
                <input
                  id="mspagent-var-name"
                  name="siteVariableName"
                  type="text"
                  placeholder="MSPSiteCode"
                  class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  value={existingConfig?.siteVariableName ?? ''}
                />
              </div>
            </Card.Content>
          </Card.Root>
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
                  <AlertDialog.Title>Delete MSPAgent Integration?</AlertDialog.Title>
                  <AlertDialog.Description>
                    This will remove the MSPAgent integration configuration. This action can be
                    undone within 30 days.
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
          <form
            method="POST"
            action="?/pushVars"
            use:enhance={() => {
              pushingAll = true;
              return async ({ update }) => {
                pushingAll = false;
                await update({ reset: false });
              };
            }}
          >
            <Button type="submit" size="sm" disabled={pushingAll || allLinkedSiteIds.length === 0}>
              {pushingAll ? 'Pushing...' : 'Push All'}
            </Button>
          </form>
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
          <span>DattoRMM Status</span>
        </div>

        <!-- Rows -->
        <div class="flex-1 overflow-y-auto">
          <FadeIn class="flex flex-col divide-y">
            {#each filteredSites as site (site.id)}
              {@const dattoLink = dattoLinks.find((l) => l.site_id === site.id)}
              {@const isLinked = !!dattoLink}
              {@const isPushing = pushing.has(site.id)}
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
                <div class="flex items-center gap-3">
                  {#if isLinked && dattoLink}
                    <span class="text-sm text-muted-foreground truncate">{dattoLink.name}</span>
                    <PermissionGaurd permission="Integrations.Write">
                      <form
                        method="POST"
                        action="?/pushVars"
                        use:enhance={makePushEnhance(site.id)}
                      >
                        <input type="hidden" name="siteId" value={site.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          disabled={isPushing || pushingAll}
                        >
                          {isPushing ? 'Pushing...' : 'Push'}
                        </Button>
                      </form>
                    </PermissionGaurd>
                  {:else}
                    <span class="text-sm text-muted-foreground/50">No DattoRMM link</span>
                  {/if}
                </div>
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
          MSPAgent is not configured yet. Click <strong>Configure</strong> to set up your settings.
        </span>
      </div>
    </FadeIn>
  {/if}
</div>
