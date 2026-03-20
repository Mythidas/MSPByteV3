import { supabase } from '$lib/utils/supabase.js';

export function createM365TenantGrid(getTenantId: () => string | null) {
  let links = $state<{ id: string; name: string }[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    loading = true;
    error = null;

    (supabase as any)
      .from('integration_links')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'microsoft-365')
      .eq('status', 'active')
      .then((res: any) => {
        links = (res.data ?? []) as { id: string; name: string }[];
      })
      .catch((e: any) => {
        error = e?.message ?? 'Failed to load tenants';
      })
      .finally(() => {
        loading = false;
      });
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
