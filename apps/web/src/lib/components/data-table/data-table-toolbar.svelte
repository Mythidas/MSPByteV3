<script lang="ts">
  import DownloadIcon from "@lucide/svelte/icons/download";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import type { DataTableColumn, TableFilter, TableView } from "./types";
  import DataTableFilterBuilder from "./data-table-filter-builder.svelte";
  import DataTableFilterChips from "./data-table-filter-chips.svelte";
  import DataTableViewSelector from "./data-table-view-selector.svelte";
  import DataTableColumnToggle from "./data-table-column-toggle.svelte";
  import SearchBar from "$lib/components/search-bar.svelte";

  interface Props {
    columns: DataTableColumn<any>[];
    globalSearch?: string;
    onglobalsearchchange?: (search: string) => void;
    filters?: TableFilter[];
    viewFilters?: TableFilter[];
    onaddfilter?: (filter: TableFilter) => void;
    onremovefilter?: (filter: TableFilter) => void;
    onclearfilters?: () => void;
    views?: TableView[];
    activeView?: TableView;
    onviewchange?: (view?: TableView) => void;
    visibleColumns?: Set<string>;
    ontogglecolumn?: (columnKey: string) => void;
    showColumnToggle?: boolean;
    showExport?: boolean;
    onexport?: (format: "csv" | "xlsx") => void;
  }

  let {
    columns,
    globalSearch = "",
    onglobalsearchchange,
    filters = [],
    viewFilters = [],
    onaddfilter,
    onremovefilter,
    onclearfilters,
    views = [],
    activeView,
    onviewchange,
    visibleColumns = new Set(columns.map((c) => c.key)),
    ontogglecolumn,
    showColumnToggle = true,
    showExport = true,
    onexport,
  }: Props = $props();
</script>

<div class="space-y-4">
  <!-- Top row: Search and Actions -->
  <div class="flex items-center justify-between gap-4">
    <!-- Global Search -->
    {#if onglobalsearchchange}
      <div class="flex-1 max-w-sm">
        <SearchBar
          value={globalSearch}
          placeholder="Search..."
          delay={300}
          onchange={onglobalsearchchange}
        />
      </div>
    {:else}
      <div></div>
    {/if}

    <!-- Actions -->
    <div class="flex items-center gap-2">
      {#if onaddfilter}
        <DataTableFilterBuilder {columns} onaddfilter={onaddfilter} />
      {/if}

      {#if showColumnToggle && ontogglecolumn}
        <DataTableColumnToggle
          {columns}
          {visibleColumns}
          ontogglecolumn={ontogglecolumn}
        />
      {/if}

      {#if showExport && onexport}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="secondary" size="sm" class="h-8 gap-2">
                <DownloadIcon class="h-4 w-4" />
                Export
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item onclick={() => onexport("csv")}>
              Export as CSV
            </DropdownMenu.Item>
            <DropdownMenu.Item onclick={() => onexport("xlsx")}>
              Export as Excel
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </div>
  </div>

  <!-- Views row -->
  {#if views.length > 0 && onviewchange}
    <DataTableViewSelector {views} {activeView} onviewchange={onviewchange} />
  {/if}

  <!-- Filter chips -->
  {#if onremovefilter && onclearfilters}
    <DataTableFilterChips
      {filters}
      {viewFilters}
      {columns}
      onremovefilter={onremovefilter}
      onclearfilters={onclearfilters}
    />
  {/if}
</div>
