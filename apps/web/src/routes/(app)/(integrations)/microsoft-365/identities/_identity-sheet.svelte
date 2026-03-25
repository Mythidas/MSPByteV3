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

  type Identity = Tables<'views', 'm365_identities_view'>;

  let {
    identity = $bindable(null),
    open = $bindable(false),
  }: { identity: Identity | null; open: boolean } = $props();

  let activeTab = $state('alerts');

  let alerts = $state<any[]>([]);
  let alertsLoading = $state(false);
  let alertsError = $state<string | null>(null);
  let alertsLoaded = $state(false);
  let alertsSearch = $state('');

  let roles = $state<any[]>([]);
  let rolesLoading = $state(false);
  let rolesError = $state<string | null>(null);
  let rolesLoaded = $state(false);
  let rolesSearch = $state('');

  let groups = $state<any[]>([]);
  let groupsLoading = $state(false);
  let groupsError = $state<string | null>(null);
  let groupsLoaded = $state(false);
  let groupsSearch = $state('');

  let licenses = $state<any[]>([]);
  let licensesLoading = $state(false);
  let licensesError = $state<string | null>(null);
  let licensesLoaded = $state(false);
  let licensesSearch = $state('');

  let policies = $state<any[]>([]);
  let policiesLoading = $state(false);
  let policiesError = $state<string | null>(null);
  let policiesLoaded = $state(false);
  let policiesSearch = $state('');

  $effect(() => {
    if (open && identity) {
      activeTab = 'alerts';
      alerts = [];
      alertsLoading = false;
      alertsError = null;
      alertsLoaded = false;
      alertsSearch = '';

      roles = [];
      rolesLoading = false;
      rolesError = null;
      rolesLoaded = false;
      rolesSearch = '';

      groups = [];
      groupsLoading = false;
      groupsError = null;
      groupsLoaded = false;
      groupsSearch = '';

      licenses = [];
      licensesLoading = false;
      licensesError = null;
      licensesLoaded = false;
      licensesSearch = '';

      policies = [];
      policiesLoading = false;
      policiesError = null;
      policiesLoaded = false;
      policiesSearch = '';
    }
  });

  $effect(() => {
    if (!open || !identity) return;
    if (activeTab === 'alerts' && !alertsLoaded) loadAlerts();
  });

  $effect(() => {
    if (!open || !identity) return;
    if (activeTab === 'roles' && !rolesLoaded) loadRoles();
  });

  $effect(() => {
    if (!open || !identity) return;
    if (activeTab === 'groups' && !groupsLoaded) loadGroups();
  });

  $effect(() => {
    if (!open || !identity) return;
    if (activeTab === 'licenses' && !licensesLoaded) loadLicenses();
  });

  $effect(() => {
    if (!open || !identity) return;
    if (activeTab === 'policies' && !policiesLoaded) loadPolicies();
  });

  async function loadAlerts() {
    if (!identity || !identity.id) return;

    alertsLoading = true;
    alertsError = null;
    try {
      const { data, error } = await supabase
        .schema('views')
        .from('d_alerts_view')
        .select('id,name,description')
        .eq('entity_type', 'm365_identity')
        .eq('entity_id', identity.id);
      if (error) throw error;
      alerts = data ?? [];
    } catch (e: any) {
      alertsError = e.message ?? 'Failed to load alerts';
    } finally {
      alertsLoaded = true;
      alertsLoading = false;
    }
  }

  async function loadRoles() {
    if (!identity || !identity.id || !identity.link_id || roles.length > 0) return;

    rolesLoading = true;
    rolesError = null;
    try {
      const { data: junctions, error: jErr } = await supabase
        .schema('vendors')
        .from('m365_identity_roles')
        .select('role_id')
        .eq('identity_id', identity.id)
        .eq('link_id', identity.link_id);
      if (jErr) throw jErr;
      const roleIds = (junctions ?? []).map((j: any) => j.role_id);
      if (roleIds.length === 0) {
        roles = [];
        rolesLoaded = true;
        rolesLoading = false;
        return;
      }
      const { data, error } = await supabase
        .schema('vendors')
        .from('m365_roles')
        .select('id,name,description')
        .in('id', roleIds)
        .eq('link_id', identity.link_id);
      if (error) throw error;
      roles = data ?? [];
    } catch (e: any) {
      rolesError = e.message ?? 'Failed to load roles';
    } finally {
      rolesLoaded = true;
      rolesLoading = false;
    }
  }

  async function loadGroups() {
    if (!identity || !identity.id || !identity.link_id || groups.length > 0) return;

    groupsLoading = true;
    groupsError = null;
    try {
      const { data: junctions, error: jErr } = await supabase
        .schema('vendors')
        .from('m365_identity_groups')
        .select('group_id')
        .eq('identity_id', identity.id)
        .eq('link_id', identity.link_id);
      if (jErr) throw jErr;
      const groupIds = (junctions ?? []).map((j: any) => j.group_id);
      if (groupIds.length === 0) {
        groups = [];
        groupsLoaded = true;
        groupsLoading = false;
        return;
      }
      const { data, error } = await supabase
        .schema('views')
        .from('m365_groups_view')
        .select('id,name,description,security_enabled,mail_enabled')
        .in('id', groupIds);
      if (error) throw error;
      groups = data ?? [];
    } catch (e: any) {
      groupsError = e.message ?? 'Failed to load groups';
    } finally {
      groupsLoaded = true;
      groupsLoading = false;
    }
  }

  async function loadLicenses() {
    if (!identity || !identity.link_id || licenses.length > 0) return;

    licensesLoading = true;
    licensesError = null;
    try {
      const { data, error } = await supabase
        .schema('vendors')
        .from('m365_licenses')
        .select('id,external_id,friendly_name,enabled')
        .eq('link_id', identity.link_id);
      if (error) throw error;
      const assigned: string[] = (identity.assigned_licenses as string[]) ?? [];
      licenses = (data ?? []).filter((l: any) => assigned.includes(l.external_id));
    } catch (e: any) {
      licensesError = e.message ?? 'Failed to load licenses';
    } finally {
      licensesLoaded = true;
      licensesLoading = false;
    }
  }

  async function loadPolicies() {
    if (!identity || !identity.id || !identity.link_id) return;
    policiesLoading = true;
    policiesError = null;
    try {
      // Get identity's role template IDs
      const { data: roleJunctions } = await supabase
        .schema('vendors')
        .from('m365_identity_roles')
        .select('role_id')
        .eq('identity_id', identity.id)
        .eq('link_id', identity.link_id);
      const roleIds = (roleJunctions ?? []).map((j: any) => j.role_id);
      let roleTemplateIds: string[] = [];
      if (roleIds.length > 0) {
        const { data: roleRows } = await supabase
          .schema('vendors')
          .from('m365_roles')
          .select('role_template_id')
          .in('id', roleIds);
        roleTemplateIds = (roleRows ?? []).map((r: any) => r.role_template_id).filter(Boolean);
      }

      // Get identity's group external IDs
      const { data: groupJunctions } = await supabase
        .schema('vendors')
        .from('m365_identity_groups')
        .select('group_id')
        .eq('identity_id', identity.id)
        .eq('link_id', identity.link_id);
      const groupIds = (groupJunctions ?? []).map((j: any) => j.group_id);
      let groupExternalIds: string[] = [];
      if (groupIds.length > 0) {
        const { data: groupRows } = await supabase
          .schema('views')
          .from('m365_groups_view')
          .select('external_id')
          .in('id', groupIds);
        groupExternalIds = (groupRows ?? []).map((g: any) => g.external_id).filter(Boolean);
      }

      // Fetch all policies for the link
      const { data, error } = await supabase
        .schema('vendors')
        .from('m365_policies')
        .select('id,name,policy_state,conditions,external_id')
        .eq('link_id', identity.link_id);
      if (error) throw error;

      // Client-side filter using expanded criteria
      const result: any[] = [];
      for (const p of data ?? []) {
        const users = (p.conditions as any)?.users ?? {};
        const includeUsers: string[] = users.includeUsers ?? [];
        const excludeUsers: string[] = users.excludeUsers ?? [];
        const includeRoles: string[] = users.includeRoles ?? [];
        const excludeRoles: string[] = users.excludeRoles ?? [];
        const includeGroups: string[] = users.includeGroups ?? [];
        const excludeGroups: string[] = users.excludeGroups ?? [];

        const exclDirect = excludeUsers.includes(identity.external_id ?? '');
        const exclRole = roleTemplateIds.some((t) => excludeRoles.includes(t));
        const exclGroup = groupExternalIds.some((g) => excludeGroups.includes(g));
        const excluded = exclDirect || exclRole || exclGroup;

        const inclAll = includeUsers.includes('All');
        const inclDirect = includeUsers.includes(identity.external_id ?? '');
        const inclRole = roleTemplateIds.some((t) => includeRoles.includes(t));
        const inclGroup = groupExternalIds.some((g) => includeGroups.includes(g));
        const included = inclAll || inclDirect || inclRole || inclGroup;

        if (!included && !excluded) continue;

        let reason = '';
        if (excluded) {
          reason = exclDirect
            ? 'Excluded (direct)'
            : exclRole
              ? 'Excluded (via role)'
              : 'Excluded (via group)';
        } else {
          reason = inclAll
            ? 'Included (all users)'
            : inclDirect
              ? 'Included (direct)'
              : inclRole
                ? 'Included (via role)'
                : 'Included (via group)';
        }

        result.push({ ...p, applicability: excluded ? 'Excluded' : 'Included', reason });
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

  const initials = $derived.by(() => {
    if (!identity?.name) return '??';
    return identity.name
      .split(' ')
      .map((w: string) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  });

  const filteredAlerts = $derived(
    alerts.filter(
      (a) =>
        a.name?.toLowerCase().includes(alertsSearch.toLowerCase()) ||
        a.description?.toLowerCase().includes(alertsSearch.toLowerCase())
    )
  );
  const filteredRoles = $derived(
    roles.filter((r) => r.name?.toLowerCase().includes(rolesSearch.toLowerCase()))
  );
  const filteredGroups = $derived(
    groups.filter((g) => g.name?.toLowerCase().includes(groupsSearch.toLowerCase()))
  );
  const filteredLicenses = $derived(
    licenses.filter((l) => l.friendly_name?.toLowerCase().includes(licensesSearch.toLowerCase()))
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
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary font-bold text-sm shrink-0"
        >
          {initials}
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <Sheet.Title class="text-base font-semibold leading-tight"
            >{identity?.name ?? ''}</Sheet.Title
          >
          <Sheet.Description class="text-xs text-muted-foreground leading-tight"
            >{identity?.email ?? ''}</Sheet.Description
          >
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        <Badge
          variant={identity?.enabled ? 'default' : 'destructive'}
          class={identity?.enabled ? 'bg-green-500/15 text-green-600 border-green-500/30' : ''}
        >
          {identity?.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
        {#if identity?.type}
          <Badge variant="outline">{identity.type}</Badge>
        {/if}
        <Badge
          variant={identity?.mfa_enforced ? 'default' : 'destructive'}
          class={identity?.mfa_enforced ? 'bg-green-500/15 text-green-600 border-green-500/30' : ''}
        >
          {identity?.mfa_enforced ? 'MFA Enforced' : 'MFA Not Enforced'}
        </Badge>
      </div>
    </Sheet.Header>

    <Separator class="shrink-0" />

    <div class="px-4 flex-1 flex flex-col min-h-0">
      <Tabs.Root bind:value={activeTab} class="flex flex-col flex-1 min-h-0">
        <Tabs.List class="grid grid-cols-5 shrink-0">
          <Tabs.Trigger value="alerts">Alerts</Tabs.Trigger>
          <Tabs.Trigger value="roles">Roles</Tabs.Trigger>
          <Tabs.Trigger value="groups">Groups</Tabs.Trigger>
          <Tabs.Trigger value="licenses">Licenses</Tabs.Trigger>
          <Tabs.Trigger value="policies">Policies</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="alerts" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="relative shrink-0">
            <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input bind:value={alertsSearch} placeholder="Search alerts..." class="pl-8" />
          </div>
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if alertsLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if alertsError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{alertsError}</span>
              </div>
            {:else if filteredAlerts.length === 0}
              <p class="text-sm text-muted-foreground py-4">No alerts found.</p>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredAlerts as alert}
                  <div class="rounded-md border bg-card px-3 py-2">
                    <p class="text-sm font-medium">{alert.name}</p>
                    {#if alert.description}
                      <p class="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </Tabs.Content>

        <Tabs.Content value="roles" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="relative shrink-0">
            <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input bind:value={rolesSearch} placeholder="Search roles..." class="pl-8" />
          </div>
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if rolesLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if rolesError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{rolesError}</span>
              </div>
            {:else if filteredRoles.length === 0}
              <p class="text-sm text-muted-foreground py-4">No roles found.</p>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredRoles as role}
                  <div class="rounded-md border bg-card px-3 py-2">
                    <p class="text-sm font-medium">{role.name}</p>
                    {#if role.description}
                      <p class="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </Tabs.Content>

        <Tabs.Content value="groups" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="relative shrink-0">
            <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input bind:value={groupsSearch} placeholder="Search groups..." class="pl-8" />
          </div>
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if groupsLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if groupsError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{groupsError}</span>
              </div>
            {:else if filteredGroups.length === 0}
              <p class="text-sm text-muted-foreground py-4">No groups found.</p>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredGroups as group}
                  <div class="rounded-md border bg-card px-3 py-2">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm font-medium">{group.name}</p>
                      <Badge variant="outline" class="text-xs shrink-0">{groupType(group)}</Badge>
                    </div>
                    {#if group.description}
                      <p class="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </Tabs.Content>

        <Tabs.Content value="licenses" class="mt-3 flex flex-col flex-1 min-h-0">
          <div class="relative shrink-0">
            <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input bind:value={licensesSearch} placeholder="Search licenses..." class="pl-8" />
          </div>
          <div class="mt-3 flex-1 overflow-y-auto">
            {#if licensesLoading}
              <div class="flex items-center justify-center py-8">
                <LoaderCircleIcon class="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            {:else if licensesError}
              <div class="flex items-center gap-2 text-destructive py-4">
                <AlertCircleIcon class="h-4 w-4" />
                <span class="text-sm">{licensesError}</span>
              </div>
            {:else if filteredLicenses.length === 0}
              <p class="text-sm text-muted-foreground py-4">No licenses assigned.</p>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredLicenses as license}
                  <div class="rounded-md border bg-card px-3 py-2">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm font-medium">{license.friendly_name}</p>
                      <Badge
                        variant={license.enabled ? 'default' : 'secondary'}
                        class={license.enabled
                          ? 'bg-green-500/15 text-green-600 border-green-500/30'
                          : ''}
                      >
                        {license.enabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
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
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {policy.reason} · {policy.policy_state}
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
