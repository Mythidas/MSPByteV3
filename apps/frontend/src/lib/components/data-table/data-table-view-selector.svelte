<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import type { TableView } from "./types";

  interface Props {
    views: TableView[];
    activeView?: TableView;
    onviewchange: (view?: TableView) => void;
  }

  let { views, activeView, onviewchange }: Props = $props();

  const selectedViewId = $derived(activeView?.id || "all");
  const selectedViewLabel = $derived(activeView?.label || "All");
</script>

{#if views.length === 0}
  <!-- No views to display -->
{:else if views.length <= 4}
  <!-- For small number of views, show as tabs -->
  <div class="flex items-center gap-2">
    <Button
      variant={!activeView ? "default" : "outline"}
      size="sm"
      onclick={() => onviewchange(undefined)}
    >
      All
    </Button>
    {#each views as view (view.id)}
      <Button
        variant={activeView?.id === view.id ? "default" : "outline"}
        size="sm"
        onclick={() => onviewchange(view)}
      >
        {#if view.icon}
          {@const Icon = view.icon}
          <Icon class="mr-2 h-4 w-4" />
        {/if}
        {view.label}
      </Button>
    {/each}
  </div>
{:else}
  <!-- For many views, use dropdown -->
  <Select.Root
    type="single"
    value={selectedViewId}
    onValueChange={(v) => {
      if (v === "all") {
        onviewchange(undefined);
      } else {
        const view = views.find((view) => view.id === v);
        onviewchange(view);
      }
    }}
  >
    <Select.Trigger class="w-[180px]">
      <span data-slot="select-value">
        {selectedViewLabel}
      </span>
    </Select.Trigger>
    <Select.Content>
      <Select.Item value="all" label="All">All</Select.Item>
      {#each views as view (view.id)}
        <Select.Item value={view.id} label={view.label}>
          {view.label}
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
{/if}
