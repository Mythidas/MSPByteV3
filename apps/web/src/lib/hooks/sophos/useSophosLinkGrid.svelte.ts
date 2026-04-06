import { supabase } from '$lib/utils/supabase.js';
import { isString, parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';

export type Tier = 'MDR' | 'XDR' | 'Endpoint';
export interface SophosLinkGridRow {
  id: string;
  siteName: string;
  siteId: string | null;
  status: string | null;
  disposition: string | null;
  note: string | null;
  serverTier: Tier | null;
  userTier: Tier | null;
}

export function createSophosLinkGrid(getTenantId: () => string | null) {
  let links = $state<SophosLinkGridRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    loading = true;
    error = null;

    void (async () => {
      try {
        const [linksRes, tiersRes] = await Promise.all([
          supabase
            .from('integration_links')
            .select('id, name, site_id, status, disposition, note, sites(id, name)')
            .eq('tenant_id', tenantId)
            .eq('integration_id', 'sophos-partner'),
          supabase
            .schema('views')
            .from('sophos_license_tiers')
            .select('link_id, server_tier, user_tier')
            .eq('tenant_id', tenantId),
        ]);

        const isTier = (value: unknown): value is Tier => {
          return isString(value) && ['MDR', 'XDR', 'Endpoint'].includes(value);
        };

        const tierMap = new Map<string, { serverTier: Tier | null; userTier: Tier | null }>();
        for (const row of tiersRes.data ?? []) {
          if (row.link_id) {
            tierMap.set(row.link_id, {
              serverTier: isTier(row.server_tier) ? row.server_tier : null,
              userTier: isTier(row.user_tier) ? row.user_tier : null,
            });
          }
        }

        const rows: SophosLinkGridRow[] = (linksRes.data ?? []).map((l) => ({
          id: l.id,
          siteName: l.sites?.name ?? l.name ?? '',
          siteId: l.site_id,
          status: l.status,
          disposition: l.disposition,
          note: l.note,
          serverTier: tierMap.get(l.id)?.serverTier ?? null,
          userTier: tierMap.get(l.id)?.userTier ?? null,
        }));

        // Default sort: active first, then alphabetical
        rows.sort((a, b) => {
          const aDisp = a.status === 'dispositioned';
          const bDisp = b.status === 'dispositioned';
          if (aDisp !== bDisp) return aDisp ? 1 : -1;
          return a.siteName.localeCompare(b.siteName);
        });

        links = rows;
      } catch (e) {
        error = parseSafeErrorMessage(e);
      } finally {
        loading = false;
      }
    })();
  });

  return {
    get links() {
      return links;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}
