type AgencyIdentity = {
  acronym: string;
};

// Agencies that never represent real usage: their events are skipped on the
// client (record-usage) and the server (usage-log) and can be purged from the
// log by scripts/remove-demo-usage-logs.ts. Smoke fixtures that introduce a
// new agency MUST register its acronym here — 69 "Smoke Agency" entries
// polluted the log on 2026-09-17 before this rule covered SMK.
const EXCLUDED_DEMO_AGENCY_ACRONYMS = new Set([
  "NCWTR", // bundled demo agency
  "SMK", // scripts/make-project-filter-fixture.ts smoke master
  "DEPLOY-CHECK", // post-deploy verification entries
]);

export function isExcludedDemoAgency(agency: AgencyIdentity): boolean {
  return EXCLUDED_DEMO_AGENCY_ACRONYMS.has(agency.acronym.trim().toUpperCase());
}
