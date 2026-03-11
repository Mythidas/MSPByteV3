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
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

  type Role = Tables<'vendors', 'm365_roles_view'>;

  let { role = $bindable(null), open = $bindable(false) }: { role: Role | null; open: boolean } =
    $props();

  let activeTab = $state('members');

  let members = $state<any[]>([]);
  let membersLoading = $state(false);
  let membersError = $state<string | null>(null);
  let membersLoaded = $state(false);
  let membersSearch = $state('');

  $effect(() => {
    if (open && role) {
      activeTab = 'members';
      members = [];
      membersLoading = false;
      membersError = null;
      membersLoaded = false;
      membersSearch = '';
    }
  });

  $effect(() => {
    if (!open || !role) return;
    if (activeTab === 'members' && !membersLoaded) loadMembers();
  });

  async function loadMembers() {
    if (!role) return;
    membersLoading = true;
    membersError = null;
    try {
      const { data: junctions, error: jErr } = await supabase
        .schema('vendors')
        .from('m365_identity_roles')
        .select('identity_id')
        .eq('role_id', role.id!)
        .eq('link_id', role.link_id!);
      if (jErr) throw jErr;
      const identityIds = (junctions ?? []).map((j: any) => j.identity_id);
      if (identityIds.length === 0) {
        members = [];
        membersLoaded = true;
        membersLoading = false;
        return;
      }
      const { data, error } = await supabase
        .schema('vendors')
        .from('m365_identities')
        .select('id,name,email')
        .in('id', identityIds)
        .order('email');
      if (error) throw error;
      members = data ?? [];
    } catch (e: any) {
      membersError = e.message ?? 'Failed to load members';
    } finally {
      membersLoaded = true;
      membersLoading = false;
    }
  }

  const filteredMembers = $derived(
    members.filter(
      (m) =>
        m.name?.toLowerCase().includes(membersSearch.toLowerCase()) ||
        m.email?.toLowerCase().includes(membersSearch.toLowerCase())
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
          <ShieldCheckIcon class="h-5 w-5" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <Sheet.Title class="text-base font-semibold leading-tight">{role?.name ?? ''}</Sheet.Title
          >
          {#if role?.description}
            <Sheet.Description class="text-xs text-muted-foreground leading-tight"
              >{role.description}</Sheet.Description
            >
          {/if}
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        {#if role?.member_count != null}
          <Badge variant="secondary">{role.member_count} members</Badge>
        {/if}
        {#if role?.link_name}
          <Badge variant="outline" class="text-muted-foreground">{role.link_name}</Badge>
        {/if}
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex-1 flex flex-col min-h-0">
      <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
        <Tabs.List class="grid grid-cols-1 shrink-0">
          <Tabs.Trigger value="members">Members</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="members" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="relative shrink-0">
            <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input bind:value={membersSearch} placeholder="Search members..." class="pl-8" />
          </div>
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if membersLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if membersError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{membersError}</span>
              </div>
            {:else if filteredMembers.length === 0}
              <p class="text-sm text-muted-foreground py-4">No members found.</p>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredMembers as member}
                  <div class="rounded-md border bg-card px-3 py-2">
                    <p class="text-sm font-medium">{member.name}</p>
                    {#if member.email}
                      <p class="text-xs text-muted-foreground mt-0.5">{member.email}</p>
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
