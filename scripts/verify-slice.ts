import assert from "node:assert/strict";
import { sliceScopedDoc, type DistributeSpec } from "../src/lib/scope/slice";
import { createEmptyDocument } from "../src/lib/store/defaults";

// Master doc: agency header + seeded Part 1 fields.
const base = createEmptyDocument({
  title: "Agency ISSP 2026",
  startYear: 2026,
  endYear: 2028,
  amendmentNumber: 0,
  scope: "AGENCY_WIDE",
  agencyHeadName: "Sec. X",
  agency: {
    name: "N",
    acronym: "N",
    type: "NGA",
    websiteUrl: "",
    logoBase64: null,
  },
});
// Owned field in master.
base.part1.cioName = "Atty. Cruz";
// Non-owned field in master — MUST NOT leak into the slice.
base.part1.cioEmail = "leak-test@agency.gov.ph";
// Shared table row in master — MUST be emptied in the slice.
base.part1.stakeholders = [{ id: "s1", name: "OfficeA", services: [] }];
// Non-owned annex payload in master — MUST be emptied in the slice.
base.annexedOffices = [
  {
    version: "1.0",
    fileType: "annex1",
    exportedAt: "2026-01-01T00:00:00.000Z",
    tool: "issp-platform",
    office: { type: "Regional", name: "Reg-1", displayLabel: "Region 1" },
    annex1: { equipment: [], software: [] },
  },
];

const spec: DistributeSpec = {
  office: { id: "b", name: "IS Div", displayLabel: "Information Systems Division" },
  editable: ["part1/b.cioName", "part1/c.stakeholders"],
  sourceDocId: "master-1",
};
const sliced = sliceScopedDoc(base, spec);

// 1. editScope set with full provenance.
assert.equal(sliced.editScope?.office.id, "b");
assert.equal(sliced.editScope?.office.displayLabel, "Information Systems Division");
assert.deepEqual(sliced.editScope?.editable, spec.editable);
assert.equal(sliced.editScope?.sourceDocId, "master-1");
assert.ok(typeof sliced.editScope?.generatedAt === "string" && sliced.editScope.generatedAt.length > 0);

// 2. Owned non-shared field retained (field-level copy from master).
assert.equal(sliced.part1.cioName, "Atty. Cruz");

// 3. Leakage guarantee: non-owned field is the DEFAULT (""), never copied.
assert.equal(
  sliced.part1.cioEmail,
  "",
  "non-owned cioEmail must be the default, not copied from master"
);

// 4. Shared table emptied in the slice — office re-adds its own rows.
assert.deepEqual(sliced.part1.stakeholders, []);

// 5. Agency header retained.
assert.equal(sliced.agency.name, "N");
assert.equal(sliced.title, "Agency ISSP 2026");
assert.equal(sliced.startYear, 2026);
assert.equal(sliced.endYear, 2028);
assert.equal(sliced.scope, "AGENCY_WIDE");

// 6. Annex 1 shared table emptied.
assert.deepEqual(sliced.annexedOffices, []);

// 7. Definitions not owned → default standard terms remain, master's not copied.
assert.ok(
  Array.isArray(sliced.definitions) && sliced.definitions.length === 3,
  "definitions stay at the 3 standard template terms when not owned"
);

// 8. Sliced doc is a fresh object — mutating it must not touch the master.
sliced.part1.cioName = "MUTATED";
assert.equal(base.part1.cioName, "Atty. Cruz", "mutation of slice must not leak back to master");

console.log("✓ slice verification passed");
