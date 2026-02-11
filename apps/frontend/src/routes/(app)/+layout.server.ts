import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(301, '/auth/login');
  }

  const { data: sites } = await locals.supabase
    .from('sites')
    .select('id, name')
    .order('name', { ascending: true });

  return {
    user: locals.user,
    role: locals.role ?? null,
    sites: sites ?? [],
  };
};
