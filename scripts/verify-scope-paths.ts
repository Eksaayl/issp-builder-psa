import assert from "node:assert/strict";
import {
  SHARED_TABLE_PATHS, resolvePath, resolveScope,
  isSectionVisible, isFieldEditable, ALL_SECTION_IDS,
} from "../src/lib/scope/paths";
import { SECTION_FIELDS } from "../src/lib/section-fields";
import { PROJECT_BEARING_FIELDS } from "../src/lib/scope/paths";

// resolvePath: area → all leaf fields under it
const part1bFields = resolvePath("part1/b").map(f => f.fieldKey);
assert.ok(part1bFields.includes("cioName"), "part1/b should include cioName");
assert.ok(part1bFields.includes("humanCapital"), "part1/b should include humanCapital");

// resolvePath: section → its fields
assert.equal(resolvePath("part1/a").length, 5, "part1/a has 5 fields");

// resolvePath: single field → one leaf
assert.equal(resolvePath("part1/b.cioName").length, 1);

// resolveScope: visibility + editability
const scope = resolveScope(["part1/b.cioName", "part4"]);
assert.equal(isSectionVisible(scope, "part1/b"), true,  "part1/b visible (1 owned field)");
assert.equal(isSectionVisible(scope, "part1/a"), false, "part1/a hidden (0 owned fields)");
assert.equal(isFieldEditable(scope, "part1/b", "cioName"), true);
assert.equal(isFieldEditable(scope, "part1/b", "cioEmail"), false, "only cioName editable");
assert.equal(isSectionVisible(scope, "part4/year1"), true);

// shared tables
assert.equal(SHARED_TABLE_PATHS.has("annexes/annex1"), true);
assert.equal(SHARED_TABLE_PATHS.has("part1/c.stakeholders"), true);

// every known section id resolves
assert.ok(ALL_SECTION_IDS.includes("part1/b"));
assert.ok(ALL_SECTION_IDS.includes("annexes/annex1"));
assert.ok(ALL_SECTION_IDS.includes("definitions"));

// ── project-bearing fields (per-project distribution filter domain) ─────────
assert.equal(PROJECT_BEARING_FIELDS.size, 6, "six project-bearing fields");
assert.ok(PROJECT_BEARING_FIELDS.has("part3/e1.internalProjects"));
assert.ok(PROJECT_BEARING_FIELDS.has("part3/e2.crossAgencyProjects"));
assert.ok(PROJECT_BEARING_FIELDS.has("part3/f.performanceFramework"));
assert.ok(PROJECT_BEARING_FIELDS.has("part4/year1.year1"));
assert.ok(PROJECT_BEARING_FIELDS.has("part4/year2.year2"));
assert.ok(PROJECT_BEARING_FIELDS.has("part4/year3.year3"));
// every member must be a REAL leaf of a REAL section (schema-drift guard)
for (const key of PROJECT_BEARING_FIELDS) {
  const dot = key.indexOf(".");
  const sid = key.slice(0, dot);
  const fk = key.slice(dot + 1);
  const def = SECTION_FIELDS[sid];
  assert.ok(def, `${sid} exists in SECTION_FIELDS`);
  assert.ok(
    def.fields.some((f) => f.key === fk),
    `${key} is a declared field of ${sid}`
  );
}

console.log("✓ scope-paths verification passed");
