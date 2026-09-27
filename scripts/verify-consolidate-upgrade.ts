// Verify that returned scoped files made with an older schema are upgraded
// before consolidation, and that data the older schema could not hold keeps
// the master's value (Slice 1 of
// docs/superpowers/specs/2026-09-27-consolidate-merge-review-design.md).
//
// Seams: parseScopedIsspFile(file, master) → consolidate(master, files).
// Run: npx tsx scripts/verify-consolidate-upgrade.ts
import assert from "node:assert/strict";
import { parseScopedIsspFile } from "../src/lib/store/index";
import { consolidate } from "../src/lib/scope/consolidate";
import { sliceScopedDoc } from "../src/lib/scope/slice";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IsspDocument } from "../src/lib/store/types";

function makeMaster(): IsspDocument {
  return createEmptyDocument({
    title: "Upgrade fixture",
    startYear: 2028,
    endYear: 2030,
    amendmentNumber: 0,
    scope: "AGENCY_WIDE",
    agencyHeadName: "Fixture Head",
    agency: { name: "Fixture Agency", acronym: "FX", type: "NGA", websiteUrl: "", logoBase64: null },
  });
}

/** Slice a scoped file for one office, then let `edit` shape it (including downgrading it). */
function returnedFile(master: IsspDocument, editable: string[], edit: (raw: Record<string, unknown>) => void): File {
  const doc = sliceScopedDoc(master, {
    office: { id: "office-a", name: "Office A", displayLabel: "Office A" },
    editable,
  });
  const raw = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  edit(raw);
  return new File([JSON.stringify(raw)], "office-a.issp", { type: "application/json" });
}

async function parseOk(file: File, master: IsspDocument) {
  const r = await parseScopedIsspFile(file, master);
  if (!r.success) throw new Error(`parse failed: ${r.error}`);
  return r;
}

async function main() {
// ─── (a) v12 file owning Part I-B keeps the master's Plantilla (Unfilled) ────
{
  const master = makeMaster();
  master.part1.humanCapital.plantillaUnfilled = { it: 3, nonIt: 2 };

  const file = returnedFile(master, ["part1/b.humanCapital"], (raw) => {
    raw.schemaVersion = 12;
    const part1 = raw.part1 as { humanCapital: Record<string, unknown> };
    delete part1.humanCapital.plantillaUnfilled; // v12 had no such field
    (part1.humanCapital.plantilla as { it: { male: number } }).it.male = 5; // the office's real edit
  });

  const parsed = await parseOk(file, master);
  assert.equal(parsed.sourceSchemaVersion, 12, "(a) reports the file's original schema version");

  const { merged } = consolidate(master, [parsed.doc]);
  assert.deepEqual(
    merged.part1.humanCapital.plantillaUnfilled,
    { it: 3, nonIt: 2 },
    "(a) master's Plantilla (Unfilled) counts survive a v12 file"
  );
  assert.equal(merged.part1.humanCapital.plantilla.it.male, 5, "(a) the office's own Human Capital edit still lands");
}

// ─── (b) v12 file owning Part III-F keeps each KPI row's targetedResult ─────
{
  const master = makeMaster();
  const kpi = (id: string, targetedResult: string) => ({
    id, hierarchy: "Output" as const, targetedResult, indicator: `Indicator ${id}`, baseline: "",
    year1Target: "", year2Target: "", year3Target: "", dataCollectionMethod: "", responsibleUnit: "",
  });
  master.part3.performanceFramework["proj-x"] = {
    projectTitle: "Project X",
    projectCategory: "internal",
    rows: [kpi("kpi-1", "Faster permit processing"), kpi("kpi-2", "Online filing adopted")],
  };

  const file = returnedFile(master, ["part3/f.performanceFramework"], (raw) => {
    raw.schemaVersion = 12;
    const pf = (raw.part3 as { performanceFramework: Record<string, { rows: Record<string, unknown>[] }> })
      .performanceFramework;
    for (const set of Object.values(pf)) for (const row of set.rows) delete row.targetedResult; // v12 had none
    pf["proj-x"].rows[0].indicator = "Edited indicator"; // the office's real edit
    pf["proj-x"].rows.push({ ...kpi("kpi-3", "ignored"), targetedResult: undefined }); // a row the office added
  });

  const parsed = await parseOk(file, master);
  const { merged } = consolidate(master, [parsed.doc]);
  const rows = merged.part3.performanceFramework["proj-x"].rows;
  assert.equal(rows[0].targetedResult, "Faster permit processing", "(b) kpi-1 keeps the master's targetedResult");
  assert.equal(rows[1].targetedResult, "Online filing adopted", "(b) kpi-2 keeps the master's targetedResult");
  assert.equal(rows[0].indicator, "Edited indicator", "(b) the office's own KPI edit still lands");
  assert.equal(rows[2].targetedResult, "", "(b) a row the office added gets the empty default");
}

// ─── (c) v11 file owning I-A + II-A: programs upgrade, concerns keep programIds ─
{
  const master = makeMaster();
  master.part1.orgOutcomes = [
    { id: "oo-1", name: "Better services", programs: [{ id: "oo-1-pg-1", name: "Scholarship" }] },
  ];
  master.part2.strategicConcerns = [
    { id: "sc-1", outcomeIds: ["oo-1"], programIds: ["oo-1-pg-1"], criticalSystem: "HRIS", concern: "Paper forms", desiredStrategy: "Digitize" },
  ];

  const file = returnedFile(master, ["part1/a.orgOutcomes", "part2/a.strategicConcerns"], (raw) => {
    raw.schemaVersion = 11;
    const part1 = raw.part1 as { orgOutcomes: { programs: unknown }[] };
    part1.orgOutcomes[0].programs = ["Scholarship", "Internship"]; // v11: plain strings; office added one
    const part2 = raw.part2 as { strategicConcerns: Record<string, unknown>[] };
    for (const c of part2.strategicConcerns) delete c.programIds; // v11 had none
    part2.strategicConcerns[0].concern = "Paper forms everywhere"; // the office's real edit
    part2.strategicConcerns.push({ id: "sc-2", outcomeIds: [], criticalSystem: "", concern: "New", desiredStrategy: "" });
  });

  const parsed = await parseOk(file, master);
  assert.equal(parsed.sourceSchemaVersion, 11, "(c) reports the file's original schema version");
  const { merged } = consolidate(master, [parsed.doc]);
  assert.deepEqual(
    merged.part1.orgOutcomes[0].programs,
    [{ id: "oo-1-pg-1", name: "Scholarship" }, { id: "oo-1-pg-2", name: "Internship" }],
    "(c) v11 programs arrive as {id, name} with the master's deterministic ids"
  );
  const [sc1, sc2] = merged.part2.strategicConcerns;
  assert.deepEqual(sc1.programIds, ["oo-1-pg-1"], "(c) sc-1 keeps the master's programIds");
  assert.equal(sc1.concern, "Paper forms everywhere", "(c) the office's own concern edit still lands");
  assert.deepEqual(sc2.programIds, [], "(c) a concern the office added gets the empty default");
}

// ─── (d) a damaged editScope is rejected, naming the file and the bad key ───
{
  const master = makeMaster();
  const cases: [string, (scope: Record<string, unknown>) => void, RegExp][] = [
    ["office.id", (sc) => { (sc.office as Record<string, unknown>).id = ""; }, /office\.id/],
    ["editable", (sc) => { sc.editable = "part1"; }, /editable/],
    ["projectIds", (sc) => { sc.projectIds = [1, 2]; }, /projectIds/],
  ];
  for (const [what, damage, pattern] of cases) {
    const file = returnedFile(master, ["part1/b.cioName"], (raw) => damage(raw.editScope as Record<string, unknown>));
    const r = await parseScopedIsspFile(file, master);
    assert.equal(r.success, false, `(d) damaged ${what} is rejected`);
    if (!r.success) {
      assert.match(r.error, /office-a\.issp/, `(d) the error names the file (${what})`);
      assert.match(r.error, pattern, `(d) the error names the bad key (${what})`);
    }
  }
}

console.log("✓ consolidate-upgrade verification passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
