export const ENTITY_TABLE_MAP: Record<string, { schema: string; table: string }> = {
  'm365_identity':        { schema: 'vendors', table: 'm365_identities' },
  'm365_group':           { schema: 'vendors', table: 'm365_groups' },
  'm365_license':         { schema: 'vendors', table: 'm365_licenses' },
  'm365_policy':          { schema: 'vendors', table: 'm365_policies' },
  'm365_exchange_config': { schema: 'vendors', table: 'm365_exchange_configs' },
};
