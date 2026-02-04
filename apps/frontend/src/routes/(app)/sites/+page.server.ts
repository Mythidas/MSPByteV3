import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  return {
    tenant_id: locals.session.tenant_id
  };
};
