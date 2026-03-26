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
  import ShieldIcon from '@lucide/svelte/icons/shield';

  type Policy = Tables<'views', 'm365_policies_view'>;

  let {
    policy = $bindable(null),
    open = $bindable(false),
  }: { policy: Policy | null; open: boolean } = $props();

  const defaultTab = $derived.by(() => {
    const users = (policy?.conditions as any)?.users ?? {};
    const hasExclusions =
      (users.excludeUsers?.length ?? 0) > 0 ||
      (users.excludeGroups?.length ?? 0) > 0 ||
      (users.excludeRoles?.length ?? 0) > 0;
    return hasExclusions ? 'excluded' : 'included';
  });

  let activeTab = $state('included');

  let excludedLoading = $state(false);
  let excludedLoaded = $state(false);
  let excludedError = $state<string | null>(null);
  let excludedUsers = $state<any[]>([]);
  let excludedGroups = $state<any[]>([]);
  let excludedRoles = $state<any[]>([]);
  let excludedSearch = $state('');

  let includedLoading = $state(false);
  let includedLoaded = $state(false);
  let includedError = $state<string | null>(null);
  let includedUsers = $state<any[]>([]);
  let includedUsersAll = $state(false);
  let includedGroups = $state<any[]>([]);
  let includedRoles = $state<any[]>([]);
  let includedSearch = $state('');

  $effect(() => {
    if (open && policy) {
      activeTab = defaultTab;
      excludedLoading = false;
      excludedLoaded = false;
      excludedError = null;
      excludedUsers = [];
      excludedGroups = [];
      excludedRoles = [];
      excludedSearch = '';
      includedLoading = false;
      includedLoaded = false;
      includedError = null;
      includedUsers = [];
      includedUsersAll = false;
      includedGroups = [];
      includedRoles = [];
      includedSearch = '';
    }
  });

  $effect(() => {
    if (!open || !policy) return;
    if (activeTab === 'excluded' && !excludedLoaded) loadExcluded();
  });

  $effect(() => {
    if (!open || !policy) return;
    if (activeTab === 'included' && !includedLoaded) loadIncluded();
  });

  async function loadExcluded() {
    if (!policy) return;
    excludedLoading = true;
    excludedError = null;
    try {
      const [uRes, gRes, rRes] = await Promise.all([
        supabase
          .schema('vendors')
          .from('m365_policy_identities')
          .select('identity_id')
          .eq('policy_id', policy.id!)
          .eq('included', false),
        supabase
          .schema('vendors')
          .from('m365_policy_groups')
          .select('group_id')
          .eq('policy_id', policy.id!)
          .eq('included', false),
        supabase
          .schema('vendors')
          .from('m365_policy_roles')
          .select('role_id')
          .eq('policy_id', policy.id!)
          .eq('included', false),
      ]);

      const identityIds = (uRes.data ?? []).map((r: any) => r.identity_id);
      const groupIds = (gRes.data ?? []).map((r: any) => r.group_id);
      const roleIds = (rRes.data ?? []).map((r: any) => r.role_id);

      const [usersRes, groupsRes, rolesRes] = await Promise.all([
        identityIds.length > 0
          ? supabase
              .schema('vendors')
              .from('m365_identities')
              .select('id,name,email')
              .in('id', identityIds)
          : Promise.resolve({ data: [] }),
        groupIds.length > 0
          ? supabase
              .schema('views')
              .from('m365_groups_view')
              .select('id,name,description')
              .in('id', groupIds)
          : Promise.resolve({ data: [] }),
        roleIds.length > 0
          ? supabase.schema('definitions').from('m365_roles').select('id,name').in('id', roleIds)
          : Promise.resolve({ data: [] }),
      ]);

      excludedUsers = usersRes.data ?? [];
      excludedGroups = groupsRes.data ?? [];
      excludedRoles = rolesRes.data ?? [];
    } catch (e: any) {
      excludedError = e.message ?? 'Failed to load exclusions';
    } finally {
      excludedLoaded = true;
      excludedLoading = false;
    }
  }

  async function loadIncluded() {
    if (!policy) return;
    includedLoading = true;
    includedError = null;
    try {
      const users = (policy.conditions as any)?.users ?? {};
      if ((users.includeUsers ?? []).includes('All')) {
        includedUsersAll = true;
      }

      const [uRes, gRes, rRes] = await Promise.all([
        supabase
          .schema('vendors')
          .from('m365_policy_identities')
          .select('identity_id')
          .eq('policy_id', policy.id!)
          .eq('included', true),
        supabase
          .schema('vendors')
          .from('m365_policy_groups')
          .select('group_id')
          .eq('policy_id', policy.id!)
          .eq('included', true),
        supabase
          .schema('vendors')
          .from('m365_policy_roles')
          .select('role_id')
          .eq('policy_id', policy.id!)
          .eq('included', true),
      ]);

      const identityIds = (uRes.data ?? []).map((r: any) => r.identity_id);
      const groupIds = (gRes.data ?? []).map((r: any) => r.group_id);
      const roleIds = (rRes.data ?? []).map((r: any) => r.role_id);

      const [usersRes, groupsRes, rolesRes] = await Promise.all([
        identityIds.length > 0
          ? supabase
              .schema('vendors')
              .from('m365_identities')
              .select('id,name,email')
              .in('id', identityIds)
          : Promise.resolve({ data: [] }),
        groupIds.length > 0
          ? supabase
              .schema('views')
              .from('m365_groups_view')
              .select('id,name,description')
              .in('id', groupIds)
          : Promise.resolve({ data: [] }),
        roleIds.length > 0
          ? supabase.schema('definitions').from('m365_roles').select('id,name').in('id', roleIds)
          : Promise.resolve({ data: [] }),
      ]);

      includedUsers = usersRes.data ?? [];
      includedGroups = groupsRes.data ?? [];
      includedRoles = rolesRes.data ?? [];
    } catch (e: any) {
      includedError = e.message ?? 'Failed to load inclusions';
    } finally {
      includedLoaded = true;
      includedLoading = false;
    }
  }

  const stateVariant = $derived.by(() => {
    if (policy?.policy_state === 'enabled') return 'default';
    return 'secondary';
  });
  const stateClass = $derived.by(() => {
    if (policy?.policy_state === 'enabled')
      return 'bg-green-500/15 text-green-600 border-green-500/30';
    if (policy?.policy_state === 'enabledForReportingButNotEnforced')
      return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
    return '';
  });
  const stateLabel = $derived.by(() => {
    if (policy?.policy_state === 'enabled') return 'Enabled';
    if (policy?.policy_state === 'enabledForReportingButNotEnforced') return 'Report Only';
    return 'Disabled';
  });

  const conditions = $derived((policy?.conditions as any) ?? {});
  const controls = $derived((policy?.grant_controls as any) ?? {});

  const filteredExcluded = $derived({
    users: excludedUsers.filter(
      (u) =>
        u.name?.toLowerCase().includes(excludedSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(excludedSearch.toLowerCase())
    ),
    groups: excludedGroups.filter((g) =>
      g.name?.toLowerCase().includes(excludedSearch.toLowerCase())
    ),
    roles: excludedRoles.filter((r) =>
      r.name?.toLowerCase().includes(excludedSearch.toLowerCase())
    ),
  });

  const filteredIncluded = $derived({
    users: includedUsers.filter(
      (u) =>
        u.name?.toLowerCase().includes(includedSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(includedSearch.toLowerCase())
    ),
    groups: includedGroups.filter((g) =>
      g.name?.toLowerCase().includes(includedSearch.toLowerCase())
    ),
    roles: includedRoles.filter((r) =>
      r.name?.toLowerCase().includes(includedSearch.toLowerCase())
    ),
  });
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    <Sheet.Header class="shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary shrink-0"
        >
          <ShieldIcon class="h-5 w-5" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <Sheet.Title class="text-base font-semibold leading-tight"
            >{policy?.name ?? ''}</Sheet.Title
          >
          <Sheet.Description class="text-xs text-muted-foreground leading-tight"
            >{policy?.link_name ?? ''}</Sheet.Description
          >
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        <Badge variant={stateVariant} class={stateClass}>{stateLabel}</Badge>
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex-1 flex flex-col min-h-0">
      <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
        <Tabs.List>
          <Tabs.Trigger value="excluded">Excluded</Tabs.Trigger>
          <Tabs.Trigger value="included">Included</Tabs.Trigger>
          <Tabs.Trigger value="conditions">Conditions</Tabs.Trigger>
          <Tabs.Trigger value="controls">Controls</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="excluded" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="relative shrink-0">
            <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input bind:value={excludedSearch} placeholder="Search..." class="pl-8" />
          </div>
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if excludedLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if excludedError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{excludedError}</span>
              </div>
            {:else if filteredExcluded.users.length === 0 && filteredExcluded.groups.length === 0 && filteredExcluded.roles.length === 0}
              <p class="text-sm text-muted-foreground py-4">No exclusions configured.</p>
            {:else}
              {#if filteredExcluded.users.length > 0}
                <p class="text-xs font-medium text-muted-foreground mb-1">Users</p>
                <div class="flex flex-col gap-2 mb-3">
                  {#each filteredExcluded.users as user}
                    <div class="rounded-md border bg-card px-3 py-2">
                      <p class="text-sm font-medium">{user.name}</p>
                      {#if user.email}<p class="text-xs text-muted-foreground mt-0.5">
                          {user.email}
                        </p>{/if}
                    </div>
                  {/each}
                </div>
              {/if}
              {#if filteredExcluded.groups.length > 0}
                <p class="text-xs font-medium text-muted-foreground mb-1">Groups</p>
                <div class="flex flex-col gap-2 mb-3">
                  {#each filteredExcluded.groups as grp}
                    <div class="rounded-md border bg-card px-3 py-2">
                      <p class="text-sm font-medium">{grp.name}</p>
                      {#if grp.description}<p class="text-xs text-muted-foreground mt-0.5">
                          {grp.description}
                        </p>{/if}
                    </div>
                  {/each}
                </div>
              {/if}
              {#if filteredExcluded.roles.length > 0}
                <p class="text-xs font-medium text-muted-foreground mb-1">Roles</p>
                <div class="flex flex-col gap-2">
                  {#each filteredExcluded.roles as role}
                    <div class="rounded-md border bg-card px-3 py-2">
                      <p class="text-sm font-medium">{role.name}</p>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        </Tabs.Content>

        <Tabs.Content value="included" class="mt-3 flex flex-col flex-1 min-h-0">
          {#if !includedUsersAll}
            <div class="relative shrink-0">
              <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input bind:value={includedSearch} placeholder="Search..." class="pl-8" />
            </div>
          {/if}
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if includedLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if includedError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{includedError}</span>
              </div>
            {:else if includedUsersAll}
              <div
                class="rounded-md border bg-primary/5 border-primary/20 px-3 py-4 text-center mb-3"
              >
                <p class="text-sm font-medium text-primary">All Users</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  This policy applies to all users in the tenant.
                </p>
              </div>
              {#if filteredIncluded.groups.length > 0}
                <p class="text-xs font-medium text-muted-foreground mb-1">Groups</p>
                <div class="flex flex-col gap-2 mb-3">
                  {#each filteredIncluded.groups as grp}
                    <div class="rounded-md border bg-card px-3 py-2">
                      <p class="text-sm font-medium">{grp.name}</p>
                      {#if grp.description}<p class="text-xs text-muted-foreground mt-0.5">
                          {grp.description}
                        </p>{/if}
                    </div>
                  {/each}
                </div>
              {/if}
              {#if filteredIncluded.roles.length > 0}
                <p class="text-xs font-medium text-muted-foreground mb-1">Roles</p>
                <div class="flex flex-col gap-2">
                  {#each filteredIncluded.roles as role}
                    <div class="rounded-md border bg-card px-3 py-2">
                      <p class="text-sm font-medium">{role.name}</p>
                    </div>
                  {/each}
                </div>
              {/if}
            {:else if filteredIncluded.users.length === 0 && filteredIncluded.groups.length === 0 && filteredIncluded.roles.length === 0}
              <p class="text-sm text-muted-foreground py-4">No inclusions configured.</p>
            {:else}
              {#if filteredIncluded.users.length > 0}
                <p class="text-xs font-medium text-muted-foreground mb-1">Users</p>
                <div class="flex flex-col gap-2 mb-3">
                  {#each filteredIncluded.users as user}
                    <div class="rounded-md border bg-card px-3 py-2">
                      <p class="text-sm font-medium">{user.name}</p>
                      {#if user.email}<p class="text-xs text-muted-foreground mt-0.5">
                          {user.email}
                        </p>{/if}
                    </div>
                  {/each}
                </div>
              {/if}
              {#if filteredIncluded.groups.length > 0}
                <p class="text-xs font-medium text-muted-foreground mb-1">Groups</p>
                <div class="flex flex-col gap-2 mb-3">
                  {#each filteredIncluded.groups as grp}
                    <div class="rounded-md border bg-card px-3 py-2">
                      <p class="text-sm font-medium">{grp.name}</p>
                      {#if grp.description}<p class="text-xs text-muted-foreground mt-0.5">
                          {grp.description}
                        </p>{/if}
                    </div>
                  {/each}
                </div>
              {/if}
              {#if filteredIncluded.roles.length > 0}
                <p class="text-xs font-medium text-muted-foreground mb-1">Roles</p>
                <div class="flex flex-col gap-2">
                  {#each filteredIncluded.roles as role}
                    <div class="rounded-md border bg-card px-3 py-2">
                      <p class="text-sm font-medium">{role.name}</p>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        </Tabs.Content>

        <Tabs.Content value="conditions" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="flex-1 overflow-y-auto">
            <div class="flex flex-col gap-3">
              {#if conditions.platforms?.includePlatforms?.length || conditions.platforms?.excludePlatforms?.length}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs font-medium text-muted-foreground mb-2">Platforms</p>
                  {#if conditions.platforms.includePlatforms?.length}
                    <div class="mb-1">
                      <p class="text-xs text-muted-foreground mb-1">Included</p>
                      <div class="flex flex-wrap gap-1">
                        {#each conditions.platforms.includePlatforms as p}
                          <Badge variant="outline" class="text-xs capitalize">{p}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if conditions.platforms.excludePlatforms?.length}
                    <div>
                      <p class="text-xs text-muted-foreground mb-1">Excluded</p>
                      <div class="flex flex-wrap gap-1">
                        {#each conditions.platforms.excludePlatforms as p}
                          <Badge variant="outline" class="text-xs capitalize">{p}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if conditions.locations?.includeLocations?.length || conditions.locations?.excludeLocations?.length}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs font-medium text-muted-foreground mb-2">Locations</p>
                  {#if conditions.locations.includeLocations?.length}
                    <div class="mb-1">
                      <p class="text-xs text-muted-foreground mb-1">Included</p>
                      <div class="flex flex-wrap gap-1">
                        {#each conditions.locations.includeLocations as l}
                          <Badge variant="outline" class="text-xs">{l}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if conditions.locations.excludeLocations?.length}
                    <div>
                      <p class="text-xs text-muted-foreground mb-1">Excluded</p>
                      <div class="flex flex-wrap gap-1">
                        {#each conditions.locations.excludeLocations as l}
                          <Badge variant="outline" class="text-xs">{l}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if conditions.clientAppTypes?.length}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs font-medium text-muted-foreground mb-2">Client App Types</p>
                  <div class="flex flex-wrap gap-1">
                    {#each conditions.clientAppTypes as t}
                      <Badge variant="outline" class="text-xs capitalize">{t}</Badge>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if conditions.signInRiskLevels?.length || conditions.userRiskLevels?.length}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs font-medium text-muted-foreground mb-2">Risk Levels</p>
                  {#if conditions.signInRiskLevels?.length}
                    <div class="mb-1">
                      <p class="text-xs text-muted-foreground mb-1">Sign-In Risk</p>
                      <div class="flex flex-wrap gap-1">
                        {#each conditions.signInRiskLevels as r}
                          <Badge variant="outline" class="text-xs capitalize">{r}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if conditions.userRiskLevels?.length}
                    <div>
                      <p class="text-xs text-muted-foreground mb-1">User Risk</p>
                      <div class="flex flex-wrap gap-1">
                        {#each conditions.userRiskLevels as r}
                          <Badge variant="outline" class="text-xs capitalize">{r}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if conditions.applications?.includeApplications?.length}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs font-medium text-muted-foreground mb-2">Applications</p>
                  <div class="flex flex-wrap gap-1">
                    {#each conditions.applications.includeApplications as a}
                      <Badge variant="outline" class="text-xs">{a}</Badge>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if !conditions.platforms && !conditions.locations && !conditions.clientAppTypes && !conditions.signInRiskLevels && !conditions.userRiskLevels && !conditions.applications}
                <p class="text-sm text-muted-foreground py-4">No conditions configured.</p>
              {/if}
            </div>
          </div>
        </Tabs.Content>
        <Tabs.Content value="controls" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="flex-1 overflow-y-auto">
            <div class="flex flex-col gap-3">
              {#if controls.builtInControls?.length}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs font-medium text-muted-foreground mb-2">Built In</p>
                  <div class="flex flex-wrap gap-1">
                    {#each controls.builtInControls as c}
                      <Badge variant="outline" class="text-xs">{c}</Badge>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if controls.customAuthenticationFactors?.length}
                <div class="rounded-md border bg-card px-3 py-2">
                  <p class="text-xs font-medium text-muted-foreground mb-2">Custom Authentication Factors</p>
                  <div class="flex flex-wrap gap-1">
                    {#each controls.customAuthenticationFactors as c}
                      <Badge variant="outline" class="text-xs">{c}</Badge>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if !controls.builtInControls?.length && !controls.customAuthenticationFactors?.length}
                <p class="text-sm text-muted-foreground py-4">No controls configured.</p>
              {/if}
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </Sheet.Content>
</Sheet.Root>
