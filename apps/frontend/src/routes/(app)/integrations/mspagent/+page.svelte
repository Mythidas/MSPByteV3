<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import SearchBar from '$lib/components/search-bar.svelte';
  import {
    Loader2,
    AlertCircle,
    Trash2,
    Check,
    X,
    HelpCircle,
    ArrowUpFromLine,
    RefreshCw,
  } from 'lucide-svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zod4Client } from 'sveltekit-superforms/adapters';
  import { toast } from 'svelte-sonner';
  import type { PageProps } from './$types';
  import { mspagentConfigSchema } from './_forms';

  let { data }: PageProps = $props();

  // svelte-ignore state_referenced_locally
  const form = superForm(data.form, {
    validators: zod4Client(mspagentConfigSchema),
    resetForm: false,
    onUpdate({ form }) {
      if (form.message) {
        if (form.valid) {
          toast.success(form.message);
        } else {
          toast.error(form.message);
        }
      }
    },
  });

  const { form: formData, errors, enhance, delayed, submitting } = form;
  let currentTab = $state('configuration');

  // Site Variables tab state
  let search = $state('');
  let filter = $state<'all' | 'linked' | 'unlinked' | 'set' | 'not_set'>('all');
  let variableStatuses = $state<Record<string, 'set' | 'not_set' | 'unknown'>>({});
  let checkingAll = $state(false);
  let pushingAll = $state(false);
  let loadingActions = $state<Record<string, 'checking' | 'pushing'>>({});

  const siteVariablesEnabled = $derived(data.integration && data.dattoConfigured);

  type RmmSiteMapping = { rmmSiteId: string; rmmSiteName: string };
  type SiteWithMapping = {
    id: string;
    name: string;
    rmmSites: RmmSiteMapping[];
    linked: boolean;
  };

  const getSiteData = async (): Promise<SiteWithMapping[]> => {
    const links = await data.siteLinks;
    const dattoSites = await data.dattoSites;

    if (dattoSites.error) {
      throw dattoSites.error;
    }

    const dattoSiteMap = new Map(dattoSites.data.map((s) => [String(s.id), s]));

    return data.sites.map((site) => {
      const siteLinks = links.filter((l) => l.site_id === site.id);
      const rmmSites: RmmSiteMapping[] = siteLinks
        .map((link) => {
          const dattoSite = dattoSiteMap.get(link.external_id);
          return dattoSite ? { rmmSiteId: dattoSite.uid, rmmSiteName: dattoSite.name } : null;
        })
        .filter((m): m is RmmSiteMapping => m !== null);

      return {
        id: site.id,
        name: site.name,
        rmmSites,
        linked: rmmSites.length > 0,
      };
    });
  };

  let allSiteData = $state<SiteWithMapping[]>([]);
  let siteDataError = $state<string | null>(null);
  let siteDataLoading = $state(true);

  $effect(() => {
    if (currentTab === 'site-variables' && siteVariablesEnabled) {
      siteDataLoading = true;
      getSiteData()
        .then((result) => {
          allSiteData = result;
          siteDataError = null;
        })
        .catch((err) => {
          siteDataError = err.message || 'Failed to load site data';
        })
        .finally(() => {
          siteDataLoading = false;
        });
    }
  });

  function getAggregateStatus(site: SiteWithMapping): 'set' | 'not_set' | 'unknown' {
    if (site.rmmSites.length === 0) return 'unknown';
    const statuses = site.rmmSites.map((r) => variableStatuses[r.rmmSiteId]);
    if (statuses.every((s) => s === 'set')) return 'set';
    if (statuses.some((s) => s === 'not_set')) return 'not_set';
    return 'unknown';
  }

  const filteredSites = $derived.by(() => {
    let sites = allSiteData;

    if (search) {
      const q = search.toLowerCase();
      sites = sites.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.rmmSites.some((r) => r.rmmSiteName.toLowerCase().includes(q))
      );
    }

    switch (filter) {
      case 'linked':
        return sites.filter((s) => s.linked);
      case 'unlinked':
        return sites.filter((s) => !s.linked);
      case 'set':
        return sites.filter((s) => getAggregateStatus(s) === 'set');
      case 'not_set':
        return sites.filter((s) => s.linked && getAggregateStatus(s) !== 'set');
      default:
        return sites;
    }
  });

  const linkedSites = $derived(allSiteData.filter((s) => s.linked));

  async function handleDelete() {
    if (
      !confirm('Are you sure you want to delete this integration? This action cannot be undone.')
    ) {
      return;
    }

    const response = await fetch('?/delete', { method: 'POST' });

    if (response.ok) {
      toast.success('Integration deleted successfully');
      window.location.reload();
    } else {
      toast.error('Failed to delete integration');
    }
  }

  async function callAction(action: string, body: unknown) {
    const response = await fetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(body as any) }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Failed with status ${response.status}`);
    }
    return response.json();
  }

  async function checkVariable(site: SiteWithMapping) {
    if (site.rmmSites.length === 0) return;
    loadingActions = { ...loadingActions, [site.id]: 'checking' };

    try {
      const items = site.rmmSites.map((r) => ({ siteId: site.id, rmmSiteId: r.rmmSiteId }));
      const result = await callAction('bulkCheck', { items });
      variableStatuses = { ...variableStatuses, ...result.statusMap };
    } catch {
      for (const r of site.rmmSites) {
        variableStatuses = { ...variableStatuses, [r.rmmSiteId]: 'unknown' };
      }
    } finally {
      const { [site.id]: _, ...rest } = loadingActions;
      loadingActions = rest;
    }
  }

  async function pushVariable(site: SiteWithMapping) {
    if (site.rmmSites.length === 0) return;
    loadingActions = { ...loadingActions, [site.id]: 'pushing' };

    try {
      const items = site.rmmSites.map((r) => ({ siteId: site.id, rmmSiteId: r.rmmSiteId }));
      const result = await callAction('bulkPush', { items });

      for (const [rmmSiteId, res] of Object.entries(result.resultMap)) {
        if ((res as any).success) {
          variableStatuses = { ...variableStatuses, [rmmSiteId]: 'set' };
        }
      }

      const succeeded = Object.values(result.resultMap).filter((r: any) => r.success).length;
      const failed = Object.values(result.resultMap).filter((r: any) => !r.success).length;

      if (failed > 0) {
        toast.warning(
          `Pushed ${succeeded}/${site.rmmSites.length} RMM site(s) for ${site.name}. ${failed} failed.`
        );
      } else {
        toast.success(`Variable pushed for ${site.name}`);
      }
    } catch (err) {
      toast.error(`Failed to push for ${site.name}: ${String(err)}`);
    } finally {
      const { [site.id]: _, ...rest } = loadingActions;
      loadingActions = rest;
    }
  }

  async function bulkCheck() {
    if (linkedSites.length === 0) return;
    checkingAll = true;

    try {
      const items = linkedSites.flatMap((s) =>
        s.rmmSites.map((r) => ({ siteId: s.id, rmmSiteId: r.rmmSiteId }))
      );
      const result = await callAction('bulkCheck', { items });
      variableStatuses = { ...variableStatuses, ...result.statusMap };
      toast.success(`Checked ${items.length} RMM site(s) across ${linkedSites.length} site(s)`);
    } catch (err) {
      toast.error(`Bulk check failed: ${String(err)}`);
    } finally {
      checkingAll = false;
    }
  }

  async function bulkPush() {
    if (linkedSites.length === 0) return;

    const items = linkedSites.flatMap((s) =>
      s.rmmSites
        .filter((r) => variableStatuses[r.rmmSiteId] !== 'set')
        .map((r) => ({ siteId: s.id, rmmSiteId: r.rmmSiteId }))
    );

    if (items.length === 0) {
      toast.info('All linked RMM sites already have the variable set');
      return;
    }

    if (!confirm(`Push variables to ${items.length} RMM site(s) missing the variable?`)) return;
    pushingAll = true;

    try {
      const result = await callAction('bulkPush', { items });

      const succeeded = Object.values(result.resultMap).filter((r: any) => r.success).length;
      const failed = Object.values(result.resultMap).filter((r: any) => !r.success).length;

      for (const [rmmSiteId, res] of Object.entries(result.resultMap)) {
        if ((res as any).success) {
          variableStatuses = { ...variableStatuses, [rmmSiteId]: 'set' };
        }
      }

      if (failed > 0) {
        toast.warning(`Pushed ${succeeded} / ${succeeded + failed} RMM site(s). ${failed} failed.`);
      } else {
        toast.success(`Successfully pushed to ${succeeded} RMM site(s)`);
      }
    } catch (err) {
      toast.error(`Bulk push failed: ${String(err)}`);
    } finally {
      pushingAll = false;
    }
  }
</script>

<div class="flex flex-col relative size-full items-center p-4 gap-2">
  <div class="flex bg-card w-1/2 h-fit py-2 px-4 shadow rounded">
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>
          <Breadcrumb.Link href="/integrations">Integrations</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Page>MSPAgent</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>
  </div>

  <div class="flex flex-col w-1/2 h-full overflow-hidden shadow rounded">
    <Tabs.Root bind:value={currentTab} class="size-full flex flex-col">
      <div class="flex bg-card w-full h-fit py-2 px-2 shadow rounded">
        <Tabs.List>
          <Tabs.Trigger value="configuration">Configuration</Tabs.Trigger>
          <Tabs.Trigger value="site-variables" disabled={!siteVariablesEnabled}>
            Site Variables
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <div class="flex bg-card w-full h-full flex-1 py-4 px-4 shadow rounded overflow-hidden">
        <Tabs.Content value="configuration" class="w-full h-full overflow-hidden space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">MSPAgent Configuration</h2>
              <p class="text-sm text-muted-foreground">
                Configure the MSPAgent site variable and primary PSA
              </p>
            </div>
            {#if data.integration}
              <Button variant="destructive" size="sm" onclick={handleDelete} disabled={$submitting}>
                <Trash2 class="h-4 w-4 mr-2" />
                Delete
              </Button>
            {/if}
          </div>

          <form method="POST" action="?/save" class="space-y-6" use:enhance>
            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="siteVariableName">
                  Site Variable Name
                  <span class="text-destructive">*</span>
                </Label>
                <Input
                  id="siteVariableName"
                  name="siteVariableName"
                  type="text"
                  placeholder="MSPSiteCode"
                  bind:value={$formData.siteVariableName}
                  aria-invalid={$errors.siteVariableName ? 'true' : undefined}
                  class={$errors.siteVariableName ? 'border-destructive' : ''}
                />
                {#if $errors.siteVariableName}
                  <p class="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle class="h-3 w-3" />
                    {$errors.siteVariableName}
                  </p>
                {/if}
                <p class="text-xs text-muted-foreground">
                  The DattoRMM site variable name where the site UUID will be stored
                </p>
              </div>

              <div class="space-y-2">
                <Label>
                  Primary PSA
                  <span class="text-destructive">*</span>
                </Label>
                <input type="hidden" name="primaryPSA" value={$formData.primaryPSA} />
                <Select.Root
                  type="single"
                  value={$formData.primaryPSA}
                  onValueChange={(v) => {
                    if (v) $formData.primaryPSA = v as 'autotask' | 'halopsa';
                  }}
                >
                  <Select.Trigger class="w-full">
                    {$formData.primaryPSA === 'autotask' ? 'AutoTask' : 'HaloPSA'}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="autotask" label="AutoTask">AutoTask</Select.Item>
                    <Select.Item value="halopsa" label="HaloPSA">HaloPSA</Select.Item>
                  </Select.Content>
                </Select.Root>
                {#if $errors.primaryPSA}
                  <p class="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle class="h-3 w-3" />
                    {$errors.primaryPSA}
                  </p>
                {/if}
              </div>
            </div>

            <div class="flex gap-2 justify-end pt-4 border-t">
              <Button type="submit" disabled={$submitting}>
                {#if $delayed && $submitting}
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                {/if}
                {data.integration ? 'Update' : 'Create'} Configuration
              </Button>
            </div>
          </form>
        </Tabs.Content>

        <Tabs.Content value="site-variables" class="w-full h-full overflow-hidden flex flex-col">
          {#if siteVariablesEnabled}
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold">Site Variables</h2>
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={bulkCheck}
                  disabled={checkingAll || pushingAll || linkedSites.length === 0}
                >
                  {#if checkingAll}
                    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                  {:else}
                    <RefreshCw class="mr-2 h-4 w-4" />
                  {/if}
                  Check All
                </Button>
                <Button
                  size="sm"
                  onclick={bulkPush}
                  disabled={checkingAll || pushingAll || linkedSites.length === 0}
                >
                  {#if pushingAll}
                    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                  {:else}
                    <ArrowUpFromLine class="mr-2 h-4 w-4" />
                  {/if}
                  Push All
                </Button>
              </div>
            </div>

            <div class="flex items-center gap-2 mb-3">
              <SearchBar bind:value={search} placeholder="Search sites..." />
            </div>

            <div class="flex flex-wrap gap-1.5 mb-3">
              <button
                class="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors {filter ===
                'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                onclick={() => (filter = 'all')}
              >
                All ({allSiteData.length})
              </button>
              <button
                class="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors {filter ===
                'linked'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                onclick={() => (filter = 'linked')}
              >
                Linked ({linkedSites.length})
              </button>
              <button
                class="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors {filter ===
                'unlinked'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                onclick={() => (filter = 'unlinked')}
              >
                Unlinked ({allSiteData.filter((s) => !s.linked).length})
              </button>
              <button
                class="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors {filter ===
                'set'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                onclick={() => (filter = 'set')}
              >
                Variables Set ({allSiteData.filter((s) => getAggregateStatus(s) === 'set').length})
              </button>
              <button
                class="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors {filter ===
                'not_set'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                onclick={() => (filter = 'not_set')}
              >
                Variables Not Set
              </button>
            </div>

            {#if siteDataLoading}
              <div class="flex items-center justify-center h-full">
                <Loader2 class="h-8 w-8 animate-spin" />
              </div>
            {:else if siteDataError}
              <p class="text-destructive">{siteDataError}</p>
            {:else}
              <div class="flex-1 overflow-y-auto space-y-1.5">
                {#each filteredSites as site (site.id)}
                  {@const status = getAggregateStatus(site)}
                  {@const isLoading = !!loadingActions[site.id]}
                  <div
                    class="flex items-center justify-between p-3 rounded-md border bg-card/50 hover:bg-card transition-colors"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="shrink-0">
                        {#if status === 'set'}
                          <div
                            class="w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center"
                          >
                            <Check class="h-3.5 w-3.5 text-green-500" />
                          </div>
                        {:else if status === 'not_set'}
                          <div
                            class="w-6 h-6 rounded-full bg-destructive/15 flex items-center justify-center"
                          >
                            <X class="h-3.5 w-3.5 text-destructive" />
                          </div>
                        {:else}
                          <div
                            class="w-6 h-6 rounded-full bg-muted flex items-center justify-center"
                          >
                            <HelpCircle class="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        {/if}
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-medium truncate">{site.name}</p>
                        {#if site.linked}
                          <p class="text-xs text-muted-foreground truncate">
                            {site.rmmSites.map((r) => r.rmmSiteName).join(', ')}
                          </p>
                        {:else}
                          <p class="text-xs text-muted-foreground/60 italic">
                            Not mapped to DattoRMM
                          </p>
                        {/if}
                      </div>
                    </div>

                    {#if site.linked}
                      <div class="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onclick={() => checkVariable(site)}
                          disabled={isLoading}
                        >
                          {#if loadingActions[site.id] === 'checking'}
                            <Loader2 class="h-3.5 w-3.5 animate-spin" />
                          {:else}
                            <RefreshCw class="h-3.5 w-3.5" />
                          {/if}
                          <span class="ml-1">Check</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onclick={() => pushVariable(site)}
                          disabled={isLoading}
                        >
                          {#if loadingActions[site.id] === 'pushing'}
                            <Loader2 class="h-3.5 w-3.5 animate-spin" />
                          {:else}
                            <ArrowUpFromLine class="h-3.5 w-3.5" />
                          {/if}
                          <span class="ml-1">Push</span>
                        </Button>
                      </div>
                    {/if}
                  </div>
                {:else}
                  <div class="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    No sites match your filters
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </Tabs.Content>
      </div>
    </Tabs.Root>
  </div>
</div>
