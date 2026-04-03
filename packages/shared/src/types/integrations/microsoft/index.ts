import z from "zod";

export const Microsoft365ConfigSchema = z.object({
  tenantId: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  certificatePem: z.string().optional(),
  domainMappings: z
    .array(z.object({ domain: z.string(), siteId: z.string().optional() }))
    .optional(),
  refreshToken: z.string().optional(),
  onRefreshToken: z.void("newToken").optional(),
});
export type Microsoft365Config = z.infer<typeof Microsoft365ConfigSchema>;

export type MSGraphReturn<T> = {
  "@odata.nextLink": string;
  value: T;
};

export type MSGraphError = {
  error: {
    code: string;
    message: string;
    innerError?: unknown;
  };
};
