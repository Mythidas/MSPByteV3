import z from "zod";

export const SophosPartnerConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
});
export type SophosPartnerConfig = z.infer<typeof SophosPartnerConfigSchema>;

export const SophosTenantConfigSchema = z.object({
  apiHost: z.string(),
  tenantId: z.string(),
});
export type SophosTenantConfig = z.infer<typeof SophosTenantConfigSchema>;

export type SophosPartnerAPIResponse<T> = {
  items: T[];
  pages: {
    total: number;
    current: number;
  };
};

export type SophosPartnerScope = { type: "partner" };
export type SophosTenantScope = { type: "tenant"; tenantId: string };
export type SophosScope = SophosPartnerScope | SophosTenantScope;

// Re-export types from submodules
export type { SophosPartnerTenant } from "./tenants";
