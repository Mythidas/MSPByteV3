import { supabase } from '$lib/utils/supabase.js';
import { parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';

export interface SophosLinkGridRow {
  id: string;
  siteName: string;
  siteId: string | null;
  status: string | null;
  disposition: string | null;
  note: string | null;
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
        const res = await (supabase
          .from('integration_links')
          .select('id, name, site_id, status, disposition, note, sites(id, name)')
          .eq('tenant_id', tenantId)
          .eq('integration_id', 'sophos-partner') as any);

        const rows: SophosLinkGridRow[] = (res.data ?? []).map((l: any) => ({
          id: l.id,
          siteName: (l.sites as any)?.name ?? l.name ?? '',
          siteId: l.site_id,
          status: l.status,
          disposition: l.disposition,
          note: l.note,
        }));

        // Sort: active first, then dispositioned; alphabetical within each group
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
