import { supabase } from '$lib/utils/supabase.js';
import { parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';
import type { AnyQueryBuilder } from '@workspace/shared/lib/utils/supabase-helper';

export interface MSPAgentOverviewStats {
  totalAgents: number;
  staleAgents: number;
  totalTickets: number;
  recentTickets: number;
}

export function createMSPAgentOverview(
  getParams: () => { tenantId: string; siteId?: string | null } | null
) {
  let data = $state<MSPAgentOverviewStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, siteId } = params;
    loading = true;
    error = null;

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const applyScope = (q: AnyQueryBuilder): AnyQueryBuilder => {
      q.eq('tenant_id', tenantId);
      if (siteId) q.eq('site_id', siteId);
      return q;
    };

    Promise.all([
      applyScope(
        supabase.from('agents').select('*', { count: 'exact', head: true })
      ),
      applyScope(
        supabase
          .from('agents')
          .select('*', { count: 'exact', head: true })
          .lt('updated_at', sixtyDaysAgo)
      ),
      applyScope(
        supabase.from('agent_tickets').select('*', { count: 'exact', head: true })
      ),
      applyScope(
        supabase
          .from('agent_tickets')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo)
      ),
    ])
      .then(([total, stale, totalTickets, recentTickets]) => {
        data = {
          totalAgents: total.count ?? 0,
          staleAgents: stale.count ?? 0,
          totalTickets: totalTickets.count ?? 0,
          recentTickets: recentTickets.count ?? 0,
        };
      })
      .catch((e) => {
        error = parseSafeErrorMessage(e);
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
