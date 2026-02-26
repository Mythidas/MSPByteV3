<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { formatStringProper, formatRelativeDate } from '$lib/utils/format.js';
  import { stateClass } from '$lib/utils/state.js';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  function formatBytes(bytes: string | number | null | undefined): string {
    const n = typeof bytes === 'string' ? parseInt(bytes) : (bytes ?? 0);
    if (isNaN(n as number) || n === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0,
      v = n as number;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(1)} ${units[i]}`;
  }

  const BACKUP_STATUS_COLOR: Record<string, string> = {
    '5': 'bg-green-500',
    '2': 'bg-destructive',
    '8': 'bg-amber-500',
    '3': 'bg-orange-500',
    '0': 'bg-muted-foreground/30',
    '6': 'bg-orange-200/70',
    c: 'bg-orange-700',
  };

  const BACKUP_STATUS_LABEL: Record<string, string> = {
    '5': 'Completed',
    '2': 'Failed',
    '8': 'Completed with Errors',
    '3': 'Aborted',
    '0': 'No Backup',
    '6': 'Interrupted',
    c: 'Restarted',
  };

  const columns: DataTableColumn<Entity>[] = [
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
      key: 'display_name',
      title: 'Computer',
      sortable: true,
      searchable: true,
      filter: { type: 'text', operators: ['ilike', 'eq'], placeholder: 'Search computer...' },
    },
    {
      key: 'site_name',
      title: 'Site',
      sortable: true,
      searchable: true,
      filter: { type: 'text', operators: ['ilike', 'eq'], placeholder: 'Search site...' },
    },
    {
      key: 'raw_data.Settings.profile',
      title: 'Profile',
      sortable: true,
    },
    {
      key: 'raw_data.Settings.retentionPolicy',
      title: 'Retention',
      sortable: true,
    },
    {
      key: 'raw_data.Settings.usedStorage',
      title: 'Storage Used',
      cell: usedStorageCell,
      sortable: true,
    },
    {
      key: 'raw_data.Settings.selectedSize',
      title: 'Selected Size',
      cell: selectedSizeCell,
      sortable: true,
    },
    {
      key: 'raw_data.Settings.errors',
      title: 'Errors',
      cell: errorsCell,
      sortable: true,
    },
    {
      key: 'raw_data.Settings.last28Days',
      title: 'Last 28 Days',
      cell: last28DaysCell,
      sortable: true,
    },
    {
      key: 'tags',
      title: 'Tags',
      sortable: true,
      cell: tagsCell,
    },
  ];

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function modifyQuery(q: any) {
    q.eq('integration_id', 'cove').eq('entity_type', 'endpoint');
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet usedStorageCell({ row }: { row: Entity; value: string | null })}
  {@const s = (row.raw_data as any)?.Settings ?? {}}
  <span class="text-xs">{formatBytes(s.usedStorage)}</span>
{/snippet}

{#snippet selectedSizeCell({ row }: { row: Entity; value: string | null })}
  {@const s = (row.raw_data as any)?.Settings ?? {}}
  <span class="text-xs">{formatBytes(s.selectedSize)}</span>
{/snippet}

{#snippet errorsCell({ value }: { row: Entity; value: string | null })}
  {#if parseInt(value ?? '0') > 0}
    <Badge variant="outline" class="bg-destructive/15 text-destructive border-destructive/30">
      {value}
    </Badge>
  {:else}
    <Badge variant="outline" class="bg-green-500/15 text-green border-green-500/30">
      {value}
    </Badge>
  {/if}
{/snippet}

{#snippet last28DaysCell({ value }: { row: Entity; value: string | null })}
  <div class="flex gap-px">
    {#each (value ?? '').split('') as code}
      <span
        class="w-1.5 h-4 rounded-sm shrink-0 {BACKUP_STATUS_COLOR[code] ?? 'bg-muted'}"
        title={BACKUP_STATUS_LABEL[code] ?? 'Unknown'}
      ></span>
    {/each}
  </div>
{/snippet}

{#snippet stateCell({ value }: { row: Entity; value: string | null })}
  <Badge variant="outline" class={stateClass(value)}>
    {value ? formatStringProper(value) : '—'}
  </Badge>
{/snippet}

{#snippet tagsCell({ value }: { row: Entity; value: string })}
  {#each value as tag}
    <Badge variant="outline">{formatStringProper(tag)}</Badge>
  {/each}
{/snippet}

{#snippet lastSeenCell({ value }: { row: Entity; value: number })}
  {formatRelativeDate(new Date(value).toISOString())}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Devices</h1>

  {#key `${scope}-${scopeId}`}
    <DataTable
      schema="views"
      table="d_entities_view"
      {columns}
      {modifyQuery}
      defaultSort={{ field: 'site_name', dir: 'asc' }}
      enableGlobalSearch={true}
      enableFilters={true}
      enablePagination={true}
      enableColumnToggle={true}
      enableExport={true}
      enableURLState={true}
    />
  {/key}
</div>
