<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import { formatRelativeDate, formatStringProper } from '$lib/utils/format.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { stateClass } from '$lib/utils/state.js';

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
    {
      key: 'raw_data.online',
      title: 'Online',
      cell: onlineCell,
    },
    {
      key: 'raw_data.os.name',
      title: 'OS',
      cell: osCell,
    },
    {
      key: 'raw_data.health.overall',
      title: 'Health',
      cell: healthCell,
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
      key: 'raw_data.lastSeenAt',
      title: 'Last Online',
      sortable: true,
      cell: lastSeenCell,
    },
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

{#snippet onlineCell({ value }: { row: Entity; value: boolean | null })}
  {#if value === true}
    <Badge variant="outline" class="bg-green-500/15 text-green-500 border-green-500/30"
      >Online</Badge
    >
  {:else if value === false}
    <Badge variant="outline" class="bg-muted/15 text-muted-foreground border-muted/30"
      >Offline</Badge
    >
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet osCell({ value }: { row: Entity; value: string | null })}
  {#if value}
    {value}
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
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

{#snippet stateCell({ value }: { row: Entity; value: string | null })}
  <Badge variant="outline" class={stateClass(value)}>
    {value ? formatStringProper(value) : '—'}
  </Badge>
{/snippet}

{#snippet tagsCell({ value }: { row: Entity; value: string[] | null })}
  {#if value?.length}
    {#each value as tag}
      <Badge variant="outline">{formatStringProper(tag)}</Badge>
    {/each}
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet lastSeenCell({ value }: { row: Entity; value: string | null })}
  {value ? formatRelativeDate(value) : '—'}
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
