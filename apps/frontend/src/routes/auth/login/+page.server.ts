import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { loginFormSchema } from './_forms';

export const load: PageServerLoad = async () => {
  const form = await superValidate(null, zod4(loginFormSchema));
  return {
    form,
  };
};

export const actions: Actions = {
  login: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(loginFormSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const { error } = await locals.supabase.auth.signInWithPassword({
        email: form.data.username,
        password: form.data.password,
      });
      if (error) {
        throw error.message;
      }
    } catch (err) {
      return message(form, `Login failed: ${String(err)}`, {
        status: 500,
      });
    }

    throw redirect(302, '/');
  },
};
