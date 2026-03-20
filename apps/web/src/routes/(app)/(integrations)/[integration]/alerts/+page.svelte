<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission } from '$lib/utils/permissions';
  import { relativeDateColumn, textColumn } from '$lib/components/data-table/column-defs.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { INTEGRATIONS } from '@workspace/core/config/integrations';
  import { formatStringProper } from '$lib/utils/format.js';
  import { severityClass, alertStatusClass } from './_alert-config.js';
  import AlertSheet from './_alert-sheet.svelte';
  import type { TableView } from '$lib/components/data-table/types.js';

  type Alert = Tables<'views', 'd_alerts_view'>;

  const { data } = $props();

  let selectedAlert = $state<Alert | null>(null);
  let sheetOpen = $state(false);

  let canSuppress = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Assets.Write')
  );

  const integration = $derived(INTEGRATIONS[scopeStore.currentIntegration!]);
  const isLinkScoped = $derived(integration?.scope === 'link');
  const currentScope = $derived(isLinkScoped ? scopeStore.currentLink : scopeStore.currentSite);

  const views: TableView[] = [
    {
      id: 'active',
      label: 'Active',
      filters: [{ field: 'status', operator: 'eq', value: 'active' }],
      isDefault: true,
    },
  ];

  const columns: DataTableColumn<Alert>[] = $derived.by(() => {
    const scopeSelected = !!currentScope;
    const linked = isLinkScoped;
    return [
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
        cell: statusCell,
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
      textColumn<Alert>('message', 'Message'),
      linked
        ? textColumn<Alert>('link_name', 'Tenant', undefined, { hidden: scopeSelected })
        : textColumn<Alert>('site_name', 'Site', undefined, { hidden: scopeSelected }),
      textColumn<Alert>('entity_type', 'Entity Type', undefined, { defaultHidden: true }),
      relativeDateColumn<Alert>('last_seen_at', 'Last Seen'),
    ];
  });

  const modifyQuery = $derived.by(() => {
    const scope = currentScope;
    const linked = isLinkScoped;
    return (q: any) => {
      q.in(
        'entity_type',
        integration.supportedTypes.filter((t) => t.type).map((t) => t.type!)
      );
      if (scope) {
        q.eq(linked ? 'link_id' : 'site_id', scope as string);
      }
    };
  });
</script>

{#snippet severityCell({ value }: { row: Alert; value: string })}
  <Badge variant="outline" class={severityClass(value)}>
    {formatStringProper(value)}
  </Badge>
{/snippet}

{#snippet statusCell({ value }: { row: Alert; value: string })}
  <Badge variant="outline" class={alertStatusClass(value)}>
    {formatStringProper(value)}
  </Badge>
{/snippet}

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Alerts</h1>

  <DataTable
    schema="views"
    table="d_alerts_view"
    {columns}
    {modifyQuery}
    {views}
    defaultSort={{ field: 'last_seen_at', dir: 'desc' }}
    enableRowSelection={false}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={(row) => {
      selectedAlert = row;
      sheetOpen = true;
    }}
  />
</div>

<AlertSheet
  bind:open={sheetOpen}
  bind:alert={selectedAlert}
  {canSuppress}
  userId={data.user.id}
  onsuppress={() => {
    sheetOpen = false;
  }}
/>
