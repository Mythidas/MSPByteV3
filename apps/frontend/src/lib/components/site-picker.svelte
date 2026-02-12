<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { cn } from '$lib/utils/index';
  import Button from '$lib/components/ui/button/button.svelte';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import * as Command from '$lib/components/ui/command/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Check, ChevronsUpDown, MapPin } from '@lucide/svelte';
  import {
    getParentSites,
    type SiteRef,
    type GroupRef,
    type ScopeType,
  } from '$lib/utils/scope-filter';

  let {
    sites = [],
    groups = [],
  }: {
    sites: SiteRef[];
    groups: GroupRef[];
  } = $props();

  let open = $state(false);
  let search = $state('');

  let scope = $derived(page.url.searchParams.get('scope') as ScopeType | null);
  let scopeId = $derived(page.url.searchParams.get('scopeId'));

  let parentSites = $derived(getParentSites(sites));

  let scopeType = $derived(scope ?? 'site');

  let options = $derived.by((): { id: string; name: string }[] => {
    switch (scopeType) {
      case 'group':
        return groups;
      case 'parent':
        return parentSites;
      default:
        return sites;
    }
  });

  let filteredOptions = $derived(
    options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase())),
  );

  let selectedLabel = $derived(options.find((o) => o.id === scopeId)?.name ?? null);

  let placeholder = $derived.by(() => {
    switch (scopeType) {
      case 'group':
        return 'All Groups';
      case 'parent':
        return 'All Parents';
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
      default:
        return 'Search sites...';
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

<div class="flex items-center gap-1">
  <Select.Root
    type="single"
    value={scopeType}
    onValueChange={(v) => {
      if (v) changeScope(v);
    }}
  >
    <Select.Trigger size="sm" class="w-25">
      {scopeType === 'site' ? 'Site' : scopeType === 'group' ? 'Group' : 'Parent'}
    </Select.Trigger>
    <Select.Content>
      <Select.Item value="site" label="Site">Site</Select.Item>
      <Select.Item value="group" label="Group">Group</Select.Item>
      <Select.Item value="parent" label="Parent">Parent</Select.Item>
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
          class="w-45 justify-between"
        >
          <MapPin class="size-3.5 shrink-0 opacity-50" />
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
                class={cn(
                  'size-4 shrink-0',
                  scopeId === option.id ? 'opacity-100' : 'opacity-0',
                )}
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
