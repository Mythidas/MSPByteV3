<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { supabase } from '$lib/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { Input } from '$lib/components/ui/input/index.js';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
  import SearchIcon from '@lucide/svelte/icons/search';
  import KeyIcon from '@lucide/svelte/icons/key';

  type Entity = Tables<'views', 'd_entities_view'>;

  let {
    license = $bindable<Entity | null>(null),
    open = $bindable(false),
  }: {
    license: Entity | null;
    open: boolean;
  } = $props();

  let activeTab = $state('users');
  let tabSearch = $state('');

  let users = $state<{ id: string; displayName: string; upn: string | null }[]>([]);
  let usersLoading = $state(false);
  let usersError = $state<string | null>(null);
  let usersLoaded = $state(false);

  let rawData = $derived((license?.raw_data ?? {}) as Record<string, any>);
  let total = $derived((rawData.prepaidUnits?.enabled as number | undefined) ?? 0);
  let consumed = $derived((rawData.consumedUnits as number | undefined) ?? 0);
  let available = $derived(total - consumed);

  let filteredUsers = $derived(
    users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(tabSearch.toLowerCase()) ||
        (u.upn ?? '').toLowerCase().includes(tabSearch.toLowerCase())
    )
  );

  $effect(() => {
    activeTab;
    tabSearch = '';
  });

  $effect(() => {
    if (open && license) {
      activeTab = 'users';
      tabSearch = '';
      usersLoaded = false;
      users = [];
      usersError = null;
    }
  });

  $effect(() => {
    if (!open || !license) return;
    if (activeTab === 'users' && !usersLoaded) loadUsers();
  });

  async function loadUsers() {
    if (!license?.connection_id || !license?.external_id) {
      usersLoaded = true;
      return;
    }
    usersLoading = true;
    usersError = null;
    try {
      const skuId = license.external_id;
      const { data, error } = await supabase
        .schema('views')
        .from('d_entities_view')
        .select('id, display_name, raw_data')
        .eq('integration_id', 'microsoft-365')
        .eq('entity_type', 'identity')
        .eq('connection_id', license.connection_id);
      if (error) throw error;

      users = (data ?? [])
        .filter((e) => {
          const assignedLicenses = ((e.raw_data as any)?.assignedLicenses as { skuId: string }[] | undefined) ?? [];
          return assignedLicenses.some((l) => l.skuId === skuId);
        })
        .map((e) => {
          const r = (e.raw_data ?? {}) as Record<string, any>;
          return {
            id: e.id!,
            displayName: e.display_name ?? r.displayName ?? 'Unknown User',
            upn: (r.userPrincipalName as string | null) ?? null,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      usersLoaded = true;
    } catch (err: any) {
      usersError = err.message ?? 'Failed to load users';
    } finally {
      usersLoading = false;
    }
  }

  function statusClass(status: string | undefined): string {
    switch (status) {
      case 'Enabled':
        return 'bg-green-500/15 text-green-500 border-green-500/30';
      case 'Warning':
        return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30';
      default:
        return 'bg-destructive/15 text-destructive border-destructive/30';
    }
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    {#if license}
      <Sheet.Header class="shrink-0">
        <div class="flex items-start gap-3">
          <div class="size-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <KeyIcon class="size-6 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <Sheet.Title class="text-lg leading-tight truncate">
              {license.display_name ?? rawData.skuPartNumber ?? '—'}
            </Sheet.Title>
            <Sheet.Description class="text-sm truncate">
              {license.connection_name ?? 'License'}
            </Sheet.Description>
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#if rawData.capabilityStatus}
                <Badge variant="outline" class="text-xs {statusClass(rawData.capabilityStatus as string)}">
                  {rawData.capabilityStatus}
                </Badge>
              {/if}
            </div>
          </div>
        </div>
      </Sheet.Header>

      <!-- Unit summary -->
      <div class="px-4 shrink-0">
        <div class="grid grid-cols-3 gap-4 rounded-lg border bg-card p-3">
          <div class="text-center">
            <p class="text-xs text-muted-foreground mb-1">Total</p>
            <p class="text-lg font-semibold">{total}</p>
          </div>
          <div class="text-center">
            <p class="text-xs text-muted-foreground mb-1">Assigned</p>
            <p class="text-lg font-semibold">{consumed}</p>
          </div>
          <div class="text-center">
            <p class="text-xs text-muted-foreground mb-1">Available</p>
            <p class="text-lg font-semibold" class:text-destructive={available < 0}>{available}</p>
          </div>
        </div>
      </div>

      <Separator class="shrink-0" />

      <div class="px-4 flex-1 flex flex-col min-h-0">
        <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
          <Tabs.List class="w-full grid grid-cols-1">
            <Tabs.Trigger value="users">Assigned Users</Tabs.Trigger>
          </Tabs.List>

          <div class="relative mt-3 shrink-0">
            <SearchIcon
              class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            />
            <Input bind:value={tabSearch} placeholder="Search users..." class="pl-8 h-8 text-sm" />
          </div>

          <Tabs.Content value="users" class="mt-3 flex flex-col flex-1 min-h-0">
            {#if usersLoading}
              <div class="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <LoaderCircleIcon class="size-4 animate-spin" />
                <span class="text-sm">Loading users...</span>
              </div>
            {:else if usersError}
              <div
                class="rounded-lg border bg-destructive/10 text-destructive border-destructive/30 p-3 flex gap-2 text-sm"
              >
                <AlertCircleIcon class="size-4 shrink-0 mt-0.5" />
                {usersError}
              </div>
            {:else if users.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">No users assigned this license.</p>
            {:else if filteredUsers.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No results matching '{tabSearch}'.
              </p>
            {:else}
              <div class="flex-1 overflow-y-auto flex flex-col gap-2">
                {#each filteredUsers as user}
                  <div class="rounded-lg border bg-card p-3">
                    <p class="font-medium text-sm">{user.displayName}</p>
                    {#if user.upn}
                      <p class="text-xs text-muted-foreground mt-0.5">{user.upn}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </Tabs.Content>
        </Tabs.Root>
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>
