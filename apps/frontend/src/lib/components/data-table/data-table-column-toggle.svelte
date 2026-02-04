<script lang="ts">
  import Settings2Icon from "@lucide/svelte/icons/settings-2";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import type { DataTableColumn } from "./types";

  interface Props {
    columns: DataTableColumn<any>[];
    visibleColumns: Set<string>;
    ontogglecolumn: (columnKey: string) => void;
  }

  let { columns, visibleColumns, ontogglecolumn }: Props = $props();

  const hideableColumns = $derived(
    columns.filter((col) => col.hideable !== false)
  );
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="secondary" size="sm" class="h-8 gap-2">
        <Settings2Icon class="h-4 w-4" />
        View
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-[180px]">
    <DropdownMenu.Label>Toggle columns</DropdownMenu.Label>
    <DropdownMenu.Separator />
    {#each hideableColumns as column (column.key)}
      <DropdownMenu.CheckboxItem
        checked={visibleColumns.has(column.key)}
        onCheckedChange={() => ontogglecolumn(column.key)}
      >
        {column.title}
      </DropdownMenu.CheckboxItem>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
