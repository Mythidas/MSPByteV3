export type HaloPSAUser = {
  id: number;
  name: string;
  site_id: number;
  site_id_int: number;
  site_name: string;
  client_name: string;
  firstname: string;
  surname: string;
  initials: string;
  title: string;
  emailaddress: string;
  email2: string;
  email3: string;
  phonenumber_preferred: string;
  sitephonenumber: string;
  phonenumber: string;
  homenumber: string;
  mobilenumber: string;
  mobilenumber2: string;
  fax: string;
  telpref: number;
  activedirectory_dn: string;
  onpremise_activedirectory_dn: string;
  container_dn: string;
  login: string;
  inactive: boolean;
  colour: string;
  isimportantcontact: boolean;
  other1: string;
  other2: string;
  other3: string;
  other4: string;
  other5: string;
  notes: string;
  neversendemails: boolean;
  default_currency_code: number;
  site_guid: string;
  area_guid: string;
  site_cautomate_guid: string;
  priority_id: number;
  linked_agent_id: number;
  covered_by_contract: boolean;
  contract_value: number;
  software_role_name: string;

  // Compressed complex objects
  customfields: any[];
  attachments: any[];
  custombuttons: any[];

  relationship_id: number;
  user_relationships: any[];

  uddevsite: number;
  uddevnum: number;
  uduserid: number;
  userdevicerolecount: number;
  site_hubspot_guid: string;

  isserviceaccount: boolean;
  ignoreautomatedbilling: boolean;
  isimportantcontact2: boolean;

  connectwiseid: number;
  autotaskid: number;
  messagegroup_id: number;
  role_list: string;
  sitetimezone: string;
  client_account_manager_id: number;

  use: string;
  key: number;
  table: number;
  client_id: number;
  item_tax_code: number;
  automatic_sales_tax: boolean;
  client_taxable: boolean;

  overridepdftemplatequote: number;
  overridepdftemplatequote_name: string;
  contract_end_date: string; // ISO date
  okta_id: string;
  azure_id: string;
  user_with_clientsite: string;
  client_automatic_callscript_id: number;
  neversendmarketingemails: boolean;
  is_prospect: boolean;
  whatsapp_number: string;
  azureoid: string;
  approver_note_hint: string;
  language_id: number;
  date_of_birth: string; // ISO date

  role_ids: number[];

  avalara_tenant: number;
  _importtypeid: number;
  _importthirdpartyid: string;
  _importtype: string;

  new_external_link: any;
  import_details_id: number;
  _isupdateimport: boolean;
};
