import { Logger } from '@workspace/shared/lib/utils/logger.js';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector.js';
import { HaloPSATicketHandler } from '@workspace/shared/lib/services/halopsa/HaloPSATicketHandler.js';
import type { HaloPSAConfig } from '@workspace/shared/types/integrations/halopsa/index.js';
import { getSupabase } from '../../../supabase.js';
import type { ActionDefinition, EntityLogEntry } from '../../../types.js';

export const HaloPSATicketsCreateOrUpdate: ActionDefinition = {
  key: 'halopsa/tickets/create-or-update',
  integration: 'halopsa',
  label: 'HaloPSA — Create or Update Ticket',
  description: 'Creates a new HaloPSA ticket or updates an existing one with the rendered body.',
  inputs: {
    ticket_id: { type: 'string', optional: true, description: 'Existing ticket ID to update' },
    payload: { type: 'array', description: 'EntityLogEntry array to include in the ticket' },
    rendered_body: { type: 'string', description: 'Pre-rendered HTML/text body of the ticket' },
  },
  outputs: {
    ticket_id: { type: 'string', description: 'Created or updated ticket ID' },
  },
  affectsEntities: false,
  async execute(ctx, inputs) {
    const supabase = getSupabase();

    const { data: connection } = await (supabase.from('integration_connections' as any) as any)
      .select('config')
      .eq('tenant_id', ctx.tenant_id)
      .eq('integration_id', 'halopsa')
      .single();

    if (!connection?.config) {
      Logger.error({
        module: 'HaloPSATicketsCreateOrUpdate',
        context: 'execute',
        message: `No HaloPSA connection found for tenant ${ctx.tenant_id}`,
      });
      return { succeeded: [], failed: [], output: null };
    }

    const config = connection.config as HaloPSAConfig;
    const connector = new HaloPSAConnector(config);
    const handler = new HaloPSATicketHandler(connector);

    const payload = (inputs.payload as EntityLogEntry[]) ?? [];
    const renderedBody = (inputs.rendered_body as string) ?? '';

    const { data: ticketId, error } = await handler.createTicket({
      summary: `Workflow Run — ${ctx.run_id}`,
      details: renderedBody,
      user: { name: 'MSPByte Automation', email: 'automation@mspbyte.io', phone: '' },
      impact: 'Low',
      urgency: 'Low',
      deviceName: '',
      assets: [],
      images: [],
    });

    if (error) {
      Logger.error({
        module: 'HaloPSATicketsCreateOrUpdate',
        context: 'execute',
        message: `Failed to create ticket: ${error}`,
      });
      return { succeeded: [], failed: [], output: null };
    }

    Logger.info({
      module: 'HaloPSATicketsCreateOrUpdate',
      context: 'execute',
      message: `Created ticket ${ticketId} for tenant ${ctx.tenant_id}`,
    });

    return {
      succeeded: payload.map((e) => e.entity_id),
      failed: [],
      output: { ticket_id: ticketId },
    };
  },
};
