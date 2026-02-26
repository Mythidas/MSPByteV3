import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const isM365 = url.pathname.startsWith('/microsoft-365');

  const [{ data: sites }, { data: groups }, { data: siteToGroup }] = await Promise.all([
    locals.supabase.from('sites').select('id, name').order('name', { ascending: true }),
    locals.supabase.from('site_groups').select('id, name').order('name', { ascending: true }),
    locals.supabase.from('site_to_group').select('site_id, group_id'),
  ]);

  let connections: { id: string; name: string }[] = [];
  if (isM365) {
    const { data } = await locals.supabase
      .from('integration_connections')
      .select('id, name')
      .eq('integration_id', 'microsoft-365')
      .eq('status', 'active')
      .order('name');
    connections = data ?? [];
  }

  return {
    user: locals.user!,
    role: locals.role ?? null,
    sites: sites ?? [],
    groups: groups ?? [],
    siteToGroup: siteToGroup ?? [],
    connections,
  };
};
