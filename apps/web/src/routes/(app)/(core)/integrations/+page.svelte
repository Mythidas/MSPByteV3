<script lang="ts">
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import Loader from '$lib/components/transition/loader.svelte';
  import { INTEGRATIONS, type IntegrationId } from '@workspace/core/config/integrations';
  import type { PageProps } from './$types';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import SearchBar from '$lib/components/search-bar.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { SquareArrowRight } from 'lucide-svelte';

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
        {@const active = !!values.find((v) => v.id === key && !v.deleted_at)}
        <div class="flex flex-col bg-card/70 p-4 h-30 justify-between">
          <div class="flex w-full justify-between">
            <span>{INTEGRATIONS[key].name}</span>
            <span class="text-sm text-muted-foreground">
              {INTEGRATIONS[key].type.toUpperCase()}
            </span>
          </div>
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
