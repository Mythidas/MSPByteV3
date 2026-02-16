<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import { formatDate, formatRelativeDate, formatStringProper } from '$lib/utils/format.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  const columns: DataTableColumn<Entity>[] = $derived([
    {
      key: 'display_name',
      title: 'Hostname',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search hostname...',
      },
    },
    {
      key: 'site_name',
      title: 'Site',
      sortable: true,
      searchable: true,
    },
    {
      key: 'state',
      title: 'State',
      sortable: true,
      cell: stateCell,
      filter: {
        type: 'select',
        operators: ['eq', 'neq'],
        options: [
          { label: 'Normal', value: 'normal' },
          { label: 'Warn', value: 'warn' },
        ],
      },
    },
    {
      key: 'tags',
      title: 'Tags',
      sortable: true,
      cell: tagsCell,
    },
    {
      key: 'last_seen_at',
      title: 'Last Synced',
      sortable: true,
      cell: lastSeenCell,
    },
  ]);

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function modifyQuery(q: any) {
    q.eq('integration_id', 'dattormm').eq('entity_type', 'endpoint');
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet stateCell({ value }: { row: Entity; value: string })}
  {formatStringProper(value)}
{/snippet}

{#snippet tagsCell({ value }: { row: Entity; value: string })}
  {#each value as tag}
    <Badge variant="outline">{formatStringProper(tag)}</Badge>
  {/each}
{/snippet}

{#snippet lastSeenCell({ value }: { row: Entity; value: string })}
  {formatRelativeDate(value)}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Endpoints</h1>

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
