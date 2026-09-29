// Repro/verification for consolidating PRE-v14 returned files (real uacsCode
// shape) into a v14 master through the real parseScopedIsspFile path.
// Run: npx tsx scripts/verify-legacy-uacs-consolidate.ts
import assert from "node:assert/strict";
import { parseScopedIsspFile } from "../src/lib/store/index";
import { createEmptyDocument } from "../src/lib/store/defaults";
import { buildMergeReview } from "../src/lib/scope/merge-review";
import type { IsspDocument, LineItem } from "../src/lib/store/types";

function baseDoc(): IsspDocument {
  return createEmptyDocument({
    title: "Consolidate fixture", startYear: 2028, endYear: 2030, amendmentNumber: 0, scope: "AGENCY_WIDE",
    agencyHeadName: "Head", agency: { name: "Smoke Agency", acronym: "SMK", type: "NGA", websiteUrl: "", logoBase64: null },
  });
}

/** A pre-v14 line in the numeric-code shape the old combobox wrote. */
function legacyLine(id: string, item: string, uacsCode: string, qty = 1): unknown {
  return { id, item, office: "", uacsCode, uacsLabel: uacsCode ? "Old label" : "", fundSource: "General Appropriations Act", qty, unitCost: 1000 };
}

/** A clean v14 line (exactly what a loaded/migrated master carries). */
function v14Line(id: string, item: string, categoryId: string, qty = 1): LineItem {
  return { id, item, office: "", categoryId, fundSource: "General Appropriations Act", qty, unitCost: 1000 };
}

function master(): IsspDocument {
  const d = baseDoc();
  d.part4.year1.officeProductivity.capitalOutlay = [
    v14Line("l1", "Server", "co-ict-machinery-equipment"),      // office's file still has the matching uacsCode
    v14Line("l2", "Old blank-code item", "mooe-ict-supplies"),  // office's file NEVER had a code for this line
    v14Line("l3", "Edited by office", "co-ict-software"),       // office will edit qty
  ];
  return d;
}

/** Returned scoped file still in the v13 shape (uacsCode fields, schemaVersion 13). */
function returnedFile(masterDoc: IsspDocument): File {
  const d = structuredClone(masterDoc);
  d.part4.year1.officeProductivity.capitalOutlay = [
    legacyLine("l1", "Server", "5060405003"),                                                   // same code, office didn't touch it
    legacyLine("l2", "Old blank-code item", ""),                                                // blank code — old tool allowed it
    { ...(legacyLine("l3", "Edited by office", "5060405015") as Record<string, unknown>), qty: 5 }, // office edited qty
  ] as unknown as LineItem[];
  d.schemaVersion = 13;
  d.editScope = {
    office: { id: "a", name: "Office A", displayLabel: "Office A" },
    editable: ["part4/year1.year1"],
    generatedAt: "2026-09-01T00:00:00.000Z",
  };
  return new File([JSON.stringify(d)], "office-a.issp");
}

void (async () => {
  const m = master();
  const parsed = await parseScopedIsspFile(returnedFile(m), m);
  assert.ok(parsed.success, "scoped v13 file parses");

  // ─── (1) the returned file's lines arrive as category ids, legacy shape stripped ──
  {
    const lines = parsed.doc.part4.year1.officeProductivity.capitalOutlay;
    const json = JSON.stringify(lines);
    assert.ok(!json.includes("uacsCode") && !json.includes("uacsLabel"), "(1) legacy fields stripped from the upgraded file");
    assert.equal(lines[0].categoryId, "co-ict-machinery-equipment", "(1) office's own uacsCode mapped to the category");
  }

  // ─── (2) merge review: the real edit surfaces, no spurious category noise ──────
  {
    const review = buildMergeReview(m, [parsed]);
    const lineChanges = review.changes.filter((c) => c.id.includes("officeProductivity/capitalOutlay#") && c.kind !== "unchanged");
    const cellPaths = lineChanges.flatMap((c) => (c.cells ?? []).map((x) => x.path.join(".")));
    console.log("  changed cells:", JSON.stringify(cellPaths));
    assert.deepEqual(cellPaths, ["qty"], "(2) only the office's qty edit is visible — no uacs/category noise");
  }

  console.log("✓ legacy-uacs consolidate verification passed");
})();
