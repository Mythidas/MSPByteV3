<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import { supabase } from '$lib/utils/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
  import SearchIcon from '@lucide/svelte/icons/search';
  import KeyIcon from '@lucide/svelte/icons/key';

  type License = Tables<'views', 'm365_licenses_view'>;

  let {
    license = $bindable(null),
    open = $bindable(false),
  }: { license: License | null; open: boolean } = $props();

  let activeTab = $state('users');

  let users = $state<any[]>([]);
  let usersLoading = $state(false);
  let usersError = $state<string | null>(null);
  let usersLoaded = $state(false);
  let usersSearch = $state('');

  $effect(() => {
    if (open && license) {
      activeTab = 'users';
      users = [];
      usersLoading = false;
      usersError = null;
      usersLoaded = false;
      usersSearch = '';
    }
  });

  $effect(() => {
    if (!open || !license) return;
    if (activeTab === 'users' && !usersLoaded) loadUsers();
  });

  async function loadUsers() {
    if (!license) return;
    usersLoading = true;
    usersError = null;
    try {
      const { data, error } = await supabase
        .schema('vendors')
        .from('m365_identities')
        .select('id,name,email')
        .eq('link_id', license.link_id!)
        .contains('assigned_licenses', [license.external_id])
        .order('email');
      if (error) throw error;
      users = data ?? [];
    } catch (e: any) {
      usersError = e.message ?? 'Failed to load users';
    } finally {
      usersLoaded = true;
      usersLoading = false;
    }
  }

  const availableClass = $derived(
    (license?.available_units ?? 0) < 0 ? 'text-destructive' : 'text-foreground'
  );

  const filteredUsers = $derived(
    users.filter(
      (u) =>
        u.name?.toLowerCase().includes(usersSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(usersSearch.toLowerCase())
    )
  );
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    <Sheet.Header class="shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary shrink-0"
        >
          <KeyIcon class="h-5 w-5" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <Sheet.Title class="text-base font-semibold leading-tight"
            >{license?.friendly_name ?? ''}</Sheet.Title
          >
          <Sheet.Description class="text-xs text-muted-foreground leading-tight"
            >{license?.link_name ?? ''}</Sheet.Description
          >
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        <Badge
          variant={license?.enabled ? 'default' : 'secondary'}
          class={license?.enabled ? 'bg-green-500/15 text-green-600 border-green-500/30' : ''}
        >
          {license?.enabled ? 'Active' : 'Inactive'}
        </Badge>
      </div>
    </Sheet.Header>

    <div class="grid grid-cols-3 gap-3 px-6 shrink-0">
      <div class="rounded-md border bg-card px-3 py-2 text-center">
        <p class="text-xs text-muted-foreground">Total</p>
        <p class="text-lg font-semibold">{license?.total_units ?? 0}</p>
      </div>
      <div class="rounded-md border bg-card px-3 py-2 text-center">
        <p class="text-xs text-muted-foreground">Consumed</p>
        <p class="text-lg font-semibold">{license?.consumed_units ?? 0}</p>
      </div>
      <div class="rounded-md border bg-card px-3 py-2 text-center">
        <p class="text-xs text-muted-foreground">Available</p>
        <p class="text-lg font-semibold {availableClass}">{license?.available_units ?? 0}</p>
      </div>
    </div>

    <Separator class="shrink-0" />

    <div class="px-4 flex-1 flex flex-col min-h-0">
      <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
        <Tabs.List class="grid grid-cols-1 shrink-0">
          <Tabs.Trigger value="users">Assigned Users</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="users" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="relative shrink-0">
            <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input bind:value={usersSearch} placeholder="Search users..." class="pl-8" />
          </div>
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if usersLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if usersError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{usersError}</span>
              </div>
            {:else if filteredUsers.length === 0}
              <p class="text-sm text-muted-foreground py-4">No users assigned.</p>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredUsers as user}
                  <div class="rounded-md border bg-card px-3 py-2">
                    <p class="text-sm font-medium">{user.name}</p>
                    {#if user.email}
                      <p class="text-xs text-muted-foreground mt-0.5">{user.email}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </Sheet.Content>
</Sheet.Root>
