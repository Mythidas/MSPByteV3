import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { data: roles } = await locals.supabase
    .from('roles')
    .select('id, name, level, tenant_id')
    .order('level');

  return { roles: roles ?? [] };
};

export const actions: Actions = {
  createUser: async ({ locals, request }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const first_name = formData.get('first_name') as string;
    const last_name = formData.get('last_name') as string;
    const role_id = formData.get('role_id') as string;

    if (!email || !first_name || !last_name || !role_id) {
      return fail(400, { message: 'All fields are required' });
    }

    const { error } = await locals.supabase.from('users').insert([
      {
        email,
        first_name,
        last_name,
        role_id,
        tenant_id: locals.tenant!.id,
      },
    ]);

    if (error) {
      return fail(500, { message: error.message });
    }

    return { success: true };
  },

  deleteUser: async ({ locals, request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    if (!id) {
      return fail(400, { message: 'User ID required' });
    }

    if (id === locals.user!.id) {
      return fail(400, { message: 'Cannot delete yourself' });
    }

    const { error } = await locals.supabase.from('users').delete().eq('id', id);

    if (error) {
      return fail(500, { message: error.message });
    }

    return { success: true };
  },
};
