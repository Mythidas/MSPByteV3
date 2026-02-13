import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { data } = await locals.supabase
    .from('roles')
    .select('id, name, level, tenant_id')
    .order('level', { ascending: true });

  return {
    roles: data ?? [],
  };
};

export const actions: Actions = {
  createUser: async ({ request, locals }) => {
    const form = await request.formData();
    const email = form.get('email')?.toString().trim();
    const firstName = form.get('first_name')?.toString().trim();
    const lastName = form.get('last_name')?.toString().trim();
    const roleId = form.get('role_id')?.toString();

    if (!email || !firstName || !lastName || !roleId) {
      return fail(400, { error: 'All fields are required.' });
    }

    const tenantId = locals.user?.tenant_id;
    if (!tenantId) {
      return fail(403, { error: 'No tenant context.' });
    }

    // Insert public.users profile row
    const { error: profileError } = await locals.supabase.from('users').insert({
      email,
      first_name: firstName,
      last_name: lastName,
      role_id: roleId,
      tenant_id: tenantId,
    });

    return { success: !profileError };
  },

  deleteUser: async ({ request, locals }) => {
    const form = await request.formData();
    const userId = form.get('user_id')?.toString();

    if (!userId) {
      return fail(400, { error: 'User ID is required.' });
    }

    if (userId === locals.user?.id) {
      return fail(400, { error: 'You cannot delete yourself.' });
    }

    const { error: profileError } = await locals.supabase.from('users').delete().eq('id', userId);

    if (profileError) {
      return fail(400, { error: profileError.message });
    }

    return { success: true };
  },
};
