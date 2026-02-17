import { generateAgentGuid } from '@/lib/utils.js';
import { getSupabase } from '@/lib/supabase.js';
import { FastifyInstance } from 'fastify';
import { Debug } from '@workspace/shared/lib/utils/debug';

export default async function (fastify: FastifyInstance) {
  fastify.post('/', async (req) => {
    try {
      const { site_id, hostname, version, guid, mac, platform, ip_address, ext_address, username } =
        req.body as string as {
          site_id?: string;
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
        return Debug.response(
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
        return Debug.response(
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

      // Generate GUID using the new utility function
      const calculatedGuid = generateAgentGuid(guid, mac, hostname, String(site.id));
      const { data: agent } = await supabase
        .from('agents')
        .select()
        .eq('guid', calculatedGuid)
        .single();

      const result = !agent
        ? await supabase
            .from('agents')
            .insert({
              site_id: site.id,
              tenant_id: site.tenant_id,
              guid: calculatedGuid,
              hostname,
              platform,
              version,
              mac_address: mac,
              ip_address: ip_address,
              ext_address: ext_address,
            })
            .select('id')
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
            .select('id')
            .single();

      if (!result.data) {
        return Debug.response(
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

      return Debug.response(
        {
          data: {
            device_id: result.data.id,
            guid: calculatedGuid,
          },
        },
        200
      );
    } catch (err) {
      Debug.error({
        context: '/v1.0/register',
        module: 'POST',
        message: `Failed to register agent: ${err}`,
      });

      return Debug.response(
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
