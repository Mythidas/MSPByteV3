<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { formatBytes, formatRelativeDate } from '$lib/utils/format.js';
  import HardDriveIcon from '@lucide/svelte/icons/hard-drive';

  type Endpoint = Tables<'views', 'cove_endpoints_view'>;

  const BACKUP_STATUS_COLORS: Record<string, string> = {
    '5': 'bg-green-500',
    '2': 'bg-destructive',
    '8': 'bg-amber-500',
    '3': 'bg-orange-500',
    '0': 'bg-muted-foreground/30',
    '6': 'bg-orange-200/70',
    '7': 'bg-red-500/70',
    c: 'bg-orange-700',
  };

  const BACKUP_STATUS_LABEL: Record<string, string> = {
    '5': 'Completed',
    '2': 'Failed',
    '8': 'Completed with Errors',
    '3': 'Aborted',
    '0': 'No Backup',
    '6': 'Interrupted',
    '7': 'Not Started',
    c: 'Restarted',
  };

  let {
    endpoint = $bindable(null),
    open = $bindable(false),
  }: { endpoint: Endpoint | null; open: boolean } = $props();

  const statusVariant = $derived.by(() => {
    if (!endpoint?.status) return 'outline';
    if (endpoint.status === 'Completed') return 'default';
    if (endpoint.status === 'Failed') return 'destructive';
    return 'outline';
  });

  const statusClass = $derived.by(() => {
    if (!endpoint?.status) return '';
    if (endpoint.status === 'Completed') return 'bg-green-500/15 text-green-600 border-green-500/30';
    if (endpoint.status.includes('Error') || endpoint.status.includes('Aborted'))
      return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
    return '';
  });
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-auto max-h-screen flex flex-col pb-4">
    <Sheet.Header class="shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary shrink-0"
        >
          <HardDriveIcon class="h-5 w-5" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <Sheet.Title class="text-base font-semibold leading-tight"
            >{endpoint?.endpoint_name ?? endpoint?.hostname ?? ''}</Sheet.Title
          >
          <Sheet.Description class="text-xs text-muted-foreground leading-tight"
            >{endpoint?.hostname ?? ''}</Sheet.Description
          >
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        {#if endpoint?.status}
          <Badge variant={statusVariant} class={statusClass}>{endpoint.status}</Badge>
        {/if}
        {#if endpoint?.type}
          <Badge variant="outline">{endpoint.type}</Badge>
        {/if}
        {#if endpoint?.site_name}
          <Badge variant="outline">{endpoint.site_name}</Badge>
        {/if}
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex flex-col gap-4 mt-1">
      <!-- Storage -->
      <div>
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Storage</p>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-md border bg-primary/5 border-primary/20 px-3 py-2">
            <p class="text-xs text-muted-foreground">Used Storage</p>
            <p class="text-sm font-semibold mt-0.5">{formatBytes(endpoint?.used_storage ?? 0)}</p>
          </div>
          <div class="rounded-md border bg-primary/5 border-primary/20 px-3 py-2">
            <p class="text-xs text-muted-foreground">Selected Size</p>
            <p class="text-sm font-semibold mt-0.5">{formatBytes(endpoint?.selected_size ?? 0)}</p>
          </div>
        </div>
      </div>

      <!-- Backup History -->
      <div>
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Backup History</p>
        <div class="rounded-md border bg-card px-3 py-3 flex flex-col gap-3">
          <div>
            <p class="text-xs text-muted-foreground mb-1.5">Last 28 Days</p>
            <div class="flex gap-px">
              {#each ((endpoint?.last_28_days as string) ?? '').split('').reverse() as code}
                <div
                  class="h-5 w-2 rounded-sm {BACKUP_STATUS_COLORS[code] ?? 'bg-muted-foreground/20'}"
                  title={BACKUP_STATUS_LABEL[code] ?? 'Unknown'}
                ></div>
              {/each}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <p class="text-xs text-muted-foreground">Last Success</p>
              <p class="text-sm font-medium mt-0.5">
                {endpoint?.last_success_at ? formatRelativeDate(endpoint.last_success_at) : 'Never'}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Errors</p>
              <div class="mt-0.5">
                {#if (endpoint?.errors ?? 0) > 0}
                  <Badge variant="destructive">{endpoint?.errors}</Badge>
                {:else}
                  <Badge variant="outline" class="text-green-500 border-green-500/30">{endpoint?.errors ?? 0}</Badge>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Details -->
      <div>
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Details</p>
        <div class="flex flex-col gap-2">
          {#each [
            { label: 'Profile', value: endpoint?.profile },
            { label: 'Retention Policy', value: endpoint?.retention_policy },
            { label: 'LSV Status', value: endpoint?.lsv_status },
          ] as item}
            {#if item.value}
              <div class="rounded-md border bg-card px-3 py-2">
                <p class="text-xs text-muted-foreground">{item.label}</p>
                <p class="text-sm font-medium mt-0.5">{item.value}</p>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </Sheet.Content>
</Sheet.Root>
