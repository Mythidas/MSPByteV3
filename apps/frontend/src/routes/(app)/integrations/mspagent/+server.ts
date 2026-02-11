import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import { Encryption } from '$lib/server/encryption';
import type { ORM } from '@workspace/shared/lib/utils/orm';

const getDattoConnector = async (orm: ORM) => {
  const { data } = await orm.selectSingle('public', 'integrations', (q) => q.eq('id', 'dattormm'));
  if (!data) return null;

  const config = data.config as any;
  config.apiSecretKey = Encryption.decrypt(config.apiSecretKey);
  return new DattoRMMConnector(config);
};

const getVariableName = async (orm: ORM) => {
  const { data: agentConfig } = await orm.selectSingle('public', 'integrations', (q) =>
    q.eq('id', 'mspagent')
  );
  return (agentConfig?.config as any)?.siteVariableName || 'MSPSiteCode';
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  const { action, ...params } = body;

  switch (action) {
    case 'pushVariable':
      return handlePushVariable(locals.orm, params);
    case 'checkVariable':
      return handleCheckVariable(locals.orm, params);
    case 'bulkCheck':
      return handleBulkCheck(locals.orm, params);
    case 'bulkPush':
      return handleBulkPush(locals.orm, params);
    default:
      return json({ message: `Unknown action: ${action}` }, { status: 400 });
  }
};

async function handlePushVariable(orm: ORM, params: any) {
  try {
    const { siteId, rmmSiteId } = params as { siteId: string; rmmSiteId: string };
    const variableName = await getVariableName(orm);

    const connector = await getDattoConnector(orm);
    if (!connector) {
      return json({ message: 'DattoRMM integration not configured' }, { status: 400 });
    }

    const { error } = await connector.setSiteVariable(rmmSiteId, variableName, siteId);
    if (error) {
      return json({ message: `Failed to push variable: ${error.message}` }, { status: 500 });
    }

    return json({ success: true, message: 'Variable pushed successfully' });
  } catch (err) {
    return json({ message: `Failed to push variable: ${String(err)}` }, { status: 500 });
  }
}

async function handleCheckVariable(orm: ORM, params: any) {
  try {
    const { siteId, rmmSiteId } = params as { siteId: string; rmmSiteId: string };
    const variableName = await getVariableName(orm);

    const connector = await getDattoConnector(orm);
    if (!connector) {
      return json({ message: 'DattoRMM integration not configured' }, { status: 400 });
    }

    const { data: value, error } = await connector.getSiteVariable(rmmSiteId, variableName);
    if (error) {
      return json({ status: 'unknown', siteId });
    }

    return json({ status: value === siteId ? 'set' : 'not_set', siteId });
  } catch {
    return json({ status: 'unknown', siteId: '' });
  }
}

async function handleBulkCheck(orm: ORM, params: any) {
  try {
    const { items } = params as { items: { siteId: string; rmmSiteId: string }[] };
    const variableName = await getVariableName(orm);

    const connector = await getDattoConnector(orm);
    if (!connector) {
      return json({ message: 'DattoRMM integration not configured' }, { status: 400 });
    }

    const results = await Promise.allSettled(
      items.map(async ({ siteId, rmmSiteId }) => {
        const { data: value, error } = await connector.getSiteVariable(rmmSiteId, variableName);
        if (error) return { siteId, status: 'unknown' };
        const status = value === siteId ? 'set' : 'not_set';
        return { siteId, status };
      })
    );

    const statusMap: Record<string, string> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        statusMap[result.value.siteId] = result.value.status;
      }
    }

    return json({ statusMap });
  } catch (err) {
    return json({ message: `Bulk check failed: ${String(err)}` }, { status: 500 });
  }
}

async function handleBulkPush(orm: ORM, params: any) {
  try {
    const { items } = params as { items: { siteId: string; rmmSiteId: string }[] };
    const variableName = await getVariableName(orm);

    const connector = await getDattoConnector(orm);
    if (!connector) {
      return json({ message: 'DattoRMM integration not configured' }, { status: 400 });
    }

    const results = await Promise.allSettled(
      items.map(async ({ siteId, rmmSiteId }) => {
        const { error } = await connector.setSiteVariable(rmmSiteId, variableName, siteId);
        return { siteId, success: !error, error: error?.message };
      })
    );

    const resultMap: Record<string, { success: boolean; error?: string }> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap[result.value.siteId] = {
          success: result.value.success,
          error: result.value.error,
        };
      }
    }

    return json({ resultMap });
  } catch (err) {
    return json({ message: `Bulk push failed: ${String(err)}` }, { status: 500 });
  }
}
