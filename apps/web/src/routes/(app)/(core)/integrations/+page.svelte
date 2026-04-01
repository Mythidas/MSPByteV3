<script lang="ts">
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import Loader from '$lib/components/transition/loader.svelte';
  import type { PageProps } from './$types';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import SearchBar from '$lib/components/search-bar.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { SquareArrowRight } from 'lucide-svelte';
    import { INTEGRATIONS } from "@workspace/core/config/integrations";
    import type { IntegrationId } from "@workspace/core/types/integrations";

  const { data }: PageProps = $props();

  let search = $state('');
  let filtered = $derived(
    (Object.keys(INTEGRATIONS) as IntegrationId[])
      .filter((i) => INTEGRATIONS[i].name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) =>
        INTEGRATIONS[a].name.toLowerCase().localeCompare(INTEGRATIONS[b].name.toLowerCase())
      )
  );
</script>

<div class="flex flex-col gap-4 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Integrations</h1>
  <div class="flex w-full">
    <div class="w-1/3">
      <SearchBar bind:value={search} />
    </div>
  </div>
  {#await data.getIntegrations}
    <Loader />
  {:then values}
    <FadeIn class="grid grid-cols-4 gap-2">
      {#each filtered as key}
        {@const entry = values.find((v) => v.id === key && !v.deleted_at)}
        {@const active = !!entry}
        <div class="flex flex-col bg-card/70 p-4 h-fit min-h-30 justify-between gap-2">
          <div class="flex w-full justify-between">
            <span>{INTEGRATIONS[key].name}</span>
            <span class="text-sm text-muted-foreground">
              {INTEGRATIONS[key].category.toUpperCase()}
            </span>
          </div>
          {#if active && entry}
            <div class="flex flex-col gap-1">
              {#if entry.healthStatus === 'action_required'}
                <Badge class="h-fit w-fit bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10">Action Required</Badge>
              {:else if entry.healthStatus === 'degraded'}
                <Badge class="h-fit w-fit bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/10">Degraded</Badge>
              {/if}
              {#if entry.credExpiryStatus === 'expired'}
                <span class="text-xs text-destructive">Credentials expired</span>
              {:else if entry.credExpiryStatus === 'expiring_urgent'}
                <span class="text-xs text-amber-500">Expires in {entry.credDaysRemaining} day{entry.credDaysRemaining === 1 ? '' : 's'}</span>
              {/if}
            </div>
          {/if}
          <div class="flex w-full justify-between items-end">
            <Badge variant={active ? 'default' : 'secondary'} class="h-fit">
              {active ? 'Configured' : 'Available'}
            </Badge>
            <Button variant="link" class="py-0! h-fit" href={`/integrations/${key}`}>
              {active ? 'Manage' : 'Configure'}
              <SquareArrowRight class="w-5 h-5" />
            </Button>
          </div>
        </div>
      {/each}
    </FadeIn>
  {/await}
</div>
