import { supabase } from '$lib/utils/supabase.js';
import { parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';

export function createM365TenantGrid(getTenantId: () => string | null) {
  let links = $state<{ id: string; name: string }[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    loading = true;
    error = null;

    void (async () => {
      try {
        const res = await supabase
          .from('integration_links')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('integration_id', 'microsoft-365')
          .eq('status', 'active');
        links = (res.data ?? []).map((l) => ({ id: l.id, name: l.name ?? '' }));
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
