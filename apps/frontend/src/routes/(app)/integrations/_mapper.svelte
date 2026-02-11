<script lang="ts">
  import SearchBar from '$lib/components/search-bar.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Separator from '$lib/components/ui/separator/separator.svelte';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import MultiSelect from '$lib/components/multi-select.svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import { Plus } from 'lucide-svelte';
  import { ORM } from '@workspace/shared/lib/utils/orm';
  import { supabase } from '$lib/supabase';
  import { toast } from 'svelte-sonner';
  import { stringCompare } from '$lib/utils/compare';
  import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';

  let {
    id,
    tenantId,
    sites = $bindable(),
    tenants,
    links = $bindable(),
  }: {
    id: string;
    tenantId: string;
    sites: Tables<'public', 'sites'>[];
    tenants: { id: string; name: string }[];
    links: Tables<'public', 'site_to_integration'>[];
  } = $props();

  type PendingCreate = {
    type: 'create';
    siteId: string;
    siteName: string;
    tenantIds: string[];
  };

  let search = $state('');
  let filter = $state('all');
  let newSiteDialog = $state(false);
  let newSiteName = $state('');
  let newSiteTenants = $state<string[]>([]);
  let importAllSites = $state(false);
  let isSaving = $state(false);

  // Pending creates for new sites (separate from selection changes)
  let pendingCreates = $state<Map<string, PendingCreate>>(new Map());

  // Original linked tenant IDs per site (derived from links prop, immutable reference)
  let originalMappings = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const site of sites) {
      // Skip temporary sites
      if (site.id.toString().startsWith('new-')) continue;
      const tenantIds = links.filter((l) => l.site_id === site.id).map((l) => l.external_id);
      map.set(site.id.toString(), tenantIds);
    }
    return map;
  });

  // Current selections (mutable state, tracks user modifications)
  let currentSelections = $state<Map<string, string[]>>(new Map());

  // Get current selection for a site (falls back to original if not modified)
  function getSelection(siteId: string): string[] {
    if (currentSelections.has(siteId)) {
      return currentSelections.get(siteId)!;
    }
    return originalMappings.get(siteId) || [];
  }

  // Set selection for a site
  function setSelection(siteId: string, tenantIds: string[]) {
    currentSelections.set(siteId, [...tenantIds]);
    currentSelections = new Map(currentSelections);
  }

  // Check if a site has pending changes
  function hasPendingChange(siteId: string): boolean {
    // New sites always have pending changes
    if (siteId.startsWith('new-')) return true;

    const original = originalMappings.get(siteId) || [];
    const current = getSelection(siteId);

    // Compare as sets
    if (original.length !== current.length) return true;
    const originalSet = new Set(original);
    return current.some((id) => !originalSet.has(id));
  }

  // Get the type of pending change for a site
  function getPendingChangeType(siteId: string): 'link' | 'unlink' | 'modify' | 'create' | null {
    // New sites are "create" type
    if (siteId.startsWith('new-')) return 'create';

    if (!hasPendingChange(siteId)) return null;

    const original = originalMappings.get(siteId) || [];
    const current = getSelection(siteId);

    if (original.length === 0 && current.length > 0) return 'link';
    if (original.length > 0 && current.length === 0) return 'unlink';
    return 'modify';
  }

  function getUsedTenants() {
    const usedByOthers = new Set<string>();

    for (const site of sites) {
      const sid = site.id.toString();

      // For new sites, get from pending creates
      if (sid.startsWith('new-')) {
        const pending = pendingCreates.get(sid);
        if (pending) {
          pending.tenantIds.forEach((tid) => usedByOthers.add(String(tid)));
        }
      } else {
        const selection = getSelection(sid);
        selection.forEach((tid) => usedByOthers.add(String(tid)));
      }
    }

    return usedByOthers;
  }

  // Get available tenants for a site (excludes tenants mapped to OTHER sites)
  function getAvailableTenants(siteId: string) {
    // Get ALL tenants currently selected by OTHER sites
    const usedByOthers = new Set<string>();

    // Get current site's selection so we can always include them
    const currentSiteSelection = new Set(
      siteId.startsWith('new-') ? pendingCreates.get(siteId)?.tenantIds || [] : getSelection(siteId)
    );

    for (const site of sites) {
      const sid = site.id.toString();
      if (sid === siteId) continue;

      // For new sites, get from pending creates
      if (sid.startsWith('new-')) {
        const pending = pendingCreates.get(sid);
        if (pending) {
          pending.tenantIds.forEach((tid) => usedByOthers.add(String(tid)));
        }
      } else {
        const selection = getSelection(sid);
        selection.forEach((tid) => usedByOthers.add(String(tid)));
      }
    }

    // Include tenants that are:
    // 1. Selected by current site (always show these)
    // 2. OR not used by any other site
    // Convert t.id to string for comparison AND for the option value
    return tenants
      .filter((t) => currentSiteSelection.has(String(t.id)) || !usedByOthers.has(String(t.id)))
      .map((t) => ({ value: String(t.id), label: t.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // Build the site list for display
  let siteList = $derived.by(() => {
    return sites.map((site) => {
      const siteId = site.id.toString();
      const isNew = siteId.startsWith('new-');
      const pendingType = getPendingChangeType(siteId);

      return {
        ...site,
        siteId,
        isNew,
        pendingType,
        hasPending: pendingType !== null,
      };
    });
  });

  let filtered = $derived.by(() => {
    const usedTenants = getUsedTenants();
    const lowerSearch = search.toLowerCase();

    return siteList
      .filter(
        (s) =>
          s.name.toLowerCase().includes(lowerSearch) ||
          tenants.some(
            (t) =>
              usedTenants.has(String(t.id)) &&
              t.name.toLowerCase().includes(lowerSearch) &&
              originalMappings.get(s.siteId)?.includes(String(t.id))
          )
      )
      .filter((s) => {
        if (filter === 'all') return true;
        const currentSelection = s.isNew
          ? pendingCreates.get(s.siteId)?.tenantIds || []
          : getSelection(s.siteId);
        const isLinked = currentSelection.length > 0;
        return filter === 'linked' ? isLinked : !isLinked;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  let linkedCount = $derived(
    siteList.filter((s) => {
      const currentSelection = s.isNew
        ? pendingCreates.get(s.siteId)?.tenantIds || []
        : getSelection(s.siteId);
      return currentSelection.length > 0;
    }).length
  );
  let unlinkedCount = $derived(sites.length - linkedCount);

  // Count total pending changes
  let pendingCount = $derived.by(() => {
    let count = pendingCreates.size;
    for (const site of sites) {
      const siteId = site.id.toString();
      if (!siteId.startsWith('new-') && hasPendingChange(siteId)) {
        count++;
      }
    }
    return count;
  });

  const openCreateSiteDialog = () => {
    newSiteName = '';
    newSiteTenants = [];
    newSiteDialog = true;
    importAllSites = false;
  };

  const handleSiteSelection = (siteId: string, tenantIds: string[]) => {
    setSelection(siteId, tenantIds);
  };

  const handleNewSiteSelection = (siteId: string, tenantIds: string[]) => {
    const pending = pendingCreates.get(siteId);
    if (pending) {
      pending.tenantIds = [...tenantIds];
      pendingCreates = new Map(pendingCreates);
    }
  };

  const handleCreateSite = () => {
    if (importAllSites) {
      const tenants = getAvailableTenants('new');

      for (const t of tenants) {
        createSiteHelper(t.label, [t.value.toString()]);
      }
    } else {
      if (!newSiteName.trim()) return;

      createSiteHelper(newSiteName.trim(), newSiteTenants);
    }

    newSiteDialog = false;
    newSiteName = '';
    newSiteTenants = [];
  };

  const createSiteHelper = (siteName: string, tenantIds: string[]) => {
    const tempId = `new-${crypto.randomUUID()}`;

    // Add to pending creates
    pendingCreates.set(tempId, {
      type: 'create',
      siteId: tempId,
      siteName: siteName.trim(),
      tenantIds: [...tenantIds],
    });
    pendingCreates = new Map(pendingCreates);

    // Add temporary site to the list for UI purposes
    sites = [
      ...sites,
      {
        id: tempId,
        name: siteName.trim(),
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
      } as Tables<'public', 'sites'>,
    ];
  };

  const cancelPendingChange = (siteId: string) => {
    if (siteId.startsWith('new-')) {
      // Remove the temporary site
      pendingCreates.delete(siteId);
      pendingCreates = new Map(pendingCreates);
      sites = sites.filter((s) => s.id.toString() !== siteId);
    } else {
      // Revert to original selection
      currentSelections.delete(siteId);
      currentSelections = new Map(currentSelections);
    }
  };

  const handleSaveMappings = async () => {
    if (pendingCount === 0) return;

    isSaving = true;
    const toastId = toast.loading(
      `Saving ${pendingCount} mapping${pendingCount > 1 ? 's' : ''}...`
    );

    try {
      const orm = new ORM(supabase);

      // Collect pending creates into ordered arrays for a single bulk insert
      const createEntries = [...pendingCreates.entries()];
      const allNewSiteRows = createEntries.map(([, create]) => ({
        tenant_id: tenantId,
        name: create.siteName,
      }));

      // Collect existing sites with pending changes
      const changedExisting = sites.filter((site) => {
        const siteId = site.id.toString();
        return !siteId.startsWith('new-') && hasPendingChange(siteId);
      });

      // --- Step 1: Batch insert all new sites (1 API call) ---
      let createdSites: Tables<'public', 'sites'>[] = [];
      if (allNewSiteRows.length > 0) {
        const { data } = await orm.insert('public', 'sites', allNewSiteRows);
        createdSites = data ?? [];
      }

      // Build tempId → real site map (insert preserves order)
      const tempToReal = new Map<string, Tables<'public', 'sites'>>();
      for (let i = 0; i < createEntries.length; i++) {
        if (createdSites[i]) {
          tempToReal.set(createEntries[i][0], createdSites[i]);
        }
      }

      // --- Step 2: Batch delete all stale links (1 API call) ---
      const allLinkIdsToDelete: string[] = [];
      for (const site of changedExisting) {
        const existingLinkIds = links.filter((l) => l.site_id === site.id).map((l) => l.id);
        allLinkIdsToDelete.push(...existingLinkIds);
      }

      if (allLinkIdsToDelete.length > 0) {
        await orm.delete('public', 'site_to_integration', (q) => q.in('id', allLinkIdsToDelete));
      }

      // --- Step 3: Batch insert all new links (1 API call) ---
      const allNewLinks: {
        tenant_id: string;
        site_id: string;
        integration_id: string;
        external_id: string;
      }[] = [];

      // Links for newly created sites
      for (const [tempId, create] of createEntries) {
        const realSite = tempToReal.get(tempId);
        if (!realSite || create.tenantIds.length === 0) continue;
        for (const eId of create.tenantIds) {
          allNewLinks.push({
            tenant_id: tenantId,
            site_id: realSite.id,
            integration_id: id,
            external_id: eId,
          });
        }
      }

      // Links for existing changed sites
      for (const site of changedExisting) {
        const current = getSelection(site.id.toString());
        for (const eId of current) {
          allNewLinks.push({
            tenant_id: tenantId,
            site_id: site.id,
            integration_id: id,
            external_id: eId,
          });
        }
      }

      let insertedLinks: Tables<'public', 'site_to_integration'>[] = [];
      if (allNewLinks.length > 0) {
        const { data } = await orm.insert('public', 'site_to_integration', allNewLinks);
        insertedLinks = data ?? [];
      }

      // --- Step 4: Update local state ---
      // Replace temp sites with real sites
      if (tempToReal.size > 0) {
        sites = sites.map((s) => {
          const real = tempToReal.get(s.id.toString());
          return real ?? s;
        });
      }

      // Update links: remove deleted, add new
      const deletedSet = new Set(allLinkIdsToDelete);
      links = [...links.filter((l) => !deletedSet.has(l.id)), ...insertedLinks];

      // Clear pending state
      pendingCreates.clear();
      pendingCreates = new Map(pendingCreates);
      currentSelections.clear();
      currentSelections = new Map(currentSelections);

      const successCount = tempToReal.size + changedExisting.length;
      toast.success(`Successfully saved ${successCount} mapping${successCount > 1 ? 's' : ''}`, {
        id: toastId,
      });
    } catch (error) {
      console.error('Error saving mappings:', error);
      toast.error('Failed to save mappings. Please try again.', { id: toastId });
    } finally {
      isSaving = false;
    }
  };

  const handleNewSiteTenantChange = (tenantIds: string[]) => {
    newSiteTenants = tenantIds;
    // Prefill site name with first selected tenant's name if name is empty
    if (tenantIds.length > 0 && newSiteName.length === 0) {
      const firstTenant = tenants.find((t) => t.id.toString() === tenantIds[0]);
      if (firstTenant) {
        newSiteName = firstTenant.name;
      }
    }
  };

  const autoMatch = () => {
    // Track which tenants get matched to avoid duplicates
    const matchedTenants = new Set<string>();

    for (const site of sites) {
      const siteId = site.id.toString();
      if (siteId.startsWith('new-')) continue;

      // Skip sites that already have a selection
      if (getSelection(siteId).length > 0) continue;

      // Find the best matching tenant for this site
      let bestMatch: { tenantId: string; score: number } | null = null;

      for (const tenant of tenants) {
        const tenantId = String(tenant.id);
        // Skip tenants already matched to another site
        if (matchedTenants.has(tenantId)) continue;

        let score = 0;
        const tenantName =
          id === 'halopsa' ? (tenant.name.split('/')[1] ?? tenant.name) : tenant.name;
        score = stringCompare(site.name, tenantName);

        if (id === 'halopsa') {
          const score1 = stringCompare(site.name, tenant.name);
          const score2 = stringCompare(site.name, tenant.name.split('/').at(1) ?? tenant.name);
          score = Math.max(score1, score2);
        } else score = stringCompare(site.name, tenant.name);
        if (score > 0.8 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { tenantId, score };
        }
      }

      // Apply the best match if found
      if (bestMatch) {
        setSelection(siteId, [bestMatch.tenantId]);
        matchedTenants.add(bestMatch.tenantId);
      }
    }
  };
</script>

<div class="flex flex-col size-full gap-4 overflow-hidden">
  <div class="flex w-full h-fit justify-between items-center gap-4">
    <SearchBar bind:value={search} />
    <div class="flex gap-2">
      <Badge
        onclick={() => (filter = 'all')}
        class="hover:cursor-pointer hover:bg-accent transition-colors"
        variant={filter === 'all' ? 'default' : 'outline'}
      >
        Total: {sites.length}
      </Badge>
      <Badge
        onclick={() => (filter = 'linked')}
        class="hover:cursor-pointer hover:bg-accent transition-colors"
        variant={filter === 'linked' ? 'default' : 'outline'}
      >
        Linked: {linkedCount}
      </Badge>
      <Badge
        onclick={() => (filter = 'unlinked')}
        variant={filter === 'unlinked' ? 'destructive' : 'outline'}
        class="hover:cursor-pointer hover:bg-accent transition-colors"
      >
        Unlinked: {unlinkedCount}
      </Badge>
      {#if pendingCount > 0}
        <Badge variant="secondary" class="ml-2">
          Pending: {pendingCount}
        </Badge>
      {/if}
    </div>
  </div>

  <div class="flex gap-2">
    <Button onclick={openCreateSiteDialog} variant="outline" class="flex-1">
      <Plus class="w-4 h-4 mr-2" />
      Create New Site
    </Button>
    <Button onclick={autoMatch} variant="outline">Auto-Match</Button>
  </div>

  <Separator />

  <div class="flex flex-col size-full gap-2 pr-2 overflow-auto">
    {#each filtered as site}
      {@const currentSelection = site.isNew
        ? pendingCreates.get(site.siteId)?.tenantIds || []
        : getSelection(site.siteId)}
      <div
        class="flex items-center justify-between gap-3 border shadow-sm rounded-lg px-4 py-3 transition-all hover:shadow-md"
      >
        <div class="flex items-center gap-2 min-w-0 shrink-0">
          <span class="font-medium truncate w-full">{site.name}</span>
        </div>

        <div class="flex w-1/2 items-center gap-1">
          {#if site.hasPending}
            <Button
              class="h-8 w-fit shrink-0"
              variant="ghost"
              size="sm"
              onclick={() => cancelPendingChange(site.siteId)}
            >
              Cancel
            </Button>
          {/if}
          <div class="flex flex-1 min-w-0">
            <MultiSelect
              options={getAvailableTenants(site.siteId)}
              selected={currentSelection}
              placeholder="Select tenants..."
              searchPlaceholder="Search tenants..."
              onchange={(newSelection) =>
                site.isNew
                  ? handleNewSiteSelection(site.siteId, newSelection)
                  : handleSiteSelection(site.siteId, newSelection)}
            />
          </div>
        </div>
      </div>
    {/each}

    {#if filtered.length === 0}
      <div class="flex items-center justify-center h-32 text-muted-foreground">No sites found</div>
    {/if}
  </div>

  <Button
    onclick={handleSaveMappings}
    disabled={pendingCount === 0 || isSaving}
    class="w-full"
    size="lg"
  >
    {isSaving ? 'Saving...' : `Save Mappings ${pendingCount > 0 ? `(${pendingCount})` : ''}`}
  </Button>
</div>

<Dialog.Root bind:open={newSiteDialog}>
  <Dialog.Content class="sm:max-w-125">
    <Dialog.Header>
      <Dialog.Title>Create New Site</Dialog.Title>
      <Dialog.Description>
        Create a new site and optionally link it to integration tenants.
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-4 py-4">
      {#if !importAllSites}
        <div class="flex flex-col gap-2">
          <Label for="siteName">Site Name</Label>
          <Input
            id="siteName"
            bind:value={newSiteName}
            placeholder="Enter site name"
            onkeydown={(e) => {
              if (e.key === 'Enter' && newSiteName.trim()) handleCreateSite();
            }}
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label>Link to Tenants (Optional)</Label>
          <MultiSelect
            options={getAvailableTenants('new')}
            selected={newSiteTenants}
            placeholder="Select tenants..."
            searchPlaceholder="Search tenants..."
            onchange={handleNewSiteTenantChange}
          />
        </div>
      {:else}
        <span class="text-amber-500">This will create all available tenants as sites</span>
      {/if}
      <div class="flex gap-2">
        <Checkbox id="all-sites" bind:checked={importAllSites} />
        <Label for="all-sites">Import All Sites?</Label>
      </div>
    </div>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => {
          newSiteDialog = false;
          newSiteName = '';
          newSiteTenants = [];
        }}
      >
        Cancel
      </Button>
      <Button onclick={handleCreateSite} disabled={!newSiteName.trim() && !importAllSites}>
        Create Site{importAllSites ? 's' : ''}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
