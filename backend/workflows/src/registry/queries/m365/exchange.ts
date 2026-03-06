import { Logger } from '@workspace/shared/lib/utils/logger.js';
import type { QueryDefinition } from '../../../types.js';
import { PowerShellRunner } from '@workspace/shared/lib/utils/PowerShellRunner.js';
import type { Tables } from '@workspace/shared/types/database.js';

export const M365ExchangeConfig: QueryDefinition = {
  key: 'microsoft-365/exchange/config',
  integration: 'microsoft-365',
  label: 'M365 - Get Exchange Config',
  description: 'Retrieves live Exchange Organization Config per M365 connection via PowerShell.',
  inputs: {
    connections: {
      type: 'array',
      items: 'object',
      optional: false,
      description: 'Connection objects from GetConnections stage (integration=microsoft-365)',
    },
  },
  outputs: {
    configs: { type: 'array', description: 'Exchange org configs with RejectDirectSend status' },
  },
  output_schema: {
    configs: {
      type: 'array',
      item_schema: {
        connection_id: 'string',
        display_name: 'string',
        reject_direct_send: 'boolean',
      },
      description: 'M365 Exchange org configs per connection',
    },
  },
  source: 'live',
  outputType: 'void',
  async execute(ctx, inputs) {
    if (!inputs['connections'] || (inputs['connections'] as any[]).length === 0)
      return { configs: [] };

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const certPemBase64 = process.env.MICROSOFT_CERT_PEM;

    if (!clientId || !certPemBase64) {
      Logger.warn({
        module: 'M365ExchangeConfig',
        context: ctx.tenant_id,
        message: 'Missing MICROSOFT_CLIENT_ID or MICROSOFT_CERT_PEM env vars — skipping',
      });
      return { configs: [] };
    }

    const certPem = Buffer.from(certPemBase64, 'base64').toString('utf8');
    const connections = inputs['connections'] as Tables<'public', 'integration_connections'>[];
    const configs: { connection_id: string; display_name: string; reject_direct_send: boolean }[] =
      [];

    for (const conn of connections) {
      const domain = (conn.meta as any)?.defaultDomain ?? '';
      if (!domain) {
        Logger.warn({
          module: 'M365ExchangeConfig',
          context: conn.id,
          message: 'No defaultDomain in connection meta — skipping',
        });
        continue;
      }

      try {
        const data = await PowerShellRunner.runExchangeOnline(
          clientId,
          certPem,
          domain,
          'Get-OrganizationConfig'
        );
        configs.push({
          connection_id: conn.id,
          display_name: conn.name,
          reject_direct_send: data?.RejectDirectSend ?? false,
        });
      } catch (err: any) {
        Logger.error({
          module: 'M365ExchangeConfig',
          context: conn.id,
          message: `PowerShell fetch failed: ${err.message}`,
        });
      }
    }

    return { configs };
  },
};
