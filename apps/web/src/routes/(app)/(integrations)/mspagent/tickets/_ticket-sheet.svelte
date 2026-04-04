<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { formatDate } from '$lib/utils/format.js';
  import TicketIcon from '@lucide/svelte/icons/ticket';

  type Ticket = Tables<'views', 'd_agent_tickets_view'>;

  let {
    ticket = $bindable(null),
    open = $bindable(false),
  }: { ticket: Ticket | null; open: boolean } = $props();

  const meta = $derived.by(() => {
    if (!ticket?.meta) return [];
    return Object.entries(ticket.meta as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined
    );
  });
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-auto max-h-screen flex flex-col pb-4">
    <Sheet.Header class="shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary shrink-0"
        >
          <TicketIcon class="h-5 w-5" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <Sheet.Title class="text-base font-semibold leading-tight"
            >{ticket?.ticket_id ?? ''}</Sheet.Title
          >
          <Sheet.Description class="text-xs text-muted-foreground leading-tight"
            >{ticket?.agent_name ?? ''}</Sheet.Description
          >
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        {#if ticket?.site_name}
          <Badge variant="outline">{ticket.site_name}</Badge>
        {/if}
        {#if ticket?.created_at}
          <Badge variant="outline">{formatDate(ticket.created_at)}</Badge>
        {/if}
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex flex-col gap-4 mt-1">
      {#if ticket?.summary}
        <div>
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Summary</p>
          <div class="rounded-md border bg-card px-3 py-2">
            <p class="text-sm">{ticket.summary}</p>
          </div>
        </div>
      {/if}

      {#if meta.length > 0}
        <div>
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Details</p>
          <div class="flex flex-col gap-2">
            {#each meta as [key, value]}
              <div class="rounded-md border bg-card px-3 py-2">
                <p class="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                <p class="text-sm font-medium mt-0.5">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </p>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>
