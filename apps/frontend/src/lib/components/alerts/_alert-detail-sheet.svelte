<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import Button from '$lib/components/ui/button/button.svelte';
  import { supabase } from '$lib/supabase.js';
  import { ORM } from '@workspace/shared/lib/utils/orm.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { toast } from 'svelte-sonner';
  import { formatDate, formatStringProper } from '$lib/utils/format.js';
  import { severityClass, alertStatusClass, ALERT_TYPE_GUIDANCE } from './_alert-config.js';
  import InfoIcon from '@lucide/svelte/icons/info';
  import ShieldOffIcon from '@lucide/svelte/icons/shield-off';
  import ShieldIcon from '@lucide/svelte/icons/shield';

  type EntityAlert = Tables<'public', 'alerts'>;

  let {
    alert,
    open = $bindable(false),
    canSuppress,
    userId,
    onsuppress,
  }: {
    alert: EntityAlert | null;
    open: boolean;
    canSuppress: boolean;
    userId: string;
    onsuppress: () => void;
  } = $props();

  let suppressing = $state(false);

  let guidance = $derived(alert ? ALERT_TYPE_GUIDANCE[alert.alert_type] : null);

  let metadataEntries = $derived.by(() => {
    if (!alert?.metadata || typeof alert.metadata !== 'object' || Array.isArray(alert.metadata)) {
      return null;
    }
    const entries = Object.entries(alert.metadata as Record<string, unknown>);
    return entries.length > 0 ? entries : null;
  });

  async function handleSuppress() {
    if (!alert) return;
    suppressing = true;
    const orm = new ORM(supabase);
    const { error } = await orm.update('public', 'alerts', alert.id, {
      status: 'suppressed',
      suppressed_at: new Date().toISOString(),
      suppressed_by: userId,
    });

    if (error) {
      toast.error('Failed to suppress alert.');
    } else {
      toast.success('Alert suppressed.');
      open = false;
      onsuppress();
    }
    suppressing = false;
  }

  async function handleUnsuppress() {
    if (!alert) return;
    suppressing = true;
    const orm = new ORM(supabase);
    const { error } = await orm.update('public', 'alerts', alert.id, {
      status: 'active',
      suppressed_at: null,
      suppressed_by: null,
    });

    if (error) {
      toast.error('Failed to unsuppress alert.');
    } else {
      toast.success('Alert unsuppressed.');
      open = false;
      onsuppress();
    }
    suppressing = false;
  }

  function formatMetadataValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-md overflow-y-auto">
    {#if alert}
      <Sheet.Header>
        <Sheet.Title>{formatStringProper(alert.alert_type)}</Sheet.Title>
        <Sheet.Description>{alert.message}</Sheet.Description>
        <div class="flex gap-2">
          <Badge variant="outline" class={severityClass(alert.severity)}>
            {formatStringProper(alert.severity)}
          </Badge>
          <Badge variant="outline" class={alertStatusClass(alert.status)}>
            {formatStringProper(alert.status)}
          </Badge>
        </div>
      </Sheet.Header>

      <Separator />

      <div class="flex flex-col size-full px-4 gap-4">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p class="text-muted-foreground">Created</p>
            <p>{formatDate(alert.created_at)}</p>
          </div>
          <div>
            <p class="text-muted-foreground">Last Seen</p>
            <p>{formatDate(alert.last_seen_at)}</p>
          </div>
          {#if alert.resolved_at}
            <div>
              <p class="text-muted-foreground">Resolved</p>
              <p>{formatDate(alert.resolved_at)}</p>
            </div>
          {/if}
          {#if alert.suppressed_at}
            <div>
              <p class="text-muted-foreground">Suppressed</p>
              <p>{formatDate(alert.suppressed_at)}</p>
            </div>
          {/if}
        </div>

        {#if guidance}
          <div class="rounded-lg border bg-primary/5 border-primary/20 p-4 flex gap-3">
            <InfoIcon class="size-5 text-primary shrink-0 mt-0.5" />
            <div class="text-sm">{guidance}</div>
          </div>
        {/if}

        {#if metadataEntries}
          <div class="space-y-2">
            <h4 class="text-sm font-medium">Metadata</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              {#each metadataEntries as [key, value]}
                <div class="text-muted-foreground">{formatStringProper(key)}</div>
                <div>
                  {#if typeof value === 'object' && value !== null}
                    <pre class="text-xs bg-muted rounded p-1 overflow-x-auto">{JSON.stringify(
                        value,
                        null,
                        2
                      )}</pre>
                  {:else}
                    {formatMetadataValue(value)}
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      {#if canSuppress && alert.status === 'active'}
        <Sheet.Footer>
          <Button variant="outline" class="w-full" onclick={handleSuppress} disabled={suppressing}>
            <ShieldOffIcon class="size-4 mr-2" />
            {suppressing ? 'Suppressing...' : 'Suppress Alert'}
          </Button>
        </Sheet.Footer>
      {:else if canSuppress && alert.status === 'suppressed'}
        <Sheet.Footer>
          <Button variant="outline" class="w-full" onclick={handleUnsuppress} disabled={suppressing}>
            <ShieldIcon class="size-4 mr-2" />
            {suppressing ? 'Unsuppressing...' : 'Unsuppress Alert'}
          </Button>
        </Sheet.Footer>
      {/if}
    {/if}
  </Sheet.Content>
</Sheet.Root>
