<script lang="ts">
  import { Check, ChevronDown } from "lucide-svelte";
  import { cn } from "$lib/utils";
  import Button from "$lib/components/ui/button/button.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Command from "$lib/components/ui/command/index.js";

  type Option = {
    value: string;
    label: string;
    disabled?: boolean;
  };

  let {
    options = [],
    selected = $bindable([]),
    placeholder = "Select items...",
    maxDisplay = 1,
    searchPlaceholder = "Search...",
    class: className = "",
    disabled = false,
    onchange = (_selected: string[]) => {}
  }: {
    options: Option[];
    selected?: string[];
    placeholder?: string;
    maxDisplay?: number;
    searchPlaceholder?: string;
    class?: string;
    disabled?: boolean;
    onchange?: (selected: string[]) => void;
  } = $props();

  let open = $state(false);
  let search = $state("");

  const filteredOptions = $derived.by(() => {
    const filtered = options.filter((opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase())
    );

    // Sort selected items to the top (only when not actively searching)
    if (!search) {
      return filtered.sort((a, b) => {
        const aSelected = selected.includes(a.value);
        const bSelected = selected.includes(b.value);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        return 0;
      });
    }

    return filtered;
  });

  const selectedOptions = $derived(
    options.filter((opt) => selected.includes(opt.value))
  );

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      selected = selected.filter((v) => v !== value);
    } else {
      selected = [...selected, value];
    }
    onchange?.(selected);
  };

  const clearAll = () => {
    selected = [];
    onchange?.(selected);
  };

  const displayText = $derived.by(() => {
    if (selectedOptions.length === 0) return placeholder;
    if (selectedOptions.length <= maxDisplay) {
      return selectedOptions.map((o) => o.label).join(", ");
    }
    return `${selectedOptions.length} selected`;
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
        class={cn("w-full justify-between overflow-hidden", className)}
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
            onSelect={() => !option.disabled && toggleOption(option.value)}
            disabled={option.disabled}
            class={cn(option.disabled && "opacity-50 cursor-not-allowed")}
          >
            <div
              class={cn(
                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                selected.includes(option.value)
                  ? "bg-primary text-primary-foreground"
                  : "opacity-50 [&_svg]:invisible"
              )}
            >
              <Check class="h-4 w-4" />
            </div>
            <span>{option.label}</span>
          </Command.Item>
        {/each}
      </Command.Group>
      {#if selected.length > 0}
        <Command.Separator />
        <Command.Group>
          <Command.Item onSelect={clearAll} class="justify-center text-center">
            Clear all
          </Command.Item>
        </Command.Group>
      {/if}
    </Command.Root>
  </Popover.Content>
</Popover.Root>