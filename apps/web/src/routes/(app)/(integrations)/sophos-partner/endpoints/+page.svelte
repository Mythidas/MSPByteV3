<script lang="ts">
  import { DataTable, type DataTableColumn, type TableView } from '$lib/components/data-table';
  import {
    textColumn,
    relativeDateColumn,
    stateColumn,
    boolBadgeColumn,
  } from '$lib/components/data-table/column-defs.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { Badge } from '$lib/components/ui/badge';

  type Endpoint = Tables<'views', 'sophos_endpoints_view'>;

  const columns: DataTableColumn<Endpoint>[] = $derived.by(() => {
    const siteSelected = !!scopeStore.currentSite;
    return [
      stateColumn<Endpoint>(),
      textColumn<Endpoint>('hostname', 'Name'),
      textColumn<Endpoint>('site_name', 'Site', undefined, { hidden: siteSelected }),
      textColumn<Endpoint>('platform', 'Platform'),
      textColumn<Endpoint>('os_name', 'OS'),
      textColumn<Endpoint>('type', 'Type'),
      textColumn<Endpoint>('health', 'Health'),
      {
        key: 'online',
        title: 'Online',
        cell: onlineCell,
        sortable: true,
      },
      {
        key: 'needs_upgrade',
        title: 'Needs Upgrade',
        cell: needsUpgradeCell,
        sortable: true,
      },
      boolBadgeColumn<Endpoint>('has_mdr', 'MDR'),
      boolBadgeColumn<Endpoint>('tamper_protection_enabled', 'Tamper Protection', {
        falseVariant: 'destructive',
      }),
      relativeDateColumn<Endpoint>('last_heartbeat_at', 'Last Heartbeat'),
    ];
  });

  const views: TableView[] = [
    {
      id: 'health-issues',
      label: 'Health Issues',
      filters: [{ field: 'health', operator: 'neq', value: 'good' }],
    },
    {
      id: 'tamper-disabled',
      label: 'Tamper Protection Disabled',
      filters: [{ field: 'tamper_protection_enabled', operator: 'neq', value: true }],
    },
    {
      id: 'upgradable',
      label: 'Needs Upgrade',
      filters: [{ field: 'needs_upgrade', operator: 'eq', value: true }],
    },
    {
      id: 'stale',
      label: 'Stale',
      filters: [],
      modifyQuery: (q: any) => {
        q.or(
          `last_heartbeat_at.is.null,last_heartbeat_at.lt.${new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()}`
        );
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

{#snippet needsUpgradeCell({ value }: { row: Endpoint; value: unknown })}
  {#if value === true}
    <Badge class="bg-amber-500/15 text-amber-500 border-amber-500/30">Yes</Badge>
  {:else}
    <Badge variant="outline" class="text-muted-foreground">No</Badge>
  {/if}
{/snippet}

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Endpoints</h1>

  <DataTable
    schema="views"
    table="sophos_endpoints_view"
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
