<script lang="ts">
  import { INTEGRATIONS } from '@workspace/shared/config/integrations/integrations';
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
  import {
    Settings,
    TriangleAlert,
    Building2,
    ArrowRight,
    CircleCheck,
    CircleX,
    CircleDot,
    ServerCog,
  } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import PermissionGaurd from '$lib/components/auth/permission-gaurd.svelte';
  import ConfirmDialog from '$lib/components/fields/confirm-dialog.svelte';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { MSPAgentConfig } from '@workspace/shared/types/integrations/mspagent/index.js';

  type MSPAgentLinkMeta = {
    rmm: 'dattormm';
    variableName: string;
    variableStatus: 'ok' | 'missing' | 'mismatch' | null;
    lastCheckedAt: string | null;
  };

  type CheckResult = { status: 'ok' | 'missing' | 'mismatch'; currentValue: string | null };

  const { data, form }: PageProps = $props();

  const integration = INTEGRATIONS['mspagent'];

  let dbIntegration = $state<Tables<'public', 'integrations'> | null>(null);
  let dbSites = $state<Tables<'public', 'sites'>[]>([]);
  let dattoLinks = $state<Tables<'public', 'integration_links'>[]>([]);
  let mspagentLinks = $state<Tables<'public', 'integration_links'>[]>([]);
  let psaOptions = $state<{ label: string; value: string }[]>([]);
  let loading = $state(true);
  let siteSearch = $state('');
  let activeFilter = $state<'All' | 'Linked' | 'Unlinked'>('All');
  let configSheetOpen = $state(false);
  let savingConfig = $state(false);
  let pushing = $state<Set<string>>(new Set());
  let pushingAll = $state(false);
  let checking = $state<Set<string>>(new Set());
  let checkingAll = $state(false);
  let checkResults = $state<Map<string, CheckResult>>(new Map());

  $effect(() => {
    const load = async () => {
      dbIntegration = (await data.getIntegration) ?? null;
      dbSites = (await data.getSites) ?? [];
      mspagentLinks = (await data.getLinks) ?? [];
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
      .filter((i) => INTEGRATIONS[i.id as keyof typeof INTEGRATIONS]?.category === 'psa')
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

  const persistedStatus = $derived(
    new Map(
      mspagentLinks
        .filter((l) => l.site_id && l.meta)
        .map((l) => {
          const meta = l.meta as MSPAgentLinkMeta;
          return [l.site_id!, { status: meta.variableStatus, lastCheckedAt: meta.lastCheckedAt }];
        })
    )
  );

  function getVarStatus(siteId: string): CheckResult | null {
    const sessionResult = checkResults.get(siteId);
    if (sessionResult) return sessionResult;
    const persisted = persistedStatus.get(siteId);
    if (persisted?.status) return { status: persisted.status, currentValue: null };
    return null;
  }

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

  function makeCheckEnhance(siteId: string) {
    return () => {
      checking = new Set([...checking, siteId]);
      return async ({ result, update }: { result: any; update: (opts?: any) => Promise<void> }) => {
        const next = new Set(checking);
        next.delete(siteId);
        checking = next;
        if (result.type === 'success' && result.data?.checkResult) {
          const nextMap = new Map(checkResults);
          for (const item of result.data.checkResult as any[]) {
            nextMap.set(item.siteId, { status: item.status, currentValue: item.currentValue });
          }
          checkResults = nextMap;
        }
        await update({ reset: false });
      };
    };
  }

  const existingConfig = $derived((dbIntegration?.config as MSPAgentConfig) ?? null);
</script>

<!-- Configuration Sheet -->
<PermissionGaurd permission="Integrations.Write">
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
            {#if !!dbIntegration}
              <ConfirmDialog
                title="Delete MSPAgent Integration?"
                description="This will remove the MSPAgent integration configuration. This action can be undone within 30 days."
                confirmLabel="Delete Integration"
                destructive
              >
                {#snippet trigger(props)}
                  <Button variant="destructive" size="sm" {...props}>Delete Integration</Button>
                {/snippet}
                {#snippet confirmAction()}
                  <form method="POST" action="?/deleteIntegration">
                    <Button type="submit" variant="destructive" size="sm">Delete Integration</Button
                    >
                  </form>
                {/snippet}
              </ConfirmDialog>
            {:else}
              <div></div>
            {/if}
            <Button size="sm" type="submit" disabled={savingConfig}>
              {savingConfig ? 'Saving...' : 'Save'}
            </Button>
          </Sheet.Footer>
        </form>
      </Sheet.Content>
    </Sheet.Portal>
  </Sheet.Root>
</PermissionGaurd>

<!-- Main Layout -->
<div class="flex flex-col size-full p-4 gap-4 overflow-hidden">
  <div class="flex items-start justify-between shrink-0">
    <IntegrationHeader {integration} active={!!dbIntegration} {loading} />
    <PermissionGaurd permission="Integrations.Write">
      <Button variant="outline" size="sm" onclick={() => (configSheetOpen = true)} class="gap-2">
        <Settings class="size-4" />
        Configure
      </Button>
    </PermissionGaurd>
  </div>

  {#if !!dbIntegration}
    <!-- Pathway indicator -->
    <div
      class="flex items-center gap-2 px-3 py-2 rounded border bg-primary/5 border-primary/20 w-fit text-sm shrink-0"
    >
      <ServerCog class="size-4 text-primary shrink-0" />
      <span class="font-medium text-primary">MSPAgent</span>
      <ArrowRight class="size-3.5 text-muted-foreground shrink-0" />
      <span class="font-medium">DattoRMM</span>
      <span class="text-muted-foreground text-xs ml-1">— site variable sync</span>
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
        <!-- Check All: no PermissionGaurd, accessible to Integrations.Read -->
        <form
          method="POST"
          action="?/checkVars"
          use:enhance={() => {
            checkingAll = true;
            return async ({ result, update }) => {
              checkingAll = false;
              if (result.type === 'success' && (result.data as any)?.checkResult) {
                const items = (result.data as any).checkResult as {
                  siteId: string;
                  status: 'ok' | 'missing' | 'mismatch';
                  currentValue: string | null;
                }[];
                const nextMap = new Map<string, CheckResult>();
                for (const item of items) {
                  nextMap.set(item.siteId, { status: item.status, currentValue: item.currentValue });
                }
                checkResults = nextMap;
                const ok = items.filter((i) => i.status === 'ok').length;
                toast.success(`Check complete: ${ok}/${items.length} sites OK`);
              } else if (result.type === 'failure') {
                toast.error(`Check failed: ${(result.data as any)?.error}`);
              }
              await update({ reset: false });
            };
          }}
        >
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={checkingAll || allLinkedSiteIds.length === 0}
            class="gap-2"
          >
            <CircleDot class="size-4" />
            {checkingAll ? 'Checking...' : 'Check All'}
          </Button>
        </form>

        <!-- Push All: Integrations.Write only -->
        <PermissionGaurd permission="Integrations.Write">
          <ConfirmDialog
            title="Push Variables to All Sites?"
            description="This will push the site variable to all {allLinkedSiteIds.length} linked DattoRMM site{allLinkedSiteIds.length !==
            1
              ? 's'
              : ''}."
            confirmLabel="Push All"
          >
            {#snippet trigger(props)}
              <Button
                type="button"
                size="sm"
                disabled={pushingAll || allLinkedSiteIds.length === 0}
                {...props}
              >
                {pushingAll ? 'Pushing...' : 'Push All'}
              </Button>
            {/snippet}
            {#snippet confirmAction()}
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
                <Button type="submit" size="sm" disabled={pushingAll}>Push All</Button>
              </form>
            {/snippet}
          </ConfirmDialog>
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
          class="grid grid-cols-[1fr_1fr_160px_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground border-b shrink-0"
        >
          <span>Site</span>
          <span>DattoRMM Site</span>
          <span>Variable Status</span>
          <span class="text-right">Actions</span>
        </div>

        <!-- Rows -->
        <div class="flex-1 overflow-y-auto">
          <FadeIn class="flex flex-col divide-y">
            {#each filteredSites as site (site.id)}
              {@const dattoLink = dattoLinks.find((l) => l.site_id === site.id)}
              {@const isLinked = !!dattoLink}
              {@const isPushing = pushing.has(site.id)}
              {@const isChecking = checking.has(site.id)}
              {@const varStatus = getVarStatus(site.id)}
              <div
                class="grid grid-cols-[1fr_1fr_160px_auto] gap-4 px-4 py-3 items-center hover:bg-muted/30"
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
                  {:else}
                    <Badge
                      class="text-xs shrink-0 bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30"
                      variant="outline"
                    >
                      NOT LINKED
                    </Badge>
                  {/if}
                </div>

                <!-- DattoRMM site name -->
                <div class="flex items-center min-w-0">
                  {#if isLinked && dattoLink}
                    <span class="text-sm text-muted-foreground truncate">{dattoLink.name}</span>
                  {:else}
                    <span class="text-sm text-muted-foreground/50">No DattoRMM link</span>
                  {/if}
                </div>

                <!-- Variable status badge -->
                <div class="flex items-center">
                  {#if !isLinked}
                    <span class="text-xs text-muted-foreground/40">—</span>
                  {:else if isChecking}
                    <span class="text-xs text-muted-foreground animate-pulse">Checking...</span>
                  {:else if varStatus?.status === 'ok'}
                    <span
                      class="inline-flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full"
                    >
                      <CircleCheck class="size-3" /> OK
                    </span>
                  {:else if varStatus?.status === 'mismatch'}
                    <span
                      class="inline-flex items-center gap-1 text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full"
                    >
                      <CircleX class="size-3" /> Mismatch
                    </span>
                  {:else if varStatus?.status === 'missing'}
                    <span
                      class="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded-full"
                    >
                      <CircleX class="size-3" /> Missing
                    </span>
                  {:else}
                    <span class="text-xs text-muted-foreground/40">Not checked</span>
                  {/if}
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2 justify-end">
                  {#if isLinked && dattoLink}
                    <!-- Check: no PermissionGaurd -->
                    <form
                      method="POST"
                      action="?/checkVars"
                      use:enhance={makeCheckEnhance(site.id)}
                    >
                      <input type="hidden" name="siteId" value={site.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        disabled={isChecking || checkingAll}
                        class="gap-1.5"
                      >
                        <CircleDot class="size-3.5" />
                        {isChecking ? '...' : 'Check'}
                      </Button>
                    </form>

                    <!-- Push: Integrations.Write only -->
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
