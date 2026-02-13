import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const [{ data: sites }, { data: groups }, { data: siteToGroup }] = await Promise.all([
    locals.supabase.from('sites').select('id, name, parent_id').order('name', { ascending: true }),
    locals.supabase.from('site_groups').select('id, name').order('name', { ascending: true }),
    locals.supabase.from('site_to_group').select('site_id, group_id'),
  ]);

  return {
    user: locals.user!,
    role: locals.role ?? null,
    sites: sites ?? [],
    groups: groups ?? [],
    siteToGroup: siteToGroup ?? [],
  };
};
