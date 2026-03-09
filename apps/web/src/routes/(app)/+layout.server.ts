import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.user || !locals.role || !locals.tenant) {
    throw redirect(303, '/auth/login');
  }

  return {
    user: locals.user,
    role: locals.role,
    tenant: locals.tenant,
  };
};
