// Verify script for src/lib/scope/consolidate.ts — the Phase 3 merge engine.
// Run: npx tsx scripts/verify-consolidate.ts
//
// Covers the merge-contract cases:
//  (a) unique-owner overlay
//  (b) shared-table replace-by-office (part1/c.stakeholders)
//  (c) multi-office shared-table merge (each office's rows replace only their own)
//  (d) overlap on a list field (empty master list) → both offices' rows + review flag
//  (d2–d9) row-id list merge with the master as merge base: no duplicates,
//      one change wins, delete, edit-vs-edit / edit-vs-delete / same-new-id
//      row conflicts, appended new rows, and applyResolutions row choices
//  (e) scalar field written by ≥2 offices → scalarConflicts entry, no silent pick
//  (f) idempotent re-import: B v1 then B v2 — no duplicates, A untouched
//  (g) same-value scalar across ≥2 owners → overlay the agreed value, NO conflict
//  (h) different-value scalar across ≥2 owners → conflict + merged keeps master
//  (h2–h4) scalar + Part IV sub-object merge base: one change wins in any file
//      order; conflict options list only the offices that changed the value
//
// Plus purity (master + file inputs are not mutated, no aliasing) and the
// consolidationFlags write-through.

import assert from "node:assert/strict";
import { applyResolutions, consolidate, conflictKey, ROW_REMOVED } from "../src/lib/scope/consolidate";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { Annex1FilePayload, DefinitionTerm, IctProject, IsspDocument, Stakeholder } from "../src/lib/store/types";

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

// ─── Row-id list merge with the master as merge base (Q14 / D2) ─────────────
// Every owning office's file starts from the SAME master rows (Distribute
// copies them), so each office's list is judged against the master per row id.
function project(id: string, title: string): IctProject {
  return { id, title, description: "", objectives: "", projectType: "", linkedSystemIds: [], strategicAlignment: [], harmonizationFramework: [], implementingUnit: "", fundingSource: "", year1Deliverables: "", year2Deliverables: "", year3Deliverables: "", duration: "" };
}
const E1 = ["part3/e1.internalProjects"];

// (d2) two owners, neither changes the master rows → no duplicates, no flag
{
  const master = makeMaster();
  master.part3.internalProjects = [project("p1", "One"), project("p2", "Two")];
  const a = scoped("a", E1, (d) => { d.part3.internalProjects = structuredClone(master.part3.internalProjects); });
  const b = scoped("b", E1, (d) => { d.part3.internalProjects = structuredClone(master.part3.internalProjects); });
  const r = consolidate(master, [a, b]);
  assert.deepEqual(r.merged.part3.internalProjects.map((p) => p.id), ["p1", "p2"], "(d2) master rows appear once each");
  assert.equal(r.scalarConflicts.length, 0, "(d2) no conflict");
  assert.ok(!r.reviewFlags.includes("part3/e1"), "(d2) no flag when nothing changed");
}

// (d3) A edits a row, B leaves it untouched → A's version, no conflict
{
  const master = makeMaster();
  master.part3.internalProjects = [project("p1", "One"), project("p2", "Two")];
  const a = scoped("a", E1, (d) => { d.part3.internalProjects = [project("p1", "One — edited by A"), project("p2", "Two")]; });
  const b = scoped("b", E1, (d) => { d.part3.internalProjects = structuredClone(master.part3.internalProjects); });
  const r = consolidate(master, [a, b]);
  assert.deepEqual(r.merged.part3.internalProjects.map((p) => p.title), ["One — edited by A", "Two"], "(d3) A's edit wins in place");
  assert.equal(r.scalarConflicts.length, 0, "(d3) no conflict when only one office changed the row");
  assert.ok(!r.reviewFlags.includes("part3/e1"), "(d3) no flag");
}

// (d4) A and B edit the same row differently → row conflict, master row kept
{
  const master = makeMaster();
  master.part3.internalProjects = [project("p1", "One")];
  const a = scoped("a", E1, (d) => { d.part3.internalProjects = [project("p1", "One (A)")]; });
  const b = scoped("b", E1, (d) => { d.part3.internalProjects = [project("p1", "One (B)")]; });
  const r = consolidate(master, [a, b]);
  assert.equal(r.scalarConflicts.length, 1, "(d4) one row conflict");
  const c = r.scalarConflicts[0];
  assert.equal(conflictKey(c), "part3/e1.internalProjects#p1", "(d4) conflict is keyed by row id");
  assert.deepEqual(c.values.map((v) => [v.officeId, (v.value as IctProject).title]), [["a", "One (A)"], ["b", "One (B)"]], "(d4) both versions offered");
  assert.equal((c.master as IctProject).title, "One", "(d4) master row offered as keep-master");
  assert.equal(r.merged.part3.internalProjects[0].title, "One", "(d4) merged keeps the master row until resolved");
  assert.ok(r.reviewFlags.includes("part3/e1"), "(d4) section flagged");
}

// (d5) A deletes a row, B leaves it untouched → row removed, no conflict
{
  const master = makeMaster();
  master.part3.internalProjects = [project("p1", "One"), project("p2", "Two")];
  const a = scoped("a", E1, (d) => { d.part3.internalProjects = [project("p2", "Two")]; });
  const b = scoped("b", E1, (d) => { d.part3.internalProjects = structuredClone(master.part3.internalProjects); });
  const r = consolidate(master, [a, b]);
  assert.deepEqual(r.merged.part3.internalProjects.map((p) => p.id), ["p2"], "(d5) deleted row removed");
  assert.equal(r.scalarConflicts.length, 0, "(d5) no conflict");
}

// (d6) A edits a row, B deletes it → row conflict (edited / removed / keep master)
{
  const master = makeMaster();
  master.part3.internalProjects = [project("p1", "One")];
  const a = scoped("a", E1, (d) => { d.part3.internalProjects = [project("p1", "One (A)")]; });
  const b = scoped("b", E1, (d) => { d.part3.internalProjects = []; });
  const r = consolidate(master, [a, b]);
  assert.equal(r.scalarConflicts.length, 1, "(d6) edit-vs-delete is a conflict");
  const byOffice = Object.fromEntries(r.scalarConflicts[0].values.map((v) => [v.officeId, v.value]));
  assert.equal((byOffice.a as IctProject).title, "One (A)", "(d6) A's edited version offered");
  assert.equal(byOffice.b, ROW_REMOVED, "(d6) B's deletion offered as ROW_REMOVED");
  assert.equal(r.merged.part3.internalProjects.length, 1, "(d6) master row kept until resolved");
}

// (d7) both offices add rows with new ids → both appended, section flagged
{
  const master = makeMaster();
  master.part3.internalProjects = [project("p1", "One")];
  const a = scoped("a", E1, (d) => { d.part3.internalProjects = [project("p1", "One"), project("pa", "From A")]; });
  const b = scoped("b", E1, (d) => { d.part3.internalProjects = [project("p1", "One"), project("pb", "From B")]; });
  const r = consolidate(master, [a, b]);
  assert.deepEqual(r.merged.part3.internalProjects.map((p) => p.id), ["p1", "pa", "pb"], "(d7) new rows appended in batch order");
  assert.equal(r.scalarConflicts.length, 0, "(d7) no conflict");
  assert.ok(r.reviewFlags.includes("part3/e1"), "(d7) flagged: two offices added rows (possible duplicates)");
}

// (d8) the same new id with different content from two offices → row conflict
{
  const master = makeMaster();
  master.part3.internalProjects = [];
  const a = scoped("a", E1, (d) => { d.part3.internalProjects = [project("px", "X by A")]; });
  const b = scoped("b", E1, (d) => { d.part3.internalProjects = [project("px", "X by B")]; });
  const r = consolidate(master, [a, b]);
  assert.equal(r.scalarConflicts.length, 1, "(d8) conflicting new row surfaced");
  assert.equal(r.scalarConflicts[0].master, ROW_REMOVED, "(d8) keep-master means 'not added'");
  assert.equal(r.merged.part3.internalProjects.length, 0, "(d8) left out until resolved");
}

// (d9) applyResolutions: each row-conflict choice lands in the merged doc
{
  const master = makeMaster();
  master.part3.internalProjects = [project("p1", "One"), project("p2", "Two")];
  const a = scoped("a", E1, (d) => { d.part3.internalProjects = [project("p1", "One (A)"), project("p2", "Two"), project("px", "X by A")]; });
  const b = scoped("b", E1, (d) => { d.part3.internalProjects = [project("p2", "Two"), project("px", "X by B")]; });
  const pick = (officeOrMaster: string) => {
    const r = consolidate(master, [a, b]);
    const resolutions: Record<string, unknown> = {};
    for (const c of r.scalarConflicts) {
      resolutions[conflictKey(c)] = officeOrMaster === "master"
        ? c.master
        : c.values.find((v) => v.officeId === officeOrMaster)!.value;
    }
    applyResolutions(r.merged, resolutions);
    return r.merged.part3.internalProjects.map((p) => `${p.id}:${p.title}`);
  };
  // p1: A edited, B deleted. px: new id, different content from A and B.
  assert.deepEqual(pick("a"), ["p1:One (A)", "p2:Two", "px:X by A"], "(d9) picking A: A's edit + A's new row");
  assert.deepEqual(pick("b"), ["p2:Two", "px:X by B"], "(d9) picking B: p1 removed + B's new row");
  assert.deepEqual(pick("master"), ["p1:One", "p2:Two"], "(d9) keep master: p1 unchanged, px not added");
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

// ─── (g) same-value scalar across ≥2 owners → overlay, NOT conflict ─────────
// Spec: a scalar conflict arises only when a field is "written differently" by
// ≥2 offices. Two offices sending the SAME value is an implicit agreement —
// overlay the agreed value once, emit NO conflict. (Regression guard: an
// earlier version flagged this AND left merged.part1.cioName at the master's
// stale "" default, which could have shipped an empty CIO name.)
{
  const master = makeMaster();
  const a = scoped("a", ["part1/b.cioName"], (d) => {
    d.part1.cioName = "Atty. Cruz";
  });
  const b = scoped("b", ["part1/b.cioName"], (d) => {
    d.part1.cioName = "Atty. Cruz";
  });
  const r = consolidate(master, [a, b]);
  const conflictForCioName = r.scalarConflicts.find(
    (c) => c.sectionId === "part1/b" && c.fieldKey === "cioName"
  );
  assert.equal(conflictForCioName, undefined, "(g) no scalar conflict when values agree");
  assert.equal(r.merged.part1.cioName, "Atty. Cruz", "(g) agreed value overlaid into merged");
  assert.ok(!r.reviewFlags.includes("part1/b"), "(g) no review flag for agreement");
}

// ─── (h) different-value scalar across ≥2 owners → conflict, merged unchanged ─
// The counterpart to (g): when values genuinely differ, surface a conflict with
// each office's value, and leave the merged field at the master's existing value
// (no silent pick). Uses a non-default master value so "unchanged" is meaningful.
{
  const master = makeMaster();
  master.part1.cioName = "Master-On-File";
  const a = scoped("a", ["part1/b.cioName"], (d) => {
    d.part1.cioName = "Atty. Cruz";
  });
  const b = scoped("b", ["part1/b.cioName"], (d) => {
    d.part1.cioName = "Atty. Dela Cruz";
  });
  const r = consolidate(master, [a, b]);
  assert.equal(r.scalarConflicts.length, 1, "(h) one scalar conflict surfaced");
  const c = r.scalarConflicts[0];
  assert.equal(c.sectionId, "part1/b", "(h) conflict sectionId");
  assert.equal(c.fieldKey, "cioName", "(h) conflict fieldKey");
  assert.equal(c.values.length, 2, "(h) both offices recorded with their values");
  const byOffice = Object.fromEntries(c.values.map((v) => [v.officeId, v.value]));
  assert.equal(byOffice.a, "Atty. Cruz", "(h) office a value");
  assert.equal(byOffice.b, "Atty. Dela Cruz", "(h) office b value");
  assert.equal(r.merged.part1.cioName, "Master-On-File", "(h) merged keeps master value (no silent pick)");
}

// ─── (h2) D3: only one office changed a scalar → its value, NO conflict ───────
// The master is the merge base: an office that returns the master's value has
// not written the field, so the one office that did change it wins — in
// either file order.
{
  const master = makeMaster();
  master.part1.cioName = "Master-On-File";
  const a = scoped("a", ["part1/b.cioName"], (d) => { d.part1.cioName = "Master-On-File"; });
  const b = scoped("b", ["part1/b.cioName"], (d) => { d.part1.cioName = "Atty. Reyes"; });
  for (const order of [[a, b], [b, a]]) {
    const r = consolidate(master, order);
    assert.equal(r.scalarConflicts.length, 0, "(h2) no conflict when only one office changed the field");
    assert.equal(r.merged.part1.cioName, "Atty. Reyes", "(h2) the changed value wins regardless of file order");
    assert.ok(!r.reviewFlags.includes("part1/b"), "(h2) no flag");
  }
}

// ─── (h3) D3: conflict values list only the offices that changed the field ───
{
  const master = makeMaster();
  master.part1.cioName = "Master-On-File";
  const a = scoped("a", ["part1/b.cioName"], (d) => { d.part1.cioName = "Master-On-File"; });
  const b = scoped("b", ["part1/b.cioName"], (d) => { d.part1.cioName = "Atty. Reyes"; });
  const c = scoped("c", ["part1/b.cioName"], (d) => { d.part1.cioName = "Atty. Santos"; });
  const r = consolidate(master, [a, b, c]);
  assert.equal(r.scalarConflicts.length, 1, "(h3) B and C changed it differently → conflict");
  assert.deepEqual(r.scalarConflicts[0].values.map((v) => v.officeId), ["b", "c"], "(h3) unchanged office A is not an option");
  assert.equal(r.scalarConflicts[0].master, "Master-On-File", "(h3) master value offered as keep-master");
}

// ─── (h4) D3 for Part IV sub-objects (project-keyed batches) ──────────────────
// A project filter anywhere in the batch decomposes the Part IV year budget;
// officeProductivity / continuingCosts are then judged against the master too.
{
  const line = (id: string, item: string) => ({ id, item, office: "", categoryId: "", fundSource: "General Appropriations Act", qty: 1, unitCost: 1000 });
  const Y1 = ["part4/year1.year1"];
  const master = makeMaster();
  master.part4.year1.officeProductivity.capitalOutlay = [line("op-1", "Printers")];
  const unchanged = scoped("a", Y1, (d) => { d.part4.year1 = structuredClone(master.part4.year1); });
  const changed = scoped("b", Y1, (d) => {
    d.part4.year1 = structuredClone(master.part4.year1);
    d.part4.year1.officeProductivity.capitalOutlay.push(line("op-2", "Scanners"));
  });
  const projectFile = scoped("c", Y1, (d) => { d.editScope!.projectIds = []; });
  for (const order of [[unchanged, changed, projectFile], [changed, unchanged, projectFile]]) {
    const r = consolidate(master, order);
    assert.equal(r.scalarConflicts.length, 0, "(h4) no sub-conflict when only one office changed Office Productivity");
    assert.deepEqual(
      r.merged.part4.year1.officeProductivity.capitalOutlay.map((l) => l.id),
      ["op-1", "op-2"],
      "(h4) the changed Office Productivity wins regardless of file order"
    );
  }
}

// ─── (i) multi-owner definitions → overlay (last file wins) + review flag, NO ─
// conflict. Regression guard: an earlier strategyFor returned "scalar-conflict"
// for the no-partKey case (definitions has no Part I–IV prefix), which emitted
// a spurious scalarConflict for "definitions.definitions" in the pre-pass and
// surfaced a misleading "pick a value" UI — but the resolution overlay skips
// no-partKey sections, so the secretariat's pick was silently dropped and the
// merged doc kept whatever the last file wrote (file-order-dependent). The
// main-pass branch is the real handler: last-write-wins + reviewFlags.add
// ("definitions") when ≥2 offices owned it.
{
  const master = makeMaster();
  const aDefs: DefinitionTerm[] = [{ id: "a1", term: "A-term", definition: "from-a" }];
  const bDefs: DefinitionTerm[] = [{ id: "b1", term: "B-term", definition: "from-b" }];
  const a = scoped("a", ["definitions.definitions"], (d) => {
    d.definitions = aDefs;
  });
  const b = scoped("b", ["definitions.definitions"], (d) => {
    d.definitions = bDefs;
  });
  const r = consolidate(master, [a, b]);
  const conflictForDefinitions = r.scalarConflicts.find(
    (c) => c.sectionId === "definitions" && c.fieldKey === "definitions"
  );
  assert.equal(conflictForDefinitions, undefined, "(i) NO scalar conflict for multi-owner definitions");
  assert.ok(r.reviewFlags.includes("definitions"), "(i) definitions flagged for review");
  // Main-pass rule: iterate files in order, last write wins → b.definitions.
  assert.deepEqual(
    r.merged.definitions,
    bDefs,
    "(i) merged.definitions is the last file's value (deterministic last-write-wins)"
  );

  // Order independence of the flag: swap file order, flag still set, last still wins.
  const r2 = consolidate(master, [b, a]);
  assert.ok(r2.reviewFlags.includes("definitions"), "(i) review flag set regardless of file order");
  assert.deepEqual(
    r2.merged.definitions,
    aDefs,
    "(i) merged.definitions follows file iteration order (a is now last)"
  );
  assert.equal(
    r2.scalarConflicts.find((c) => c.sectionId === "definitions"),
    undefined,
    "(i) no spurious conflict regardless of file order"
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

// ─── Purity: master and file inputs must not be mutated, no aliasing ─────────
// Two distinct guarantees: (1) consolidate itself does not mutate its inputs;
// (2) `merged` shares NO object/array references with the inputs — a later
// in-memory mutation of `merged` before save cannot write back into a file.
// The second is what makes the merge safe to hand to downstream code that may
// edit `merged` (review screen, idb persistence, etc.).
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
  const r = consolidate(master, [b]);
  assert.equal(JSON.stringify(master), masterSnap, "purity: master unchanged by consolidate");
  assert.equal(JSON.stringify(b), bSnap, "purity: file input unchanged by consolidate");

  // No aliasing: mutate the merged doc's overlaid fields/rows and confirm the
  // file input is still byte-identical to its pre-consolidate snapshot.
  const bRowInMerged = r.merged.part1.stakeholders.find((s) => s.officeId === "b");
  assert.ok(bRowInMerged, "purity: B's row present in merged");
  (bRowInMerged as { name: string }).name = "MUTATED";
  r.merged.part1.cioName = "MUTATED";
  assert.equal(
    JSON.stringify(b),
    bSnap,
    "purity (no aliasing): mutating merged does not propagate to file input"
  );
}

console.log("✓ consolidate verification passed");
