import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { data } = await locals.orm.select('public', 'roles');

  return {
    roles: data?.rows ?? [],
  };
};
