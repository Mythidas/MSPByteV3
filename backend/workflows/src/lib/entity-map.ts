// Maps _entityType tag to the FK column on the alerts table.
export const ENTITY_FK_COLUMN: Record<string, string> = {
  'm365_identity': 'm365_identity_id',
  'm365_group': 'm365_group_id',
  'm365_license': 'm365_license_id',
  'm365_policy': 'm365_policy_id',
  'm365_exchange_config': 'm365_exchange_config_id',
};
