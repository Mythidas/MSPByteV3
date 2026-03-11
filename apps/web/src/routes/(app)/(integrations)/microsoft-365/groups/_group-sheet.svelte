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
  import UsersIcon from '@lucide/svelte/icons/users';

  type Group = Tables<'vendors', 'm365_groups_view'>;

  let { group = $bindable(null), open = $bindable(false) }: { group: Group | null; open: boolean } =
    $props();

  let activeTab = $state('members');

  let members = $state<any[]>([]);
  let membersLoading = $state(false);
  let membersError = $state<string | null>(null);
  let membersLoaded = $state(false);
  let membersSearch = $state('');

  let policies = $state<any[]>([]);
  let policiesLoading = $state(false);
  let policiesError = $state<string | null>(null);
  let policiesLoaded = $state(false);
  let policiesSearch = $state('');

  $effect(() => {
    if (open && group) {
      activeTab = 'members';
      members = [];
      membersLoading = false;
      membersError = null;
      membersLoaded = false;
      membersSearch = '';
      policies = [];
      policiesLoading = false;
      policiesError = null;
      policiesLoaded = false;
      policiesSearch = '';
    }
  });

  $effect(() => {
    if (!open || !group) return;
    if (activeTab === 'members' && !membersLoaded) loadMembers();
  });

  $effect(() => {
    if (!open || !group) return;
    if (activeTab === 'policies' && !policiesLoaded) loadPolicies();
  });

  async function loadMembers() {
    if (!group || !group.id || !group.link_id) return;
    membersLoading = true;
    membersError = null;
    try {
      const { data: junctions, error: jErr } = await supabase
        .schema('vendors')
        .from('m365_identity_groups')
        .select('identity_id')
        .eq('group_id', group.id)
        .eq('link_id', group.link_id);
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

  async function loadPolicies() {
    if (!group || !group.link_id) return;
    policiesLoading = true;
    policiesError = null;
    try {
      const { data, error } = await supabase
        .schema('vendors')
        .from('m365_policies')
        .select('id,name,policy_state,conditions,requires_mfa,external_id')
        .eq('link_id', group.link_id);
      if (error) throw error;
      const result: any[] = [];
      for (const p of data ?? []) {
        const users = (p.conditions as any)?.users ?? {};
        const includeGroups: string[] = users.includeGroups ?? [];
        const excludeGroups: string[] = users.excludeGroups ?? [];
        const included = includeGroups.includes(group.external_id ?? '');
        const excluded = excludeGroups.includes(group.external_id ?? '');
        if (!included && !excluded) continue;
        result.push({ ...p, applicability: excluded ? 'Excluded' : 'Included' });
      }
      policies = result;
    } catch (e: any) {
      policiesError = e.message ?? 'Failed to load policies';
    } finally {
      policiesLoaded = true;
      policiesLoading = false;
    }
  }

  function groupType(g: {
    security_enabled: boolean | null;
    mail_enabled: boolean | null;
  }): string {
    if (g.security_enabled && g.mail_enabled) return 'Mail-Enabled Security';
    if (g.security_enabled) return 'Security';
    if (g.mail_enabled) return 'Distribution List';
    return 'Other';
  }

  const filteredMembers = $derived(
    members.filter(
      (m) =>
        m.name?.toLowerCase().includes(membersSearch.toLowerCase()) ||
        m.email?.toLowerCase().includes(membersSearch.toLowerCase())
    )
  );
  const filteredPolicies = $derived(
    policies.filter((p) => p.name?.toLowerCase().includes(policiesSearch.toLowerCase()))
  );
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    <Sheet.Header class="shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary shrink-0"
        >
          <UsersIcon class="h-5 w-5" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <Sheet.Title class="text-base font-semibold leading-tight"
            >{group?.name ?? ''}</Sheet.Title
          >
          <Sheet.Description class="text-xs text-muted-foreground leading-tight">
            {group?.description || group?.link_name || ''}
          </Sheet.Description>
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        {#if group}
          <Badge variant="outline">{groupType(group)}</Badge>
          {#if group.mail_enabled}
            <Badge variant="secondary">Mail Enabled</Badge>
          {/if}
          {#if group.member_count != null}
            <Badge variant="secondary">{group.member_count} members</Badge>
          {/if}
        {/if}
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex-1 flex flex-col min-h-0">
      <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
        <Tabs.List class="grid grid-cols-2 shrink-0">
          <Tabs.Trigger value="members">Members</Tabs.Trigger>
          <Tabs.Trigger value="policies">Policies</Tabs.Trigger>
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

        <Tabs.Content value="policies" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="relative shrink-0">
            <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input bind:value={policiesSearch} placeholder="Search policies..." class="pl-8" />
          </div>
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if policiesLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if policiesError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{policiesError}</span>
              </div>
            {:else if filteredPolicies.length === 0}
              <p class="text-sm text-muted-foreground py-4">No policies found.</p>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredPolicies as policy}
                  <div class="rounded-md border bg-card px-3 py-2">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm font-medium">{policy.name}</p>
                      <Badge
                        variant={policy.applicability === 'Excluded' ? 'destructive' : 'default'}
                        class={policy.applicability !== 'Excluded'
                          ? 'bg-green-500/15 text-green-600 border-green-500/30'
                          : ''}
                      >
                        {policy.applicability}
                      </Badge>
                    </div>
                    <p class="text-xs text-muted-foreground mt-0.5 capitalize">
                      {policy.policy_state}
                    </p>
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
