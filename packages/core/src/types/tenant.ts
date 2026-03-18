export type TenantId = string;
export type SiteId = string;
export type LinkId = string;

export type TenantScope = {
  tenantId: TenantId;
};

export type SiteScope = TenantScope & {
  siteId: SiteId;
};

export type LinkScope = TenantScope & {
  linkId: LinkId;
};

// Union used throughout — a job is always one of these three
export type JobScope = TenantScope | SiteScope | LinkScope;

// Type guards
export const isSiteScope = (s: JobScope): s is SiteScope => "siteId" in s;
export const isLinkScope = (s: JobScope): s is LinkScope => "linkId" in s;
