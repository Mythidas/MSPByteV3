export type MSPAgentConfig = {
  primaryPsa: string; // integration id, e.g. 'halopsa'
  siteVariableName?: string; // DattoRMM site variable name (default: 'MSPSiteCode')
};
