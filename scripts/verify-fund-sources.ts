// Regression test for the fund-source spelling drift: commit a65fbe2
// (2026-09-17) renamed three stored fund-source values without migrating
// data, so older files kept "General Appropriations Act (GAA)",
// "Foreign-Assisted" and "Locally Funded". Those values match no dropdown
// option, and a file that mixes old and new spellings split the Part IV
// Summary B.2 (editor and PDF) into two rows for the same fund source.
// Run: npx tsx scripts/verify-fund-sources.ts
import assert from "node:assert/strict";
import { migrateLegacyDoc } from "../src/lib/store/index";
import { createEmptyDocument } from "../src/lib/store/defaults";
import { FUND_SOURCE_OPTIONS, groupByFundSource } from "../src/lib/fund-sources";
import { buildB2 } from "../src/components/issp-editor/part4/part4-aggregations";
import type { IctProject, IsspDocument, LineItem } from "../src/lib/store/types";

function line(id: string, fundSource: string, unitCost = 1000): LineItem {
  return { id, item: id, office: "", categoryId: "", fundSource, qty: 1, unitCost };
}
function project(id: string, fundingSource: string): IctProject {
  return {
    id, title: id, description: "", objectives: "", projectType: "", linkedSystemIds: [], strategicAlignment: [],
    harmonizationFramework: [], implementingUnit: "", fundingSource, year1Deliverables: "", year2Deliverables: "",
    year3Deliverables: "", duration: "",
  };
}

/** A file that mixes the pre-2026-09-17 spellings with the current ones. */
function mixedDoc(): IsspDocument {
  const doc = createEmptyDocument({
    title: "Fund source fixture", startYear: 2028, endYear: 2030, amendmentNumber: 0, scope: "AGENCY_WIDE",
    agencyHeadName: "Head", agency: { name: "Smoke Agency", acronym: "SMK", type: "NGA", websiteUrl: "", logoBase64: null },
  });
  doc.part4.year1.officeProductivity.capitalOutlay = [
    line("l1", "General Appropriations Act (GAA)"),
    line("l2", "General Appropriations Act"),
    line("l3", "Foreign-Assisted"),
    line("l4", "Locally Funded"),
  ];
  doc.part4.year1.continuingCosts.mooe = [line("l5", "Other Income Generating Sources")];
  doc.part4.year2.internalProjects["p1"] = { projectTitle: "P1", capitalOutlay: [line("l6", "Foreign-assisted projects")], mooe: [line("l7", "Locally funded")] };
  doc.part3.internalProjects = [project("p1", "General Appropriations Act (GAA)"), project("p2", "Foreign-Assisted")];
  doc.part3.crossAgencyProjects = [project("p3", "Locally Funded")];
  return doc;
}

function allLines(doc: IsspDocument): LineItem[] {
  return (["year1", "year2", "year3"] as const).flatMap((y) => {
    const yb = doc.part4[y];
    return [
      ...yb.officeProductivity.capitalOutlay, ...yb.officeProductivity.mooe, ...yb.continuingCosts.mooe,
      ...Object.values(yb.internalProjects).flatMap((p) => [...p.capitalOutlay, ...p.mooe]),
      ...Object.values(yb.crossAgencyProjects).flatMap((p) => [...p.capitalOutlay, ...p.mooe]),
    ];
  });
}

// ─── (a) loading a file upgrades every old spelling to a dropdown option ─────
{
  const doc = migrateLegacyDoc(mixedDoc());
  const offList = allLines(doc).map((l) => l.fundSource).filter((v) => !(FUND_SOURCE_OPTIONS as readonly string[]).includes(v));
  assert.deepEqual(offList, [], "(a) every Part IV line item carries a dropdown option after load");
  assert.deepEqual(
    [...doc.part3.internalProjects, ...doc.part3.crossAgencyProjects].map((p) => p.fundingSource),
    ["General Appropriations Act", "Foreign-assisted projects", "Locally funded"],
    "(a) III-E project funding sources are upgraded too"
  );
  const again = migrateLegacyDoc(structuredClone(doc));
  assert.deepEqual(again, doc, "(a) the upgrade is idempotent");
}

// ─── (b) Summary B.2 (editor) groups by fund source, not by exact text ───────
{
  const doc = mixedDoc(); // NOT migrated — B.2 must still not split
  const rows = buildB2([doc.part4.year1, doc.part4.year2, doc.part4.year3]).filter((r) => !r.isTotal);
  assert.deepEqual(
    rows.map((r) => [r.label, r.total]),
    [
      ["General Appropriations Act", 2000],
      ["Foreign-assisted projects", 2000],
      ["Locally funded", 2000],
      ["Other Income Generating Sources", 1000],
    ],
    "(b) one B.2 row per fund source, in template order"
  );
}

// ─── (c) the grouping the PDF's B.2 uses does not split either ───────────────
{
  const groups = groupByFundSource(allLines(mixedDoc()), (l) => l.qty * l.unitCost);
  assert.deepEqual([...groups.entries()], [
    ["General Appropriations Act", 2000],
    ["Foreign-assisted projects", 2000],
    ["Locally funded", 2000],
    ["Other Income Generating Sources", 1000],
  ], "(c) PDF B.2 grouping: one entry per fund source, in template order");
}

console.log("✓ fund-source verification passed");
