<script lang="ts">
  import { DataTable, type DataTableColumn, type TableView } from '$lib/components/data-table';
  import {
    textColumn,
    relativeDateColumn,
    stateColumn,
  } from '$lib/components/data-table/column-defs.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { Badge } from '$lib/components/ui/badge';

  type Endpoint = Tables<'vendors', 'datto_endpoints_view'>;

  const columns: DataTableColumn<Endpoint>[] = $derived.by(() => {
    const siteSelected = !!scopeStore.currentSite;
    return [
      stateColumn<Endpoint>(),
      textColumn<Endpoint>('hostname', 'Name'),
      textColumn<Endpoint>('site_name', 'Site', undefined, { hidden: siteSelected }),
      textColumn<Endpoint>('category', 'Category'),
      textColumn<Endpoint>('os', 'OS'),
      {
        key: 'online',
        title: 'Online',
        cell: onlineCell,
        sortable: true,
      },
      textColumn<Endpoint>('ip_address', 'IP Address'),
      textColumn<Endpoint>('ext_address', 'External IP'),
      relativeDateColumn<Endpoint>('last_reboot_at', 'Last Reboot'),
      relativeDateColumn<Endpoint>('last_heartbeat_at', 'Last Heartbeat'),
    ];
  });

  const views: TableView[] = [
    {
      id: 'stale',
      label: 'Stale',
      filters: [],
      modifyQuery: (q: any) => {
        const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

        q.or(`and(online.eq.false,or(last_heartbeat_at.is.null,last_heartbeat_at.lt.${cutoff}))`);
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

{#snippet onlineCell({ value }: { row: Endpoint; value: unknown })}
  {#if value === true}
    <Badge class="bg-green-500/15 text-green-500 border-green-500/30">Online</Badge>
  {:else}
    <Badge variant="outline" class="text-muted-foreground">Offline</Badge>
  {/if}
{/snippet}

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Endpoints</h1>

  <DataTable
    schema="vendors"
    table="datto_endpoints_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'hostname', dir: 'asc' }}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    {views}
  />
</div>
