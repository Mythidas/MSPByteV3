import { HaloPSAConnector } from "@workspace/shared/lib/integrations/halopsa/connector.js";
import { HaloPSATicketHandler } from "@workspace/shared/lib/integrations/halopsa/ticket-handler.js";
import { HaloPSAConfig } from "@workspace/shared/types/integrations/halopsa/index.js";
import { FastifyInstance } from "fastify";
import { PerformanceTracker } from "@workspace/shared/lib/utils/performance.js";
import { logAgentApiCall } from "@/lib/agentLogger.js";
import { HaloPSAAsset } from "@workspace/shared/types/integrations/halopsa/assets.js";
import { HaloPSASite } from "@workspace/shared/types/integrations/halopsa/sites.js";
import { getSupabase } from "@/lib/supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import Encryption from "@workspace/shared/lib/utils/encryption";
import z from "zod";

const AgentIntegrationConfigSchema = z
  .object({ primaryPsa: z.string().optional() })
  .catch({ primaryPsa: undefined });

const PSAConfigSchema = z
  .object({
    url: z.string().default(""),
    clientId: z.string().default(""),
    clientSecret: z.string().default(""),
  })
  .catch({ url: "", clientId: "", clientSecret: "" });

const BodySchema = z.object({
  screenshot: z
    .object({ name: z.string().optional(), data: z.string().optional() })
    .optional(),
  link: z.string().optional(),
  summary: z.string(),
  description: z.string().optional(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  impact: z.string(),
  urgency: z.string(),
  rmm_id: z.string().optional(),
});

export default function (fastify: FastifyInstance) {
  fastify.post("/", async (req) => {
    const perf = new PerformanceTracker();
    let statusCode = 500;
    let ticketID: string | null = null;

    try {
      const siteID = String(req.headers["x-site-id"]);
      const deviceID = String(req.headers["x-device-id"]);

      if (!siteID || !deviceID) {
        throw new Error("API headers invalid");
      }

      if (!siteID || !deviceID) {
        statusCode = 401;
        throw new Error("API headers invalid");
      }

      const supabase = getSupabase();

      // Fetch agent, site, and integration config from database
      const [agent, site, psaConfig, psaSiteMapping] = await perf.trackSpan(
        "db_fetch_records",
        async () => {
          const [agentRes, siteRes] = await Promise.all([
            supabase.from("agents").select().eq("id", deviceID).single(),
            supabase.from("sites").select().eq("id", siteID).single(),
          ]);

          if (!siteRes.data || !agentRes.data) {
            throw new Error("Resources not found");
          }

          // Get the msp-agent integration to find the PSA integration ID
          const { data: agentIntegration } = await supabase
            .from("integrations")
            .select("config")
            .eq("id", "mspagent")
            .eq("tenant_id", siteRes.data.tenant_id)
            .single();

          if (!agentIntegration) {
            throw new Error("Agent integration not found");
          }

          const psaIntId = AgentIntegrationConfigSchema.parse(
            agentIntegration.config,
          ).primaryPsa;
          if (!psaIntId) {
            return [agentRes.data, siteRes.data, null, null, null] as const;
          }

          // Fetch PSA integration config and site mapping in parallel
          const [psaIntegrationRes, psaSiteMappingRes] = await Promise.all([
            supabase
              .from("integrations")
              .select("config")
              .eq("id", psaIntId)
              .eq("tenant_id", siteRes.data.tenant_id)
              .single(),
            supabase
              .from("integration_links")
              .select("external_id")
              .eq("site_id", siteID)
              .eq("integration_id", psaIntId)
              .single(),
          ]);

          return [
            agentRes.data,
            siteRes.data,
            psaIntegrationRes.data,
            psaSiteMappingRes.data,
          ] as const;
        },
      );

      if (!psaConfig || !site || !agent) {
        statusCode = 404;
        throw new Error(
          `PSA records not valid [SiteID: ${site.id}, AgentID: ${agent.id}, HasConfig: ${!!psaConfig}]`,
        );
      }

      Logger.info({
        module: "v1.0/ticket/create",
        context: "POST",
        message: `Creating ticket for agent ${agent.hostname} (DeviceID: ${agent.id}) (SiteID: ${siteID})`,
      });

      const config: HaloPSAConfig = PSAConfigSchema.parse(psaConfig.config);

      config.clientSecret =
        Encryption.decrypt(
          config.clientSecret ?? "",
          process.env.ENCRYPTION_KEY!,
        ) || "";
      const connector = new HaloPSAConnector(config, agent.tenant_id);
      const handler = new HaloPSATicketHandler(connector);

      // Parse and validate request body (multipart/form-data or JSON)
      const body = await perf.trackSpan("parse_request_body", async () => {
        const contentType = req.headers["content-type"] || "";

        // Handle multipart/form-data
        if (contentType.includes("multipart/form-data")) {
          const formData: Record<string, unknown> = {};
          let screenshotFile: { filename: string; data: Buffer } | null = null;

          // Check if req has multipart method
          if (!req.isMultipart || !req.isMultipart()) {
            throw new Error("Request is not multipart");
          }

          const parts = req.parts();

          for await (const part of parts) {
            if (part.type === "file") {
              if (part.fieldname === "screenshot") {
                const chunks: Buffer[] = [];
                for await (const chunk of part.file) {
                  if (Buffer.isBuffer(chunk)) chunks.push(chunk);
                }
                screenshotFile = {
                  filename: part.filename,
                  data: Buffer.concat(chunks),
                };
              }
            } else {
              // Field type - has value property
              formData[part.fieldname] = part.value;
            }
          }

          // If screenshot file exists, add it to formData
          if (screenshotFile) {
            formData.screenshot = {
              name: screenshotFile.filename,
              data: screenshotFile.data.toString("base64"),
            };
          }

          return BodySchema.parse(formData);
        }

        // Handle JSON (legacy support)
        return BodySchema.parse(typeof req.body === "string" ? req.body : "");
      });

      // Fetch assets from PSA using the site mapping external_id
      const psaSiteId = psaSiteMapping?.external_id;
      const assets = await perf.trackSpan("psa_fetch_assets", async () => {
        if (!body.rmm_id || !psaSiteId) return [];
        try {
          return await connector.asset.list(psaSiteId);
        } catch {
          Logger.info({
            module: "v1.0/ticket/create",
            context: "psa_fetch_assets",
            message: "Failed to fetch assets from PSA",
          });
          return [];
        }
      });

      Logger.info({
        module: "v1.0/ticket/create",
        context: "POST",
        message: `Found ${assets.length} HaloPSAAssets (HaloSiteID: ${psaSiteId})`,
      });

      // Find matching asset
      const asset = perf.trackSpanSync("find_matching_asset", () => {
        return assets.find((a: HaloPSAAsset) => {
          if (body.rmm_id) {
            return (
              a.datto_id === body.rmm_id ||
              a.inventory_number === agent.hostname
            );
          }

          return a.inventory_number === agent.hostname;
        });
      });

      if (asset) {
        Logger.info({
          module: "v1.0/ticket/create",
          context: "POST",
          message: `HaloAsset found for ${agent.hostname} (HaloID: ${asset?.id})`,
        });
      }

      // Fetch contacts from PSA using the site mapping external_id
      const contact = await perf.trackSpan("psa_fetch_contact", async () => {
        if (!body.email) return undefined;
        try {
          return await connector.users.get(body.email);
        } catch {
          return undefined;
        }
      });

      if (contact) {
        Logger.info({
          module: "v1.0/ticket/create",
          context: "POST",
          message: `HaloContact found for ${contact.name} (HaloID: ${contact.id})`,
        });
      }

      // Upload screenshot if provided
      if (body.screenshot && body.screenshot.data && body.screenshot.name) {
        await perf.trackSpan("psa_upload_screenshot", async () => {
          const binary = atob(body.screenshot!.data!);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          const blob = new Blob([bytes], { type: "image/png" });
          const imageUrl = await connector.attachment.uploadImage(blob);
          if (imageUrl) {
            body.link = imageUrl;

            Logger.info({
              module: "v1.0/ticket/create",
              context: "POST",
              message: `Image uploaded to HaloPSA for ${agent.hostname} (Link: ${body.link})`,
            });
          }
        });
      }

      // Resolve parent company ID from HaloPSA API
      let psaParentCompanyId: number | undefined;
      await perf.trackSpan("psa_resolve_parent_company", async () => {
        try {
          const haloSites = await connector.site.list();
          const haloSite = haloSites.find(
            (s: HaloPSASite) => String(s.id) === psaSiteId,
          );
          if (haloSite) {
            psaParentCompanyId = haloSite.client_id;
          }
        } catch {
          // non-fatal — ticket will be created without parent company
        }
      });

      const urgencyMap: Record<string, string> = {
        "1": "5",
        "2": "6",
        "3": "7",
      };
      const ticketInfo = {
        siteId: psaSiteId ? Number(psaSiteId) : undefined,
        clientId: psaParentCompanyId,
        summary: body.summary,
        details: body.description || "",
        user: {
          id: contact?.id,
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
      ticketID = await perf.trackSpan("psa_create_ticket", async () =>
        handler.createTicket(ticketInfo),
      );

      if (!ticketID) {
        statusCode = 500;
        throw new Error("Failed to create ticket");
      }

      Logger.info({
        module: "v1.0/ticket/create",
        context: "POST",
        message: `Ticket create in HaloPSA for ${agent.hostname} (TicketID: ${ticketID})`,
      });

      statusCode = 200;

      await perf.trackSpan("log_ticket_usage", async () => {
        try {
          await supabase.from("agent_tickets").insert({
            agent_id: agent.id,
            site_id: site.id,
            tenant_id: site.tenant_id,
            ticket_id: String(ticketID),
            summary: ticketInfo.summary,
            meta: ticketInfo,
          });
        } catch (err) {
          Logger.info({
            module: "v1.0/ticket/create",
            context: "log_ticket_usage",
            message: `Failed to log ticket usage: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      });

      return Logger.response(
        {
          data: ticketID,
        },
        200,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Log failed API call
      const siteID = String(req.headers["x-site-id"]);
      const deviceID = String(req.headers["x-device-id"]);

      if (siteID && deviceID) {
        // Get tenant_id for logging (best effort)
        try {
          const supabase = getSupabase();
          const { data: agent } = await supabase
            .from("agents")
            .select()
            .eq("id", deviceID)
            .single();

          if (agent) {
            await logAgentApiCall(
              {
                endpoint: "/v1.0/ticket/create",
                method: "POST",
                agentId: agent.id,
                siteId: agent.site_id,
                tenantId: agent.tenant_id,
              },
              {
                statusCode,
                errorMessage,
                requestMetadata: {},
              },
              perf,
            );
          }
        } catch {
          // Ignore logging errors
        }
      }

      return Logger.response(
        {
          error: {
            module: "v1.0/ticket/create",
            context: "POST",
            message: `Failed to process route: ${errorMessage}`,
          },
        },
        500,
      );
    }
  });
}
