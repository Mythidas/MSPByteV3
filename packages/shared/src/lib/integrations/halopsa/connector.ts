import { HaloPSAHTTPClient } from './http-client';
import type { HaloPSAConfig, HaloPSAPagination } from '@workspace/shared/types/integrations/halopsa/index';
import z from 'zod';
import type { HaloPSAAsset } from '@workspace/shared/types/integrations/halopsa/assets';
import type { HaloPSASite } from '@workspace/shared/types/integrations/halopsa/sites';
import type { HaloPSATicketBody } from '@workspace/shared/types/integrations/halopsa/tickets';
import type { HaloPSAUser } from '@workspace/shared/types/integrations/halopsa/users';

export class HaloPSAConnector {
  private readonly client: HaloPSAHTTPClient;

  readonly site: {
    list(): Promise<HaloPSASite[]>;
  };

  readonly asset: {
    list(siteId: string): Promise<HaloPSAAsset[]>;
  };

  readonly users: {
    get(email?: string): Promise<HaloPSAUser>;
  };

  readonly tickets: {
    create(body: HaloPSATicketBody): Promise<string>;
  };

  readonly attachment: {
    uploadImage(file: Blob): Promise<string>;
  };

  constructor(config: HaloPSAConfig, tenantId: string) {
    this.client = new HaloPSAHTTPClient(config, tenantId);
    this.site = this.buildSiteNamespace();
    this.asset = this.buildAssetNamespace();
    this.users = this.buildUsersNamespace();
    this.tickets = this.buildTicketsNamespace();
    this.attachment = this.buildAttachmentNamespace();
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.getToken();
      return true;
    } catch {
      return false;
    }
  }

  private buildSiteNamespace(): HaloPSAConnector['site'] {
    const client = this.client;

    return {
      async list() {
        const params = new URLSearchParams({
          exclude_internal: 'false',
          includeserviceaccount: 'true',
          includenonserviceaccount: 'true',
          includeinactive: 'false',
          includecolumns: 'false',
          showcounts: 'true',
          paginate: 'true',
          page_size: '50',
          page_no: '1',
        });

        const sites: HaloPSASite[] = [];
        type APISchema = HaloPSAPagination & { sites: HaloPSASite[] };

        const first = await client.get<APISchema>(`${client.config.url}/api/site?${params}`);
        sites.push(...first.sites);
        params.set('page_no', `${first.page_no + 1}`);

        while (sites.length < first.record_count) {
          const page = await client.get<APISchema>(`${client.config.url}/api/site?${params}`);
          sites.push(...page.sites);
          params.set('page_no', `${page.page_no + 1}`);
        }

        return sites;
      },
    };
  }

  private buildAssetNamespace(): HaloPSAConnector['asset'] {
    const client = this.client;

    return {
      async list(siteId) {
        const params = new URLSearchParams({
          cf_display_values_only: 'true',
          includeinactive: 'false',
          site_id: siteId,
          includecolumns: 'false',
          showcounts: 'true',
          paginate: 'true',
          page_size: '50',
          page_no: '1',
        });

        const assets: HaloPSAAsset[] = [];
        type APISchema = HaloPSAPagination & { assets: HaloPSAAsset[] };

        const first = await client.get<APISchema>(`${client.config.url}/api/asset?${params}`);
        assets.push(...first.assets);
        params.set('page_no', `${first.page_no + 1}`);

        while (assets.length < first.record_count) {
          const page = await client.get<APISchema>(`${client.config.url}/api/asset?${params}`);
          assets.push(...page.assets);
          params.set('page_no', `${page.page_no + 1}`);
        }

        return assets;
      },
    };
  }

  private buildUsersNamespace(): HaloPSAConnector['users'] {
    const client = this.client;

    return {
      async get(email?) {
        const params = new URLSearchParams({
          cf_display_values_only: 'true',
          includeinactive: 'false',
          includecolumns: 'false',
          showcounts: 'true',
          paginate: 'true',
          page_size: '50',
          page_no: '1',
        });
        if (email) params.set('search', email);

        type APISchema = HaloPSAPagination & { users: HaloPSAUser[] };
        const data = await client.get<APISchema>(`${client.config.url}/api/users?${params}`);

        if (!data.users[0]) throw new Error('HaloPSAConnector.users.get: no user found');
        return data.users[0];
      },
    };
  }

  private buildTicketsNamespace(): HaloPSAConnector['tickets'] {
    const client = this.client;

    return {
      async create(body) {
        const params = new URLSearchParams({
          includedetails: 'false',
          includetickettype: 'false',
          includeuser: 'false',
          includepriority: 'false',
          idonly: 'true',
        });

        const data = await client.post<{ id: string }>(
          `${client.config.url}/api/tickets?${params}`,
          [body],
          'application/json-patch+json'
        );
        return String(data.id);
      },
    };
  }

  private buildAttachmentNamespace(): HaloPSAConnector['attachment'] {
    const client = this.client;

    return {
      async uploadImage(file) {
        const formData = new FormData();
        formData.append('ticket_id', '');
        formData.append('image_upload_id', '0');
        formData.append('image_upload_key', '');
        formData.append('file', file, 'upload.png');

        const response = await client.postForm(`${client.config.url}/api/attachment/image`, formData);
        const data = z.object({ link: z.string() }).parse(await response.json());
        return data.link;
      },
    };
  }
}
