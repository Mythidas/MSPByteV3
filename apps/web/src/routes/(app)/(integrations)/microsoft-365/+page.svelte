<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import { supabase } from '$lib/utils/supabase.js';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';

  let loading = $state(true);

  // Identity stats
  let totalIdentities = $state(0);
  let disabledIdentities = $state(0);
  let noMfaIdentities = $state(0);
  let noSignInIdentities = $state(0);
  let memberIdentities = $state(0);
  let guestIdentities = $state(0);

  // License stats
  let totalLicenseSKUs = $state(0);
  let totalConsumed = $state(0);
  let totalAvailable = $state(0);

  // Directory stats
  let totalGroups = $state(0);
  let totalRoles = $state(0);

  // Policy stats
  let enabledPolicies = $state(0);
  let disabledPolicies = $state(0);
  let mfaPolicies = $state(0);

  // Alert stats
  let activeAlerts = $state(0);

  $effect(() => {
    const link = scopeStore.currentLink;
    const tenantId = authStore.currentTenant?.id ?? '';

    const load = async () => {
      loading = true;

      const applyScope = (q: any) => {
        q.eq('tenant_id', tenantId);
        if (link) q.eq('link_id', link as string);
        return q;
      };

      const [
        identitiesTotal,
        identitiesDisabled,
        identitiesNoMfa,
        identitiesNoSignIn,
        identitiesMember,
        identitiesGuest,
        licensesData,
        groupsTotal,
        rolesTotal,
        policiesEnabled,
        policiesDisabled,
        policiesMfa,
        alertsActive,
      ] = await Promise.all([
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_identities' as any)
            .select('*', { count: 'exact', head: true })
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_identities' as any)
            .select('*', { count: 'exact', head: true })
            .eq('enabled', false)
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_identities' as any)
            .select('*', { count: 'exact', head: true })
            .eq('mfa_enforced', false)
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_identities' as any)
            .select('*', { count: 'exact', head: true })
            .eq('enabled', true)
            .or(
              `last_sign_in_at.is.null,last_sign_in_at.lt.${new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()}`
            )
            .or(
              `last_non_interactive_sign_in_at.is.null,last_non_interactive_sign_in_at.lt.${new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()}`
            )
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_identities')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'Member')
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_identities')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'Guest')
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_licenses' as any)
            .select('total_units,consumed_units,warning_units')
            .not('friendly_name', 'ilike', '%free%')
            .not('friendly_name', 'ilike', '%tria%')
            .not('friendly_name', 'ilike', '%Credits%')
            .not('friendly_name', 'ilike', '%Windows Store%')
            .not('friendly_name', 'ilike', '%Microsoft Power Apps for Developer%')
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_groups' as any)
            .select('*', { count: 'exact', head: true })
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_roles' as any)
            .select('*', { count: 'exact', head: true })
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_policies' as any)
            .select('*', { count: 'exact', head: true })
        ).eq('policy_state', 'enabled'),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_policies' as any)
            .select('*', { count: 'exact', head: true })
        ).eq('policy_state', 'disabled'),
        applyScope(
          supabase
            .schema('vendors')
            .from('m365_policies' as any)
            .select('*', { count: 'exact', head: true })
        ).eq('requires_mfa', true),
        (() => {
          const q = supabase
            .schema('views')
            .from('d_alerts_view' as any)
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'active');
          if (link) q.eq('link_id', link as string);
          return q;
        })(),
      ]);

      totalIdentities = identitiesTotal.count ?? 0;
      disabledIdentities = identitiesDisabled.count ?? 0;
      noMfaIdentities = identitiesNoMfa.count ?? 0;
      noSignInIdentities = identitiesNoSignIn.count ?? 0;
      memberIdentities = identitiesMember.count ?? 0;
      guestIdentities = identitiesGuest.count ?? 0;

      const licenses = (licensesData.data ?? []) as {
        total_units: number;
        consumed_units: number;
        warning_units: number;
      }[];
      totalLicenseSKUs = licenses.length;
      totalConsumed = licenses.reduce((acc, l) => acc + (l.consumed_units ?? 0), 0);
      totalAvailable = licenses.reduce(
        (acc, l) => acc + ((l.total_units ?? 0) - (l.consumed_units ?? 0)),
        0
      );

      totalGroups = groupsTotal.count ?? 0;
      totalRoles = rolesTotal.count ?? 0;

      enabledPolicies = policiesEnabled.count ?? 0;
      disabledPolicies = policiesDisabled.count ?? 0;
      mfaPolicies = policiesMfa.count ?? 0;

      activeAlerts = alertsActive.count ?? 0;

      loading = false;
    };

    load();
  });
</script>

<div class="flex flex-col gap-6 p-1">
  <h1 class="text-2xl font-bold">Overview</h1>

  <!-- Identities -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identities</h2>
    {#if !loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/microsoft-365/identities">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Total Identities</span>
                <span class="text-2xl font-bold">{totalIdentities}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/identities?view=disabled">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Disabled</span>
                <span class="text-2xl font-bold {disabledIdentities > 0 ? 'text-destructive' : ''}"
                  >{disabledIdentities}</span
                >
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/identities?view=no-mfa">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">MFA Not Enforced</span>
                <span class="text-2xl font-bold {noMfaIdentities > 0 ? 'text-warning' : ''}"
                  >{noMfaIdentities}</span
                >
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/identities?view=no-sign-in">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">No Recent Sign-In</span>
                <span
                  class="text-2xl font-bold {noSignInIdentities > 0 ? 'text-muted-foreground' : ''}"
                  >{noSignInIdentities}</span
                >
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/identities">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Members</span>
                <span class="text-2xl font-bold">{memberIdentities}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/identities">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Guests</span>
                <span class="text-2xl font-bold">{guestIdentities}</span>
              </div>
            </Card.Root>
          </a>
        </div>
      </FadeIn>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {#each Array(6) as _}
          <Card.Root class="p-4">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">—</span>
              <span class="text-2xl font-bold text-muted-foreground/30">—</span>
            </div>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Licenses -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Licenses</h2>
    {#if !loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/microsoft-365/licenses">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">License SKUs</span>
                <span class="text-2xl font-bold">{totalLicenseSKUs}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/licenses">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Seats Used</span>
                <span class="text-2xl font-bold">{totalConsumed}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/licenses">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Available Seats</span>
                <span class="text-2xl font-bold">{totalAvailable}</span>
              </div>
            </Card.Root>
          </a>
        </div>
      </FadeIn>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {#each Array(3) as _}
          <Card.Root class="p-4">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">—</span>
              <span class="text-2xl font-bold text-muted-foreground/30">—</span>
            </div>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Directory -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Directory</h2>
    {#if !loading}
      <FadeIn>
        <div class="grid grid-cols-2 gap-3">
          <a href="/microsoft-365/groups">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Total Groups</span>
                <span class="text-2xl font-bold">{totalGroups}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/roles">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Total Roles</span>
                <span class="text-2xl font-bold">{totalRoles}</span>
              </div>
            </Card.Root>
          </a>
        </div>
      </FadeIn>
    {:else}
      <div class="grid grid-cols-2 gap-3">
        {#each Array(2) as _}
          <Card.Root class="p-4">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">—</span>
              <span class="text-2xl font-bold text-muted-foreground/30">—</span>
            </div>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Conditional Access -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
      Conditional Access
    </h2>
    {#if !loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <a href="/microsoft-365/policies?view=enabled">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Enabled Policies</span>
                <span class="text-2xl font-bold text-primary">{enabledPolicies}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/policies?view=disabled">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Disabled Policies</span>
                <span
                  class="text-2xl font-bold {disabledPolicies > 0 ? 'text-muted-foreground' : ''}"
                  >{disabledPolicies}</span
                >
              </div>
            </Card.Root>
          </a>
          <a href="/microsoft-365/policies?view=mfa">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">MFA Required</span>
                <span class="text-2xl font-bold">{mfaPolicies}</span>
              </div>
            </Card.Root>
          </a>
        </div>
      </FadeIn>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {#each Array(3) as _}
          <Card.Root class="p-4">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">—</span>
              <span class="text-2xl font-bold text-muted-foreground/30">—</span>
            </div>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Alerts -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Alerts</h2>
    {#if !loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/microsoft-365/alerts">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Active Alerts</span>
                <span class="text-2xl font-bold {activeAlerts > 0 ? 'text-destructive' : ''}"
                  >{activeAlerts}</span
                >
              </div>
            </Card.Root>
          </a>
        </div>
      </FadeIn>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">—</span>
            <span class="text-2xl font-bold text-muted-foreground/30">—</span>
          </div>
        </Card.Root>
      </div>
    {/if}
  </section>
</div>
