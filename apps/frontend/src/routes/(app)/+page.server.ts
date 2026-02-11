import { redirect } from '@sveltejs/kit';
import { MODULES } from '$lib/config/modules';
import { hasPermission } from '$lib/utils/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const attributes = (locals.role?.attributes ?? null) as Record<string, unknown> | null;
  for (const mod of MODULES) {
    if (!mod.permission || hasPermission(attributes, mod.permission)) {
      throw redirect(303, mod.navLinks[0].href);
    }
  }
  throw redirect(303, '/sites');
};
