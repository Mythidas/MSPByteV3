import type { APIResponse } from '@workspace/shared/lib/utils/logger';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector';
import type {
  HaloPSANewTicket,
  HaloPSATicketBody,
} from '@workspace/shared/types/integrations/halopsa/tickets';

/**
 * Builds and submits HaloPSA tickets. Contains the business logic for
 * assembling the raw ticket body (HTML formatting, defaults) on top of the
 * connector's raw postTicket call.
 */
export class HaloPSATicketHandler {
  constructor(private connector: HaloPSAConnector) {}

  async createTicket(ticket: HaloPSANewTicket): Promise<APIResponse<string>> {
    const images = ticket.images
      .map((src) => `<img src="${src}" class="fr-fil fr-dib" width="720" height="374">`)
      .join('<br>');

    const lines: string[] = [];
    lines.push('[User Submitted Request]');
    lines.push(`Summary: ${ticket.summary}`);
    lines.push('');
    lines.push(`Name: ${ticket.user.name}`);
    lines.push(`Email: ${ticket.user.email}`);
    lines.push(`Phone: ${ticket.user.phone}`);
    lines.push(`Details: ${ticket.details}`);
    lines.push('');
    if (ticket.assets.length === 0) lines.push(`Device: ${ticket.deviceName}`);

    const details_html = `<p>${lines.join('<br>')}<br>${images}</p>`;

    const body: HaloPSATicketBody = {
      site_id: ticket.siteId,
      priority_id: 4,
      files: null,
      usertype: 1,
      user_id: ticket.user.id,
      reportedby: ticket.user.email,
      tickettype_id: 3,
      timerinuse: false,
      itil_tickettype_id: '-1',
      tickettype_group_id: '-1',
      summary: ticket.summary,
      details_html,
      category_1: '',
      impact: String(ticket.impact),
      urgency: String(ticket.urgency),
      donotapplytemplateintheapi: true,
      utcoffset: 360,
      form_id: 'newticket-1',
      dont_do_rules: true,
      return_this: false,
      phonenumber: ticket.user.phone,
      assets: ticket.assets.map((id) => ({ id })),
    };

    return this.connector.postTicket(body);
  }
}
