<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import { supabase } from '$lib/utils/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { formatRelativeDate } from '$lib/utils/format.js';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import ShieldOffIcon from '@lucide/svelte/icons/shield-off';

  type Endpoint = Tables<'views', 'sophos_endpoints_view'>;

  let {
    endpoint = $bindable(null),
    open = $bindable(false),
  }: { endpoint: Endpoint | null; open: boolean } = $props();

  let activeTab = $state('details');

  let tpData = $state<{ current_code: string; previous_codes: string[]; tamper_protection_enabled: boolean } | null>(null);
  let tpLoading = $state(false);
  let tpError = $state<string | null>(null);
  let tpLoaded = $state(false);

  $effect(() => {
    if (open && endpoint) {
      activeTab = 'details';
      tpData = null;
      tpLoading = false;
      tpError = null;
      tpLoaded = false;
    }
  });

  $effect(() => {
    if (!open || !endpoint) return;
    if (activeTab === 'tamper-protection' && !tpLoaded) loadTamperProtection();
  });

  async function loadTamperProtection() {
    if (!endpoint?.id) return;
    tpLoading = true;
    tpError = null;
    try {
      const { data, error } = await (supabase as any)
        .schema('vendors')
        .from('sophos_endpoints')
        .select('current_code,previous_codes,tamper_protection_enabled')
        .eq('id', endpoint.id)
        .single();
      if (error) throw error;
      tpData = data;
    } catch (e: any) {
      tpError = e.message ?? 'Failed to load tamper protection data';
    } finally {
      tpLoaded = true;
      tpLoading = false;
    }
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    <Sheet.Header class="shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary shrink-0"
        >
          <ShieldCheckIcon class="h-5 w-5" />
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
        <Badge
          variant={endpoint?.health === 'good' ? 'default' : 'destructive'}
          class={endpoint?.health === 'good' ? 'bg-green-500/15 text-green-600 border-green-500/30' : ''}
        >
          {endpoint?.health === 'good' ? 'Healthy' : 'Unhealthy'}
        </Badge>
        {#if endpoint?.platform}
          <Badge variant="outline">{endpoint.platform}</Badge>
        {/if}
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex-1 flex flex-col min-h-0">
      <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
        <Tabs.List class="grid grid-cols-2 shrink-0">
          <Tabs.Trigger value="details">Details</Tabs.Trigger>
          <Tabs.Trigger value="tamper-protection">Tamper Protection</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="details" class="mt-3 flex-1 overflow-y-auto">
          <div class="flex flex-col gap-2">
            {#each [
              { label: 'Operating System', value: endpoint?.os_name },
              { label: 'Type', value: endpoint?.type },
              { label: 'Last Heartbeat', value: endpoint?.last_heartbeat_at ? formatRelativeDate(endpoint.last_heartbeat_at) : null },
            ] as item}
              {#if item.value}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs text-muted-foreground">{item.label}</p>
                  <p class="text-sm font-medium mt-0.5">{item.value}</p>
                </div>
              {/if}
            {/each}
            <div class="grid grid-cols-2 gap-2 mt-1">
              <div class="rounded-md border bg-card px-3 py-2">
                <p class="text-xs text-muted-foreground mb-1">MDR Managed</p>
                {#if endpoint?.has_mdr}
                  <Badge class="bg-green-500/15 text-green-600 border-green-500/30">Yes</Badge>
                {:else}
                  <Badge variant="outline" class="text-muted-foreground">No</Badge>
                {/if}
              </div>
              <div class="rounded-md border bg-card px-3 py-2">
                <p class="text-xs text-muted-foreground mb-1">Needs Upgrade</p>
                {#if endpoint?.needs_upgrade}
                  <Badge class="bg-amber-500/15 text-amber-600 border-amber-500/30">Yes</Badge>
                {:else}
                  <Badge variant="outline" class="text-muted-foreground">No</Badge>
                {/if}
              </div>
              <div class="rounded-md border bg-card px-3 py-2">
                <p class="text-xs text-muted-foreground mb-1">Lockdown</p>
                {#if endpoint?.lockdown === 'enabled'}
                  <Badge class="bg-amber-500/15 text-amber-600 border-amber-500/30">Enabled</Badge>
                {:else if endpoint?.lockdown === 'disabled'}
                  <Badge variant="outline" class="text-muted-foreground">Disabled</Badge>
                {:else}
                  <Badge variant="outline" class="text-muted-foreground">Unavailable</Badge>
                {/if}
              </div>
              <div class="rounded-md border bg-card px-3 py-2">
                <p class="text-xs text-muted-foreground mb-1">Tamper Protection</p>
                {#if endpoint?.tamper_protection_enabled}
                  <Badge class="bg-green-500/15 text-green-600 border-green-500/30">Enabled</Badge>
                {:else}
                  <Badge variant="destructive">Disabled</Badge>
                {/if}
              </div>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="tamper-protection" class="mt-3 flex-1 overflow-y-auto">
          {#if tpLoading}
            <div class="flex items-center justify-center py-8">
              <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
            </div>
          {:else if tpError}
            <div class="flex items-center gap-2 text-destructive py-4">
              <AlertCircleIcon class="h-4 w-4" />
              <span class="text-sm">{tpError}</span>
            </div>
          {:else if tpData}
            <div class="flex flex-col gap-3">
              {#if !tpData.tamper_protection_enabled}
                <div class="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                  <ShieldOffIcon class="h-4 w-4 shrink-0" />
                  <span class="text-sm">Tamper protection is disabled on this endpoint.</span>
                </div>
              {/if}
              <div>
                <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Current Code</p>
                <div class="rounded-md border bg-primary/5 border-primary/20 px-3 py-3">
                  <p class="text-sm font-mono font-semibold tracking-widest select-all">{tpData.current_code || '—'}</p>
                </div>
              </div>
              {#if tpData.previous_codes && tpData.previous_codes.length > 0}
                <div>
                  <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Previous Codes</p>
                  <div class="flex flex-col gap-1.5">
                    {#each tpData.previous_codes as code}
                      <div class="rounded-md border bg-card px-3 py-2 flex items-center justify-between gap-2">
                        <p class="text-sm font-mono text-muted-foreground select-all">{code}</p>
                        <Badge variant="outline" class="text-xs text-muted-foreground shrink-0">Invalidated</Badge>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </Sheet.Content>
</Sheet.Root>
