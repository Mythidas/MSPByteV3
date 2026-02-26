import type { PageServerLoad } from './$types';
import { getConnectionIdForScope } from '$lib/utils/scope-filter';

export const load: PageServerLoad = async ({ locals, url }) => {
  const scope = url.searchParams.get('scope');
  const scopeId = url.searchParams.get('scopeId');

  const filterConnectionId = getConnectionIdForScope(scope, scopeId);

  let query = locals.supabase
    .schema('views')
    .from('d_entities_view')
    .select('external_id, display_name')
    .eq('integration_id', 'microsoft-365')
    .eq('entity_type', 'license')
    .not('external_id', 'is', null)
    .order('display_name');

  if (filterConnectionId) {
    query = query.eq('connection_id', filterConnectionId);
  }

  const { data: licenses } = await query;

  return {
    licenseOptions: (licenses ?? []).map((l) => ({
      label: l.display_name ?? l.external_id ?? '',
      value: JSON.stringify([{ skuId: l.external_id }]),
    })),
    licenseMap: Object.fromEntries(
      (licenses ?? [])
        .filter((l) => l.external_id)
        .map((l) => [l.external_id!, l.display_name ?? l.external_id ?? ''])
    ) as Record<string, string>,
  };
};
