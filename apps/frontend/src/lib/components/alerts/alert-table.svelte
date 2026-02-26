<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    type TableView,
    relativeDateColumn,
  } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import type { Json } from '@workspace/shared/types/schema';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import { formatDate, formatStringProper } from '$lib/utils/format.js';
  import { hasPermission } from '$lib/utils/permissions';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { severityClass, alertStatusClass } from './_alert-config.js';
  import AlertDetailSheet from './_alert-detail-sheet.svelte';

  type EntityAlert = Tables<'views', 'd_alerts_view'>;

  let {
    integrationId,
    connectionId,
    data,
  }: {
    integrationId: string;
    connectionId?: string;
    data: {
      user: { id: string };
      role: { attributes: Json } | null;
      sites: { id: string; name: string; parent_id: string | null }[];
      siteToGroup: { site_id: string; group_id: string }[];
    };
  } = $props();

  let selectedAlert = $state<EntityAlert | null>(null);
  let sheetOpen = $state(false);
  let refreshKey = $state(0);

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  let canSuppress = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Assets.Write')
  );

  const columns: DataTableColumn<EntityAlert>[] = [
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
    { key: 'site_name', title: 'Site', sortable: true, searchable: true },
    { key: 'connection_name', title: 'Tenant', sortable: true, searchable: true },
    { key: 'message', title: 'Message', sortable: false, searchable: true },
    relativeDateColumn<EntityAlert>('last_seen_at', 'Last Seen', { sortable: true }),
    { key: 'created_at', title: 'Created', sortable: true, cell: dateCell },
  ];

  let views: TableView[] = [
    {
      id: 'active',
      label: 'Active',
      isDefault: true,
      filters: [{ field: 'status', operator: 'eq', value: 'active' }],
      sort: { field: 'severity', dir: 'asc' },
    },
  ];

  function modifyQuery(q: any) {
    q.eq('integration_id', integrationId);
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
    if (connectionId) {
      q.eq('connection_id', connectionId);
    }
  }

  function handleRowClick(row: EntityAlert) {
    selectedAlert = row;
    sheetOpen = true;
  }

  function handleSuppress() {
    refreshKey++;
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

{#snippet dateCell({ value }: { row: EntityAlert; value: string | null })}
  {value ? formatDate(value) : '—'}
{/snippet}

{#key `${scope}-${scopeId}-${refreshKey}`}
  <DataTable
    schema="views"
    table="d_alerts_view"
    {columns}
    {modifyQuery}
    {views}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={handleRowClick}
  />
{/key}

<AlertDetailSheet
  alert={selectedAlert}
  bind:open={sheetOpen}
  {canSuppress}
  userId={data.user.id}
  onsuppress={handleSuppress}
/>
