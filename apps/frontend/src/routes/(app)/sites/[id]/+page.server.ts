import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const orm = locals.orm;

  const [siteResult, linksResult, groupLinksResult] = await Promise.all([
    orm.selectSingle('public', 'sites', (q) => q.eq('id', params.id)),
    orm.select('public', 'site_to_integration', (q) => q.eq('site_id', params.id)),
    orm.select('public', 'site_to_group', (q) => q.eq('site_id', params.id)),
  ]);

  if (!siteResult.data) {
    error(404, 'Site not found');
  }

  const site = siteResult.data;
  const rawLinks = linksResult.data?.rows ?? [];
  const groupLinks = groupLinksResult.data?.rows ?? [];

  // Per-integration entity and alert counts
  const countResults = await Promise.all(
    rawLinks.flatMap((link) => [
      orm.getCount('public', 'entities', (q) =>
        q.eq('site_id', params.id).eq('integration_id', link.integration_id)
      ),
      orm.getCount('public', 'alerts', (q) =>
        q.eq('site_id', params.id).eq('integration_id', link.integration_id)
      ),
    ])
  );

  const integrationLinks = rawLinks.map((link, i) => ({
    ...link,
    entityCount: countResults[i * 2].data ?? 0,
    alertCount: countResults[i * 2 + 1].data ?? 0,
  }));

  // Resolve parent site name if parent_id is set
  let parentSite: { id: string; name: string } | null = null;
  if (site.parent_id) {
    const { data: parent } = await orm.selectSingle('public', 'sites', (q) =>
      q.eq('id', site.parent_id!)
    );
    if (parent) {
      parentSite = { id: parent.id, name: parent.name };
    }
  }

  // Resolve group names
  const groupIds = groupLinks.map((g) => g.group_id);
  let groups: { id: string; name: string; description: string | null }[] = [];
  if (groupIds.length > 0) {
    const { data: groupData } = await orm.select('public', 'site_groups', (q) =>
      q.in('id', groupIds)
    );
    groups = (groupData?.rows ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
    }));
  }

  return {
    site,
    integrationLinks,
    groups,
    parentSite,
  };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    const form = await request.formData();
    const name = form.get('name')?.toString().trim();

    if (!name) {
      return fail(400, { error: 'Name is required.' });
    }

    const { error: updateError } = await locals.orm.update('public', 'sites', params.id, {
      name,
    });

    if (updateError) {
      return fail(500, { error: updateError.message });
    }

    return { success: true };
  },
};
