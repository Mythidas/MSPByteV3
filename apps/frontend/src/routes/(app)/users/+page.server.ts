import { supabaseAdmin } from '$lib/server/supabase-admin';
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

    // Create auth user with a random password (they'll use Azure OAuth)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });

    if (authError) {
      return fail(400, { error: authError.message });
    }

    const authUser = authData.user;

    // Insert public.users profile row
    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id: authUser.id,
      email,
      first_name: firstName,
      last_name: lastName,
      role_id: roleId,
      tenant_id: tenantId,
    });

    if (profileError) {
      // Rollback: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      return fail(400, { error: profileError.message });
    }

    return { success: true };
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

    const { error: profileError } = await supabaseAdmin.from('users').delete().eq('id', userId);

    if (profileError) {
      return fail(400, { error: profileError.message });
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      return fail(400, { error: authError.message });
    }

    return { success: true };
  },
};
