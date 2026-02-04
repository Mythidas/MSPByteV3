<script lang="ts">
  import Input from "$lib/components/ui/input/input.svelte";
  import { SearchIcon } from "lucide-svelte";

  let {
    value = $bindable(),
    placeholder,
    delay = 300,
    onchange,
  }: {
    value?: string;
    placeholder?: string;
    delay?: number;
    onchange?: (value: string) => void;
  } = $props();

  let internalValue = $state(value ?? "");
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastEmittedValue = value ?? "";

  // Only sync external value changes (not our own debounced updates)
  $effect(() => {
    if (value !== undefined && value !== lastEmittedValue) {
      internalValue = value;
      lastEmittedValue = value;
    }
  });

  function handleInput(e: Event) {
    const newValue = (e.target as HTMLInputElement).value;
    internalValue = newValue;

    if (timeoutId) clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      value = newValue;
      lastEmittedValue = newValue;
      onchange?.(newValue);
    }, delay);
  }
</script>

<div class="flex relative w-full h-fit">
  <div class="absolute top-2 left-2">
    <SearchIcon class="w-5 h-5"/>
  </div>
  <Input
    class="pl-9"
    placeholder={placeholder || "Search..."}
    value={internalValue}
    oninput={handleInput}
  />
</div>
