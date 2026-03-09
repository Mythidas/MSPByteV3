<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import type { TableFilter, DataTableColumn } from "./types";
  import { getOperatorLabel } from "./utils/filters";

  interface Props {
    filters: TableFilter[];
    viewFilters?: TableFilter[];
    columns: DataTableColumn<any>[];
    onremovefilter: (filter: TableFilter) => void;
    onclearfilters: () => void;
  }

  let {
    filters,
    viewFilters = [],
    columns,
    onremovefilter,
    onclearfilters,
  }: Props = $props();

  const viewFilterIds = $derived(new Set(viewFilters.map((f) => f.id)));

  // Only show dynamic filters (not from views)
  const dynamicFilters = $derived(
    filters.filter((f) => !viewFilterIds.has(f.id))
  );

  function getFilterLabel(filter: TableFilter): string {
    const column = columns.find((c) => c.key === filter.field);
    const fieldLabel = column?.filter?.label || column?.title || filter.field;
    const operatorLabel = getOperatorLabel(filter.operator);

    let valueLabel = String(filter.value);

    // Format array values for 'in' and 'not.in' operators
    if (Array.isArray(filter.value)) {
      if (column?.filter?.options) {
        const labels = filter.value
          .map(
            (v) =>
              column.filter?.options?.find((opt) => opt.value === v)?.label || v
          )
          .join(", ");
        valueLabel = labels;
      } else {
        valueLabel = filter.value.join(", ");
      }
    }

    // Format date values
    if (column?.filter?.type === "date" && filter.value) {
      try {
        const date = new Date(filter.value);
        valueLabel = date.toLocaleDateString();
      } catch {
        // Keep original value if parsing fails
      }
    }

    // Format boolean values
    if (column?.filter?.type === "boolean") {
      valueLabel = filter.value ? "Yes" : "No";
    }

    // Format select values with labels
    if (
      column?.filter?.type === "select" &&
      column.filter.options &&
      !Array.isArray(filter.value)
    ) {
      const option = column.filter.options.find(
        (opt) => opt.value === filter.value
      );
      valueLabel = option?.label || String(filter.value);
    }

    return `${fieldLabel} ${operatorLabel} ${valueLabel}`;
  }
</script>

{#if dynamicFilters.length > 0}
  <div class="flex flex-wrap items-center gap-2">
    {#each dynamicFilters as filter (filter.id)}
      <Badge variant="secondary" class="gap-1">
        <span>{getFilterLabel(filter)}</span>
        <Button
          variant="ghost"
          size="sm"
          class="h-auto p-0 hover:bg-transparent"
          onclick={() => onremovefilter(filter)}
        >
          <XIcon class="h-3 w-3" />
          <span class="sr-only">Remove filter</span>
        </Button>
      </Badge>
    {/each}

    <Button
      variant="ghost"
      size="sm"
      onclick={onclearfilters}
      class="h-auto px-2 py-1 text-xs"
    >
      Clear all
    </Button>
  </div>
{/if}
