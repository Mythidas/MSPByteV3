<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import { formatDate, formatRelativeDate, formatStringProper } from '$lib/utils/format.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  type EntityAlert = Tables<'public', 'entity_alerts'>;

  const { data } = $props();

  const columns: DataTableColumn<EntityAlert>[] = [
    {
      key: 'alert_type',
      title: 'Type',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search type...',
      },
      cell: typeCell,
    },
    {
      key: 'severity',
      title: 'Severity',
      sortable: true,
      cell: severityCell,
      filter: {
        type: 'select',
        operators: ['eq', 'neq'],
        options: [
          { label: 'Critical', value: 'critical' },
          { label: 'High', value: 'high' },
          { label: 'Medium', value: 'medium' },
          { label: 'Low', value: 'low' },
        ],
      },
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      cell: alertStatusCell,
      filter: {
        type: 'select',
        operators: ['eq', 'neq'],
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Resolved', value: 'resolved' },
          { label: 'Suppressed', value: 'suppressed' },
        ],
      },
    },
    { key: 'message', title: 'Message', sortable: false, searchable: true },
    { key: 'last_seen_at', title: 'Last Seen', sortable: true, cell: relativeCell },
    { key: 'created_at', title: 'Created', sortable: true, cell: dateCell },
  ];

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function severityClass(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
      case 'medium':
        return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
      case 'low':
        return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  }

  function alertStatusClass(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'resolved':
        return 'bg-green-500/15 text-green-600 border-green-500/30';
      case 'suppressed':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  }

  function modifyQuery(q: any) {
    q.eq('integration_id', 'dattormm');
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet typeCell({ value }: { row: EntityAlert; value: string })}
  {formatStringProper(value)}
{/snippet}

{#snippet severityCell({ value }: { row: EntityAlert; value: string })}
  <Badge variant="outline" class={severityClass(value)}>
    {formatStringProper(value)}
  </Badge>
{/snippet}

{#snippet alertStatusCell({ value }: { row: EntityAlert; value: string })}
  <Badge variant="outline" class={alertStatusClass(value)}>
    {formatStringProper(value)}
  </Badge>
{/snippet}

{#snippet relativeCell({ value }: { row: EntityAlert; value: string | null })}
  {value ? formatRelativeDate(value) : '—'}
{/snippet}

{#snippet dateCell({ value }: { row: EntityAlert; value: string | null })}
  {value ? formatDate(value) : '—'}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Alerts</h1>

  {#key `${scope}-${scopeId}`}
    <DataTable
      schema="public"
      table="entity_alerts"
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
