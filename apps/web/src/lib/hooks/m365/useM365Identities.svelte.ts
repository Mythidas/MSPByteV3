import { supabase } from '$lib/utils/supabase.js';
import type { IdentityStats } from './types.js';

export function createM365Identities(getParams: () => { tenantId: string; linkId: string } | null) {
  let data = $state<IdentityStats | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, linkId } = params;
    loading = true;
    error = null;

    const applyScope = (q: any) => q.eq('tenant_id', tenantId).eq('link_id', linkId);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true }),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true })
          .eq('enabled', false),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true })
          .eq('mfa_enforced', false),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true })
          .eq('enabled', true)
          .or(`last_sign_in_at.is.null,last_sign_in_at.lt.${sixtyDaysAgo}`)
          .or(`last_non_interactive_sign_in_at.is.null,last_non_interactive_sign_in_at.lt.${sixtyDaysAgo}`),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true })
          .eq('type', 'Member'),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true })
          .eq('type', 'Guest'),
      ),
    ])
      .then(([total, disabled, noMfa, noSignIn, members, guests]) => {
        data = {
          total: total.count ?? 0,
          disabled: disabled.count ?? 0,
          noMfa: noMfa.count ?? 0,
          noSignIn: noSignIn.count ?? 0,
          members: members.count ?? 0,
          guests: guests.count ?? 0,
        };
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load identity data';
      })
      .finally(() => {
        loading = false;
      });
  });

  return {
    get data() { return data; },
    get loading() { return loading; },
    get error() { return error; },
  };
}
