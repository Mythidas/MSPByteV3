<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    stateColumn,
    tagsColumn,
    boolBadgeColumn,
    nullableTextColumn,
    relativeDateColumn,
    displayNameColumn,
  } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import { formatStringProper } from '$lib/utils/format.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  const columns: DataTableColumn<Entity>[] = $derived([
    stateColumn<Entity>(),
    displayNameColumn<Entity>(),
    {
      key: 'site_name',
      title: 'Site',
      sortable: true,
      searchable: true,
    },
    boolBadgeColumn<Entity>('raw_data.online', 'Online', {
      trueLabel: 'Online',
      falseLabel: 'Offline',
    }),
    {
      key: 'raw_data.type',
      title: 'Type',
      sortable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search type...',
      },
      cell: typeCell,
    },
    nullableTextColumn<Entity>('raw_data.os.name', 'OS'),
    {
      key: 'raw_data.health.overall',
      title: 'Health',
      cell: healthCell,
    },
    relativeDateColumn<Entity>('raw_data.lastSeenAt', 'Last Online', { sortable: true }),
    tagsColumn<Entity>(),
  ]);

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function modifyQuery(q: any) {
    q.eq('integration_id', 'sophos-partner').eq('entity_type', 'endpoint');
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet typeCell({ value }: { row: Entity; value: string | null })}
  {formatStringProper(value) || '—'}
{/snippet}

{#snippet healthCell({ value }: { row: Entity; value: string | null })}
  {#if value === 'good'}
    <Badge variant="outline" class="bg-green-500/15 text-green-500 border-green-500/30">Good</Badge>
  {:else if value === 'suspicious' || value === 'bad'}
    <Badge variant="outline" class="bg-destructive/15 text-destructive border-destructive/30">
      {formatStringProper(value)}
    </Badge>
  {:else if value}
    <Badge variant="outline">{formatStringProper(value)}</Badge>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
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
