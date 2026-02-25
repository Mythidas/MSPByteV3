<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getConnectionIdForScope, getSiteIdsForScope } from '$lib/utils/scope-filter';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterConnectionId = $derived(getConnectionIdForScope(scope, scopeId));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  const columns: DataTableColumn<Entity>[] = [
    {
      key: 'display_name',
      title: 'Name',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search name...',
      },
    },
    {
      key: 'raw_data.groupTypes',
      title: 'Type',
      cell: groupTypeCell,
    },
    {
      key: 'raw_data.mailEnabled',
      title: 'Mail',
      cell: boolCell,
    },
    {
      key: 'raw_data.securityEnabled',
      title: 'Security',
      cell: boolCell,
    },
    {
      key: 'member_count',
      title: 'Members',
      sortable: true,
    },
    {
      key: 'raw_data.description',
      title: 'Description',
    },
    {
      key: 'connection_name',
      title: 'Tenant',
      sortable: true,
    },
  ];

  function modifyQuery(q: any) {
    q.eq('integration_id', 'microsoft-365').eq('entity_type', 'group');
    if (filterConnectionId) {
      q.eq('connection_id', filterConnectionId);
    }
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet groupTypeCell({ value }: { row: Entity; value: string[] })}
  {#if Array.isArray(value) && value.includes('Unified')}
    <Badge variant="outline" class="bg-blue-500/15 text-blue-500 border-blue-500/30"
      >Microsoft 365</Badge
    >
  {:else}
    <Badge variant="outline" class="bg-muted/15 text-muted-foreground border-muted/30"
      >Security</Badge
    >
  {/if}
{/snippet}

{#snippet boolCell({ value }: { row: Entity; value: boolean })}
  <Badge
    variant="outline"
    class={value
      ? 'bg-green-500/15 text-green-500 border-green-500/30'
      : 'bg-muted/15 text-muted-foreground border-muted/30'}
  >
    {value ? 'Yes' : 'No'}
  </Badge>
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Groups</h1>

  {#key `${scope}-${scopeId}`}
    <DataTable
      schema="views"
      table="d_entities_view"
      {columns}
      {modifyQuery}
      enableGlobalSearch={true}
      enableFilters={true}
      enablePagination={true}
      enableColumnToggle={true}
      enableExport={true}
      enableURLState={true}
    />
  {/key}
</div>
