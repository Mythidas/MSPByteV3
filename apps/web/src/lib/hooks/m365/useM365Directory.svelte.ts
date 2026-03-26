import { supabase } from '$lib/utils/supabase.js';
import type { DirectoryStats, PolicyStats } from './types.js';

export interface DirectoryAndPolicyStats {
  directory: DirectoryStats;
  policies: PolicyStats;
}

export function createM365Directory(getParams: () => { tenantId: string; linkId: string } | null) {
  let data = $state<DirectoryAndPolicyStats | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, linkId } = params;
    loading = true;
    error = null;

    const applyScope = (q: any) => q.eq('tenant_id', tenantId).eq('link_id', linkId);

    Promise.all([
      applyScope(
        supabase.schema('vendors').from('m365_groups').select('*', { count: 'exact', head: true })
      ),
      supabase.schema('definitions').from('m365_roles').select('*', { count: 'exact', head: true }),
      applyScope(
        supabase.schema('vendors').from('m365_policies').select('*', { count: 'exact', head: true })
      ).eq('policy_state', 'enabled'),
      applyScope(
        supabase.schema('vendors').from('m365_policies').select('*', { count: 'exact', head: true })
      ).eq('policy_state', 'disabled'),
    ])
      .then(([groups, roles, policiesEnabled, policiesDisabled]) => {
        data = {
          directory: {
            groups: groups.count ?? 0,
            roles: roles.count ?? 0,
          },
          policies: {
            enabled: policiesEnabled.count ?? 0,
            disabled: policiesDisabled.count ?? 0,
          },
        };
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load directory data';
      })
      .finally(() => {
        loading = false;
      });
  });

  return {
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}
