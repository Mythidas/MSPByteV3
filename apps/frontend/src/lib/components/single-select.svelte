<script lang="ts">
  import { Check, ChevronDown } from 'lucide-svelte';
  import { cn } from '$lib/utils';
  import Button from '$lib/components/ui/button/button.svelte';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import * as Command from '$lib/components/ui/command/index.js';

  type Option = {
    value: string;
    label: string;
    disabled?: boolean;
  };

  let {
    options = [],
    selected = $bindable<string | undefined>(undefined),
    placeholder = 'Select item...',
    searchPlaceholder = 'Search...',
    class: className = '',
    disabled = false,
    onchange = (_selected: string) => {},
  }: {
    options: Option[];
    selected?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    class?: string;
    disabled?: boolean;
    onchange?: (selected: string) => void;
  } = $props();

  let open = $state(false);
  let search = $state('');

  const filteredOptions = $derived(
    options.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase()))
  );

  const selectOption = (value: string) => {
    if (selected === value) {
      selected = '';
    } else {
      selected = value;
    }
    onchange?.(selected);
    open = false;
  };

  const displayText = $derived.by(() => {
    if (!selected) return placeholder;
    const option = options.find((o) => o.value === selected);
    return option?.label ?? placeholder;
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        class={cn('w-full justify-between overflow-hidden', className)}
        {disabled}
      >
        <span class="truncate">{displayText}</span>
        <ChevronDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-full p-0" align="start">
    <Command.Root shouldFilter={false}>
      <Command.Input placeholder={searchPlaceholder} bind:value={search} />
      <Command.Empty>No results found.</Command.Empty>
      <Command.Group class="max-h-64 overflow-auto">
        {#each filteredOptions as option}
          <Command.Item
            value={option.value}
            onSelect={() => !option.disabled && selectOption(option.value)}
            disabled={option.disabled}
            class={cn(option.disabled && 'opacity-50 cursor-not-allowed')}
          >
            <div
              class={cn(
                'mr-2 flex h-4 w-4 items-center justify-center rounded-full border border-primary',
                selected === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'opacity-50 [&_svg]:invisible'
              )}
            >
              <Check class="h-4 w-4" />
            </div>
            <span>{option.label}</span>
          </Command.Item>
        {/each}
      </Command.Group>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
