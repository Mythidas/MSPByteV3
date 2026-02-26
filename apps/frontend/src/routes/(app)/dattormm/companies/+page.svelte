<script lang="ts">
  import { DataTable, displayNameColumn, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import { formatRelativeDate, formatStringProper } from '$lib/utils/format.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { stateClass } from '$lib/utils/state.js';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  const columns: DataTableColumn<Entity>[] = [
    displayNameColumn<Entity>(),
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
          { label: 'Critical', value: 'critical' },
        ],
      },
    },
    {
      key: 'tags',
      title: 'Tags',
      sortable: false,
      cell: tagsCell,
    },
    {
      key: 'last_seen_at',
      title: 'Last Seen',
      sortable: true,
      cell: relativeCell,
    },
  ];

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function modifyQuery(q: any) {
    q.eq('integration_id', 'dattormm').eq('entity_type', 'company');
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet stateCell({ value }: { row: Entity; value: string | null })}
  <Badge variant="outline" class={stateClass(value)}>
    {value ? formatStringProper(value) : '—'}
  </Badge>
{/snippet}

{#snippet tagsCell({ value }: { row: Entity; value: string[] | null })}
  {#if value?.length}
    <div class="flex flex-wrap gap-1">
      {#each value as tag}
        <Badge variant="outline" class="bg-primary/15 text-primary border-primary/30 text-xs">
          {formatStringProper(tag)}
        </Badge>
      {/each}
    </div>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet relativeCell({ value }: { row: Entity; value: string | null })}
  {value ? formatRelativeDate(value) : '—'}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Companies</h1>

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
