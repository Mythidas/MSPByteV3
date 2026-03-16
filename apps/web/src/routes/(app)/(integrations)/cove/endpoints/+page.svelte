<script lang="ts">
  import { DataTable, type DataTableColumn, type TableView } from '$lib/components/data-table';
  import {
    textColumn,
    relativeDateColumn,
    stateColumn,
  } from '$lib/components/data-table/column-defs.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { formatBytes } from '$lib/utils/format.js';
  import { Badge } from '$lib/components/ui/badge';

  type Endpoint = Tables<'vendors', 'cove_endpoints_view'>;

  const BACKUP_STATUS_COLORS: Record<string, string> = {
    '5': 'bg-green-500',
    '2': 'bg-destructive',
    '8': 'bg-amber-500',
    '3': 'bg-orange-500',
    '0': 'bg-muted-foreground/30',
    '6': 'bg-orange-200/70',
    '7': 'bg-red-500/70',
    c: 'bg-orange-700',
  };

  const BACKUP_STATUS_LABEL: Record<string, string> = {
    '5': 'Completed',
    '2': 'Failed',
    '8': 'Completed with Errors',
    '3': 'Aborted',
    '0': 'No Backup',
    '6': 'Interrupted',
    '7': 'Not Started',
    c: 'Restarted',
  };

  const columns: DataTableColumn<Endpoint>[] = $derived.by(() => {
    const siteSelected = !!scopeStore.currentSite;
    return [
      stateColumn<Endpoint>(),
      textColumn<Endpoint>('endpoint_name', 'Name'),
      textColumn<Endpoint>('hostname', 'Hostname'),
      textColumn<Endpoint>('site_name', 'Site', undefined, { hidden: siteSelected }),
      textColumn<Endpoint>('type', 'Type'),
      textColumn<Endpoint>('status', 'Status'),
      textColumn<Endpoint>('profile', 'Profile'),
      textColumn<Endpoint>('retention_policy', 'Retention Policy'),
      {
        key: 'used_storage',
        title: 'Storage Used',
        cell: storageCell,
        exportValue: ({ value }) => formatBytes((value as number) ?? 0),
      },
      {
        key: 'selected_size',
        title: 'Selected Size',
        cell: storageCell,
        exportValue: ({ value }) => formatBytes((value as number) ?? 0),
      },
      {
        key: 'errors',
        title: 'Errors',
        cell: errorsCell,
      },
      {
        key: 'last_28_days',
        title: 'Last 28 Days',
        cell: last28DaysCell,
      },
      relativeDateColumn<Endpoint>('last_success_at', 'Last Success'),
    ];
  });

  const views: TableView[] = [
    {
      id: 'failed',
      label: 'Failed',
      filters: [
        { field: 'status', operator: 'neq', value: 'Completed' },
        { field: 'status', operator: 'neq', value: 'In Process' },
      ],
    },
    {
      id: 'no-recent-backup',
      label: 'No Recent Backup',
      filters: [],
      modifyQuery: (q: any) => {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        q.or(`last_success_at.is.null,last_success_at.lt.${cutoff}`);
      },
    },
  ];

  const modifyQuery = $derived.by(() => {
    const site = scopeStore.currentSite;
    return (q: any) => {
      if (site) q.eq('site_id', site as string);
    };
  });
</script>

{#snippet storageCell({ value }: { row: Endpoint; value: unknown })}
  <span>{formatBytes((value as number) ?? 0)}</span>
{/snippet}

{#snippet errorsCell({ value }: { row: Endpoint; value: unknown })}
  {#if (value as number) > 0}
    <Badge variant="destructive">{value}</Badge>
  {:else}
    <Badge variant="outline" class="text-green-500 border-green-500/30">{value ?? 0}</Badge>
  {/if}
{/snippet}

{#snippet last28DaysCell({ value }: { row: Endpoint; value: unknown })}
  <div class="flex gap-px">
    {#each ((value as string) ?? '').split('').reverse() as code}
      <div
        class="h-4 w-1.5 rounded-sm {BACKUP_STATUS_COLORS[code] ?? 'bg-muted-foreground/20'}"
        title={BACKUP_STATUS_LABEL[code] ?? 'Unknown'}
      ></div>
    {/each}
  </div>
{/snippet}

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Endpoints</h1>

  <DataTable
    schema="vendors"
    table="cove_endpoints_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'endpoint_name', dir: 'asc' }}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    {views}
  />
</div>
