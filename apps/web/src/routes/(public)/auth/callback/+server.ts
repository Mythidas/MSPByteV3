import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';

export const GET: RequestHandler = async ({ url, locals }) => {
  let route = '/';

  try {
    const code = url.searchParams.get('code');
    if (code) {
      const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
      if (!data)
        route = `/auth/login?error=${encodeURIComponent('Failed to authenticate. Please try again or contact support.')}`;
      else route = '/home';

      if (error) {
        Logger.error({
          module: '/auth/callback',
          context: 'GET',
          message: `Failed to authenticate: ${error.message}`,
        });
      }
    }
  } catch (err) {
    Logger.error({
      module: '/auth/callback',
      context: 'GET',
      message: `Failed to authenticate: ${parseSafeErrorMessage(err)}`,
    });

    route = `/auth/login?error=${encodeURIComponent('Failed to authenticate. Please try again or contact support.')}`;
  }

  return redirect(303, route);
};
