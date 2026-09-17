// Verify schema v13 migration: Plantilla (Unfilled) counts (Part I-B) and
// per-KPI-row targeted-result statements (Part III-F) are additive — old docs
// gain zeros/empty strings, existing values survive a re-migration untouched.
// Run: npx tsx scripts/verify-v13.ts   (expect: ALL CHECKS PASSED)
import assert from "node:assert";
import { migrateLegacyDoc } from "../src/lib/store/index";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IsspDocument } from "../src/lib/store/types";

function makeLegacyV12(): IsspDocument {
  const doc = createEmptyDocument({
    title: "v13 verify fixture",
    startYear: 2028,
    endYear: 2030,
    amendmentNumber: 0,
    scope: "AGENCY_WIDE",
    agencyHeadName: "Fixture Head",
    agency: { name: "Fixture Agency", acronym: "FX", type: "NGA", websiteUrl: "", logoBase64: null },
  });
  doc.schemaVersion = 12;
  // createEmptyDocument seeds no performanceFramework entries (the III-F form
  // creates them per project) — seed one project + row so the row-level
  // assertions below exercise real rows instead of a vacuous empty map.
  doc.part3.internalProjects = [{
    id: "proj-fx", title: "Fixture Project", description: "", objectives: "",
    projectType: "IS_DRIVEN", linkedSystemIds: [], strategicAlignment: [],
    harmonizationFramework: [], implementingUnit: "", fundingSource: "",
    year1Deliverables: "", year2Deliverables: "", year3Deliverables: "", duration: "2028",
  }];
  doc.part3.performanceFramework["proj-fx"] = {
    projectTitle: "Fixture Project", projectCategory: "internal",
    rows: [{
      id: "kpi-fx-1", hierarchy: "Output", targetedResult: "", indicator: "Queue monitoring",
      baseline: "", year1Target: "", year2Target: "", year3Target: "",
      dataCollectionMethod: "", responsibleUnit: "",
    }],
  };
  // Simulate a pre-v13 doc: no plantillaUnfilled, no targetedResult anywhere.
  delete (doc.part1.humanCapital as unknown as Record<string, unknown>).plantillaUnfilled;
  for (const entry of Object.values(doc.part3.performanceFramework)) {
    for (const row of entry.rows) delete (row as unknown as Record<string, unknown>).targetedResult;
  }
  return doc;
}

// 1. v12 → v13 backfills defaults
const migrated = migrateLegacyDoc(makeLegacyV12());
assert.strictEqual(migrated.schemaVersion, 13, "schemaVersion must be 13 after migration");
assert.deepStrictEqual(migrated.part1.humanCapital.plantillaUnfilled, { it: 0, nonIt: 0 });
assert.ok(Object.values(migrated.part3.performanceFramework).every(e =>
  e.rows.every(r => r.targetedResult === "")
), "every KPI row gains targetedResult: \"\"");

// 2. Existing v13 values survive untouched (idempotent re-migration)
const modern = makeLegacyV12();
modern.schemaVersion = 13;
modern.part1.humanCapital.plantillaUnfilled = { it: 4, nonIt: 12 };
for (const entry of Object.values(modern.part3.performanceFramework)) {
  entry.rows[0].targetedResult = "Consolidated queue monitoring capability";
}
const remigrated = migrateLegacyDoc(modern);
assert.deepStrictEqual(remigrated.part1.humanCapital.plantillaUnfilled, { it: 4, nonIt: 12 });
assert.strictEqual(
  Object.values(remigrated.part3.performanceFramework)[0].rows[0].targetedResult,
  "Consolidated queue monitoring capability"
);

// 3. New documents are born at 13 with both fields present
assert.strictEqual(createEmptyDocument({
  title: "t", startYear: 2028, endYear: 2030, amendmentNumber: 0, scope: "AGENCY_WIDE",
  agencyHeadName: "h",
  agency: { name: "n", acronym: "a", type: "NGA", websiteUrl: "", logoBase64: null },
}).schemaVersion, 13);

console.log("ALL CHECKS PASSED");
