<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import { supabase } from '$lib/utils/supabase.js';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { INTEGRATIONS } from '@workspace/core/config/integrations';
  import TenantCard, { type TenantStats } from './_tenant-card.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import { Search, BellRing, ShieldAlert, ShieldCheck, ChevronRight } from '@lucide/svelte';

  let search = $state('');

  // ── Scoped (single-tenant) state ──
  let loadingScoped = $state(true);

  let totalIdentities = $state(0);
  let disabledIdentities = $state(0);
  let noMfaIdentities = $state(0);
  let noSignInIdentities = $state(0);
  let memberIdentities = $state(0);
  let guestIdentities = $state(0);

  let totalLicenseSKUs = $state(0);
  let totalConsumed = $state(0);
  let totalAvailable = $state(0);

  let totalGroups = $state(0);
  let totalRoles = $state(0);

  let enabledPolicies = $state(0);
  let disabledPolicies = $state(0);
  let mfaPolicies = $state(0);

  let activeAlerts = $state(0);

  // Compliance (scoped)
  let compliancePass = $state(0);
  let complianceFail = $state(0);
  let complianceTotal = $state(0);

  type TopFailingCheck = { id: string; name: string; severity: string };
  let topFailingChecks = $state<TopFailingCheck[]>([]);

  // ── Unscoped (grid) state ──
  let loadingGrid = $state(true);
  let tenantStats = $state<TenantStats[]>([]);

  // ── Scoped effect: runs only when a link is selected ──
  $effect(() => {
    const link = scopeStore.currentLink;
    if (!link) return;

    const tenantId = authStore.currentTenant?.id ?? '';
    const integration = INTEGRATIONS['microsoft-365'];

    const load = async () => {
      loadingScoped = true;

      const applyScope = (q: any) => {
        q.eq('tenant_id', tenantId);
        q.eq('link_id', link as string);
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
        complianceResultsRaw,
        complianceChecksRaw,
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
            .eq('status', 'active')
            .in(
              'entity_type',
              (integration.supportedTypes as any[])
                .filter((t) => t.entityKey)
                .map((t) => t.entityKey)
            );
          q.eq('link_id', link as string);
          return q;
        })(),
        // slot 13: compliance results (scoped, newest-first for dedup)
        (supabase as any)
          .from('compliance_results')
          .select('framework_check_id, status, evaluated_at')
          .eq('tenant_id', tenantId)
          .eq('link_id', link as string)
          .order('evaluated_at', { ascending: false }),
        // slot 14: check definitions (for severity)
        (supabase as any)
          .from('compliance_framework_checks')
          .select('id, name, severity')
          .eq('tenant_id', tenantId),
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

      const SEVERITY_ORDER: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };
      const seenChecks = new Set<string>();
      let cPass = 0,
        cFail = 0,
        cTotal = 0;
      const failingCheckIds = new Set<string>();

      for (const row of (complianceResultsRaw.data ?? []) as {
        framework_check_id: string;
        status: string;
      }[]) {
        if (seenChecks.has(row.framework_check_id)) continue;
        seenChecks.add(row.framework_check_id);
        cTotal++;
        if (row.status === 'pass') cPass++;
        else {
          cFail++;
          failingCheckIds.add(row.framework_check_id);
        }
      }
      compliancePass = cPass;
      complianceFail = cFail;
      complianceTotal = cTotal;

      const allChecks = (complianceChecksRaw.data ?? []) as TopFailingCheck[];
      topFailingChecks = allChecks
        .filter((c) => failingCheckIds.has(c.id))
        .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99))
        .slice(0, 5);

      loadingScoped = false;
    };

    load();
  });

  // ── Unscoped effect: runs only when no link is selected ──
  $effect(() => {
    const link = scopeStore.currentLink;
    if (link) return;

    const tenantId = authStore.currentTenant?.id ?? '';
    const integration = INTEGRATIONS['microsoft-365'];

    const load = async () => {
      loadingGrid = true;

      const [linksRes, identitiesRes, licensesRes, complianceRes, alertsRes] = await Promise.all([
        (supabase as any)
          .from('integration_links')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('integration_id', 'microsoft-365'),
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('link_id, mfa_enforced, enabled')
          .eq('tenant_id', tenantId),
        supabase
          .schema('vendors')
          .from('m365_licenses' as any)
          .select('link_id, total_units, consumed_units')
          .eq('tenant_id', tenantId)
          .not('friendly_name', 'ilike', '%free%')
          .not('friendly_name', 'ilike', '%tria%')
          .not('friendly_name', 'ilike', '%Credits%')
          .not('friendly_name', 'ilike', '%Windows Store%')
          .not('friendly_name', 'ilike', '%Microsoft Power Apps for Developer%'),
        (supabase as any)
          .from('compliance_results')
          .select('link_id, framework_check_id, status, evaluated_at')
          .eq('tenant_id', tenantId)
          .order('evaluated_at', { ascending: false }),
        supabase
          .schema('views')
          .from('d_alerts_view' as any)
          .select('link_id')
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
          .in(
            'entity_type',
            (integration.supportedTypes as any[]).filter((t) => t.entityKey).map((t) => t.entityKey)
          ),
      ]);

      const links = (linksRes.data ?? []) as { id: string; name: string }[];
      const identities = (identitiesRes.data ?? []) as unknown as {
        link_id: string;
        mfa_enforced: boolean;
        enabled: boolean;
      }[];
      const licenseRows = (licensesRes.data ?? []) as unknown as {
        link_id: string;
        total_units: number;
        consumed_units: number;
      }[];
      const complianceRows = (complianceRes.data ?? []) as {
        link_id: string;
        framework_check_id: string;
        status: string;
        evaluated_at: string;
      }[];
      const alertRows = (alertsRes.data ?? []) as unknown as { link_id: string }[];

      // Dedup compliance: newest-first, first occurrence per (link, check) wins
      const seenCompliance = new Set<string>();
      const complianceByLink = new Map<string, { pass: number; total: number }>();
      for (const row of complianceRows) {
        const key = `${row.link_id}:${row.framework_check_id}`;
        if (seenCompliance.has(key)) continue;
        seenCompliance.add(key);
        const entry = complianceByLink.get(row.link_id) ?? { pass: 0, total: 0 };
        entry.total++;
        if (row.status === 'pass') entry.pass++;
        complianceByLink.set(row.link_id, entry);
      }

      tenantStats = links.map((link) => {
        const linkIdentities = identities.filter((i) => i.link_id === link.id);
        const linkLicenses = licenseRows.filter((l) => l.link_id === link.id);
        const linkAlerts = alertRows.filter((a) => a.link_id === link.id).length;
        const linkCompliance = complianceByLink.get(link.id) ?? { pass: 0, total: 0 };

        const consumed = linkLicenses.reduce((acc, l) => acc + (l.consumed_units ?? 0), 0);
        const total = linkLicenses.reduce((acc, l) => acc + (l.total_units ?? 0), 0);

        return {
          link,
          identities: {
            total: linkIdentities.length,
            noMfa: linkIdentities.filter((i) => !i.mfa_enforced).length,
            disabled: linkIdentities.filter((i) => !i.enabled).length,
          },
          licenses: { consumed, total },
          compliance: linkCompliance,
          alerts: linkAlerts,
        };
      });

      loadingGrid = false;
    };

    load();
  });

  const filteredStats = $derived(
    tenantStats
      .filter((s) => s.link.name?.toLowerCase().includes(search?.trim()?.toLowerCase()))
      .sort((a, b) => a.link?.name?.localeCompare(b.link?.name))
  );

  const compliancePassRate = $derived(
    complianceTotal > 0 ? Math.round((compliancePass / complianceTotal) * 100) : 0
  );
  const licenseUtilPct = $derived(
    totalConsumed + totalAvailable > 0
      ? Math.round((totalConsumed / (totalConsumed + totalAvailable)) * 100)
      : 0
  );

  // Health banner: compliance card tints
  const compBannerTint = $derived(
    complianceTotal === 0
      ? ''
      : compliancePassRate < 50
        ? 'bg-destructive/5 border-destructive/20'
        : compliancePassRate < 80
          ? 'bg-warning/5 border-warning/20'
          : 'bg-success/5 border-success/20'
  );
  const compBannerIconTint = $derived(
    complianceTotal === 0
      ? 'bg-muted'
      : compliancePassRate < 50
        ? 'bg-destructive/10'
        : compliancePassRate < 80
          ? 'bg-warning/10'
          : 'bg-success/10'
  );
  const compBannerTextTint = $derived(
    complianceTotal === 0
      ? 'text-muted-foreground'
      : compliancePassRate < 50
        ? 'text-destructive'
        : compliancePassRate < 80
          ? 'text-warning'
          : 'text-success'
  );

  // License progress bar colors
  const licenseBarColor = $derived(
    licenseUtilPct >= 90 ? 'bg-destructive' : licenseUtilPct >= 75 ? 'bg-amber-500' : 'bg-success'
  );
  const licenseTextColor = $derived(
    licenseUtilPct >= 90 ? 'text-destructive' : licenseUtilPct >= 75 ? 'text-amber-500' : ''
  );

  // Compliance section: pass rate card tints
  const compRateTint = $derived(
    compliancePassRate < 50
      ? 'bg-destructive/5 border-destructive/20'
      : compliancePassRate < 80
        ? 'bg-warning/5 border-warning/20'
        : 'bg-success/5 border-success/20'
  );
  const compRateTextTint = $derived(
    compliancePassRate < 50
      ? 'text-destructive'
      : compliancePassRate < 80
        ? 'text-warning'
        : 'text-success'
  );

  const SEVERITY_CLASSES: Record<string, string> = {
    critical: 'bg-destructive/15 text-destructive border border-destructive/30',
    high: 'bg-warning/15 text-warning border border-warning/30',
    medium: 'bg-amber-500/15 text-amber-500 border border-amber-500/30',
    low: 'bg-muted text-muted-foreground border border-border',
    info: 'bg-muted text-muted-foreground border border-border',
  };
</script>

<div class="flex flex-col size-full overflow-hidden">
  {#if scopeStore.currentLink}
    <div class="flex flex-col gap-2 p-1 overflow-y-auto flex-1">
      <h1 class="text-2xl font-bold">Overview</h1>

      {#if !loadingScoped}
        <FadeIn class="flex flex-col gap-4">
          <!-- Health Banner -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
            <!-- Active Alerts -->
            <a href="/microsoft-365/alerts">
              <Card.Root
                class="p-4 hover:border-primary/50 cursor-pointer transition-colors {activeAlerts >
                0
                  ? 'bg-destructive/5 border-destructive/20'
                  : ''}"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex items-center justify-center size-9 rounded-full shrink-0 {activeAlerts >
                    0
                      ? 'bg-destructive/10'
                      : 'bg-muted'}"
                  >
                    <BellRing
                      class="size-4 {activeAlerts > 0
                        ? 'text-destructive'
                        : 'text-muted-foreground'}"
                    />
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs text-muted-foreground">Active Alerts</span>
                    <span
                      class="text-2xl font-bold leading-none {activeAlerts > 0
                        ? 'text-destructive'
                        : ''}">{activeAlerts}</span
                    >
                  </div>
                </div>
              </Card.Root>
            </a>

            <!-- MFA Not Enforced -->
            <a href="/microsoft-365/identities?view=no-mfa">
              <Card.Root
                class="p-4 hover:border-primary/50 cursor-pointer transition-colors {noMfaIdentities >
                0
                  ? 'bg-warning/5 border-warning/20'
                  : ''}"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex items-center justify-center size-9 rounded-full shrink-0 {noMfaIdentities >
                    0
                      ? 'bg-warning/10'
                      : 'bg-muted'}"
                  >
                    <ShieldAlert
                      class="size-4 {noMfaIdentities > 0
                        ? 'text-warning'
                        : 'text-muted-foreground'}"
                    />
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs text-muted-foreground">MFA Not Enforced</span>
                    <span
                      class="text-2xl font-bold leading-none {noMfaIdentities > 0
                        ? 'text-warning'
                        : ''}">{noMfaIdentities}</span
                    >
                  </div>
                </div>
              </Card.Root>
            </a>

            <!-- Compliance % -->
            <a href="/microsoft-365/compliance">
              <Card.Root
                class="p-4 hover:border-primary/50 cursor-pointer transition-colors {compBannerTint}"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex items-center justify-center size-9 rounded-full shrink-0 {compBannerIconTint}"
                  >
                    <ShieldCheck class="size-4 {compBannerTextTint}" />
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs text-muted-foreground">Compliance</span>
                    <span class="text-2xl font-bold leading-none {compBannerTextTint}">
                      {complianceTotal === 0 ? '—' : `${compliancePassRate}%`}
                    </span>
                  </div>
                </div>
              </Card.Root>
            </a>
          </div>

          <!-- Identities -->
          <section class="flex flex-col gap-3">
            <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Identities
            </h2>
            <!-- Risk row -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <a href="/microsoft-365/identities?view=no-mfa">
                <Card.Root
                  class="p-4 hover:border-primary/50 cursor-pointer transition-colors {noMfaIdentities >
                  0
                    ? 'bg-warning/5 border-warning/20'
                    : ''}"
                >
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">No MFA</span>
                    <span class="text-2xl font-bold {noMfaIdentities > 0 ? 'text-warning' : ''}"
                      >{noMfaIdentities}</span
                    >
                  </div>
                </Card.Root>
              </a>
              <a href="/microsoft-365/identities?view=disabled">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Disabled</span>
                    <span class="text-2xl font-bold">{disabledIdentities}</span>
                  </div>
                </Card.Root>
              </a>
              <a href="/microsoft-365/identities?view=no-sign-in">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">No Recent Sign-In</span>
                    <span class="text-2xl font-bold text-muted-foreground"
                      >{noSignInIdentities}</span
                    >
                  </div>
                </Card.Root>
              </a>
            </div>
            <!-- Neutral row -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <a href="/microsoft-365/identities">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Total</span>
                    <span class="text-2xl font-bold">{totalIdentities}</span>
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
          </section>

          <!-- Licenses -->
          <section class="flex flex-col gap-3">
            <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Licenses
            </h2>
            <a href="/microsoft-365/licenses">
              <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                <div class="flex flex-col gap-3">
                  <div class="flex items-center justify-between">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-xs text-muted-foreground">Seat Utilization</span>
                      <span class="text-2xl font-bold {licenseTextColor}">{licenseUtilPct}%</span>
                    </div>
                    <div class="flex flex-col items-end gap-0.5 text-right">
                      <span class="text-xs text-muted-foreground"
                        >{totalConsumed} / {totalConsumed + totalAvailable} seats</span
                      >
                      <span class="text-xs text-muted-foreground">{totalLicenseSKUs} SKUs</span>
                    </div>
                  </div>
                  <div class="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all {licenseBarColor}"
                      style="width: {licenseUtilPct}%"
                    ></div>
                  </div>
                </div>
              </Card.Root>
            </a>
          </section>

          <!-- Compliance -->
          {#if complianceTotal > 0}
            <section class="flex flex-col gap-3">
              <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Compliance
              </h2>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <a href="/microsoft-365/compliance">
                  <Card.Root
                    class="p-4 hover:border-primary/50 cursor-pointer transition-colors {compRateTint}"
                  >
                    <div class="flex flex-col gap-1">
                      <span class="text-xs text-muted-foreground">Pass Rate</span>
                      <span class="text-2xl font-bold {compRateTextTint}"
                        >{compliancePassRate}%</span
                      >
                    </div>
                  </Card.Root>
                </a>
                <a href="/microsoft-365/compliance">
                  <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                    <div class="flex flex-col gap-1">
                      <span class="text-xs text-muted-foreground">Passing</span>
                      <span class="text-2xl font-bold text-success">{compliancePass}</span>
                    </div>
                  </Card.Root>
                </a>
                <a href="/microsoft-365/compliance">
                  <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                    <div class="flex flex-col gap-1">
                      <span class="text-xs text-muted-foreground">Failing</span>
                      <span
                        class="text-2xl font-bold {complianceFail > 0 ? 'text-destructive' : ''}"
                        >{complianceFail}</span
                      >
                    </div>
                  </Card.Root>
                </a>
                <a href="/microsoft-365/compliance">
                  <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                    <div class="flex flex-col gap-1">
                      <span class="text-xs text-muted-foreground">Total Checks</span>
                      <span class="text-2xl font-bold">{complianceTotal}</span>
                    </div>
                  </Card.Root>
                </a>
              </div>

              {#if topFailingChecks.length > 0}
                <Card.Root class="overflow-hidden">
                  <div class="px-4 py-3 border-b">
                    <span
                      class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      >Top Failing Checks</span
                    >
                  </div>
                  {#each topFailingChecks as check (check.id)}
                    <a
                      href="/microsoft-365/compliance"
                      class="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors border-b last:border-b-0"
                    >
                      <span
                        class="text-xs font-medium px-2 py-0.5 rounded capitalize shrink-0 {SEVERITY_CLASSES[
                          check.severity
                        ] ?? SEVERITY_CLASSES['info']}"
                      >
                        {check.severity}
                      </span>
                      <span class="text-sm flex-1 truncate">{check.name}</span>
                      <ChevronRight class="size-4 text-muted-foreground shrink-0" />
                    </a>
                  {/each}
                </Card.Root>
              {/if}
            </section>
          {/if}

          <!-- Directory & Policies -->
          <section class="flex flex-col gap-3">
            <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Directory &amp; Policies
            </h2>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <a href="/microsoft-365/groups">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Groups</span>
                    <span class="text-2xl font-bold">{totalGroups}</span>
                  </div>
                </Card.Root>
              </a>
              <a href="/microsoft-365/roles">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Roles</span>
                    <span class="text-2xl font-bold">{totalRoles}</span>
                  </div>
                </Card.Root>
              </a>
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
                    <span class="text-2xl font-bold">{disabledPolicies}</span>
                  </div>
                </Card.Root>
              </a>
              <a href="/microsoft-365/policies?view=mfa">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">MFA Policies</span>
                    <span class="text-2xl font-bold">{mfaPolicies}</span>
                  </div>
                </Card.Root>
              </a>
            </div>
          </section>
        </FadeIn>
      {:else}
        <!-- Skeleton: Health Banner -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
          {#each Array(3) as _}
            <Card.Root class="p-4">
              <div class="flex items-center gap-3">
                <div class="size-9 rounded-full bg-muted-foreground/15 shrink-0"></div>
                <div class="flex flex-col gap-1.5 flex-1">
                  <span class="h-3 w-24 rounded bg-muted-foreground/15"></span>
                  <span class="h-6 w-12 rounded bg-muted-foreground/15"></span>
                </div>
              </div>
            </Card.Root>
          {/each}
        </div>

        <!-- Skeleton: Identities -->
        <section class="flex flex-col gap-3">
          <span class="h-3 w-20 rounded bg-muted-foreground/15"></span>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {#each Array(6) as _}
              <Card.Root class="p-4">
                <div class="flex flex-col gap-1.5">
                  <span class="h-3 w-24 rounded bg-muted-foreground/15"></span>
                  <span class="h-7 w-12 rounded bg-muted-foreground/15"></span>
                </div>
              </Card.Root>
            {/each}
          </div>
        </section>

        <!-- Skeleton: Licenses -->
        <section class="flex flex-col gap-3">
          <span class="h-3 w-16 rounded bg-muted-foreground/15"></span>
          <Card.Root class="p-4">
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div class="flex flex-col gap-1.5">
                  <span class="h-3 w-28 rounded bg-muted-foreground/15"></span>
                  <span class="h-7 w-16 rounded bg-muted-foreground/15"></span>
                </div>
                <div class="flex flex-col gap-1.5 items-end">
                  <span class="h-3 w-24 rounded bg-muted-foreground/15"></span>
                  <span class="h-3 w-16 rounded bg-muted-foreground/15"></span>
                </div>
              </div>
              <div class="w-full h-2 rounded-full bg-muted-foreground/15"></div>
            </div>
          </Card.Root>
        </section>

        <!-- Skeleton: Compliance -->
        <section class="flex flex-col gap-3">
          <span class="h-3 w-24 rounded bg-muted-foreground/15"></span>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {#each Array(4) as _}
              <Card.Root class="p-4">
                <div class="flex flex-col gap-1.5">
                  <span class="h-3 w-20 rounded bg-muted-foreground/15"></span>
                  <span class="h-7 w-12 rounded bg-muted-foreground/15"></span>
                </div>
              </Card.Root>
            {/each}
          </div>
          <Card.Root class="overflow-hidden">
            {#each Array(3) as _}
              <div class="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
                <span class="h-5 w-16 rounded bg-muted-foreground/15"></span>
                <span class="h-3 flex-1 rounded bg-muted-foreground/15"></span>
              </div>
            {/each}
          </Card.Root>
        </section>

        <!-- Skeleton: Directory & Policies -->
        <section class="flex flex-col gap-3">
          <span class="h-3 w-32 rounded bg-muted-foreground/15"></span>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {#each Array(5) as _}
              <Card.Root class="p-4">
                <div class="flex flex-col gap-1.5">
                  <span class="h-3 w-20 rounded bg-muted-foreground/15"></span>
                  <span class="h-7 w-12 rounded bg-muted-foreground/15"></span>
                </div>
              </Card.Root>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {:else}
    <!-- Unscoped: per-tenant health grid -->
    <div class="flex flex-col size-full overflow-hidden">
      <!-- Fixed header -->
      <div class="flex items-center justify-between gap-4 p-1 pb-4 shrink-0">
        <h1 class="text-2xl font-bold">Tenants</h1>
        <div class="relative w-64">
          <Search
            class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
          />
          <Input bind:value={search} placeholder="Search tenants..." class="pl-8" />
        </div>
      </div>

      <!-- Scrollable grid -->
      <div class="flex-1 overflow-y-auto">
        {#if loadingGrid}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 p-1">
            {#each Array(4) as _}
              <Card.Root class="p-4">
                <div class="flex items-center justify-between mb-4">
                  <span class="h-4 w-32 rounded bg-muted-foreground/20"></span>
                  <span class="h-4 w-20 rounded bg-muted-foreground/20"></span>
                </div>
                <div class="flex flex-col gap-3">
                  {#each Array(3) as _}
                    <div class="h-3 w-full rounded bg-muted-foreground/10"></div>
                  {/each}
                </div>
              </Card.Root>
            {/each}
          </div>
        {:else if filteredStats.length === 0}
          <div class="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <span class="text-sm"
              >{tenantStats.length === 0
                ? 'No Microsoft 365 tenants connected.'
                : 'No tenants match your search.'}</span
            >
          </div>
        {:else}
          <FadeIn>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 p-1">
              {#each filteredStats as stats (stats.link.id)}
                <TenantCard {stats} />
              {/each}
            </div>
          </FadeIn>
        {/if}
      </div>
    </div>
  {/if}
</div>
