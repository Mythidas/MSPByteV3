import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Tables } from '@workspace/shared/types/database';

export const load: PageServerLoad = async ({ locals, params }) => {
  const { data: site } = await locals.supabase
    .from('sites')
    .select('*')
    .eq('id', params.id)
    .eq('tenant_id', locals.tenant!.id)
    .single();

  if (!site) error(404, 'Site not found');

  const { data: links } = await locals.supabase
    .from('integration_links')
    .select('*')
    .eq('site_id', params.id)
    .eq('tenant_id', locals.tenant!.id);

  return {
    site: site as Tables<'public', 'sites'>,
    links: (links ?? []) as Tables<'public', 'integration_links'>[],
  };
};
