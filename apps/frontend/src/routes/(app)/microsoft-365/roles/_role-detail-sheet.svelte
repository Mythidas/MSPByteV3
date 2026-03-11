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
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

  type Entity = Tables<'views', 'd_entities_view'>;

  let {
    role = $bindable<Entity | null>(null),
    open = $bindable(false),
  }: {
    role: Entity | null;
    open: boolean;
  } = $props();

  let activeTab = $state('members');
  let tabSearch = $state('');

  let members = $state<{ id: string; displayName: string; upn: string | null }[]>([]);
  let membersLoading = $state(false);
  let membersError = $state<string | null>(null);
  let membersLoaded = $state(false);

  let rawData = $derived((role?.raw_data ?? {}) as Record<string, any>);

  let filteredMembers = $derived(
    members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(tabSearch.toLowerCase()) ||
        (m.upn ?? '').toLowerCase().includes(tabSearch.toLowerCase())
    )
  );

  $effect(() => {
    activeTab;
    tabSearch = '';
  });

  $effect(() => {
    if (open && role) {
      activeTab = 'members';
      tabSearch = '';
      membersLoaded = false;
      members = [];
      membersError = null;
    }
  });

  $effect(() => {
    if (!open || !role) return;
    if (activeTab === 'members' && !membersLoaded) {
      loadMembers();
    }
  });

  async function loadMembers() {
    if (!role?.id) return;
    membersLoading = true;
    membersError = null;
    try {
      const { data: rels, error: relsError } = await supabase
        .from('entity_relationships')
        .select('child_entity_id')
        .eq('parent_entity_id', role.id)
        .eq('relationship_type', 'assigned-to');
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
          displayName: e.display_name ?? r.displayName ?? 'Unknown User',
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
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    {#if role}
      <Sheet.Header class="shrink-0">
        <div class="flex items-start gap-3">
          <div class="size-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <ShieldCheckIcon class="size-6 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <Sheet.Title class="text-lg leading-tight truncate">
              {role.display_name ?? '—'}
            </Sheet.Title>
            <Sheet.Description class="text-sm truncate">
              {rawData.description ?? 'Directory Role'}
            </Sheet.Description>
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#if role.member_count != null}
                <Badge variant="outline" class="text-xs">
                  {role.member_count} member{role.member_count === 1 ? '' : 's'}
                </Badge>
              {/if}
              {#if role.connection_name}
                <Badge variant="outline" class="text-xs text-muted-foreground">
                  {role.connection_name}
                </Badge>
              {/if}
            </div>
          </div>
        </div>
      </Sheet.Header>

      <Separator class="shrink-0" />

      <div class="px-4 flex-1 flex flex-col min-h-0">
        <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
          <Tabs.List class="w-full grid grid-cols-1">
            <Tabs.Trigger value="members">Members</Tabs.Trigger>
          </Tabs.List>

          <div class="relative mt-3 shrink-0">
            <SearchIcon
              class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            />
            <Input bind:value={tabSearch} placeholder="Search members..." class="pl-8 h-8 text-sm" />
          </div>

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
              <p class="text-sm text-muted-foreground text-center py-8">No members assigned to this role.</p>
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
        </Tabs.Root>
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>
