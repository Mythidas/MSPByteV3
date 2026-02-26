<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { supabase } from '$lib/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { formatDate, formatStringProper } from '$lib/utils/format.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
  import SearchIcon from '@lucide/svelte/icons/search';
  import ShieldIcon from '@lucide/svelte/icons/shield';
  import UsersIcon from '@lucide/svelte/icons/users';
  import UserIcon from '@lucide/svelte/icons/user';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

  type Entity = Tables<'views', 'd_entities_view'>;

  type ResolvedTarget = {
    id: string;
    displayName: string;
    type: 'user' | 'group' | 'role';
  };

  let {
    policy = $bindable<Entity | null>(null),
    open = $bindable(false),
  }: {
    policy: Entity | null;
    open: boolean;
  } = $props();

  let activeTab = $state('users');
  let tabSearch = $state('');

  // Users tab state
  let includeTargets = $state<ResolvedTarget[]>([]);
  let excludeTargets = $state<ResolvedTarget[]>([]);
  let usersLoading = $state(false);
  let usersError = $state<string | null>(null);
  let usersLoaded = $state(false);

  let rawData = $derived((policy?.raw_data ?? {}) as Record<string, any>);
  let conditions = $derived((rawData.conditions ?? {}) as Record<string, any>);
  let usersCondition = $derived((conditions.users ?? {}) as Record<string, any>);
  let grantControls = $derived((rawData.grantControls ?? null) as Record<string, any> | null);
  let sessionControls = $derived((rawData.sessionControls ?? null) as Record<string, any> | null);

  let includeUsers = $derived<string[]>(usersCondition.includeUsers ?? []);
  let excludeUsers = $derived<string[]>(usersCondition.excludeUsers ?? []);
  let includeGroups = $derived<string[]>(usersCondition.includeGroups ?? []);
  let excludeGroups = $derived<string[]>(usersCondition.excludeGroups ?? []);
  let includeRoles = $derived<string[]>(usersCondition.includeRoles ?? []);
  let excludeRoles = $derived<string[]>(usersCondition.excludeRoles ?? []);

  let allIncludeIds = $derived([...includeUsers, ...includeGroups, ...includeRoles]);
  let allExcludeIds = $derived([...excludeUsers, ...excludeGroups, ...excludeRoles]);

  let isAllUsers = $derived(includeUsers.includes('All'));
  let isNoUsers = $derived(includeUsers.includes('None'));

  const { apps, platforms, locations, clientAppTypes, userRiskLevels, signInRiskLevels } = $derived(
    {
      apps: (conditions.applications ?? {}) as Record<string, any>,
      platforms: (conditions.platforms ?? null) as Record<string, any> | null,
      locations: (conditions.locations ?? null) as Record<string, any> | null,
      clientAppTypes: (conditions.clientAppTypes ?? []) as string[],
      userRiskLevels: (conditions.userRiskLevels ?? []) as string[],
      signInRiskLevels: (conditions.signInRiskLevels ?? []) as string[],
    }
  );

  let filteredInclude = $derived(
    includeTargets.filter((t) => t.displayName.toLowerCase().includes(tabSearch.toLowerCase()))
  );
  let filteredExclude = $derived(
    excludeTargets.filter((t) => t.displayName.toLowerCase().includes(tabSearch.toLowerCase()))
  );

  // Reset on open/close
  $effect(() => {
    if (open && policy) {
      activeTab = 'users';
      tabSearch = '';
      usersLoaded = false;
      includeTargets = [];
      excludeTargets = [];
      usersError = null;
    }
  });

  // Reset search when tab changes
  $effect(() => {
    activeTab;
    tabSearch = '';
  });

  // Lazy-load users tab
  $effect(() => {
    if (!open || !policy) return;
    if (activeTab === 'users' && !usersLoaded) {
      loadUsers();
    }
  });

  async function loadUsers() {
    if (!policy?.connection_id) {
      usersLoaded = true;
      return;
    }
    usersLoading = true;
    usersError = null;

    try {
      const allIds = [...new Set([...allIncludeIds, ...allExcludeIds])].filter(
        (id) => id !== 'All' && id !== 'None' && id !== 'GuestsOrExternalUsers'
      );

      if (allIds.length === 0) {
        usersLoaded = true;
        return;
      }

      const { data, error } = await supabase
        .schema('views')
        .from('d_entities_view')
        .select('external_id, display_name, entity_type')
        .eq('integration_id', 'microsoft-365')
        .eq('connection_id', policy.connection_id)
        .in('entity_type', ['identity', 'group', 'role'])
        .in('external_id', allIds);

      if (error) throw error;

      const resolved = data ?? [];
      const resolvedMap = new Map(resolved.map((r) => [r.external_id, r]));

      function resolveIds(
        userIds: string[],
        groupIds: string[],
        roleIds: string[]
      ): ResolvedTarget[] {
        const targets: ResolvedTarget[] = [];
        for (const id of userIds) {
          if (id === 'All' || id === 'None' || id === 'GuestsOrExternalUsers') continue;
          const e = resolvedMap.get(id);
          targets.push({ id, displayName: e?.display_name ?? id, type: 'user' });
        }
        for (const id of groupIds) {
          const e = resolvedMap.get(id);
          targets.push({ id, displayName: e?.display_name ?? id, type: 'group' });
        }
        for (const id of roleIds) {
          const e = resolvedMap.get(id);
          targets.push({ id, displayName: e?.display_name ?? id, type: 'role' });
        }
        return targets;
      }

      includeTargets = resolveIds(includeUsers, includeGroups, includeRoles);
      excludeTargets = resolveIds(excludeUsers, excludeGroups, excludeRoles);
      usersLoaded = true;
    } catch (err: any) {
      usersError = err.message ?? 'Failed to load users';
    } finally {
      usersLoading = false;
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

  function targetTypeClass(type: 'user' | 'group' | 'role'): string {
    switch (type) {
      case 'user':
        return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
      case 'group':
        return 'bg-purple-500/15 text-purple-500 border-purple-500/30';
      case 'role':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    }
  }

  function isUnresolved(target: ResolvedTarget): boolean {
    // If the displayName is the same as the id (a GUID-like string), it wasn't resolved
    return target.displayName === target.id && target.id.includes('-');
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    {#if policy}
      <Sheet.Header class="shrink-0">
        <div class="flex items-start gap-3">
          <div class="size-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <ShieldIcon class="size-6 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <Sheet.Title class="text-lg leading-tight truncate">
              {policy.display_name ?? '—'}
            </Sheet.Title>
            <Sheet.Description class="text-sm truncate">
              Conditional Access Policy
            </Sheet.Description>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <Badge
                variant="outline"
                class="text-xs {policyStateClass(rawData.state as string | undefined)}"
              >
                {policyStateLabel(rawData.state as string | undefined)}
              </Badge>
            </div>
          </div>
        </div>
      </Sheet.Header>

      <!-- Overview -->
      <div class="px-4 flex flex-col gap-4 shrink-0">
        <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <p class="text-muted-foreground text-xs">Tenant</p>
            <p class="truncate">{policy.connection_name ?? '—'}</p>
          </div>
          <div>
            <p class="text-muted-foreground text-xs">Created</p>
            <p>
              {rawData.createdDateTime
                ? formatDate(rawData.createdDateTime as string)
                : policy.created_at
                  ? formatDate(policy.created_at)
                  : '—'}
            </p>
          </div>
          <div>
            <p class="text-muted-foreground text-xs">Last Modified</p>
            <p>
              {rawData.modifiedDateTime ? formatDate(rawData.modifiedDateTime as string) : '—'}
            </p>
          </div>
          {#if rawData.templateId}
            <div>
              <p class="text-muted-foreground text-xs">Template</p>
              <p class="truncate text-xs font-mono">{rawData.templateId}</p>
            </div>
          {/if}
        </div>

        <!-- Grant Controls summary -->
        {#if grantControls}
          {@const builtIn = (grantControls.builtInControls as string[] | undefined) ?? []}
          {@const operator = grantControls.operator as string | undefined}
          {#if builtIn.length > 0 || operator}
            <div>
              <p class="text-xs text-muted-foreground mb-1.5">Grant Controls</p>
              <div class="flex flex-wrap gap-1.5 items-center">
                {#if operator && builtIn.length > 1}
                  <Badge
                    variant="outline"
                    class="text-xs bg-amber-500/15 text-amber-500 border-amber-500/30"
                  >
                    {operator}
                  </Badge>
                {/if}
                {#each builtIn as control}
                  <Badge
                    variant="outline"
                    class="text-xs bg-primary/15 text-primary border-primary/30"
                  >
                    {formatStringProper(control)}
                  </Badge>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <Separator class="shrink-0" />

      <!-- Tabs -->
      <div class="px-4 flex-1 flex flex-col min-h-0">
        <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
          <Tabs.List class="w-full grid grid-cols-3">
            <Tabs.Trigger value="users">Users</Tabs.Trigger>
            <Tabs.Trigger value="applications">Applications</Tabs.Trigger>
            <Tabs.Trigger value="controls">Controls</Tabs.Trigger>
          </Tabs.List>

          <!-- Search — only on users tab -->
          {#if activeTab === 'users'}
            <div class="relative mt-3 shrink-0">
              <SearchIcon
                class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
              />
              <Input bind:value={tabSearch} placeholder="Search..." class="pl-8 h-8 text-sm" />
            </div>
          {/if}

          <!-- Users Tab -->
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
            {:else}
              <div class="flex-1 overflow-y-auto flex flex-col gap-4">
                <!-- Include -->
                <div>
                  <p class="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <UsersIcon class="size-3.5" />
                    Include
                  </p>
                  {#if isAllUsers}
                    <div class="rounded-lg border bg-primary/5 border-primary/20 p-3 text-sm">
                      <p class="font-medium text-primary">All Users</p>
                      <p class="text-xs text-muted-foreground mt-0.5">
                        Policy applies to all users in the tenant.
                      </p>
                    </div>
                  {:else if isNoUsers}
                    <div class="rounded-lg border bg-muted/10 p-3 text-sm">
                      <p class="text-muted-foreground">No users targeted.</p>
                    </div>
                  {:else if allIncludeIds.length === 0}
                    <p class="text-xs text-muted-foreground">None</p>
                  {:else if filteredInclude.length === 0 && tabSearch}
                    <p class="text-sm text-muted-foreground">No results matching '{tabSearch}'.</p>
                  {:else}
                    <div class="flex flex-col gap-1.5">
                      {#each filteredInclude as target}
                        <div class="rounded-lg border bg-card p-2.5 flex items-center gap-2">
                          {#if target.type === 'user'}
                            <UserIcon class="size-3.5 text-muted-foreground shrink-0" />
                          {:else if target.type === 'group'}
                            <UsersIcon class="size-3.5 text-muted-foreground shrink-0" />
                          {:else}
                            <ShieldCheckIcon class="size-3.5 text-muted-foreground shrink-0" />
                          {/if}
                          <p class="text-sm flex-1 min-w-0 truncate">
                            {target.displayName ?? target.id}
                          </p>
                          <Badge
                            variant="outline"
                            class="text-xs shrink-0 {targetTypeClass(target.type)}"
                          >
                            {target.type}
                          </Badge>
                        </div>
                      {/each}
                    </div>
                    {#if includeUsers.includes('GuestsOrExternalUsers')}
                      <div class="rounded-lg border bg-card p-2.5 mt-1.5 flex items-center gap-2">
                        <UsersIcon class="size-3.5 text-muted-foreground shrink-0" />
                        <p class="text-sm flex-1">Guests or External Users</p>
                        <Badge variant="outline" class="text-xs shrink-0">special</Badge>
                      </div>
                    {/if}
                  {/if}
                </div>

                <!-- Exclude -->
                {#if allExcludeIds.length > 0 || excludeUsers.includes('GuestsOrExternalUsers')}
                  <div>
                    <p class="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                      <UsersIcon class="size-3.5" />
                      Exclude
                    </p>
                    {#if filteredExclude.length === 0 && tabSearch && allExcludeIds.length > 0}
                      <p class="text-sm text-muted-foreground">
                        No results matching '{tabSearch}'.
                      </p>
                    {:else}
                      <div class="flex flex-col gap-1.5">
                        {#each filteredExclude as target}
                          <div class="rounded-lg border bg-card p-2.5 flex items-center gap-2">
                            {#if target.type === 'user'}
                              <UserIcon class="size-3.5 text-muted-foreground shrink-0" />
                            {:else if target.type === 'group'}
                              <UsersIcon class="size-3.5 text-muted-foreground shrink-0" />
                            {:else}
                              <ShieldCheckIcon class="size-3.5 text-muted-foreground shrink-0" />
                            {/if}
                            <p class="text-sm flex-1 min-w-0 truncate">
                              {isUnresolved(target)
                                ? target.id.slice(0, 8) + '...'
                                : target.displayName}
                            </p>
                            <Badge
                              variant="outline"
                              class="text-xs shrink-0 {targetTypeClass(target.type)}"
                            >
                              {target.type}
                            </Badge>
                          </div>
                        {/each}
                        {#if excludeUsers.includes('GuestsOrExternalUsers')}
                          <div class="rounded-lg border bg-card p-2.5 flex items-center gap-2">
                            <UsersIcon class="size-3.5 text-muted-foreground shrink-0" />
                            <p class="text-sm flex-1">Guests or External Users</p>
                            <Badge variant="outline" class="text-xs shrink-0">special</Badge>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </Tabs.Content>

          <!-- Applications Tab -->
          <Tabs.Content value="applications" class="mt-3 flex flex-col flex-1 min-h-0">
            <div class="flex-1 overflow-y-auto flex flex-col gap-3">
              <!-- Applications -->
              {#if (apps.includeApplications ?? []).length > 0 || (apps.excludeApplications ?? []).length > 0}
                <div class="rounded-lg border bg-card p-3">
                  <p class="text-xs text-muted-foreground mb-2">Applications</p>
                  {#if (apps.includeApplications ?? []).length > 0}
                    <div class="mb-2">
                      <p class="text-xs text-muted-foreground mb-1">Include</p>
                      <div class="flex flex-wrap gap-1">
                        {#each apps.includeApplications as appId}
                          <Badge
                            variant="outline"
                            class="text-xs {appId === 'All'
                              ? 'bg-primary/15 text-primary border-primary/30'
                              : ''}"
                          >
                            {appId === 'All' ? 'All Applications' : appId}
                          </Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if (apps.excludeApplications ?? []).length > 0}
                    <div>
                      <p class="text-xs text-muted-foreground mb-1">Exclude</p>
                      <div class="flex flex-wrap gap-1">
                        {#each apps.excludeApplications as appId}
                          <Badge variant="outline" class="text-xs">{appId}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Platforms -->
              {#if platforms && ((platforms.includePlatforms ?? []).length > 0 || (platforms.excludePlatforms ?? []).length > 0)}
                <div class="rounded-lg border bg-card p-3">
                  <p class="text-xs text-muted-foreground mb-2">Platforms</p>
                  {#if (platforms.includePlatforms ?? []).length > 0}
                    <div class="mb-2">
                      <p class="text-xs text-muted-foreground mb-1">Include</p>
                      <div class="flex flex-wrap gap-1">
                        {#each platforms.includePlatforms as p}
                          <Badge variant="outline" class="text-xs">{formatStringProper(p)}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if (platforms.excludePlatforms ?? []).length > 0}
                    <div>
                      <p class="text-xs text-muted-foreground mb-1">Exclude</p>
                      <div class="flex flex-wrap gap-1">
                        {#each platforms.excludePlatforms as p}
                          <Badge variant="outline" class="text-xs">{formatStringProper(p)}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Locations -->
              {#if locations && ((locations.includeLocations ?? []).length > 0 || (locations.excludeLocations ?? []).length > 0)}
                <div class="rounded-lg border bg-card p-3">
                  <p class="text-xs text-muted-foreground mb-2">Locations</p>
                  {#if (locations.includeLocations ?? []).length > 0}
                    <div class="mb-2">
                      <p class="text-xs text-muted-foreground mb-1">Include</p>
                      <div class="flex flex-wrap gap-1">
                        {#each locations.includeLocations as loc}
                          <Badge variant="outline" class="text-xs">{loc}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if (locations.excludeLocations ?? []).length > 0}
                    <div>
                      <p class="text-xs text-muted-foreground mb-1">Exclude</p>
                      <div class="flex flex-wrap gap-1">
                        {#each locations.excludeLocations as loc}
                          <Badge variant="outline" class="text-xs">{loc}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Client App Types -->
              {#if clientAppTypes.length > 0}
                <div class="rounded-lg border bg-card p-3">
                  <p class="text-xs text-muted-foreground mb-2">Client App Types</p>
                  <div class="flex flex-wrap gap-1">
                    {#each clientAppTypes as t}
                      <Badge variant="outline" class="text-xs">{formatStringProper(t)}</Badge>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Risk Levels -->
              {#if userRiskLevels.length > 0 || signInRiskLevels.length > 0}
                <div class="rounded-lg border bg-card p-3">
                  <p class="text-xs text-muted-foreground mb-2">Risk Levels</p>
                  {#if userRiskLevels.length > 0}
                    <div class="mb-2">
                      <p class="text-xs text-muted-foreground mb-1">User Risk</p>
                      <div class="flex flex-wrap gap-1">
                        {#each userRiskLevels as level}
                          <Badge
                            variant="outline"
                            class="text-xs bg-destructive/15 text-destructive border-destructive/30"
                          >
                            {formatStringProper(level)}
                          </Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if signInRiskLevels.length > 0}
                    <div>
                      <p class="text-xs text-muted-foreground mb-1">Sign-in Risk</p>
                      <div class="flex flex-wrap gap-1">
                        {#each signInRiskLevels as level}
                          <Badge
                            variant="outline"
                            class="text-xs bg-destructive/15 text-destructive border-destructive/30"
                          >
                            {formatStringProper(level)}
                          </Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if !apps.includeApplications?.length && !apps.excludeApplications?.length && !platforms && !locations && !clientAppTypes.length && !userRiskLevels.length && !signInRiskLevels.length}
                <p class="text-sm text-muted-foreground text-center py-8">
                  No application conditions configured.
                </p>
              {/if}
            </div>
          </Tabs.Content>

          <!-- Controls Tab -->
          <Tabs.Content value="controls" class="mt-3 flex flex-col flex-1 min-h-0">
            <div class="flex-1 overflow-y-auto flex flex-col gap-3">
              {#if grantControls}
                {@const builtIn = (grantControls.builtInControls as string[] | undefined) ?? []}
                {@const operator = grantControls.operator as string | undefined}
                {@const termsOfUse = (grantControls.termsOfUse as string[] | undefined) ?? []}
                {@const customAuthFactors =
                  (grantControls.customAuthenticationFactors as string[] | undefined) ?? []}
                {@const authStrength = grantControls.authenticationStrength as
                  | Record<string, any>
                  | null
                  | undefined}

                <div>
                  <p class="text-xs font-medium text-muted-foreground mb-2">Grant Controls</p>

                  {#if builtIn.length > 0}
                    <div class="rounded-lg border bg-card p-3 mb-2">
                      <div class="flex items-center justify-between mb-2">
                        <p class="text-xs text-muted-foreground">Built-in Controls</p>
                        {#if operator && builtIn.length > 1}
                          <Badge
                            variant="outline"
                            class="text-xs bg-amber-500/15 text-amber-500 border-amber-500/30"
                          >
                            {operator}
                          </Badge>
                        {/if}
                      </div>
                      <div class="flex flex-wrap gap-1">
                        {#each builtIn as control}
                          <Badge
                            variant="outline"
                            class="text-xs bg-primary/15 text-primary border-primary/30"
                          >
                            {formatStringProper(control)}
                          </Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if termsOfUse.length > 0}
                    <div class="rounded-lg border bg-card p-3 mb-2">
                      <p class="text-xs text-muted-foreground mb-2">Terms of Use</p>
                      <div class="flex flex-wrap gap-1">
                        {#each termsOfUse as id}
                          <Badge variant="outline" class="text-xs font-mono">{id}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if customAuthFactors.length > 0}
                    <div class="rounded-lg border bg-card p-3 mb-2">
                      <p class="text-xs text-muted-foreground mb-2">Custom Auth Factors</p>
                      <div class="flex flex-wrap gap-1">
                        {#each customAuthFactors as factor}
                          <Badge variant="outline" class="text-xs">{factor}</Badge>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if authStrength?.displayName}
                    <div class="rounded-lg border bg-card p-3 mb-2">
                      <p class="text-xs text-muted-foreground mb-1">Auth Strength</p>
                      <p class="text-sm">{authStrength.displayName}</p>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if sessionControls}
                {@const signInFreq = sessionControls.signInFrequency as
                  | Record<string, any>
                  | null
                  | undefined}
                {@const persistentBrowser = sessionControls.persistentBrowser as
                  | Record<string, any>
                  | null
                  | undefined}
                {@const cloudAppSecurity = sessionControls.cloudAppSecurity as
                  | Record<string, any>
                  | null
                  | undefined}
                {@const appEnforcedRestrictions =
                  sessionControls.applicationEnforcedRestrictions as
                    | Record<string, any>
                    | null
                    | undefined}

                <div>
                  <p class="text-xs font-medium text-muted-foreground mb-2">Session Controls</p>

                  {#if signInFreq?.isEnabled}
                    <div class="rounded-lg border bg-card p-3 mb-2">
                      <p class="text-xs text-muted-foreground mb-1">Sign-in Frequency</p>
                      <p class="text-sm">
                        {signInFreq.value ?? '—'}
                        {signInFreq.type ?? ''}
                        {signInFreq.authenticationType
                          ? `(${formatStringProper(signInFreq.authenticationType)})`
                          : ''}
                      </p>
                    </div>
                  {/if}

                  {#if persistentBrowser?.isEnabled}
                    <div class="rounded-lg border bg-card p-3 mb-2">
                      <p class="text-xs text-muted-foreground mb-1">Persistent Browser</p>
                      <Badge variant="outline" class="text-xs">
                        {formatStringProper(persistentBrowser.mode ?? 'enabled')}
                      </Badge>
                    </div>
                  {/if}

                  {#if cloudAppSecurity?.isEnabled}
                    <div class="rounded-lg border bg-card p-3 mb-2">
                      <p class="text-xs text-muted-foreground mb-1">Cloud App Security</p>
                      <Badge variant="outline" class="text-xs">
                        {formatStringProper(cloudAppSecurity.cloudAppSecurityType ?? 'enabled')}
                      </Badge>
                    </div>
                  {/if}

                  {#if appEnforcedRestrictions?.isEnabled}
                    <div class="rounded-lg border bg-card p-3 mb-2">
                      <p class="text-xs text-muted-foreground mb-1">App Enforced Restrictions</p>
                      <Badge
                        variant="outline"
                        class="text-xs bg-green-500/15 text-green-500 border-green-500/30"
                        >Enabled</Badge
                      >
                    </div>
                  {/if}
                </div>
              {/if}

              {#if !grantControls && !sessionControls}
                <p class="text-sm text-muted-foreground text-center py-8">
                  No controls configured.
                </p>
              {/if}
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>
