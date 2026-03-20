import { supabase } from '$lib/utils/supabase.js';

export function createM365LicenseOptions(getTenantId: () => string | null) {
  let options = $state<{ label: string; value: string }[]>([]);
  let loading = $state(true);

  $effect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    loading = true;

    Promise.resolve(
      supabase
        .schema('vendors')
        .from('m365_licenses')
        .select('external_id,friendly_name')
        .eq('tenant_id', tenantId)
        .order('friendly_name'),
    ).then(({ data }) => {
      options = (data ?? []).map((l) => ({
        label: l.friendly_name,
        value: l.external_id,
      }));
      loading = false;
    }).catch(() => {
      loading = false;
    });
  });

  return {
    get options() { return options; },
    get loading() { return loading; },
  };
}
