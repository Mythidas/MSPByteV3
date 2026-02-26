<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import * as Avatar from '$lib/components/ui/avatar/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { supabase } from '$lib/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { formatDate, formatRelativeDate, formatStringProper } from '$lib/utils/format.js';
  import { severityClass } from '$lib/components/alerts/_alert-config.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
  import SearchIcon from '@lucide/svelte/icons/search';

  type Entity = Tables<'views', 'd_entities_view'>;
  type EntityAlert = Tables<'views', 'd_alerts_view'>;

  let {
    user = $bindable<Entity | null>(null),
    open = $bindable(false),
    licenseMap = {},
  }: {
    user: Entity | null;
    open: boolean;
    licenseMap: Record<string, string>;
  } = $props();

  // Overview data
  let alerts = $state<EntityAlert[]>([]);
  let alertsLoading = $state(false);
  let alertsError = $state<string | null>(null);

  // Tab data
  let activeTab = $state('licenses');
  let tabSearch = $state('');
  let licensesData = $state<any[]>([]);
  let licensesLoading = $state(false);
  let licensesError = $state<string | null>(null);
  let licensesLoaded = $state(false);

  let groupsData = $state<any[]>([]);
  let groupsLoading = $state(false);
  let groupsError = $state<string | null>(null);
  let groupsLoaded = $state(false);

  let rolesData = $state<any[]>([]);
  let rolesLoading = $state(false);
  let rolesError = $state<string | null>(null);
  let rolesLoaded = $state(false);

  let policiesData = $state<any[]>([]);
  let policiesLoading = $state(false);
  let policiesError = $state<string | null>(null);
  let policiesLoaded = $state(false);

  function getInitials(name: string | null): string {
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  let rawData = $derived((user?.raw_data ?? {}) as Record<string, any>);
  let upn = $derived(rawData.userPrincipalName as string | undefined);
  let accountEnabled = $derived(rawData.accountEnabled as boolean | undefined);
  let userType = $derived(rawData.userType as string | undefined);
  let lastSignIn = $derived(rawData.signInActivity?.lastSignInDateTime as string | undefined);
  let createdDateTime = $derived(rawData.createdDateTime as string | undefined);

  let aliases = $derived(
    ((rawData.proxyAddresses as string[] | undefined) ?? [])
      .filter((a) => a.startsWith('smtp:'))
      .map((a) => a.slice(5))
  );

  let tags = $derived(Array.isArray(user?.tags) ? (user.tags as string[]) : []);

  let filteredLicenses = $derived(
    licensesData
      .filter((l) => l.displayName.toLowerCase().includes(tabSearch.toLowerCase()))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  );

  let filteredGroups = $derived(
    groupsData
      .filter((g) => g.displayName.toLowerCase().includes(tabSearch.toLowerCase()))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  );

  let filteredRoles = $derived(
    rolesData
      .filter((r) => r.displayName.toLowerCase().includes(tabSearch.toLowerCase()))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  );

  let filteredPolicies = $derived(
    policiesData
      .filter((p) => p.displayName.toLowerCase().includes(tabSearch.toLowerCase()))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  );

  // Reset search when tab changes
  $effect(() => {
    activeTab;
    tabSearch = '';
  });

  // Load overview data when sheet opens
  $effect(() => {
    if (open && user) {
      loadAlerts(user.id!);
      // Reset tabs
      activeTab = 'licenses';
      tabSearch = '';
      licensesLoaded = false;
      groupsLoaded = false;
      rolesLoaded = false;
      policiesLoaded = false;
      licensesData = [];
      groupsData = [];
      rolesData = [];
      policiesData = [];
    }
    if (!open) {
      alerts = [];
      alertsError = null;
    }
  });

  // Load tab data lazily when tab becomes active
  $effect(() => {
    if (!open || !user) return;
    if (activeTab === 'licenses' && !licensesLoaded) {
      loadLicenses();
    } else if (activeTab === 'groups' && !groupsLoaded) {
      loadGroups();
    } else if (activeTab === 'roles' && !rolesLoaded) {
      loadRoles();
    } else if (activeTab === 'policies' && !policiesLoaded) {
      loadPolicies();
    }
  });

  async function loadAlerts(entityId: string) {
    alertsLoading = true;
    alertsError = null;
    try {
      const { data, error } = await supabase
        .schema('views')
        .from('d_alerts_view')
        .select('*')
        .eq('entity_id', entityId)
        .eq('status', 'active');
      if (error) throw error;
      alerts = data ?? [];
    } catch (err: any) {
      alertsError = err.message ?? 'Failed to load alerts';
    } finally {
      alertsLoading = false;
    }
  }

  async function loadLicenses() {
    if (!user?.connection_id) {
      licensesLoaded = true;
      return;
    }
    licensesLoading = true;
    licensesError = null;
    try {
      const { data, error } = await supabase
        .schema('views')
        .from('d_entities_view')
        .select('external_id, display_name, raw_data')
        .eq('integration_id', 'microsoft-365')
        .eq('entity_type', 'license')
        .eq('connection_id', user.connection_id);
      if (error) throw error;

      const assignedLicenses = (rawData.assignedLicenses as { skuId: string }[] | undefined) ?? [];
      const assignedSkuIds = new Set(assignedLicenses.map((l) => l.skuId));
      const assignedPlans = (rawData.assignedPlans as any[] | undefined) ?? [];

      licensesData = (data ?? [])
        .filter((l) => l.external_id && assignedSkuIds.has(l.external_id))
        .map((l) => {
          const skuId = l.external_id!;
          const plans = assignedPlans.filter(
            (p) => p.skuId === skuId && p.capabilityStatus === 'Enabled'
          );
          return { skuId, displayName: licenseMap[skuId] ?? l.display_name ?? skuId, plans };
        });
      licensesLoaded = true;
    } catch (err: any) {
      licensesError = err.message ?? 'Failed to load licenses';
    } finally {
      licensesLoading = false;
    }
  }

  async function loadGroups() {
    if (!user?.id) return;
    groupsLoading = true;
    groupsError = null;
    try {
      const { data: rels, error: relsError } = await supabase
        .from('entity_relationships')
        .select('parent_entity_id')
        .eq('child_entity_id', user.id)
        .eq('relationship_type', 'member-of');
      if (relsError) throw relsError;

      const groupIds = rels?.map((r) => r.parent_entity_id) ?? [];
      if (groupIds.length === 0) {
        groupsData = [];
        groupsLoaded = true;
        return;
      }

      const { data: entities, error: entitiesError } = await supabase
        .schema('views')
        .from('d_entities_view')
        .select('id, display_name, raw_data')
        .in('id', groupIds);
      if (entitiesError) throw entitiesError;

      groupsData = (entities ?? []).map((e) => {
        const r = (e.raw_data ?? {}) as Record<string, any>;
        return {
          displayName: e.display_name ?? r.displayName ?? 'Unknown Group',
          groupTypes: r.groupTypes ?? [],
          mailEnabled: r.mailEnabled ?? false,
          securityEnabled: r.securityEnabled ?? false,
        };
      });
      groupsLoaded = true;
    } catch (err: any) {
      groupsError = err.message ?? 'Failed to load groups';
    } finally {
      groupsLoading = false;
    }
  }

  async function loadRoles() {
    if (!user?.id) return;
    rolesLoading = true;
    rolesError = null;
    try {
      const { data: rels, error: relsError } = await supabase
        .from('entity_relationships')
        .select('parent_entity_id')
        .eq('child_entity_id', user.id)
        .eq('relationship_type', 'assigned-to');
      if (relsError) throw relsError;

      const roleIds = rels?.map((r) => r.parent_entity_id) ?? [];
      if (roleIds.length === 0) {
        rolesData = [];
        rolesLoaded = true;
        return;
      }

      const { data: entities, error: entitiesError } = await supabase
        .schema('views')
        .from('d_entities_view')
        .select('id, display_name, raw_data')
        .in('id', roleIds);
      if (entitiesError) throw entitiesError;

      rolesData = (entities ?? []).map((e) => {
        const r = (e.raw_data ?? {}) as Record<string, any>;
        return {
          displayName: e.display_name ?? r.displayName ?? 'Unknown Role',
          description: r.description ?? null,
        };
      });
      rolesLoaded = true;
    } catch (err: any) {
      rolesError = err.message ?? 'Failed to load roles';
    } finally {
      rolesLoading = false;
    }
  }

  async function loadPolicies() {
    if (!user?.connection_id) {
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
        .eq('connection_id', user.connection_id);
      if (error) throw error;

      const userId = user.external_id;
      policiesData = (data ?? [])
        .map((p) => {
          const pRaw = (p.raw_data ?? {}) as Record<string, any>;
          const state = pRaw.state as string | undefined;
          const includeUsers: string[] = pRaw.conditions?.users?.includeUsers ?? [];
          const excludeUsers: string[] = pRaw.conditions?.users?.excludeUsers ?? [];
          let applicability = 'N/A';
          if (userId) {
            if (includeUsers.includes('All') || includeUsers.includes(userId)) {
              applicability = excludeUsers.includes(userId) ? 'Excluded' : 'Included';
            } else if (excludeUsers.includes(userId)) {
              applicability = 'Excluded';
            }
          }
          return {
            id: p.id,
            displayName: p.display_name ?? 'Unknown Policy',
            state,
            applicability,
          };
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
        return 'bg-green-500/15 text-green-600 border-green-500/30';
      case 'disabled':
        return 'bg-muted text-muted-foreground';
      case 'enabledForReportingButNotEnforced':
        return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
      default:
        return 'bg-muted text-muted-foreground';
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

  function groupType(g: any): string {
    const types: string[] = g.groupTypes ?? [];
    if (types.includes('Unified')) return 'Microsoft 365';
    if (types.includes('DynamicMembership')) return 'Dynamic';
    if (g.securityEnabled) return 'Security';
    if (g.mailEnabled) return 'Mail';
    return 'Other';
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-xl overflow-y-hidden max-h-screen flex flex-col pb-4">
    {#if user}
      <Sheet.Header class="shrink-0">
        <div class="flex items-start gap-3">
          <Avatar.Root class="size-12 text-base shrink-0">
            <Avatar.Fallback class="bg-primary/15 text-primary font-semibold">
              {getInitials(user.display_name)}
            </Avatar.Fallback>
          </Avatar.Root>
          <div class="flex-1 min-w-0">
            <Sheet.Title class="text-lg leading-tight truncate">
              {user.display_name ?? '—'}
            </Sheet.Title>
            <Sheet.Description class="text-sm truncate">
              {upn ?? '—'}
            </Sheet.Description>
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#if accountEnabled === true}
                <Badge
                  variant="outline"
                  class="bg-green-500/15 text-green-600 border-green-500/30 text-xs">Enabled</Badge
                >
              {:else if accountEnabled === false}
                <Badge
                  variant="outline"
                  class="bg-destructive/15 text-destructive border-destructive/30 text-xs"
                  >Disabled</Badge
                >
              {/if}
              {#if userType === 'Member'}
                <Badge
                  variant="outline"
                  class="bg-blue-500/15 text-blue-500 border-blue-500/30 text-xs">Member</Badge
                >
              {:else if userType === 'Guest'}
                <Badge
                  variant="outline"
                  class="bg-yellow-500/15 text-yellow-500 border-yellow-500/30 text-xs">Guest</Badge
                >
              {:else if userType}
                <Badge variant="outline" class="text-xs">{userType}</Badge>
              {/if}
              {#if user.state}
                <Badge variant="outline" class="text-xs">{formatStringProper(user.state)}</Badge>
              {/if}
            </div>
          </div>
        </div>
      </Sheet.Header>

      <div class="px-4 flex flex-col gap-4 shrink-0">
        <!-- Key info grid -->
        <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <p class="text-muted-foreground text-xs">Site</p>
            <p class="truncate">{user.site_name ?? '—'}</p>
          </div>
          <div>
            <p class="text-muted-foreground text-xs">Tenant</p>
            <p class="truncate">{user.connection_name ?? '—'}</p>
          </div>
          <div>
            <p class="text-muted-foreground text-xs">User Type</p>
            <p>{userType ?? '—'}</p>
          </div>
          <div>
            <p class="text-muted-foreground text-xs">Account Status</p>
            <p>
              {accountEnabled === true ? 'Enabled' : accountEnabled === false ? 'Disabled' : '—'}
            </p>
          </div>
          <div>
            <p class="text-muted-foreground text-xs">Last Sign-in</p>
            <p>{lastSignIn ? formatRelativeDate(lastSignIn) : '—'}</p>
          </div>
          <div>
            <p class="text-muted-foreground text-xs">Created</p>
            <p>
              {createdDateTime
                ? formatDate(createdDateTime)
                : user.created_at
                  ? formatDate(user.created_at)
                  : '—'}
            </p>
          </div>
        </div>

        <!-- Aliases -->
        {#if aliases.length > 0}
          <div>
            <p class="text-xs text-muted-foreground mb-1.5">Aliases</p>
            <div class="flex flex-wrap gap-1.5">
              {#each aliases as alias}
                <Badge variant="outline" class="text-xs font-normal">{alias}</Badge>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Tags -->
        {#if tags.length > 0}
          <div>
            <p class="text-xs text-muted-foreground mb-1.5">Tags</p>
            <div class="flex flex-wrap gap-1.5">
              {#each tags as tag}
                <Badge
                  variant="outline"
                  class="bg-primary/10 text-primary border-primary/25 text-xs font-normal"
                  >{tag}</Badge
                >
              {/each}
            </div>
          </div>
        {/if}

        <!-- Active Alerts -->
        {#if alertsLoading}
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon class="size-4 animate-spin" />
            Loading alerts...
          </div>
        {:else if alertsError}
          <div
            class="rounded-lg border bg-destructive/10 text-destructive border-destructive/30 p-3 text-sm"
          >
            {alertsError}
          </div>
        {:else if alerts.length > 0}
          <div>
            <p class="text-xs text-muted-foreground mb-1.5">Active Alerts</p>
            <div class="flex flex-col gap-2">
              {#each alerts as alert}
                <div class="rounded-lg border p-3 text-sm {severityClass(alert.severity ?? '')}">
                  <p class="font-medium">{formatStringProper(alert.alert_type)}</p>
                  {#if alert.message}
                    <p class="text-xs mt-0.5 opacity-80">{alert.message}</p>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <Separator class="shrink-0" />

      <!-- Tabs -->
      <div class="px-4 flex-1 flex flex-col min-h-0">
        <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
          <Tabs.List class="w-full grid grid-cols-4">
            <Tabs.Trigger value="licenses">Licenses</Tabs.Trigger>
            <Tabs.Trigger value="groups">Groups</Tabs.Trigger>
            <Tabs.Trigger value="roles">Roles</Tabs.Trigger>
            <Tabs.Trigger value="policies">Policies</Tabs.Trigger>
          </Tabs.List>

          <div class="relative mt-3 shrink-0">
            <SearchIcon
              class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            />
            <Input bind:value={tabSearch} placeholder="Search..." class="pl-8 h-8 text-sm" />
          </div>

          <!-- Licenses Tab -->
          <Tabs.Content value="licenses" class="mt-3 flex flex-col flex-1 min-h-0">
            {#if licensesLoading}
              <div class="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <LoaderCircleIcon class="size-4 animate-spin" />
                <span class="text-sm">Loading licenses...</span>
              </div>
            {:else if licensesError}
              <div
                class="rounded-lg border bg-destructive/10 text-destructive border-destructive/30 p-3 flex gap-2 text-sm"
              >
                <AlertCircleIcon class="size-4 shrink-0 mt-0.5" />
                {licensesError}
              </div>
            {:else if licensesData.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">No licenses assigned.</p>
            {:else if filteredLicenses.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No results matching '{tabSearch}'.
              </p>
            {:else}
              <div class="flex-1 overflow-y-auto flex flex-col gap-3">
                {#each filteredLicenses as license}
                  <div class="rounded-lg border bg-card p-3">
                    <p class="font-medium text-sm">{license.displayName}</p>
                    <p class="text-xs text-muted-foreground mt-0.5">{license.skuId}</p>
                    {#if license.plans.length > 0}
                      <div class="flex flex-wrap gap-1 mt-2">
                        {#each license.plans as plan}
                          <Badge
                            variant="outline"
                            class="text-xs font-normal bg-primary/5 border-primary/20"
                          >
                            {plan.servicePlanName ?? plan.servicePlanId}
                          </Badge>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </Tabs.Content>

          <!-- Groups Tab -->
          <Tabs.Content value="groups" class="mt-3 flex flex-col flex-1 min-h-0">
            {#if groupsLoading}
              <div class="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <LoaderCircleIcon class="size-4 animate-spin" />
                <span class="text-sm">Loading groups...</span>
              </div>
            {:else if groupsError}
              <div
                class="rounded-lg border bg-destructive/10 text-destructive border-destructive/30 p-3 flex gap-2 text-sm"
              >
                <AlertCircleIcon class="size-4 shrink-0 mt-0.5" />
                {groupsError}
              </div>
            {:else if groupsData.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No group memberships found.
              </p>
            {:else if filteredGroups.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No results matching '{tabSearch}'.
              </p>
            {:else}
              <div class="flex-1 overflow-y-auto flex flex-col gap-2">
                {#each filteredGroups as group}
                  <div class="rounded-lg border bg-card p-3">
                    <div class="flex items-center justify-between gap-2">
                      <p class="font-medium text-sm">{group.displayName ?? '—'}</p>
                      <Badge variant="outline" class="text-xs font-normal shrink-0"
                        >{groupType(group)}</Badge
                      >
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </Tabs.Content>

          <!-- Roles Tab -->
          <Tabs.Content value="roles" class="mt-3 flex flex-col flex-1 min-h-0">
            {#if rolesLoading}
              <div class="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <LoaderCircleIcon class="size-4 animate-spin" />
                <span class="text-sm">Loading roles...</span>
              </div>
            {:else if rolesError}
              <div
                class="rounded-lg border bg-destructive/10 text-destructive border-destructive/30 p-3 flex gap-2 text-sm"
              >
                <AlertCircleIcon class="size-4 shrink-0 mt-0.5" />
                {rolesError}
              </div>
            {:else if rolesData.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">No roles assigned.</p>
            {:else if filteredRoles.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No results matching '{tabSearch}'.
              </p>
            {:else}
              <div class="flex-1 overflow-y-auto flex flex-col gap-2">
                {#each filteredRoles as role}
                  <div class="rounded-lg border bg-card p-3">
                    <p class="font-medium text-sm">{role.displayName ?? '—'}</p>
                    {#if role.description}
                      <p class="text-xs text-muted-foreground mt-0.5">{role.description}</p>
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
            {:else if policiesData.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">
                No applicable policies for this user.
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
                        <Badge
                          variant="outline"
                          class="text-xs {applicabilityClass(policy.applicability)}"
                        >
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
