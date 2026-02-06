import { Encryption } from '$lib/server/encryption';
import { AutoTaskConnector } from '@workspace/shared/lib/connectors/AutoTaskConnector';
import { CoveConnector } from '@workspace/shared/lib/connectors/CoveConnector';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import { SophosPartnerConnector } from '@workspace/shared/lib/connectors/SophosConnector';
import type { SiteReport, Mismatch, MismatchType, ReconciliationReport } from './types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendProgress(current: number, total: number, siteName: string) {
        const data = JSON.stringify({ current, total, siteName });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      function sendError(message: string) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }

      try {
        console.log('Starting reconciliation report generation...');

        // 1. Load all sites from database
        const { data: sites, error: sitesError } = await locals.supabase
          .from('sites')
          .select('*')
          .order('name');

        if (sitesError) {
          console.error('Error loading sites:', sitesError);
          return sendError('Failed to load sites');
        }

        const totalSites = sites.length;
        sendProgress(0, totalSites, 'Initializing...');

        // 2. Load all integration configs and decrypt credentials
        const { data: integrations, error: integrationsError } = await locals.supabase
          .from('integrations')
          .select('*')
          .in('id', ['autotask', 'sophos-partner', 'dattormm', 'cove']);

        if (integrationsError) {
          console.error('Error loading integrations:', integrationsError);
          return sendError('Failed to load integrations');
        }

        // Decrypt integration credentials
        const integrationsMap = new Map(
          integrations.map((integration) => {
            const config = { ...(integration.config as any) };
            if (config.clientSecret) {
              config.clientSecret = Encryption.decrypt(config.clientSecret);
            }
            if (config.apiSecretKey) {
              config.apiSecretKey = Encryption.decrypt(config.apiSecretKey);
            }
            return [integration.id, { ...integration, config }];
          })
        );

        // 3. Load all site integration links
        const { data: links, error: linksError } = await locals.supabase
          .from('site_to_integration')
          .select('*');

        if (linksError) {
          console.error('Error loading links:', linksError);
          return sendError('Failed to load integration links');
        }

        const linksBySite = new Map<number, Map<string, string>>();
        for (const link of links) {
          if (!linksBySite.has(link.site_id)) {
            linksBySite.set(link.site_id, new Map());
          }
          linksBySite.get(link.site_id)!.set(link.integration_id, link.external_id.toString());
        }

        // 4. Initialize connectors
        const autotaskConfig = integrationsMap.get('autotask')?.config;
        const sophosConfig = integrationsMap.get('sophos-partner')?.config;
        const dattoConfig = integrationsMap.get('dattormm')?.config;
        const coveConfig = integrationsMap.get('cove')?.config;

        if (!autotaskConfig || !sophosConfig || !dattoConfig || !coveConfig) {
          return sendError('Missing integration configuration');
        }

        const autotask = new AutoTaskConnector(autotaskConfig);
        const sophos = new SophosPartnerConnector(sophosConfig);
        const datto = new DattoRMMConnector(dattoConfig);
        const cove = new CoveConnector(coveConfig);

        // 5. Fetch all tenants/companies from integrations
        sendProgress(0, totalSites, 'Fetching integration data...');

        const [sophosTenants, dattoSites, coveStats] = await Promise.all([
          sophos.getTenants(),
          datto.getSites(),
          cove.getAccountStatistics(),
        ]);

        const sophosMap = new Map((sophosTenants.data || []).map((t) => [t.id, t]));
        const dattoMap = new Map((dattoSites.data || []).map((s) => [s.id.toString(), s]));
        const coveMap = new Map((coveStats.data || []).map((cs) => [cs.PartnerId.toString(), cs]));

        // 6. Process each site
        const siteReports: SiteReport[] = [];
        let processedCount = 0;

        for (const site of sites) {
          processedCount++;
          sendProgress(processedCount, totalSites, site.name);

          try {
            const siteLinks = linksBySite.get(site.id) || new Map();

            const autoTaskId = siteLinks.get('autotask')?.toString();
            const sophosId = siteLinks.get('sophos-partner');
            const dattoId = siteLinks.get('dattormm')?.toString();
            const coveId = siteLinks.get('cove');

            const sophosTenant = sophosId ? sophosMap.get(sophosId) : null;
            const dattoSite = dattoId ? dattoMap.get(dattoId) : null;
            const coveSite = coveId ? coveMap.get(coveId) : null;

            const [sophosDevices, dattoDevices, contracts] = await Promise.all([
              sophosTenant
                ? sophos.getEndpoints({
                    apiHost: sophosTenant.apiHost,
                    tenantId: sophosTenant.id,
                    tenantName: sophosTenant.name,
                  })
                : Promise.resolve({ data: [] }),
              dattoSite ? datto.getDevices(dattoSite.uid) : Promise.resolve({ data: [] }),
              autoTaskId ? autotask.getContracts(autoTaskId) : Promise.resolve({ data: [] }),
            ]);

            const coveDevices = coveSite
              ? (coveStats.data || []).filter((cs) => cs.PartnerId === coveSite.PartnerId).length
              : 0;

            let desktopContractUnits = 0;
            let serverContractUnits = 0;
            let backupContractUnits = 0;

            for (const contract of contracts.data || []) {
              const services = await autotask.getContractServices(contract.id.toString());

              for (const serv of services.data || []) {
                const isDesktop =
                  (serv.invoiceDescription.includes('Support') ||
                    serv.invoiceDescription.includes('Management')) &&
                  serv.invoiceDescription.includes('PC');
                const isServer =
                  serv.invoiceDescription.includes('Server') &&
                  (serv.invoiceDescription.includes('Support') ||
                    serv.invoiceDescription.includes('Management'));
                const isBackup = serv.invoiceDescription.includes('Backup');

                if (!isDesktop && !isServer && !isBackup) continue;

                const units: { units: number }[] = [];

                if (serv.isBundle) {
                  const res = await autotask.getContractServiceBundleUnits(
                    serv.id.toString(),
                    serv.contractID.toString()
                  );
                  units.push(...(res.data || []));
                } else {
                  const res = await autotask.getContractServiceUnits(
                    serv.id.toString(),
                    serv.contractID.toString()
                  );
                  units.push(...(res.data || []));
                }

                const sum = units.reduce((total, u) => total + u.units, 0);
                if (isDesktop) desktopContractUnits += sum;
                else if (isServer) serverContractUnits += sum;
                else if (isBackup) backupContractUnits += sum;
              }
            }

            // Calculate mismatches
            const sophosServerCount =
              sophosDevices.data?.filter((d) => d.type === 'server').length || 0;
            const sophosDesktopCount =
              sophosDevices.data?.filter((d) => d.type === 'computer').length || 0;
            const dattoServerCount =
              dattoDevices.data?.filter((d) => d.deviceType.category === 'Server').length || 0;
            const dattoDesktopCount =
              dattoDevices.data?.filter(
                (d) => d.deviceType.category === 'Desktop' || d.deviceType.category === 'Laptop'
              ).length || 0;

            const mismatches: Mismatch[] = [];

            function addMismatch(
              type: MismatchType,
              label: string,
              expected: number,
              actual: number
            ) {
              if (expected !== actual) {
                mismatches.push({
                  type,
                  label,
                  expected,
                  actual,
                  difference: actual - expected,
                });
              }
            }

            addMismatch('sophos-servers', 'Sophos Srv', serverContractUnits, sophosServerCount);
            addMismatch('sophos-desktops', 'Sophos Dsk', desktopContractUnits, sophosDesktopCount);
            addMismatch('datto-servers', 'Datto Srv', serverContractUnits, dattoServerCount);
            addMismatch('datto-desktops', 'Datto Dsk', desktopContractUnits, dattoDesktopCount);
            addMismatch('cove-backups', 'Cove Bkp', backupContractUnits, coveDevices);

            const status = mismatches.length > 0 ? 'issues' : 'complete';

            siteReports.push({
              id: site.id.toString(),
              name: site.name,
              status,
              mismatches,
              contract: {
                servers: serverContractUnits,
                desktops: desktopContractUnits,
                backups: backupContractUnits,
              },
              sophos: {
                servers: sophosServerCount,
                desktops: sophosDesktopCount,
              },
              datto: {
                servers: dattoServerCount,
                desktops: dattoDesktopCount,
              },
              cove: {
                devices: coveDevices,
              },
            });
          } catch (err) {
            console.error(`Failed to process site: ${site.name}`, err);
            siteReports.push({
              id: site.id.toString(),
              name: site.name,
              status: 'error',
              mismatches: [],
              contract: { servers: 0, desktops: 0, backups: 0 },
              sophos: { servers: 0, desktops: 0 },
              datto: { servers: 0, desktops: 0 },
              cove: { devices: 0 },
            });
          }
        }

        // 7. Build final report
        const sitesWithIssues = siteReports.filter(
          (s) => s.status === 'issues' || s.status === 'error'
        ).length;
        const totalMismatches = siteReports.reduce((sum, s) => sum + s.mismatches.length, 0);

        const report: ReconciliationReport = {
          generatedAt: new Date().toISOString(),
          sites: siteReports,
          summary: {
            totalSites,
            sitesWithIssues,
            totalMismatches,
          },
        };

        // 8. Send completion event with report data
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              complete: true,
              report,
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        console.error('Error generating reconciliation report:', error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
