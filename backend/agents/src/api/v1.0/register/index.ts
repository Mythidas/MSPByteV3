import { getSupabase } from '@/lib/supabase.js';
import { FastifyInstance } from 'fastify';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { randomUUID } from 'node:crypto';

export function isVersionGte(value: string, target: string): boolean {
  const splitV1 = value.split('.').map(Number);
  const splitV2 = target.split('.').map(Number);

  const len = Math.max(splitV1.length, splitV2.length);

  for (let i = 0; i < len; i++) {
    const num1 = splitV1[i] ?? 0; // default to 0 if undefined
    const num2 = splitV2[i] ?? 0;

    if (num1 > num2) return true;
    if (num1 < num2) return false;
    // if equal, continue to next part
  }

  // all parts equal
  return true;
}

export default async function (fastify: FastifyInstance) {
  fastify.post('/', async (req) => {
    try {
      const {
        site_id,
        device_id,
        hostname,
        version,
        guid,
        mac,
        platform,
        ip_address,
        ext_address,
      } = req.body as string as {
        site_id?: string;
        device_id?: string;
        hostname?: string;
        version?: string;
        guid?: string;
        platform?: string;
        mac?: string;
        ip_address?: string;
        ext_address?: string;
        username?: string;
      };

      if (!site_id || !hostname || !version || !platform) {
        return Logger.response(
          {
            error: {
              module: 'v1.0/register',
              context: 'POST',
              message: 'Site, Hostname, Platform and Version are required for registration',
            },
          },
          400
        );
      }

      const supabase = getSupabase();

      const { data: site } = await supabase.from('sites').select().eq('id', site_id).single();

      if (!site) {
        return Logger.response(
          {
            error: {
              module: 'v1.0/register',
              context: 'POST',
              message: `Invalid site_uid provided: ${site_id} | ${hostname} | ${version} | ${platform}`,
            },
          },
          400
        );
      }

      const isValidVer = isVersionGte(version, '0.1.22');
      let query = supabase.from('agents').select();

      if (!isValidVer) query = query.eq('site_id', site.id); // This check can be removed once agents are updated
      if (device_id) query = query.eq('id', device_id);
      else query = query.eq('guid', guid || '');

      const { data: agent } = await query.single();
      const calculatedGuid = !agent ? randomUUID() : guid;

      if (!agent) {
        Logger.info({
          context: '/v1.0/register',
          module: 'POST',
          message: `New agent registration, generating UUID: ${calculatedGuid}`,
        });
      }

      const result = !agent
        ? await supabase
            .from('agents')
            .insert({
              site_id: site.id,
              tenant_id: site.tenant_id,
              guid: calculatedGuid!,
              hostname,
              platform,
              version,
              mac_address: mac,
              ip_address: ip_address,
              ext_address: ext_address,
            })
            .select('id, guid')
            .single()
        : await supabase
            .from('agents')
            .update({
              site_id: site.id,
              guid: calculatedGuid,
              hostname,
              version,
              mac_address: mac,
              ip_address: ip_address,
              ext_address: ext_address,
              updated_at: new Date().toISOString(),
            })
            .eq('id', agent.id)
            .select('id, guid')
            .single();

      if (!result.data) {
        return Logger.response(
          {
            error: {
              module: 'v1.0/register',
              context: 'POST',
              message: 'Failed to create agent',
            },
          },
          500
        );
      }

      return Logger.response(
        {
          data: {
            device_id: result.data.id,
            guid: result.data.guid,
          },
        },
        200
      );
    } catch (err) {
      Logger.error({
        context: '/v1.0/register',
        module: 'POST',
        message: `Failed to register agent: ${err}`,
      });

      return Logger.response(
        {
          error: {
            module: 'v1.0/register',
            context: 'POST',
            message: 'Failed to create agent',
          },
        },
        500
      );
    }
  });
}
