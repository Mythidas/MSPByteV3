<script lang="ts">
  import SearchBar from "$lib/components/search-bar.svelte";
  import Badge from "$lib/components/ui/badge/badge.svelte";
  import Separator from "$lib/components/ui/separator/separator.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import Label from "$lib/components/ui/label/label.svelte";
  import MultiSelect from "$lib/components/multi-select.svelte";
  import type { Tables } from "@workspace/shared/types/database";
  import { Plus } from "lucide-svelte";
  import { ORM } from "@workspace/shared/lib/utils/orm";
  import { supabase } from "$lib/supabase";
  import { toast } from "svelte-sonner";
  import { stringCompare } from "$lib/utils/compare";

  let {
    id,
    sites = $bindable(),
    tenants,
    links = $bindable(),
  }: {
    id: string;
    sites: Tables<"public", "sites">[];
    tenants: { id: string; name: string }[];
    links: Tables<"public", "site_to_integration">[];
  } = $props();

  type PendingCreate = {
    type: "create";
    siteId: string;
    siteName: string;
    tenantIds: string[];
  };

  let search = $state("");
  let filter = $state("all");
  let newSiteDialog = $state(false);
  let newSiteName = $state("");
  let newSiteTenants = $state<string[]>([]);
  let isSaving = $state(false);

  // Pending creates for new sites (separate from selection changes)
  let pendingCreates = $state<Map<string, PendingCreate>>(new Map());

  // Original linked tenant IDs per site (derived from links prop, immutable reference)
  let originalMappings = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const site of sites) {
      // Skip temporary sites
      if (site.id.toString().startsWith("new-")) continue;
      const tenantIds = links
        .filter((l) => l.site_id === site.id)
        .map((l) => l.external_id);
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
    if (siteId.startsWith("new-")) return true;

    const original = originalMappings.get(siteId) || [];
    const current = getSelection(siteId);

    // Compare as sets
    if (original.length !== current.length) return true;
    const originalSet = new Set(original);
    return current.some((id) => !originalSet.has(id));
  }

  // Get the type of pending change for a site
  function getPendingChangeType(
    siteId: string
  ): "link" | "unlink" | "modify" | "create" | null {
    // New sites are "create" type
    if (siteId.startsWith("new-")) return "create";

    if (!hasPendingChange(siteId)) return null;

    const original = originalMappings.get(siteId) || [];
    const current = getSelection(siteId);

    if (original.length === 0 && current.length > 0) return "link";
    if (original.length > 0 && current.length === 0) return "unlink";
    return "modify";
  }

  function getUsedTenants() {
    const usedByOthers = new Set<string>();

    for (const site of sites) {
      const sid = site.id.toString();

      // For new sites, get from pending creates
      if (sid.startsWith("new-")) {
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
      siteId.startsWith("new-")
        ? pendingCreates.get(siteId)?.tenantIds || []
        : getSelection(siteId)
    );

    for (const site of sites) {
      const sid = site.id.toString();
      if (sid === siteId) continue;

      // For new sites, get from pending creates
      if (sid.startsWith("new-")) {
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
      const isNew = siteId.startsWith("new-");
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

    console.log(usedTenants)
    return siteList
      .filter((s) => s.name.toLowerCase().includes(lowerSearch) || 
        (tenants.some((t) => usedTenants.has(String(t.id)) 
          && t.name.toLowerCase().includes(lowerSearch) 
          && originalMappings.get(s.siteId)?.includes(String(t.id))))
        )
      .filter((s) => {
        if (filter === "all") return true;
        const currentSelection = s.isNew
          ? pendingCreates.get(s.siteId)?.tenantIds || []
          : getSelection(s.siteId);
        const isLinked = currentSelection.length > 0;
        return filter === "linked" ? isLinked : !isLinked;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
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
      if (!siteId.startsWith("new-") && hasPendingChange(siteId)) {
        count++;
      }
    }
    return count;
  });

  const openCreateSiteDialog = () => {
    newSiteName = "";
    newSiteTenants = [];
    newSiteDialog = true;
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
    if (!newSiteName.trim()) return;

    // Generate temporary ID for the new site
    const tempId = `new-${Date.now()}`;

    // Add to pending creates
    pendingCreates.set(tempId, {
      type: "create",
      siteId: tempId,
      siteName: newSiteName.trim(),
      tenantIds: [...newSiteTenants],
    });
    pendingCreates = new Map(pendingCreates);

    // Add temporary site to the list for UI purposes
    sites = [
      ...sites,
      {
        id: tempId as unknown as number,
        name: newSiteName.trim(),
        tenant_id: 1,
        created_at: new Date().toISOString(),
      } as Tables<"public", "sites">,
    ];

    // Close dialog and reset
    newSiteDialog = false;
    newSiteName = "";
    newSiteTenants = [];
  };

  const cancelPendingChange = (siteId: string) => {
    if (siteId.startsWith("new-")) {
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
      `Saving ${pendingCount} mapping${pendingCount > 1 ? "s" : ""}...`
    );

    try {
      const orm = new ORM(supabase);
      let successCount = 0;

      // Process pending creates (new sites)
      for (const [tempId, create] of pendingCreates) {
        try {
          // Create new site
          const { data: newSite } = await orm.insert("public", "sites", [
            { tenant_id: 1, name: create.siteName },
          ]);

          if (newSite && newSite[0]) {
            // Create links to integration tenants
            if (create.tenantIds.length > 0) {
              const linkInserts = create.tenantIds.map((tenantId) => ({
                tenant_id: 1,
                site_id: newSite[0].id,
                integration_id: id,
                external_id: tenantId,
              }));

              const { data: newLinks } = await orm.insert(
                "public",
                "site_to_integration",
                linkInserts
              );

              if (newLinks) {
                links = [...links, ...newLinks];
              }
            }

            // Update local state - replace temp site with real one
            sites = sites.map((s) =>
              s.id.toString() === tempId ? newSite[0] : s
            );
            successCount++;
          }
        } catch (err) {
          console.error(`Error creating site ${create.siteName}:`, err);
          toast.error(`Failed to create site ${create.siteName}`);
        }
      }

      // Process existing site changes
      for (const site of sites) {
        const siteId = site.id.toString();
        if (siteId.startsWith("new-")) continue; // Skip temp sites, handled above
        if (!hasPendingChange(siteId)) continue;

        try {
          const current = getSelection(siteId);

          // Get existing link IDs for this site
          const existingLinkIds = links
            .filter((l) => l.site_id === site.id)
            .map((l) => l.id);

          // Delete existing links
          if (existingLinkIds.length > 0) {
            for (const linkId of existingLinkIds) {
              await orm.delete("public", "site_to_integration", (q) =>
                q.eq("id", linkId)
              );
            }
            links = links.filter((l) => !existingLinkIds.includes(l.id));
          }

          // Create new links if any
          if (current.length > 0) {
            const linkInserts = current.map((tenantId) => ({
              tenant_id: 1,
              site_id: site.id,
              integration_id: id,
              external_id: tenantId,
            }));

            const { data: newLinks } = await orm.insert(
              "public",
              "site_to_integration",
              linkInserts
            );

            if (newLinks) {
              links = [...links, ...newLinks];
            }
          }

          successCount++;
        } catch (err) {
          console.error(`Error updating mappings for site ${site.name}:`, err);
          toast.error(`Failed to update mappings for ${site.name}`);
        }
      }

      // Clear all pending state after successful save
      pendingCreates.clear();
      pendingCreates = new Map(pendingCreates);
      currentSelections.clear();
      currentSelections = new Map(currentSelections);

      toast.success(
        `Successfully saved ${successCount} mapping${successCount > 1 ? "s" : ""}`,
        { id: toastId }
      );
    } catch (error) {
      console.error("Error saving mappings:", error);
      toast.error("Failed to save mappings. Please try again.", { id: toastId });
    } finally {
      isSaving = false;
    }
  };

  const handleNewSiteTenantChange = (tenantIds: string[]) => {
    newSiteTenants = tenantIds;
    // Prefill site name with first selected tenant's name if name is empty
    if (tenantIds.length > 0 && newSiteName.length === 0) {
      const firstTenant = tenants.find((t) => t.id.toString() === tenantIds[0]);
      console.log(firstTenant, newSiteName)
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
      if (siteId.startsWith("new-")) continue;

      // Skip sites that already have a selection
      if (getSelection(siteId).length > 0) continue;

      // Find the best matching tenant for this site
      let bestMatch: { tenantId: string; score: number } | null = null;

      for (const tenant of tenants) {
        const tenantId = String(tenant.id);
        // Skip tenants already matched to another site
        if (matchedTenants.has(tenantId)) continue;

        const score = stringCompare(site.name, tenant.name);
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
        onclick={() => (filter = "all")}
        class="hover:cursor-pointer hover:bg-accent transition-colors"
        variant={filter === "all" ? "default" : "outline"}
      >
        Total: {sites.length}
      </Badge>
      <Badge
        onclick={() => (filter = "linked")}
        class="hover:cursor-pointer hover:bg-accent transition-colors"
        variant={filter === "linked" ? "default" : "outline"}
      >
        Linked: {linkedCount}
      </Badge>
      <Badge
        onclick={() => (filter = "unlinked")}
        variant={filter === "unlinked" ? "destructive" : "outline"}
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
    <Button onclick={autoMatch} variant="outline">
      Auto-Match
    </Button>
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
      <div class="flex items-center justify-center h-32 text-muted-foreground">
        No sites found
      </div>
    {/if}
  </div>

  <Button
    onclick={handleSaveMappings}
    disabled={pendingCount === 0 || isSaving}
    class="w-full"
    size="lg"
  >
    {isSaving ? "Saving..." : `Save Mappings ${pendingCount > 0 ? `(${pendingCount})` : ""}`}
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
      <div class="flex flex-col gap-2">
        <Label for="siteName">Site Name</Label>
        <Input
          id="siteName"
          bind:value={newSiteName}
          placeholder="Enter site name"
          onkeydown={(e) => {
            if (e.key === "Enter" && newSiteName.trim()) handleCreateSite();
          }}
        />
      </div>
      <div class="flex flex-col gap-2">
        <Label>Link to Tenants (Optional)</Label>
        <MultiSelect
          options={getAvailableTenants("new")}
          selected={newSiteTenants}
          placeholder="Select tenants..."
          searchPlaceholder="Search tenants..."
          onchange={handleNewSiteTenantChange}
        />
      </div>
    </div>
    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => {
          newSiteDialog = false;
          newSiteName = "";
          newSiteTenants = [];
        }}
      >
        Cancel
      </Button>
      <Button onclick={handleCreateSite} disabled={!newSiteName.trim()}>
        Create Site
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
