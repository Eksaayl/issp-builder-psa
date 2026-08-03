// Verify script for src/lib/scope/consolidate.ts — the Phase 3 merge engine.
// Run: npx tsx scripts/verify-consolidate.ts
//
// Covers the six merge-contract cases:
//  (a) unique-owner overlay
//  (b) shared-table replace-by-office (part1/c.stakeholders)
//  (c) multi-office shared-table merge (each office's rows replace only their own)
//  (d) overlap on a list field → union + review flag
//  (e) scalar field written by ≥2 offices → scalarConflicts entry, no silent pick
//  (f) idempotent re-import: B v1 then B v2 — no duplicates, A untouched
//
// Plus purity (master + file inputs are not mutated) and the consolidationFlags
// write-through.

import assert from "node:assert/strict";
import { consolidate } from "../src/lib/scope/consolidate";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { Annex1FilePayload, IsspDocument, Stakeholder } from "../src/lib/store/types";

function makeMaster(): IsspDocument {
  return createEmptyDocument({
    title: "T",
    startYear: 2026,
    endYear: 2028,
    amendmentNumber: 0,
    scope: "AGENCY_WIDE",
    agencyHeadName: "X",
    agency: { name: "N", acronym: "N", type: "NGA", websiteUrl: "", logoBase64: null },
  });
}

/** Build a scoped file for `officeId` owning `editable` paths, with patches applied. */
function scoped(
  officeId: string,
  editable: string[],
  patch: (d: IsspDocument) => void
): IsspDocument {
  const d = makeMaster();
  d.editScope = {
    office: { id: officeId, name: officeId, displayLabel: officeId },
    editable,
    generatedAt: "2026-07-21T00:00:00.000Z",
  };
  patch(d);
  return d;
}

// ─── (a) unique-owner overlay ────────────────────────────────────────────────
{
  const master = makeMaster();
  const a = scoped("a", ["part1/b.cioName"], (d) => {
    d.part1.cioName = "Atty. A";
  });
  const r = consolidate(master, [a]);
  assert.equal(r.merged.part1.cioName, "Atty. A", "(a) overlay writes the owned field");
  // Sibling field not owned by A must stay at the master default.
  assert.equal(r.merged.part1.cioEmail, "", "(a) non-owned sibling untouched");
  assert.equal(r.reviewFlags.length, 0, "(a) no review flag for unique owner");
  assert.equal(r.scalarConflicts.length, 0, "(a) no scalar conflict for unique owner");
}

// ─── (b) shared-table replace-by-office (single office in batch) ─────────────
{
  const master = makeMaster();
  master.part1.stakeholders = [
    { id: "legacy", name: "Legacy", services: [] }, // no officeId → secretariat/legacy
  ];
  const b = scoped("b", ["part1/c.stakeholders"], (d) => {
    d.part1.stakeholders = [
      { id: "1", rowId: "r1", officeId: "b", name: "S1", services: [] },
      { id: "2", rowId: "r2", officeId: "b", name: "S2", services: [] },
    ];
  });
  const r = consolidate(master, [b]);
  const rows = r.merged.part1.stakeholders;
  assert.equal(rows.length, 3, "(b) legacy + B(2) = 3");
  assert.ok(rows.some((x) => !x.officeId), "(b) legacy row preserved");
  assert.equal(rows.filter((x) => x.officeId === "b").length, 2, "(b) B's 2 rows present");
}

// ─── (c) multi-office shared-table merge ─────────────────────────────────────
{
  const master = makeMaster();
  master.part1.stakeholders = [];
  const b = scoped("b", ["part1/c.stakeholders"], (d) => {
    d.part1.stakeholders = [
      { id: "1", rowId: "r1", officeId: "b", name: "S1", services: [] },
      { id: "2", rowId: "r2", officeId: "b", name: "S2", services: [] },
    ];
  });
  const a = scoped("a", ["part1/c.stakeholders"], (d) => {
    d.part1.stakeholders = [
      { id: "3", rowId: "r3", officeId: "a", name: "S3", services: [] },
    ];
  });
  const r = consolidate(master, [b, a]);
  assert.equal(r.merged.part1.stakeholders.length, 3, "(c) B(2)+A(1) = 3, clean merge");
}

// ─── (d) overlap on a list field → union + review flag ───────────────────────
{
  const master = makeMaster();
  master.part3.internalProjects = [];
  const a = scoped("a", ["part3/e1.internalProjects"], (d) => {
    d.part3.internalProjects = [
      { id: "pa1", title: "PA-one", description: "", objectives: "", projectType: "", linkedSystemIds: [], strategicAlignment: [], harmonizationFramework: [], implementingUnit: "", fundingSource: "", year1Deliverables: "", year2Deliverables: "", year3Deliverables: "", duration: "" },
    ];
  });
  const b = scoped("b", ["part3/e1.internalProjects"], (d) => {
    d.part3.internalProjects = [
      { id: "pb1", title: "PB-one", description: "", objectives: "", projectType: "", linkedSystemIds: [], strategicAlignment: [], harmonizationFramework: [], implementingUnit: "", fundingSource: "", year1Deliverables: "", year2Deliverables: "", year3Deliverables: "", duration: "" },
    ];
  });
  const r = consolidate(master, [a, b]);
  assert.equal(r.merged.part3.internalProjects.length, 2, "(d) both offices' items unioned");
  assert.ok(r.reviewFlags.includes("part3/e1"), "(d) review flag set on overlapped section");
  assert.equal(r.merged.consolidationFlags?.includes("part3/e1"), true, "(d) flag written to merged.consolidationFlags");
}

// ─── (e) scalar field written differently by ≥2 offices → conflict ──────────
{
  const master = makeMaster();
  const a = scoped("a", ["part1/b.cioName"], (d) => {
    d.part1.cioName = "Atty. Cruz";
  });
  const b = scoped("b", ["part1/b.cioName"], (d) => {
    d.part1.cioName = "Atty. Dela Cruz";
  });
  const r = consolidate(master, [a, b]);
  assert.equal(r.scalarConflicts.length, 1, "(e) one scalar conflict surfaced");
  const c = r.scalarConflicts[0];
  assert.equal(c.sectionId, "part1/b", "(e) conflict sectionId");
  assert.equal(c.fieldKey, "cioName", "(e) conflict fieldKey");
  assert.equal(c.values.length, 2, "(e) both offices recorded");
  const byOffice = Object.fromEntries(c.values.map((v) => [v.officeId, v.value]));
  assert.equal(byOffice.a, "Atty. Cruz", "(e) office a value");
  assert.equal(byOffice.b, "Atty. Dela Cruz", "(e) office b value");
}

// ─── (f) idempotent re-import: B v1 → B v2, A untouched ──────────────────────
// The spec's timeline. B v2 replaces B's rows rather than duplicating; A's row
// (sent in the same batch) survives. This is the single most important test.
{
  const master = makeMaster();
  master.part1.stakeholders = [];
  const bV1 = scoped("b", ["part1/c.stakeholders"], (d) => {
    d.part1.stakeholders = [
      { id: "1", rowId: "r1", officeId: "b", name: "S1", services: [] },
      { id: "2", rowId: "r2", officeId: "b", name: "S2", services: [] },
    ];
  });
  const a1 = scoped("a", ["part1/c.stakeholders"], (d) => {
    d.part1.stakeholders = [
      { id: "3", rowId: "r3", officeId: "a", name: "S3", services: [] },
    ];
  });
  // First confirm (b)+(c) baseline holds.
  let r = consolidate(master, [bV1, a1]);
  assert.equal(r.merged.part1.stakeholders.length, 3, "(f) baseline B(2)+A(1)");

  // Now B fixes typos and resends v2 in the same batch — B's v2 must replace v1.
  const bV2 = scoped("b", ["part1/c.stakeholders"], (d) => {
    d.part1.stakeholders = [
      { id: "1b", rowId: "r1b", officeId: "b", name: "S1-fixed", services: [] },
      { id: "2b", rowId: "r2b", officeId: "b", name: "S2-fixed", services: [] },
    ];
  });
  r = consolidate(master, [bV1, a1, bV2]);
  const rows = r.merged.part1.stakeholders as Stakeholder[];
  assert.equal(rows.length, 3, "(f) B replaced (2) + A(1) = 3, no duplicates");
  assert.ok(
    rows.every((x) => x.officeId !== "b" || ["r1b", "r2b"].includes(x.rowId ?? "")),
    "(f) B's rows are the v2 versions"
  );
  assert.ok(
    rows.some((x) => x.officeId === "a" && x.rowId === "r3"),
    "(f) A's row untouched by B's resend"
  );
}

// ─── Annex 1 (annexes/annex1) replace-by-office + idempotent re-import ──────
// Annex1FilePayload.officeId is the merge key (Task 6 stamp). Each office's
// payload replaces only its own; legacy payloads without officeId are preserved.
{
  const master = makeMaster();
  const legacy: Annex1FilePayload = {
    version: "1.0", fileType: "annex1", exportedAt: "x", tool: "issp-platform",
    office: { type: "region", name: "Legacy", displayLabel: "Legacy" },
    annex1: { equipment: [], software: [] },
  };
  master.annexedOffices = [legacy];

  const aPayload: Annex1FilePayload = {
    version: "1.0", fileType: "annex1", exportedAt: "x", tool: "issp-platform",
    office: { type: "region", name: "A", displayLabel: "A" }, officeId: "a",
    annex1: { equipment: [], software: [] },
  };
  const a = scoped("a", ["annexes/annex1"], (d) => {
    d.annexedOffices = [aPayload];
  });

  let r = consolidate(master, [a]);
  assert.equal(r.merged.annexedOffices!.length, 2, "(annex1) legacy + A = 2");
  assert.ok(r.merged.annexedOffices!.some((o) => !o.officeId), "(annex1) legacy preserved");

  // Re-import with a v2 payload for A — A's v1 replaced, legacy untouched.
  const aV2: Annex1FilePayload = {
    ...aPayload,
    office: { type: "region", name: "A-fixed", displayLabel: "A-fixed" },
  };
  const a2 = scoped("a", ["annexes/annex1"], (d) => {
    d.annexedOffices = [aV2];
  });
  r = consolidate(master, [a, a2]);
  assert.equal(r.merged.annexedOffices!.length, 2, "(annex1) idempotent: legacy + A(v2) = 2");
  const aRows = r.merged.annexedOffices!.filter((o) => o.officeId === "a");
  assert.equal(aRows.length, 1, "(annex1) A appears once after re-import");
  assert.equal(aRows[0].office.displayLabel, "A-fixed", "(annex1) A is v2");
}

// ─── Purity: master and file inputs must not be mutated ──────────────────────
{
  const master = makeMaster();
  master.part1.stakeholders = [];
  const masterSnap = JSON.stringify(master);
  const b = scoped("b", ["part1/c.stakeholders", "part1/b.cioName"], (d) => {
    d.part1.stakeholders = [
      { id: "1", rowId: "r1", officeId: "b", name: "S1", services: [] },
    ];
    d.part1.cioName = "B";
  });
  const bSnap = JSON.stringify(b);
  consolidate(master, [b]);
  assert.equal(JSON.stringify(master), masterSnap, "purity: master unchanged");
  assert.equal(JSON.stringify(b), bSnap, "purity: file input unchanged");
}

console.log("✓ consolidate verification passed");
