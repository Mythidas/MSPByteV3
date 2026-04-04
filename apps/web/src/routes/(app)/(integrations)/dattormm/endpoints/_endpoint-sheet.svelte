<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { formatRelativeDate } from '$lib/utils/format.js';
  import MonitorIcon from '@lucide/svelte/icons/monitor';

  type Endpoint = Tables<'views', 'datto_endpoints_view'>;

  let {
    endpoint = $bindable(null),
    open = $bindable(false),
  }: { endpoint: Endpoint | null; open: boolean } = $props();

  let activeTab = $state('details');

  $effect(() => {
    if (open && endpoint) {
      activeTab = 'details';
    }
  });

  const udfs = $derived.by(() => {
    if (!endpoint?.udfs) return [];
    return Object.entries(endpoint.udfs as Record<string, string>).filter(
      ([, v]) => v !== null && v !== undefined && v !== ''
    );
  });
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    <Sheet.Header class="shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary shrink-0"
        >
          <MonitorIcon class="h-5 w-5" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <Sheet.Title class="text-base font-semibold leading-tight"
            >{endpoint?.hostname ?? ''}</Sheet.Title
          >
          <Sheet.Description class="text-xs text-muted-foreground leading-tight"
            >{endpoint?.link_name ?? endpoint?.site_name ?? ''}</Sheet.Description
          >
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        <Badge
          variant={endpoint?.online ? 'default' : 'outline'}
          class={endpoint?.online
            ? 'bg-green-500/15 text-green-600 border-green-500/30'
            : 'text-muted-foreground'}
        >
          {endpoint?.online ? 'Online' : 'Offline'}
        </Badge>
        {#if endpoint?.category}
          <Badge variant="outline">{endpoint.category}</Badge>
        {/if}
        {#if endpoint?.site_name}
          <Badge variant="outline">{endpoint.site_name}</Badge>
        {/if}
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex-1 flex flex-col min-h-0">
      <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
        <Tabs.List class="grid grid-cols-2 shrink-0">
          <Tabs.Trigger value="details">Details</Tabs.Trigger>
          <Tabs.Trigger value="udfs">UDFs</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="details" class="mt-3 flex-1 overflow-y-auto">
          <div class="flex flex-col gap-3">
            {#each [
              { label: 'Operating System', value: endpoint?.os },
              { label: 'IP Address', value: endpoint?.ip_address },
              { label: 'External IP', value: endpoint?.ext_address },
              { label: 'Last Reboot', value: endpoint?.last_reboot_at ? formatRelativeDate(endpoint.last_reboot_at) : null },
              { label: 'Last Heartbeat', value: endpoint?.last_heartbeat_at ? formatRelativeDate(endpoint.last_heartbeat_at) : null },
            ] as item}
              {#if item.value}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs text-muted-foreground">{item.label}</p>
                  <p class="text-sm font-medium mt-0.5">{item.value}</p>
                </div>
              {/if}
            {/each}
          </div>
        </Tabs.Content>

        <Tabs.Content value="udfs" class="mt-3 flex-1 overflow-y-auto">
          {#if udfs.length === 0}
            <p class="text-sm text-muted-foreground py-4">No UDF fields configured.</p>
          {:else}
            <div class="flex flex-col gap-2">
              {#each udfs as [key, value]}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs text-muted-foreground uppercase tracking-wide">{key}</p>
                  <p class="text-sm font-medium mt-0.5">{value}</p>
                </div>
              {/each}
            </div>
          {/if}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </Sheet.Content>
</Sheet.Root>
