import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector.js';
import { HaloPSAConfig } from '@workspace/shared/types/integrations/halopsa/index.js';
import { FastifyInstance } from 'fastify';
import { PerformanceTracker } from '@workspace/shared/lib/utils/performance.js';
import { logAgentApiCall } from '@/lib/agentLogger.js';
import { HaloPSAAsset } from '@workspace/shared/types/integrations/halopsa/assets.js';
import { getSupabase } from '@/lib/supabase.js';
import { Debug } from '@workspace/shared/lib/utils/debug';
import Encryption from '@workspace/shared/lib/utils/encryption';

export default async function (fastify: FastifyInstance) {
  fastify.post('/', async (req) => {
    const perf = new PerformanceTracker();
    let statusCode = 500;
    let ticketID: string | null = null;
    let errorMessage: string | undefined;

    try {
      const siteID = req.headers['x-site-id'] as string;
      const deviceID = req.headers['x-device-id'] as string;

      // Validate headers
      await perf.trackSpan('validate_headers', async () => {
        if (!siteID || !deviceID) {
          throw new Error('API headers invalid');
        }
      });

      if (!siteID || !deviceID) {
        statusCode = 401;
        errorMessage = 'API headers invalid';
        return Debug.response(
          {
            error: {
              module: 'v1.0/ticket/create',
              context: 'POST',
              message: 'API headers invalid',
            },
          },
          401
        );
      }

      const supabase = getSupabase();

      // Fetch agent, site, and integration config from database
      const [agent, site, psaIntegrationId, psaConfig, psaSiteMapping] = await perf.trackSpan(
        'db_fetch_records',
        async () => {
          const [agentRes, siteRes] = await Promise.all([
            supabase.from('agents').select().eq('id', deviceID).single(),
            supabase.from('sites').select().eq('id', siteID).single(),
          ]);

          if (!siteRes.data || !agentRes.data) {
            throw new Error('Resources not found');
          }

          // Get the msp-agent integration to find the PSA integration ID
          const { data: agentIntegration } = await supabase
            .from('integrations')
            .select('config')
            .eq('id', 'mspagent')
            .eq('tenant_id', siteRes.data.tenant_id)
            .single();

          if (!agentIntegration) {
            throw new Error('Agent integration not found');
          }

          const psaIntId = (agentIntegration.config as any)?.primaryPSA as string | undefined;
          if (!psaIntId) {
            return [agentRes.data, siteRes.data, null, null, null] as const;
          }

          // Fetch PSA integration config and site mapping in parallel
          const [psaIntegrationRes, psaSiteMappingRes] = await Promise.all([
            supabase
              .from('integrations')
              .select('config')
              .eq('id', psaIntId)
              .eq('tenant_id', siteRes.data.tenant_id)
              .single(),
            supabase
              .from('site_to_integration')
              .select('external_id')
              .eq('site_id', siteID)
              .eq('integration_id', psaIntId)
              .single(),
          ]);

          return [
            agentRes.data,
            siteRes.data,
            psaIntId,
            psaIntegrationRes.data,
            psaSiteMappingRes.data,
          ] as const;
        }
      );

      if (!psaConfig || !site || !agent || !psaSiteMapping) {
        statusCode = 404;
        errorMessage = 'PSA records not valid';
        return Debug.response(
          {
            error: {
              module: 'v1.0/ticket/create',
              context: 'POST',
              message: 'PSA records not valid',
            },
          },
          404
        );
      }

      Debug.log({
        module: 'v1.0/ticket/create',
        context: 'POST',
        message: `Creating ticket for agent ${agent.hostname} (DeviceID: ${agent.id}) (SiteID: ${siteID})`,
      });

      const config = psaConfig.config as HaloPSAConfig;
      config.clientSecret =
        (await Encryption.decrypt(config.clientSecret, process.env.ENCRYPTION_KEY!)) || '';
      const connector = new HaloPSAConnector(psaConfig.config as HaloPSAConfig);

      // Parse and validate request body (multipart/form-data or JSON)
      const body = await perf.trackSpan('parse_request_body', async () => {
        const contentType = req.headers['content-type'] || '';

        // Handle multipart/form-data
        if (contentType.includes('multipart/form-data')) {
          const formData: Record<string, any> = {};
          let screenshotFile: { filename: string; data: Buffer } | null = null;

          // Check if req has multipart method
          if (!req.isMultipart || !req.isMultipart()) {
            throw new Error('Request is not multipart');
          }

          const parts = req.parts();

          for await (const part of parts) {
            if (part.type === 'file') {
              if (part.fieldname === 'screenshot') {
                const chunks: Buffer[] = [];
                for await (const chunk of part.file) {
                  chunks.push(chunk);
                }
                screenshotFile = {
                  filename: part.filename,
                  data: Buffer.concat(chunks),
                };
              }
            } else {
              // Field type - has value property
              formData[part.fieldname] = (part as any).value;
            }
          }

          // If screenshot file exists, add it to formData
          if (screenshotFile) {
            formData.screenshot = {
              name: screenshotFile.filename,
              data: screenshotFile.data.toString('base64'),
            };
          }

          return formData as {
            screenshot?: {
              name?: string;
              data?: string;
            };
            link?: string;
            summary: string;
            description?: string;
            name: string;
            email: string;
            phone: string;
            impact: string;
            urgency: string;
            rmm_id?: string;
          };
        }

        // Handle JSON (legacy support)
        return JSON.parse(req.body as string) as {
          screenshot?: {
            name?: string;
            data?: string;
          };
          link?: string;
          summary: string;
          description?: string;
          name: string;
          email: string;
          phone: string;
          impact: string;
          urgency: string;
          rmm_id?: string;
        };
      });

      // Fetch assets from PSA using the site mapping external_id
      const psaSiteId = psaSiteMapping.external_id;
      const assetResponse = await perf.trackSpan('psa_fetch_assets', async () => {
        if (!body.rmm_id) {
          return { data: [] };
        }
        return await connector.getAssets(psaSiteId);
      });

      if ('error' in assetResponse) {
        Debug.log({
          module: 'v1.0/ticket/create',
          context: 'psa_fetch_assets',
          message: 'Failed to fetch assets from PSA',
        });
        return;
      }

      const { data: assets } = assetResponse;

      if (!assets) {
        Debug.log({
          module: 'v1.0/ticket/create',
          context: 'POST',
          message: 'Failed to fetch halo assets',
        });
      }

      Debug.log({
        module: 'v1.0/ticket/create',
        context: 'POST',
        message: `Found ${assets?.length || 0} HaloPSAAssets (HaloSiteID: ${psaSiteId})`,
      });

      // Find matching asset
      const asset = perf.trackSpanSync('find_matching_asset', () => {
        return (assets || []).find((a: HaloPSAAsset) => {
          Debug.log({
            module: 'v1.0/ticket/create',
            context: 'POST',
            message: `Evaluating HaloPSAAsset (HaloAssetID: ${a.id}) (HaloRMMID: ${a.datto_id})`,
          });

          if (body.rmm_id) {
            return a.datto_id === body.rmm_id || a.inventory_number === agent.hostname;
          }

          return a.inventory_number === agent.hostname;
        });
      });

      if (asset) {
        Debug.log({
          module: 'v1.0/ticket/create',
          context: 'POST',
          message: `HaloAsset found for ${agent.hostname} (HaloID: ${asset?.id})`,
        });
      }

      // Upload screenshot if provided
      if (body.screenshot && body.screenshot.data && body.screenshot.name) {
        await perf.trackSpan('psa_upload_screenshot', async () => {
          const binary = atob(body.screenshot!.data!);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          const blob = new Blob([bytes], { type: 'image/png' });
          const { data } = await connector.uploadImage(blob);
          if (data) {
            body.link = data;

            Debug.log({
              module: 'v1.0/ticket/create',
              context: 'POST',
              message: `Image uploaded to HaloPSA for ${agent.hostname} (Link: ${body.link})`,
            });
          }
        });
      }

      // Resolve parent company ID from HaloPSA API
      let psaParentCompanyId: number | undefined;
      await perf.trackSpan('psa_resolve_parent_company', async () => {
        const sitesResponse = await connector.getSites();
        if ('data' in sitesResponse && sitesResponse.data) {
          const haloSite = sitesResponse.data.find((s: any) => String(s.id) === psaSiteId);
          if (haloSite) {
            psaParentCompanyId = haloSite.client_id;
          }
        }
      });

      const urgencyMap: Record<string, string> = {
        '1': '5',
        '2': '6',
        '3': '7',
      };
      const ticketInfo = {
        siteId: Number(psaSiteId),
        clientId: psaParentCompanyId || 0,
        summary: body.summary,
        details: body.description || '',
        user: {
          name: body.name,
          email: body.email,
          phone: body.phone,
        },
        impact: body.impact,
        urgency: urgencyMap[String(body.urgency)],
        deviceName: agent.hostname,
        assets: asset ? [asset.id] : [],
        images: body.link ? [body.link] : [],
      };

      // Create ticket in PSA
      const { data: createdTicketID } = await perf.trackSpan('psa_create_ticket', async () => {
        return await connector.createTicket(ticketInfo);
      });

      if (!createdTicketID) {
        statusCode = 500;
        errorMessage = 'Failed to create ticket';
        return Debug.response(
          {
            error: {
              module: 'v1.0/ticket/create',
              context: 'POST',
              message: 'Failed to create ticket',
            },
          },
          500
        );
      }

      ticketID = createdTicketID;

      Debug.log({
        module: 'v1.0/ticket/create',
        context: 'POST',
        message: `Ticket create in HaloPSA for ${agent.hostname} (TicketID: ${ticketID})`,
      });

      statusCode = 200;

      // Log ticket usage for billing
      await perf.trackSpan('log_ticket_usage', async () => {
        try {
          await supabase.from('agent_tickets').insert({
            agent_id: agent.id,
            site_id: site.id,
            ticket_id: String(ticketID),
          });
        } catch (err) {
          // Log error but don't fail the request
          Debug.log({
            module: 'v1.0/ticket/create',
            context: 'log_ticket_usage',
            message: `Failed to log ticket usage: ${err}`,
          });
        }
      });

      // Log successful API call
      await logAgentApiCall(
        {
          endpoint: '/v1.0/ticket/create',
          method: 'POST',
          agentId: agent.id,
          siteId: site.id,
          tenantId: agent.tenant_id,
          psaSiteId: psaSiteId,
          rmmDeviceId: body.rmm_id,
        },
        {
          statusCode: 200,
          externalId: String(ticketID),
          requestMetadata: {
            ...ticketInfo,
          },
          responseMetadata: {
            ticket_id: ticketID,
          },
        },
        perf
      );

      return Debug.response(
        {
          data: ticketID,
        },
        200
      );
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);

      // Log failed API call
      const siteID = req.headers['x-site-id'] as string;
      const deviceID = req.headers['x-device-id'] as string;

      if (siteID && deviceID) {
        // Get tenant_id for logging (best effort)
        try {
          const supabase = getSupabase();
          const { data: agent } = await supabase
            .from('agents')
            .select()
            .eq('id', deviceID)
            .single();

          if (agent) {
            await logAgentApiCall(
              {
                endpoint: '/v1.0/ticket/create',
                method: 'POST',
                agentId: agent.id,
                siteId: agent.site_id,
                tenantId: agent.tenant_id,
              },
              {
                statusCode,
                errorMessage,
                requestMetadata: {},
              },
              perf
            );
          }
        } catch {
          // Ignore logging errors
        }
      }

      return Debug.response(
        {
          error: {
            module: 'v1.0/ticket/create',
            context: 'POST',
            message: `Failed to process route: ${err}`,
          },
        },
        500
      );
    }
  });
}
