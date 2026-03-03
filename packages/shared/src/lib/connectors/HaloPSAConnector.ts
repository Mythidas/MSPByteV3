import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import { fetchWithRetry } from '@workspace/shared/lib/utils/fetchWithRetry';
import type { HaloPSAAsset } from '@workspace/shared/types/integrations/halopsa/assets.js';
import type {
  HaloPSAConfig,
  HaloPSAPagination,
} from '@workspace/shared/types/integrations/halopsa/index.js';
import type { HaloPSASite } from '@workspace/shared/types/integrations/halopsa/sites.js';
import type { HaloPSATicketBody } from '@workspace/shared/types/integrations/halopsa/tickets.js';
import type { HaloPSAUser } from '@workspace/shared/types/integrations/halopsa/users';
import { type LocalFilters, applyFilters } from '@workspace/shared/types/connector';

const MODULE = 'HaloPSAConnector';
const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes (conservative default)

export class HaloPSAConnector {
  private token: string | null = null;
  private tokenExpiry: Date = new Date();

  constructor(private config: HaloPSAConfig) {}

  async checkHealth(): Promise<APIResponse<boolean>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };
    return { data: !!token };
  }

  async getSites(filters?: LocalFilters<HaloPSASite>): Promise<APIResponse<HaloPSASite[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const params = new URLSearchParams();
      params.set('exclude_internal', 'false');
      params.set('includeserviceaccount', 'true');
      params.set('includenonserviceaccount', 'true');
      params.set('includeinactive', 'false');
      params.set('includecolumns', 'false');
      params.set('showcounts', 'true');
      params.set('paginate', 'true');
      params.set('page_size', '50');
      params.set('page_no', '1');

      const sites: HaloPSASite[] = [];
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const response = await fetchWithRetry(
        `${this.config.url}/api/site?${params}`,
        { method: 'GET', headers },
        MODULE,
        'getSites'
      );

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getSites',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data: HaloPSAPagination & { sites: HaloPSASite[] } = await response.json();
      sites.push(...data.sites);
      params.set('page_no', `${data.page_no + 1}`);

      while (sites.length < data.record_count) {
        const refetchResponse = await fetchWithRetry(
          `${this.config.url}/api/site?${params}`,
          { method: 'GET', headers },
          MODULE,
          'getSites'
        );

        if (!refetchResponse.ok) break;
        const refetchData: HaloPSAPagination & { sites: HaloPSASite[] } =
          await refetchResponse.json();
        sites.push(...refetchData.sites);
        params.set('page_no', `${refetchData.page_no + 1}`);
      }

      return { data: this.postFilter(sites, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getSites', message: String(err) });
    }
  }

  async getAssets(
    siteID: string,
    filters?: LocalFilters<HaloPSAAsset>
  ): Promise<APIResponse<HaloPSAAsset[]>> {
    try {
      type APISchema = HaloPSAPagination & { assets: HaloPSAAsset[] };

      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const params = new URLSearchParams();
      params.set('cf_display_values_only', 'true');
      params.set('includeinactive', 'false');
      params.set('site_id', siteID);
      params.set('includecolumns', 'false');
      params.set('showcounts', 'true');
      params.set('paginate', 'true');
      params.set('page_size', '50');
      params.set('page_no', '1');

      const assets: HaloPSAAsset[] = [];
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const response = await fetchWithRetry(
        `${this.config.url}/api/asset?${params}`,
        { method: 'GET', headers },
        MODULE,
        'getAssets'
      );

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getAssets',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data: APISchema = await response.json();
      assets.push(...data.assets);
      params.set('page_no', `${data.page_no + 1}`);

      while (assets.length < data.record_count) {
        const refetchResponse = await fetchWithRetry(
          `${this.config.url}/api/asset?${params}`,
          { method: 'GET', headers },
          MODULE,
          'getAssets'
        );

        if (!refetchResponse.ok) break;
        const refetchData: APISchema = await refetchResponse.json();
        assets.push(...refetchData.assets);
        params.set('page_no', `${refetchData.page_no + 1}`);
      }

      return { data: this.postFilter(assets, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getAssets', message: String(err) });
    }
  }

  async getUser(email?: string): Promise<APIResponse<HaloPSAUser>> {
    try {
      type APISchema = HaloPSAPagination & { users: HaloPSAUser[] };

      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const params = new URLSearchParams();
      if (email) params.set('search', email);
      params.set('cf_display_values_only', 'true');
      params.set('includeinactive', 'false');
      params.set('includecolumns', 'false');
      params.set('showcounts', 'true');
      params.set('paginate', 'true');
      params.set('page_size', '50');
      params.set('page_no', '1');

      const response = await fetchWithRetry(
        `${this.config.url}/api/users?${params}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        },
        MODULE,
        'getUser'
      );

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getUser',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data: APISchema = await response.json();

      if (data.users.length === 0 || !data.users[0]) {
        return Logger.error({ module: MODULE, context: 'getUser', message: 'No user found' });
      }

      return { data: data.users[0] };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getUser', message: String(err) });
    }
  }

  async postTicket(body: HaloPSATicketBody): Promise<APIResponse<string>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const params = new URLSearchParams();
      params.set('includedetails', 'false');
      params.set('includetickettype', 'false');
      params.set('includeuser', 'false');
      params.set('includepriority', 'false');
      params.set('idonly', 'true');

      const response = await fetchWithRetry(
        `${this.config.url}/api/tickets?${params}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json-patch+json',
          },
          body: JSON.stringify([body]),
        },
        MODULE,
        'postTicket'
      );

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'postTicket',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data: { id: string } = await response.json();
      return { data: String(data.id) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'postTicket', message: String(err) });
    }
  }

  async uploadImage(file: Blob): Promise<APIResponse<string>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const formData = new FormData();
      formData.append('ticket_id', '');
      formData.append('image_upload_id', '0');
      formData.append('image_upload_key', '');
      formData.append('file', file, 'upload.png');

      const response = await fetchWithRetry(
        `${this.config.url}/api/attachment/image`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData },
        MODULE,
        'uploadImage'
      );

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'uploadImage',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data: { link: string } = await response.json();
      return { data: data.link };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'uploadImage', message: String(err) });
    }
  }

  private postFilter<T>(items: T[], filters?: LocalFilters<T>): T[] {
    return applyFilters(
      items as unknown as Record<string, unknown>[],
      filters as unknown as LocalFilters<Record<string, unknown>>
    ) as T[];
  }

  private async getToken(): Promise<APIResponse<string>> {
    try {
      if (this.token && new Date().getTime() < this.tokenExpiry.getTime()) {
        return { data: this.token };
      }

      const response = await fetch(`${this.config.url}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: 'all',
        }),
      });

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getToken',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data: { access_token: string; expires_in?: number } = await response.json();
      this.token = data.access_token;
      this.tokenExpiry = new Date(new Date().getTime() + (data.expires_in ? data.expires_in * 1000 : TOKEN_TTL_MS));

      return { data: data.access_token };
    } catch (err) {
      return Logger.error({
        module: MODULE,
        context: 'getToken',
        message: `Failed to get token: ${err}`,
      });
    }
  }
}
