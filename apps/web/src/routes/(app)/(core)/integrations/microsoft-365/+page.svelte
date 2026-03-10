<script lang="ts">
  import { INTEGRATIONS } from '@workspace/shared/config/integrations';
  import { CONSENT_VERSION, MS_CAPABILITIES } from '@workspace/shared/config/microsoft';
  import IntegrationHeader from '../_helpers/integration-header.svelte';
  import type { PageProps } from './$types';
  import type { Tables } from '@workspace/shared/types/database';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import SearchBar from '$lib/components/search-bar.svelte';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import {
    CircleAlert,
    X,
    Settings,
    TriangleAlert,
    Users,
    Globe,
    Activity,
    CircleCheck,
    CircleX,
  } from '@lucide/svelte';
  import Loader from '$lib/components/transition/loader.svelte';
  import SingleSelect from '$lib/components/single-select.svelte';
  import { CircleQuestionMark } from 'lucide-svelte';
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import PermissionGaurd from '$lib/components/auth/permission-gaurd.svelte';
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';

  const { data, form }: PageProps = $props();

  const integration = INTEGRATIONS['microsoft-365'];

  let dbIntegration = $state<Tables<'public', 'integrations'> | null>(null);
  let dbLinks = $state<Tables<'public', 'integration_links'>[]>([]);
  let dbSites = $state<Tables<'public', 'sites'>[]>([]);
  let loading = $state(true);
  let selectedLinkId = $state<string | null>(null);
  let connectionSearch = $state('');
  let activeFilter = $state<
    'All' | 'Active' | 'Needs Consent' | 'Has Unmapped' | 'Has Orphans' | 'Missing Capabilities'
  >('All');
  let configSheetOpen = $state(false);

  const tenantLinks = $derived(dbLinks.filter((l) => !l.site_id));
  const siteLinks = $derived(dbLinks.filter((l) => !!l.site_id));

  const selectedLink = $derived(dbLinks.find((l) => l.id === selectedLinkId) ?? null);
  const filteredLinks = $derived(
    tenantLinks
      .filter((l) => l.name?.toLowerCase().includes(connectionSearch.toLowerCase()))
      .filter((l) => evaluateLinkFiler(activeFilter, l))
      .sort((a, b) => a.name!.toLowerCase().localeCompare(b.name!.toLowerCase()))
  );
  const activeLinks = $derived(tenantLinks.filter((dl) => dl.status === 'active'));

  const metrics = $derived({
    total: tenantLinks.length,
    active: activeLinks.length,
    withIssues: activeLinks.filter((l) => (l.meta as any).consentVersion !== CONSENT_VERSION)
      .length,
    totalUnmapped: activeLinks.reduce((acc, al) => {
      const mapped = siteLinks
        .filter((sl) => sl.external_id === al.external_id)
        .reduce((dacc, sl) => dacc + ((sl.meta as any).domains?.length ?? 0), 0);
      return acc + ((al.meta as any).domains?.length ?? 0) - mapped;
    }, 0),
    totalOrphaned: 0,
    isConfigured: !!dbIntegration,
  });

  const domainSiteMap = $derived.by(() => {
    const map = new Map<string, string>();
    for (const sl of siteLinks) {
      for (const domain of (sl.meta as any)?.domains ?? []) {
        map.set(domain, sl.site_id!);
      }
    }
    return map;
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
    const error = page.url.searchParams.get('error');
    const initialConsent = page.url.searchParams.get('initialConsent');
    const consentedTenant = page.url.searchParams.get('consentedTenant');

    if (initialConsent) {
      toast.info('Microsoft 365 consent successful!');
    } else if (consentedTenant) {
      const link = dbLinks.find((dl) => !dl.site_id && dl.external_id === consentedTenant);
      if (!link) {
        return;
      }

      toast.info(`Successfully consented for tenant ${link.name}`);
      selectedLinkId = link.id;
    } else if (error) {
      toast.error(`Failed to complete the consent flow: ${error}`);
    }
  });

  $effect(() => {
    if (form?.error) {
      toast.info(`Failed to process action: ${form.error}`);
    }
  });

  const missingCapsCount = (link: Tables<'public', 'integration_links'>): number =>
    Object.keys(MS_CAPABILITIES).filter((key) => (link.meta as any)?.capabilities?.[key] === false)
      .length;

  const evaluateLinkFiler = (
    active:
      | 'All'
      | 'Active'
      | 'Needs Consent'
      | 'Has Unmapped'
      | 'Has Orphans'
      | 'Missing Capabilities',
    link: Tables<'public', 'integration_links'>
  ) => {
    switch (active) {
      case 'All':
        return true;
      case 'Has Unmapped': {
        if (link.status !== 'active') return false;
        const domainCount = siteLinks
          .filter((sl) => sl.external_id === link.external_id)
          .reduce((acc, sl) => acc + ((sl.meta as any).domains?.length ?? 0), 0);

        return domainCount < (link.meta as any).domains?.length;
      }
      case 'Active':
        return link.status === 'active';
      case 'Has Orphans':
        return true;
      case 'Needs Consent':
        return (link.meta as any)?.consentVersion !== CONSENT_VERSION && link.status === 'active';
      case 'Missing Capabilities':
        return link.status === 'active' && missingCapsCount(link) > 0;
      default:
        return true;
    }
  };
</script>

<!-- Configuration Sheet -->
<Sheet.Root bind:open={configSheetOpen}>
  <Sheet.Portal>
    <Sheet.Overlay />
    <Sheet.Content side="right" class="w-105 flex flex-col gap-0 p-0">
      <Sheet.Header class="p-4 border-b">
        <Sheet.Title>Configure Microsoft 365</Sheet.Title>
        <Sheet.Description>Set up your M365 integration credentials.</Sheet.Description>
      </Sheet.Header>

      <div class="flex flex-col p-4 flex-1 overflow-y-auto">
        <Card.Root class="bg-primary/5 border-primary/20">
          <Card.Header class="pb-2">
            <Card.Title class="text-base">GDAP Partner Connection</Card.Title>
          </Card.Header>
          <Card.Content>
            <p class="text-sm text-muted-foreground mb-4">
              Connect MSPByte as a partner application through Microsoft's Granular Delegated Admin
              Privileges (GDAP) framework. This allows managing multiple customer tenants without
              requiring per-tenant credentials.
            </p>
            <form method="POST" action="?/initialConsent" use:enhance>
              <Button variant="outline" size="sm" type="submit">Connect MSPByte</Button>
            </form>
          </Card.Content>
        </Card.Root>
      </div>
      <Sheet.Footer>
        <PermissionGaurd permission="Integrations.Write">
          <AlertDialog.Root>
            <AlertDialog.Trigger>
              {#snippet child({ props })}
                {#if !!dbIntegration}
                  <Button variant="destructive" {...props}>Delete Integration</Button>
                {/if}
              {/snippet}
            </AlertDialog.Trigger>
            <AlertDialog.Content>
              <AlertDialog.Header>
                <AlertDialog.Title>Delete Microsoft 365 Integration?</AlertDialog.Title>
                <AlertDialog.Description>
                  This will remove the Microsoft 365 integration from your account. All associated
                  data (tenants, identities, domains) will be permanently deleted after
                  <strong>30 days</strong>. This action can be undone before that window expires.
                </AlertDialog.Description>
              </AlertDialog.Header>
              <AlertDialog.Footer>
                <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
                <form method="POST" action="?/deleteIntegration">
                  <AlertDialog.Action type="submit" class="bg-red-500 hover:bg-red-500/70"
                    >Delete Integration</AlertDialog.Action
                  >
                </form>
              </AlertDialog.Footer>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </PermissionGaurd>
      </Sheet.Footer>
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
    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 shrink-0">
      <Card.Root class="p-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Total Tenants</span>
          <span class="text-2xl font-bold">{loading ? '—' : metrics.total}</span>
        </div>
      </Card.Root>
      <Card.Root class="p-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Active</span>
          <span class="text-2xl font-bold text-primary">{loading ? '—' : metrics.active}</span>
        </div>
      </Card.Root>
      <Card.Root class="p-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Needs Action</span>
          <span class="text-2xl font-bold text-warning">{loading ? '—' : metrics.withIssues}</span>
        </div>
      </Card.Root>
      <Card.Root class="p-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Unmapped</span>
          <span class="text-2xl font-bold text-destructive"
            >{loading ? '—' : metrics.totalUnmapped}</span
          >
        </div>
      </Card.Root>
      <Card.Root class="p-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Orphaned</span>
          <span class="text-2xl font-bold text-destructive"
            >{loading ? '—' : metrics.totalOrphaned}</span
          >
        </div>
      </Card.Root>
      <Card.Root class="p-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Config Health</span>
          {#if loading}
            <span class="text-2xl font-bold">—</span>
          {:else if metrics.isConfigured}
            <span class="text-sm font-medium text-primary flex items-center gap-1">
              <CircleCheck class="size-4" /> Healthy
            </span>
          {:else}
            <span class="text-sm font-medium text-destructive flex items-center gap-1">
              <CircleX class="size-4" /> Not set up
            </span>
          {/if}
        </div>
      </Card.Root>
    </div>

    {#if !loading && !metrics.isConfigured}
      <FadeIn>
        <div
          class="flex items-center gap-3 px-4 py-3 rounded bg-warning/10 text-warning border border-warning/30 shrink-0"
        >
          <TriangleAlert class="size-4 shrink-0" />
          <span class="text-sm">
            Microsoft 365 is not configured yet. Click <strong>Configure</strong> to set up your credentials.
          </span>
        </div>
      </FadeIn>
    {/if}

    <!-- Search -->
    <div class="flex gap-2 items-center shrink-0 w-1/2">
      <SearchBar bind:value={connectionSearch} placeholder="Search tenants..." />
      <div class="flex gap-1.5 shrink-0">
        {#each ['All', 'Active', 'Needs Consent', 'Has Unmapped', 'Has Orphans', 'Missing Capabilities'] as filter}
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
    </div>

    <div class="flex-1 overflow-hidden flex gap-4 min-h-0">
      <div
        class="flex flex-col overflow-hidden gap-4 transition-all duration-200 {selectedLinkId
          ? 'w-96'
          : 'flex-1'}"
      >
        <!-- Tenant cards -->
        <div class="flex-1 overflow-y-auto pr-1">
          {#if loading}
            <Loader />
          {:else if filteredLinks.length === 0}
            <FadeIn
              class="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground"
            >
              <Globe class="size-8 opacity-40" />
              <span class="text-sm">No tenants found</span>
            </FadeIn>
          {:else}
            <FadeIn
              class="grid gap-3 {selectedLinkId
                ? 'grid-cols-1'
                : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}"
            >
              {#each filteredLinks as link (link.id)}
                {@const missing = missingCapsCount(link)}
                <button
                  class="text-left w-full"
                  onclick={() => (selectedLinkId = selectedLinkId === link.id ? null : link.id)}
                >
                  <Card.Root
                    class="p-3 cursor-pointer hover:border-primary/50 transition-colors h-24 {selectedLinkId ===
                    link.id
                      ? 'border-primary bg-primary/10'
                      : 'bg-card/70'}"
                  >
                    <div class="flex flex-col h-full gap-2 justify-between">
                      <div class="flex items-start justify-between gap-2">
                        <span class="font-medium text-sm leading-tight">
                          {link.name ?? link.external_id}
                        </span>
                        <Badge
                          class="text-xs shrink-0 {link.status === 'active'
                            ? 'bg-primary/15 text-primary border-primary/30'
                            : 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30'}"
                          variant="outline"
                        >
                          {link.status?.toUpperCase() ?? 'unknown'}
                        </Badge>
                      </div>
                      <div class="flex items-center gap-3 text-xs text-muted-foreground">
                        <span class="flex items-center gap-1">
                          <Globe class="size-3" />
                          {(link.meta as any)?.domains?.length ?? 0} domains
                        </span>
                        <span class="flex items-center gap-1">
                          <Users class="size-3" />
                          {(link.meta as any)?.userCount ?? 0} users
                        </span>
                        {#if missing > 0}
                          <span class="flex items-center gap-1 text-warning">
                            <TriangleAlert class="size-3 text-amber-500" />
                            {missing} missing
                          </span>
                        {/if}
                      </div>
                    </div>
                  </Card.Root>
                </button>
              {/each}
            </FadeIn>
          {/if}
        </div>
      </div>

      {#if selectedLink}
        <div class="flex-1 flex flex-col overflow-hidden border rounded bg-card/70">
          <!-- Tenant header -->
          <div class="flex items-start justify-between px-4 py-3 border-b shrink-0">
            <div class="flex flex-col gap-0.5">
              <h2 class="font-semibold">{selectedLink.name ?? selectedLink.external_id}</h2>
              <span class="text-xs text-muted-foreground font-mono"
                >Tenant: {selectedLink.external_id}</span
              >
            </div>
            <button
              class="p-1 rounded hover:bg-muted transition-colors"
              onclick={() => (selectedLinkId = null)}
              aria-label="Close panel"
            >
              <X class="size-4" />
            </button>
          </div>

          {#if selectedLink.status === 'active'}
            {@const needsConsent = (selectedLink.meta as any)?.consentVersion !== CONSENT_VERSION}
            {#if needsConsent}
              <div
                class="flex items-center justify-between gap-3 mx-4 mt-3 px-3 py-2 rounded bg-warning/10 text-warning border border-warning/30 shrink-0"
              >
                <div class="flex items-center gap-2">
                  <TriangleAlert class="size-4 shrink-0" />
                  <span class="text-xs"
                    >Consent is outdated — re-consent to restore full access.</span
                  >
                </div>
                <form method="POST" action="?/gdapConsent" use:enhance>
                  <input name="gdapTenantId" value={selectedLink.external_id} hidden />
                  <Button
                    size="sm"
                    variant="outline"
                    class="text-warning border-warning/40 hover:bg-warning/10 shrink-0"
                    type="submit"
                  >
                    Re-consent
                  </Button>
                </form>
              </div>
            {/if}
            <!-- Tabs -->
            <Tabs.Root value="domains" class="flex flex-col flex-1 overflow-hidden">
              <Tabs.List class="mx-4 mt-3 shrink-0">
                <Tabs.Trigger value="domains">Domains</Tabs.Trigger>
                <Tabs.Trigger value="identities">Identities</Tabs.Trigger>
                <Tabs.Trigger value="capabilities">Capabilities</Tabs.Trigger>
              </Tabs.List>

              <!-- Domains tab -->
              <Tabs.Content value="domains" class="flex flex-col overflow-y-auto p-4 gap-2">
                {#if !(selectedLink.meta as any)?.domains?.length}
                  <div
                    class="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground"
                  >
                    <Globe class="size-8 opacity-40" />
                    <span class="text-sm">No domains cached</span>
                  </div>
                {:else}
                  <div class="flex flex-col h-full gap-3 overflow-auto">
                    <div
                      class="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground px-1"
                    >
                      <span>Domain</span>
                      <span>Mapped Site</span>
                    </div>
                    {#each (selectedLink.meta as any).domains as domain}
                      {@const mappedSiteId = domainSiteMap.get(domain)}
                      <div class="grid grid-cols-2 gap-2 items-center">
                        <span class="text-sm font-mono truncate">{domain}</span>
                        <SingleSelect
                          options={dbSites.map((ds) => ({ label: ds.name, value: ds.id }))}
                          selected={mappedSiteId}
                        />
                      </div>
                    {/each}
                  </div>
                {/if}
                <div class="flex h-fit pt-4">
                  <Button size="sm" disabled>Save Mappings</Button>
                </div>
              </Tabs.Content>

              <!-- Identities tab -->
              <Tabs.Content value="identities" class="flex-1 overflow-y-auto px-4 pb-4 mt-3">
                <div class="flex flex-col gap-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm">Orphaned Identities</span>
                      <Badge variant="outline" class="text-xs">0</Badge>
                    </div>
                    <Button size="sm" variant="outline" disabled>Load</Button>
                  </div>
                  <div
                    class="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground border rounded"
                  >
                    <Users class="size-8 opacity-40" />
                    <span class="text-sm">Click Load to fetch identities</span>
                  </div>
                  <div class="flex gap-2">
                    <Button size="sm" variant="outline" disabled>Load More</Button>
                    <Button size="sm" disabled>Save Assignments</Button>
                  </div>
                </div>
              </Tabs.Content>

              <!-- Capabilities tab -->
              <Tabs.Content value="capabilities" class="flex-1 overflow-y-auto px-4 pb-4 mt-3">
                <div class="flex flex-col gap-4">
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-sm">Tenant Capabilities</span>
                    <Button size="sm" variant="outline" disabled>
                      <Activity class="size-4 mr-1.5" />
                      Refresh Capabilities
                    </Button>
                  </div>
                  <div class="flex flex-col gap-2">
                    {#each Object.entries(MS_CAPABILITIES) as [key, cap]}
                      {@const hasCapability = (selectedLink.meta as any)?.capabilities?.[
                        key
                      ] as boolean}
                      <div class="flex items-start gap-3 p-3 rounded border bg-muted/30">
                        {#if hasCapability}
                          <CircleCheck class="size-4 text-primary mt-0.5 shrink-0" />
                        {:else if (selectedLink.meta as any)?.capabilities?.[key] === undefined}
                          <CircleQuestionMark class="size-4 text-amber-500 mt-0.5 shrink-0" />
                        {:else}
                          <CircleAlert class="size-4 text-red-500 mt-0.5 shrink-0" />
                        {/if}
                        <div class="flex flex-col gap-0.5">
                          <span class="text-sm font-medium">{cap.label}</span>
                          <span class="text-xs text-muted-foreground">{cap.description}</span>
                          {#if (selectedLink.meta as any)?.capabilities?.[key] === undefined}
                            <span class="text-xs text-muted-foreground/60 italic"
                              >not yet checked</span
                            >
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </Tabs.Content>
            </Tabs.Root>
          {:else}
            <div class="flex flex-col size-full p-4 items-center justify-center">
              <div class="flex flex-col h-fit justify-center items-center w-full gap-2">
                Process consent flow to activate this tenant.
                <form method="POST" action="?/gdapConsent" use:enhance>
                  <input name="gdapTenantId" bind:value={selectedLink.external_id} hidden />
                  <Button type="submit">Consent</Button>
                </form>
              </div>
            </div>
          {/if}
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
          Microsoft 365 is not configured yet. Click <strong>Configure</strong> to set up your credentials.
        </span>
      </div>
    </FadeIn>
  {/if}
</div>
