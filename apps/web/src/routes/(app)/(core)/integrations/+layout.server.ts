import type { Tables } from '@workspace/shared/types/database';
import type { LayoutServerLoad } from './$types';

async function getIntegration({ locals, url }: { locals: App.Locals; url: URL }) {
  const integrationId = url.pathname.split('/').at(-1);
  if (!integrationId) return null;

  const { data } = await locals.supabase
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .eq('tenant_id', locals.tenant.id)
    .is('deleted_at', null)
    .single();
  return (data as Tables<'public', 'integrations'>) ?? null;
}

async function getLinks({ locals, url }: { locals: App.Locals; url: URL }) {
  const integrationId = url.pathname.split('/').at(-1);
  if (!integrationId) return [];

  const { data } = await locals.supabase
    .from('integration_links')
    .select('*')
    .eq('integration_id', integrationId)
    .eq('tenant_id', locals.tenant.id);

  return (data as Tables<'public', 'integration_links'>[]) ?? null;
}

async function getSites({ locals }: { locals: App.Locals }) {
  const { data } = await locals.supabase
    .from('sites')
    .select('*')
    .eq('tenant_id', locals.tenant.id);

  return (data as Tables<'public', 'sites'>[]) ?? null;
}

export const load: LayoutServerLoad = async ({ locals, url }) => {
  return {
    getIntegration: getIntegration({ locals, url }),
    getLinks: getLinks({ locals, url }),
    getSites: getSites({ locals }),
  };
};

