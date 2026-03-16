export type BaseRawType<T> = {
  externalId: string;
  linkId: string | null;
  siteId: string | null;
  data: T;
};
