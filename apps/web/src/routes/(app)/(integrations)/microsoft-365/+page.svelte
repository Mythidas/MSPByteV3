<script lang="ts">
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import TenantCard from './_tenant-card.svelte';
  import HealthBanner from './_health-banner.svelte';
  import IdentitySection from './_identity-section.svelte';
  import LicenseSection from './_license-section.svelte';
  import ComplianceSection from './_compliance-section.svelte';
  import DirectorySection from './_directory-section.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Search } from '@lucide/svelte';
  import { createM365TenantGrid } from '$lib/hooks/m365/useM365TenantGrid.svelte.js';

  let search = $state('');

  const tenantId = $derived(authStore.currentTenant?.id ?? '');
  const linkId = $derived(scopeStore.currentLink as string);

  // ── Unscoped grid: only fetches the links list; each card loads its own data ──
  const grid = createM365TenantGrid(() => (scopeStore.currentLink ? null : tenantId || null));

  const filteredLinks = $derived(
    grid.links
      .filter((l) => l.name?.toLowerCase().includes(search?.trim()?.toLowerCase()))
      .sort((a, b) => a.name?.localeCompare(b.name)),
  );
</script>

<div class="flex flex-col size-full overflow-hidden">
  {#if scopeStore.currentLink}
    <div class="flex flex-col gap-2 p-1 overflow-y-auto flex-1">
      <h1 class="text-2xl font-bold">Overview</h1>

      <FadeIn class="flex flex-col gap-4">
        <HealthBanner {tenantId} {linkId} />
        <IdentitySection {tenantId} {linkId} />
        <LicenseSection {tenantId} {linkId} />
        <ComplianceSection {tenantId} {linkId} />
        <DirectorySection {tenantId} {linkId} />
      </FadeIn>
    </div>
  {:else}
    <!-- Unscoped: per-tenant health grid -->
    <div class="flex flex-col size-full overflow-hidden">
      <!-- Fixed header -->
      <div class="flex items-center justify-between gap-4 p-1 pb-4 shrink-0">
        <h1 class="text-2xl font-bold">Tenants</h1>
        <div class="relative w-64">
          <Search
            class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
          />
          <Input bind:value={search} placeholder="Search tenants..." class="pl-8" />
        </div>
      </div>

      <!-- Scrollable grid -->
      <div class="flex-1 overflow-y-auto">
        {#if grid.loading}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 p-1">
            {#each Array(4) as _}
              <Card.Root class="p-4">
                <div class="flex items-center justify-between mb-4">
                  <span class="h-4 w-32 rounded bg-muted-foreground/20"></span>
                  <span class="h-4 w-20 rounded bg-muted-foreground/20"></span>
                </div>
                <div class="flex flex-col gap-3">
                  {#each Array(3) as _}
                    <div class="h-3 w-full rounded bg-muted-foreground/10"></div>
                  {/each}
                </div>
              </Card.Root>
            {/each}
          </div>
        {:else if filteredLinks.length === 0}
          <div class="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <span class="text-sm"
              >{grid.links.length === 0
                ? 'No Microsoft 365 tenants connected.'
                : 'No tenants match your search.'}</span
            >
          </div>
        {:else}
          <FadeIn>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 p-1">
              {#each filteredLinks as link (link.id)}
                <TenantCard {tenantId} {link} />
              {/each}
            </div>
          </FadeIn>
        {/if}
      </div>
    </div>
  {/if}
</div>
