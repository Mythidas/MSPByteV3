<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import { supabase } from '$lib/utils/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { formatDate } from '$lib/utils/format.js';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
  import MonitorIcon from '@lucide/svelte/icons/monitor';

  type Agent = Tables<'views', 'd_agents_view'>;

  let {
    agent = $bindable(null),
    open = $bindable(false),
  }: { agent: Agent | null; open: boolean } = $props();

  let activeTab = $state('details');

  let tickets = $state<any[]>([]);
  let ticketsLoading = $state(false);
  let ticketsError = $state<string | null>(null);
  let ticketsLoaded = $state(false);

  $effect(() => {
    if (open && agent) {
      activeTab = 'details';
      tickets = [];
      ticketsLoading = false;
      ticketsError = null;
      ticketsLoaded = false;
    }
  });

  $effect(() => {
    if (!open || !agent) return;
    if (activeTab === 'tickets' && !ticketsLoaded) loadTickets();
  });

  async function loadTickets() {
    if (!agent?.id) return;
    ticketsLoading = true;
    ticketsError = null;
    try {
      const { data, error } = await supabase
        .schema('views')
        .from('d_agent_tickets_view')
        .select('id,ticket_id,summary,created_at')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      tickets = data ?? [];
    } catch (e: any) {
      ticketsError = e.message ?? 'Failed to load tickets';
    } finally {
      ticketsLoaded = true;
      ticketsLoading = false;
    }
  }

  const initials = $derived.by(() => {
    if (!agent?.hostname) return '??';
    return agent.hostname.slice(0, 2).toUpperCase();
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
            >{agent?.hostname ?? ''}</Sheet.Title
          >
          <Sheet.Description class="text-xs text-muted-foreground leading-tight"
            >{agent?.site_name ?? ''}</Sheet.Description
          >
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        {#if agent?.platform}
          <Badge variant="outline">{agent.platform}</Badge>
        {/if}
        {#if agent?.version}
          <Badge variant="outline">v{agent.version}</Badge>
        {/if}
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex-1 flex flex-col min-h-0">
      <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
        <Tabs.List class="grid grid-cols-2 shrink-0">
          <Tabs.Trigger value="details">Details</Tabs.Trigger>
          <Tabs.Trigger value="tickets">Tickets</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="details" class="mt-3 flex-1 overflow-y-auto">
          <div class="flex flex-col gap-2">
            {#each [
              { label: 'GUID', value: agent?.guid },
              { label: 'IP Address', value: agent?.ip_address },
              { label: 'External IP', value: agent?.ext_address },
              { label: 'MAC Address', value: agent?.mac_address },
              { label: 'Registered', value: agent?.registered_at ? formatDate(agent.registered_at) : null },
              { label: 'Last Seen', value: agent?.updated_at ? formatDate(agent.updated_at) : null },
            ] as item}
              {#if item.value}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs text-muted-foreground">{item.label}</p>
                  <p class="text-sm font-medium mt-0.5 font-mono">{item.value}</p>
                </div>
              {/if}
            {/each}
          </div>
        </Tabs.Content>

        <Tabs.Content value="tickets" class="mt-3 flex-1 overflow-y-auto">
          {#if ticketsLoading}
            <div class="flex items-center justify-center py-8">
              <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
            </div>
          {:else if ticketsError}
            <div class="flex items-center gap-2 text-destructive py-4">
              <AlertCircleIcon class="h-4 w-4" />
              <span class="text-sm">{ticketsError}</span>
            </div>
          {:else if tickets.length === 0}
            <p class="text-sm text-muted-foreground py-4">No tickets found.</p>
          {:else}
            <div class="flex flex-col gap-2">
              {#each tickets as ticket}
                <div class="rounded-md border bg-card px-3 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-sm font-medium">{ticket.ticket_id}</p>
                    {#if ticket.created_at}
                      <span class="text-xs text-muted-foreground shrink-0"
                        >{formatDate(ticket.created_at)}</span
                      >
                    {/if}
                  </div>
                  {#if ticket.summary}
                    <p class="text-xs text-muted-foreground mt-0.5">{ticket.summary}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </Sheet.Content>
</Sheet.Root>
