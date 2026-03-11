<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { supabase } from '$lib/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { formatStringProper } from '$lib/utils/format.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
  import SearchIcon from '@lucide/svelte/icons/search';
  import UsersIcon from '@lucide/svelte/icons/users';

  type Entity = Tables<'views', 'd_entities_view'>;

  let {
    group = $bindable<Entity | null>(null),
    open = $bindable(false),
  }: {
    group: Entity | null;
    open: boolean;
  } = $props();

  let activeTab = $state('members');
  let tabSearch = $state('');

  let members = $state<{ id: string; displayName: string; upn: string | null }[]>([]);
  let membersLoading = $state(false);
  let membersError = $state<string | null>(null);
  let membersLoaded = $state(false);

  let policies = $state<{ id: string; displayName: string; state: string | undefined; applicability: string }[]>([]);
  let policiesLoading = $state(false);
  let policiesError = $state<string | null>(null);
  let policiesLoaded = $state(false);

  let rawData = $derived((group?.raw_data ?? {}) as Record<string, any>);

  let groupTypeLabel = $derived(() => {
    const types: string[] = rawData.groupTypes ?? [];
    if (types.includes('Unified')) return 'Microsoft 365';
    if (rawData.securityEnabled && rawData.mailEnabled) return 'Mail-Enabled Security';
    if (rawData.securityEnabled) return 'Security';
    if (rawData.mailEnabled) return 'Distribution List';
    return 'Other';
  });

  let filteredMembers = $derived(
    members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(tabSearch.toLowerCase()) ||
        (m.upn ?? '').toLowerCase().includes(tabSearch.toLowerCase())
    )
  );

  let filteredPolicies = $derived(
    policies.filter((p) => p.displayName.toLowerCase().includes(tabSearch.toLowerCase()))
  );

  $effect(() => {
    activeTab;
    tabSearch = '';
  });

  $effect(() => {
    if (open && group) {
      activeTab = 'members';
      tabSearch = '';
      membersLoaded = false;
      policiesLoaded = false;
      members = [];
      policies = [];
      membersError = null;
      policiesError = null;
    }
  });

  $effect(() => {
    if (!open || !group) return;
    if (activeTab === 'members' && !membersLoaded) loadMembers();
    else if (activeTab === 'policies' && !policiesLoaded) loadPolicies();
  });

  async function loadMembers() {
    if (!group?.id) return;
    membersLoading = true;
    membersError = null;
    try {
      const { data: rels, error: relsError } = await supabase
        .from('entity_relationships')
        .select('child_entity_id')
        .eq('parent_entity_id', group.id)
        .eq('relationship_type', 'member-of');
      if (relsError) throw relsError;

      const memberIds = rels?.map((r) => r.child_entity_id) ?? [];
      if (memberIds.length === 0) {
        members = [];
        membersLoaded = true;
        return;
      }

      const { data: entities, error: entitiesError } = await supabase
        .schema('views')
        .from('d_entities_view')
        .select('id, display_name, raw_data')
        .in('id', memberIds);
      if (entitiesError) throw entitiesError;

      members = (entities ?? []).map((e) => {
        const r = (e.raw_data ?? {}) as Record<string, any>;
        return {
          id: e.id!,
          displayName: e.display_name ?? r.displayName ?? 'Unknown',
          upn: (r.userPrincipalName as string | null) ?? null,
        };
      });
      membersLoaded = true;
    } catch (err: any) {
      membersError = err.message ?? 'Failed to load members';
    } finally {
      membersLoading = false;
    }
  }

  async function loadPolicies() {
    if (!group?.connection_id || !group?.external_id) {
      policiesLoaded = true;
      return;
    }
    policiesLoading = true;
    policiesError = null;
    try {
      const { data, error } = await supabase
        .schema('views')
        .from('d_entities_view')
        .select('id, display_name, raw_data')
        .eq('integration_id', 'microsoft-365')
        .eq('entity_type', 'policy')
        .eq('connection_id', group.connection_id);
      if (error) throw error;

      const groupId = group.external_id;
      policies = (data ?? [])
        .map((p) => {
          const pRaw = (p.raw_data ?? {}) as Record<string, any>;
          const state = pRaw.state as string | undefined;
          const includeGroups: string[] = pRaw.conditions?.users?.includeGroups ?? [];
          const excludeGroups: string[] = pRaw.conditions?.users?.excludeGroups ?? [];
          let applicability = 'N/A';
          if (groupId) {
            if (includeGroups.includes(groupId)) {
              applicability = excludeGroups.includes(groupId) ? 'Excluded' : 'Included';
            } else if (excludeGroups.includes(groupId)) {
              applicability = 'Excluded';
            }
          }
          return { id: p.id!, displayName: p.display_name ?? 'Unknown Policy', state, applicability };
        })
        .filter((p) => p.applicability !== 'N/A');
      policiesLoaded = true;
    } catch (err: any) {
      policiesError = err.message ?? 'Failed to load policies';
    } finally {
      policiesLoading = false;
    }
  }

  function policyStateClass(state: string | undefined): string {
    switch (state) {
      case 'enabled':
        return 'bg-green-500/15 text-green-500 border-green-500/30';
      case 'enabledForReportingButNotEnforced':
        return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
      default:
        return 'bg-muted/15 text-muted-foreground border-muted/30';
    }
  }

  function policyStateLabel(state: string | undefined): string {
    switch (state) {
      case 'enabled':
        return 'Enabled';
      case 'disabled':
        return 'Disabled';
      case 'enabledForReportingButNotEnforced':
        return 'Report Only';
      default:
        return state ?? '—';
    }
  }

  function applicabilityClass(a: string): string {
    switch (a) {
      case 'Included':
        return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
      case 'Excluded':
        return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    {#if group}
      <Sheet.Header class="shrink-0">
        <div class="flex items-start gap-3">
          <div class="size-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <UsersIcon class="size-6 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <Sheet.Title class="text-lg leading-tight truncate">
              {group.display_name ?? '—'}
            </Sheet.Title>
            <Sheet.Description class="text-sm truncate">
              {rawData.mail ?? group.connection_name ?? 'Group'}
            </Sheet.Description>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <Badge variant="outline" class="text-xs">{groupTypeLabel()}</Badge>
              {#if rawData.mailEnabled}
                <Badge variant="outline" class="text-xs bg-blue-500/15 text-blue-500 border-blue-500/30">
                  Mail Enabled
                </Badge>
              {/if}
              {#if group.member_count != null}
                <Badge variant="outline" class="text-xs">
                  {group.member_count} member{group.member_count === 1 ? '' : 's'}
                </Badge>
              {/if}
            </div>
          </div>
        </div>
      </Sheet.Header>

      <Separator class="shrink-0" />

      <div class="px-4 flex-1 flex flex-col min-h-0">
        <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
          <Tabs.List class="w-full grid grid-cols-2">
            <Tabs.Trigger value="members">Members</Tabs.Trigger>
            <Tabs.Trigger value="policies">Policies</Tabs.Trigger>
          </Tabs.List>

          <div class="relative mt-3 shrink-0">
            <SearchIcon
              class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            />
            <Input bind:value={tabSearch} placeholder="Search..." class="pl-8 h-8 text-sm" />
          </div>

          <!-- Members Tab -->
          <Tabs.Content value="members" class="mt-3 flex flex-col flex-1 min-h-0">
            {#if membersLoading}
              <div class="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <LoaderCircleIcon class="size-4 animate-spin" />
                <span class="text-sm">Loading members...</span>
              </div>
            {:else if membersError}
              <div
                class="rounded-lg border bg-destructive/10 text-destructive border-destructive/30 p-3 flex gap-2 text-sm"
              >
                <AlertCircleIcon class="size-4 shrink-0 mt-0.5" />
                {membersError}
              </div>
            {:else if members.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">No members found.</p>
            {:else if filteredMembers.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No results matching '{tabSearch}'.
              </p>
            {:else}
              <div class="flex-1 overflow-y-auto flex flex-col gap-2">
                {#each filteredMembers as member}
                  <div class="rounded-lg border bg-card p-3">
                    <p class="font-medium text-sm">{member.displayName}</p>
                    {#if member.upn}
                      <p class="text-xs text-muted-foreground mt-0.5">{member.upn}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </Tabs.Content>

          <!-- Policies Tab -->
          <Tabs.Content value="policies" class="mt-3 flex flex-col flex-1 min-h-0">
            {#if policiesLoading}
              <div class="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <LoaderCircleIcon class="size-4 animate-spin" />
                <span class="text-sm">Loading policies...</span>
              </div>
            {:else if policiesError}
              <div
                class="rounded-lg border bg-destructive/10 text-destructive border-destructive/30 p-3 flex gap-2 text-sm"
              >
                <AlertCircleIcon class="size-4 shrink-0 mt-0.5" />
                {policiesError}
              </div>
            {:else if policies.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No applicable policies for this group.
              </p>
            {:else if filteredPolicies.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No results matching '{tabSearch}'.
              </p>
            {:else}
              <div class="flex-1 overflow-y-auto flex flex-col gap-2">
                {#each filteredPolicies as policy}
                  <div class="rounded-lg border bg-card p-3">
                    <div class="flex items-start justify-between gap-2">
                      <p class="font-medium text-sm">{policy.displayName}</p>
                      <div class="flex gap-1.5 shrink-0">
                        <Badge variant="outline" class="text-xs {policyStateClass(policy.state)}">
                          {policyStateLabel(policy.state)}
                        </Badge>
                        <Badge variant="outline" class="text-xs {applicabilityClass(policy.applicability)}">
                          {policy.applicability}
                        </Badge>
                      </div>
                    </div>
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
