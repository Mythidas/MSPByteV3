<script lang="ts" generics="S extends Schemas, T extends TableOrView<S>">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ORM } from '@workspace/shared/lib/utils/orm';
  import { supabase } from '$lib/supabase';
  import type {
    Schemas,
    TableOrView,
    Tables,
    PaginationOptions,
    Filters,
  } from '@workspace/shared/types/database';
  import type { DataTableProps, TableFilter, TableView, DataTableColumn, RowAction } from './types';
  import { cn } from '$lib/utils';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
  import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
  import DataTableToolbar from './data-table-toolbar.svelte';
  import DataTablePagination from './data-table-pagination.svelte';
  import { getNestedValue } from './utils/nested';
  import { exportData } from './utils/export';
  import { serializeFilters, deserializeFilters, generateFilterId } from './utils/filters';

  let {
    schema,
    table,
    columns,
    modifyQuery,
    enableRowSelection = false,
    enableGlobalSearch = true,
    enableFilters = true,
    enablePagination = true,
    enableColumnToggle = true,
    enableExport = true,
    enableURLState = true,
    views = [],
    rowActions = [],
    globalSearchFields,
    filterMap,
    defaultPageSize = 25,
    defaultSort,
    onrowclick,
    onselectionchange,
  }: DataTableProps<S, T> = $props();

  // Initialize state from URL if enabled
  function getInitialState() {
    if (enableURLState && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const rawViewId = url.searchParams.get('view') || undefined;
      const isExplicitNone = rawViewId === '_none';
      const urlViewId = isExplicitNone ? undefined : rawViewId;
      const defaultView = !isExplicitNone ? views.find((v) => v.isDefault) : undefined;
      const resolvedViewId = urlViewId ?? defaultView?.id;
      const viewFromUrl = views.find((v) => v.id === resolvedViewId);
      const urlSortField = url.searchParams.get('sortField') || undefined;
      const urlSortDir = (url.searchParams.get('sortDir') as 'asc' | 'desc') || undefined;
      return {
        page: parseInt(url.searchParams.get('page') || '0'),
        pageSize: parseInt(url.searchParams.get('size') || String(defaultPageSize)),
        globalSearch: url.searchParams.get('search') || '',
        filters: deserializeFilters(url.searchParams.get('filters') || ''),
        activeViewId: resolvedViewId,
        sortField: urlSortField ?? viewFromUrl?.sort?.field ?? defaultSort?.field,
        sortDir: urlSortDir ?? viewFromUrl?.sort?.dir ?? defaultSort?.dir,
      };
    }
    const defaultView = views.find((v) => v.isDefault);
    return {
      page: 0,
      pageSize: defaultPageSize,
      globalSearch: '',
      filters: [] as TableFilter[],
      activeViewId: defaultView?.id,
      sortField: defaultView?.sort?.field ?? defaultSort?.field,
      sortDir: defaultView?.sort?.dir ?? defaultSort?.dir,
    };
  }

  const initialState = getInitialState();

  // State
  let currentPage = $state(initialState.page);
  let pageSize = $state(initialState.pageSize);
  let globalSearch = $state(initialState.globalSearch);
  let filters = $state<TableFilter[]>(initialState.filters);
  let activeViewId = $state<string | undefined>(initialState.activeViewId);
  let sortField = $state<string | undefined>(initialState.sortField);
  let sortDir = $state<'asc' | 'desc' | undefined>(initialState.sortDir);
  let selectedRowIds = $state<Set<string>>(new Set());
  let allSelected = $state(false);
  let visibleColumnKeys = $state<Set<string> | null>(null);

  // Initialize visible columns on first render
  const resolvedVisibleColumnKeys = $derived(
    visibleColumnKeys ?? new Set(columns.map((c) => c.key))
  );

  // Data
  let data = $state<Tables<S, T>[]>([]);
  let total = $state(0);
  let loading = $state(false);

  // Derived state
  const activeView = $derived(views.find((v) => v.id === activeViewId));

  const viewFilters = $derived<TableFilter[]>(
    activeView?.filters.map((f) => ({ ...f, id: `view-${f.field}-${f.operator}` })) || []
  );

  const allFilters = $derived([...filters, ...viewFilters]);

  const sorting = $derived<Record<string, 'asc' | 'desc'>>(
    sortField && sortDir ? { [sortField]: sortDir } : {}
  );

  const visibleColumns = $derived(columns.filter((col) => resolvedVisibleColumnKeys.has(col.key)));

  const selectedRows = $derived<Tables<S, T>[]>(
    data.filter((row) => selectedRowIds.has(getRowId(row)))
  );

  const selectionCount = $derived(allSelected ? total : selectedRows.length);

  const allRowsSelected = $derived(
    data.length > 0 && data.every((row) => selectedRowIds.has(getRowId(row)))
  );

  const someRowsSelected = $derived(
    data.some((row) => selectedRowIds.has(getRowId(row))) && !allRowsSelected
  );

  // Convert TableFilter[] to ORM Filters format
  function convertFilters(tableFilters: TableFilter[]): Filters {
    const result: Filters = {};
    for (const f of tableFilters) {
      result[f.field] = { op: f.operator as any, value: f.value };
    }
    return result;
  }

  // Build pagination options
  const paginationOptions = $derived<PaginationOptions>({
    page: currentPage,
    size: pageSize,
    filters: convertFilters(allFilters),
    globalFields: globalSearchFields || columns.filter((c) => c.searchable).map((c) => c.key),
    globalSearch: globalSearch || undefined,
    filterMap,
    sorting,
  });

  // Get row ID (assumes 'id' field exists)
  function getRowId(row: Tables<S, T>): string {
    return String((row as any).id || JSON.stringify(row));
  }

  // Fetch data
  async function fetchData() {
    loading = true;
    const orm = new ORM(supabase);
    const { data: response, error } = await orm.select(
      schema,
      table,
      modifyQuery,
      paginationOptions
    );
    if (response) {
      data = response.rows;
      total = response.total;
    }
    if (error) {
      console.error('DataTable fetch error:', error);
    }
    loading = false;
  }

  // Update URL when state changes
  function updateURL() {
    if (!enableURLState || typeof window === 'undefined') return;

    const url = new URL(window.location.href);

    if (currentPage > 0) {
      url.searchParams.set('page', String(currentPage));
    } else {
      url.searchParams.delete('page');
    }

    if (pageSize !== defaultPageSize) {
      url.searchParams.set('size', String(pageSize));
    } else {
      url.searchParams.delete('size');
    }

    if (globalSearch) {
      url.searchParams.set('search', globalSearch);
    } else {
      url.searchParams.delete('search');
    }

    if (filters.length > 0) {
      url.searchParams.set('filters', serializeFilters(filters));
    } else {
      url.searchParams.delete('filters');
    }

    if (activeViewId) {
      url.searchParams.set('view', activeViewId);
    } else if (views.some((v) => v.isDefault)) {
      url.searchParams.set('view', '_none');
    } else {
      url.searchParams.delete('view');
    }

    if (sortField && sortDir) {
      url.searchParams.set('sortField', sortField);
      url.searchParams.set('sortDir', sortDir);
    } else {
      url.searchParams.delete('sortField');
      url.searchParams.delete('sortDir');
    }

    goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
  }

  // Refetch on pagination/filter changes
  $effect(() => {
    // Access all reactive dependencies
    currentPage;
    pageSize;
    globalSearch;
    filters;
    activeViewId;
    sortField;
    sortDir;

    fetchData();
    updateURL();
  });

  // Selection change callback
  $effect(() => {
    if (onselectionchange) {
      onselectionchange(selectedRows);
    }
  });

  // Handlers
  function handlePageChange(newPage: number) {
    currentPage = newPage;
    allSelected = false;
  }

  function handlePageSizeChange(newSize: number) {
    pageSize = newSize;
    currentPage = 0;
    allSelected = false;
  }

  function handleGlobalSearchChange(search: string) {
    globalSearch = search;
    currentPage = 0;
    allSelected = false;
  }

  function handleAddFilter(filter: TableFilter) {
    filters = [...filters, filter];
    currentPage = 0;
    allSelected = false;
  }

  function handleRemoveFilter(filter: TableFilter) {
    filters = filters.filter((f) => f.id !== filter.id);
    allSelected = false;
  }

  function handleClearFilters() {
    filters = [];
    currentPage = 0;
    allSelected = false;
  }

  function handleViewChange(view?: TableView) {
    activeViewId = view?.id;
    currentPage = 0;
    allSelected = false;
    sortField = view?.sort?.field ?? defaultSort?.field;
    sortDir = view?.sort?.dir ?? defaultSort?.dir;
  }

  function handleSort(columnKey: string) {
    if (sortField === columnKey) {
      if (sortDir === 'asc') {
        sortDir = 'desc';
      } else if (sortDir === 'desc') {
        sortField = undefined;
        sortDir = undefined;
      }
    } else {
      sortField = columnKey;
      sortDir = 'asc';
    }
  }

  function handleToggleColumn(columnKey: string) {
    const newSet = new Set(resolvedVisibleColumnKeys);
    if (newSet.has(columnKey)) {
      newSet.delete(columnKey);
    } else {
      newSet.add(columnKey);
    }
    visibleColumnKeys = newSet;
  }

  function handleToggleAllRows(checked: boolean) {
    if (checked) {
      const newSet = new Set(selectedRowIds);
      for (const row of data) {
        newSet.add(getRowId(row));
      }
      selectedRowIds = newSet;
    } else {
      allSelected = false;
      selectedRowIds = new Set();
    }
  }

  function handleToggleRow(row: Tables<S, T>, checked: boolean) {
    const rowId = getRowId(row);
    const newSet = new Set(selectedRowIds);
    if (checked) {
      newSet.add(rowId);
    } else {
      allSelected = false;
      newSet.delete(rowId);
    }
    selectedRowIds = newSet;
  }

  function handleRowClick(row: Tables<S, T>, event: MouseEvent) {
    // Don't trigger row click if clicking on checkbox or action buttons
    if (
      onrowclick &&
      !(event.target as HTMLElement).closest('input[type="checkbox"]') &&
      !(event.target as HTMLElement).closest('[data-slot="checkbox"]') &&
      !(event.target as HTMLElement).closest('button')
    ) {
      onrowclick(row);
    }
  }

  // Export handlers
  async function handleExport(format: 'csv' | 'xlsx') {
    // Fetch all data without pagination
    const orm = new ORM(supabase);
    const { data: response } = await orm.select(schema, table, modifyQuery, {
      ...paginationOptions,
      page: 0,
      size: total || 10000,
    });
    if (response) {
      await exportData(response.rows, columns, format, resolvedVisibleColumnKeys);
    }
  }

  async function handleAction(action: RowAction<Tables<S, T>>) {
    let rows: Tables<S, T>[];
    if (allSelected) {
      const orm = new ORM(supabase);
      const { data: response } = await orm.select(schema, table, modifyQuery, {
        ...paginationOptions,
        page: 0,
        size: total || 10000,
      });
      rows = response?.rows ?? [];
    } else {
      rows = selectedRows;
    }
    await action.onclick(rows, fetchData);
    allSelected = false;
    selectedRowIds = new Set();
  }
</script>

<div class="flex flex-col flex-1 w-full min-h-0 overflow-hidden gap-2">
  <!-- Toolbar -->
  <div>
    <DataTableToolbar
      {columns}
      globalSearch={enableGlobalSearch ? globalSearch : undefined}
      onglobalsearchchange={enableGlobalSearch ? handleGlobalSearchChange : undefined}
      filters={enableFilters ? filters : undefined}
      viewFilters={enableFilters ? viewFilters : undefined}
      onaddfilter={enableFilters ? handleAddFilter : undefined}
      onremovefilter={enableFilters ? handleRemoveFilter : undefined}
      onclearfilters={enableFilters ? handleClearFilters : undefined}
      {views}
      {activeView}
      onviewchange={handleViewChange}
      visibleColumns={resolvedVisibleColumnKeys}
      ontogglecolumn={enableColumnToggle ? handleToggleColumn : undefined}
      showColumnToggle={enableColumnToggle}
      showExport={enableExport}
      onexport={enableExport ? handleExport : undefined}
    />
  </div>

  <!-- Table -->
  <div class="flex size-full rounded-md border overflow-hidden bg-card/10">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          {#if enableRowSelection}
            <Table.Head class="w-10">
              <Checkbox
                checked={allRowsSelected}
                indeterminate={someRowsSelected}
                onCheckedChange={handleToggleAllRows}
              />
            </Table.Head>
          {/if}
          {#each visibleColumns as column (column.key)}
            <Table.Head style={column.width ? `width: ${column.width}` : undefined}>
              {#if column.sortable}
                <button
                  type="button"
                  class={cn(
                    'flex items-center gap-2 cursor-pointer select-none hover:text-foreground'
                  )}
                  onclick={() => handleSort(column.key)}
                >
                  {column.title}
                  {#if sortField === column.key}
                    {#if sortDir === 'asc'}
                      <ArrowUpIcon class="h-4 w-4" />
                    {:else}
                      <ArrowDownIcon class="h-4 w-4" />
                    {/if}
                  {:else}
                    <ChevronsUpDownIcon class="h-4 w-4 opacity-30" />
                  {/if}
                </button>
              {:else}
                {column.title}
              {/if}
            </Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#if loading}
          <Table.Row>
            <Table.Cell
              colspan={enableRowSelection ? visibleColumns.length + 1 : visibleColumns.length}
              class="h-24 text-center"
            >
              Loading...
            </Table.Cell>
          </Table.Row>
        {:else if data.length === 0}
          <Table.Row>
            <Table.Cell
              colspan={enableRowSelection ? visibleColumns.length + 1 : visibleColumns.length}
              class="h-24 text-center"
            >
              No results.
            </Table.Cell>
          </Table.Row>
        {:else}
          {#each data as row (getRowId(row))}
            {@const rowId = getRowId(row)}
            {@const isSelected = selectedRowIds.has(rowId)}
            <Table.Row
              data-state={isSelected ? 'selected' : undefined}
              class={cn(onrowclick ? 'cursor-pointer' : undefined, 'hover:bg-muted/50')}
              onclick={(e) => handleRowClick(row, e)}
            >
              {#if enableRowSelection}
                <Table.Cell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => handleToggleRow(row, !!checked)}
                  />
                </Table.Cell>
              {/if}
              {#each visibleColumns as column (column.key)}
                {@const value = getNestedValue(row, column.key)}
                <Table.Cell>
                  {#if column.cellComponent}
                    {@const CellComp = column.cellComponent}
                    <CellComp {value} {row} {...(column.cellProps ?? {})} />
                  {:else if column.cell}
                    {@render column.cell({ row, value })}
                  {:else}
                    {value ?? ''}
                  {/if}
                </Table.Cell>
              {/each}
            </Table.Row>
          {/each}
        {/if}
      </Table.Body>
    </Table.Root>
  </div>

  <!-- Bulk Actions -->
  {#if selectionCount > 0 && rowActions.length > 0}
    <div
      class="flex items-center gap-2 rounded-md border border-muted bg-muted/50 p-2 justify-between"
    >
      <span class="text-sm font-medium">
        {selectionCount} row{selectionCount !== 1 ? 's' : ''} selected
        {#if allSelected}
          <Button
            variant="ghost"
            size="sm"
            class="text-sm ml-2"
            onclick={() => {
              allSelected = false;
              selectedRowIds = new Set();
            }}>Clear selection</Button
          >
        {:else if allRowsSelected && total > data.length}
          <span class="text-muted-foreground mr-2"> of {total} total</span>
          <Button
            variant="ghost"
            size="sm"
            class="text-sm"
            onclick={() => {
              allSelected = true;
            }}>Select All {total} rows</Button
          >
        {/if}
      </span>
      <div class="flex gap-2">
        {#each rowActions as action}
          <Button
            variant={action.variant || 'outline'}
            size="sm"
            onclick={() => handleAction(action)}
            disabled={!allSelected && action.disabled ? action.disabled(selectedRows) : false}
          >
            {#if action.icon}
              <span class="mr-2">{@render action.icon()}</span>
            {/if}
            {action.label}
          </Button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Pagination -->
  {#if enablePagination}
    <div class="mt-4">
      <DataTablePagination
        page={currentPage}
        {pageSize}
        {total}
        selectedCount={selectionCount}
        onpagechange={handlePageChange}
        onpagesizechange={handlePageSizeChange}
      />
    </div>
  {/if}
</div>
