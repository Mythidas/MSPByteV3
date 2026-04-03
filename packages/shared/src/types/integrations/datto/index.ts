import z from "zod";

export const DattoRMMConfigSchema = z.object({
  url: z.string(),
  apiKey: z.string(),
  apiSecretKey: z.string(),
  siteVariableName: z.string().default("MSPSiteCode").optional(),
});

export type DattoRMMConfig = z.infer<typeof DattoRMMConfigSchema>;

export type DattoRMMPagination = {
  page: number;
  pageSize: number;
  totalRecords: number;
  nextPageUrl?: string;
};
