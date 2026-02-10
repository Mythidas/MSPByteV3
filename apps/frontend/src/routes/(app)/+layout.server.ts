import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(301, '/auth/login');
  }

  return {
    user: locals.user,
    role: locals.role ?? null,
  };
};
