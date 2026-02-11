<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { cn } from '$lib/utils/index';
  import Button from '$lib/components/ui/button/button.svelte';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import * as Command from '$lib/components/ui/command/index.js';
  import { Check, ChevronsUpDown, MapPin } from '@lucide/svelte';

  type Site = { id: string; name: string };

  let { sites = [] }: { sites: Site[] } = $props();

  let open = $state(false);
  let search = $state('');

  let selectedId = $derived(page.url.searchParams.get('site'));

  let selectedSite = $derived(sites.find((s) => s.id === selectedId) ?? null);

  let filteredSites = $derived(
    sites.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
  );

  function selectSite(id: string | null) {
    const url = new URL(page.url);
    if (id) {
      url.searchParams.set('site', id);
    } else {
      url.searchParams.delete('site');
    }
    url.searchParams.delete('page');
    open = false;
    search = '';
    goto(url.toString(), { replaceState: true, noScroll: true });
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        class="w-full justify-between"
      >
        <MapPin class="size-3.5 shrink-0 opacity-50" />
        <span class="truncate">{selectedSite?.name ?? 'All Sites'}</span>
        <ChevronsUpDown class="size-3.5 shrink-0 opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-full p-0" align="start">
    <Command.Root shouldFilter={false}>
      <Command.Input placeholder="Search sites..." bind:value={search} />
      <Command.Empty>No sites found.</Command.Empty>
      <Command.Group class="max-h-64 overflow-auto">
        {#each filteredSites as site (site.id)}
          <Command.Item value={site.id} onSelect={() => selectSite(site.id)}>
            <Check
              class={cn('size-4 shrink-0', selectedId === site.id ? 'opacity-100' : 'opacity-0')}
            />
            <span>{site.name}</span>
          </Command.Item>
        {/each}
      </Command.Group>
      {#if selectedId}
        <Command.Separator />
        <Command.Group>
          <Command.Item onSelect={() => selectSite(null)} class="justify-center text-center">
            All Sites
          </Command.Item>
        </Command.Group>
      {/if}
    </Command.Root>
  </Popover.Content>
</Popover.Root>
