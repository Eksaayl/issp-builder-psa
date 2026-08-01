type AgencyIdentity = {
  acronym: string;
};

const EXCLUDED_DEMO_AGENCY_ACRONYMS = new Set(["NCWTR"]);

export function isExcludedDemoAgency(agency: AgencyIdentity): boolean {
  return EXCLUDED_DEMO_AGENCY_ACRONYMS.has(agency.acronym.trim().toUpperCase());
}
