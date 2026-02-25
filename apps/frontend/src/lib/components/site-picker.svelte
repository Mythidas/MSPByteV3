<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { cn } from '$lib/utils/index';
  import Button from '$lib/components/ui/button/button.svelte';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import * as Command from '$lib/components/ui/command/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Check, ChevronsUpDown, MapPin, Network } from '@lucide/svelte';
  import {
    getParentSites,
    type SiteRef,
    type GroupRef,
    type ScopeType,
    type ConnectionRef,
  } from '$lib/utils/scope-filter';

  let {
    sites = [],
    groups = [],
    connections = [],
    pickerTypes = ['site', 'group', 'parent'],
  }: {
    sites: SiteRef[];
    groups: GroupRef[];
    connections: ConnectionRef[];
    pickerTypes: ScopeType[];
  } = $props();

  let open = $state(false);
  let search = $state('');

  let scope = $derived(page.url.searchParams.get('scope') as ScopeType | null);
  let scopeId = $derived(page.url.searchParams.get('scopeId'));

  let parentSites = $derived(getParentSites(sites));

  let scopeType = $derived((scope ?? pickerTypes[0]) as ScopeType);

  let options = $derived.by((): { id: string; name: string }[] => {
    switch (scopeType) {
      case 'group':
        return groups;
      case 'parent':
        return parentSites;
      case 'connection':
        return connections;
      default:
        return sites;
    }
  });

  let filteredOptions = $derived(
    options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
  );

  let selectedLabel = $derived(options.find((o) => o.id === scopeId)?.name ?? null);

  let placeholder = $derived.by(() => {
    switch (scopeType) {
      case 'group':
        return 'All Groups';
      case 'parent':
        return 'All Parents';
      case 'connection':
        return 'All Tenants';
      default:
        return 'All Sites';
    }
  });

  let searchPlaceholder = $derived.by(() => {
    switch (scopeType) {
      case 'group':
        return 'Search groups...';
      case 'parent':
        return 'Search parents...';
      case 'connection':
        return 'Search tenants...';
      default:
        return 'Search sites...';
    }
  });

  let scopeTypeLabel = $derived.by(() => {
    switch (scopeType) {
      case 'group':
        return 'Group';
      case 'parent':
        return 'Parent';
      case 'connection':
        return 'Tenant';
      default:
        return 'Site';
    }
  });

  function selectItem(id: string | null) {
    const url = new URL(page.url);
    if (id) {
      url.searchParams.set('scope', scopeType);
      url.searchParams.set('scopeId', id);
    } else {
      url.searchParams.delete('scope');
      url.searchParams.delete('scopeId');
    }
    url.searchParams.delete('page');
    open = false;
    search = '';
    goto(url.toString(), { replaceState: true, noScroll: true });
  }

  function changeScope(newScope: string) {
    const url = new URL(page.url);
    if (newScope === scopeType && !scopeId) {
      url.searchParams.delete('scope');
      url.searchParams.delete('scopeId');
    } else {
      url.searchParams.set('scope', newScope);
      url.searchParams.delete('scopeId');
    }
    url.searchParams.delete('page');
    goto(url.toString(), { replaceState: true, noScroll: true });
  }
</script>

<div class="flex items-center gap-0">
  <Select.Root
    type="single"
    value={scopeType}
    onValueChange={(v) => {
      if (v) changeScope(v);
    }}
  >
    <Select.Trigger size="sm" class="w-22 rounded-r-none border-r-0">
      {scopeTypeLabel}
    </Select.Trigger>
    <Select.Content>
      {#each pickerTypes as pt}
        <Select.Item
          value={pt}
          label={pt === 'site'
            ? 'Site'
            : pt === 'group'
              ? 'Group'
              : pt === 'parent'
                ? 'Parent'
                : 'Tenant'}
        >
          {pt === 'site'
            ? 'Site'
            : pt === 'group'
              ? 'Group'
              : pt === 'parent'
                ? 'Parent'
                : 'Tenant'}
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          class="w-56 justify-between rounded-l-none"
        >
          {#if scopeType === 'connection'}
            <Network class="size-3.5 shrink-0 opacity-50" />
          {:else}
            <MapPin class="size-3.5 shrink-0 opacity-50" />
          {/if}
          <span class="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown class="size-3.5 shrink-0 opacity-50" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-55 p-0" align="start">
      <Command.Root shouldFilter={false}>
        <Command.Input placeholder={searchPlaceholder} bind:value={search} />
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group class="max-h-64 overflow-auto">
          {#each filteredOptions as option (option.id)}
            <Command.Item value={option.id} onSelect={() => selectItem(option.id)}>
              <Check
                class={cn('size-4 shrink-0', scopeId === option.id ? 'opacity-100' : 'opacity-0')}
              />
              <span>{option.name}</span>
            </Command.Item>
          {/each}
        </Command.Group>
        {#if scopeId}
          <Command.Separator />
          <Command.Group>
            <Command.Item onSelect={() => selectItem(null)} class="justify-center text-center">
              {placeholder}
            </Command.Item>
          </Command.Group>
        {/if}
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
</div>
