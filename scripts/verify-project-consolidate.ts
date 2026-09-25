// Verify script for the "project-keyed" consolidate strategy — Part III + IV fields.
// Run: npx tsx scripts/verify-project-consolidate.ts
import assert from "node:assert/strict";
import { consolidate } from "../src/lib/scope/consolidate";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IctProject, IsspDocument, ProjectBudget } from "../src/lib/store/types";

function makeMaster(): IsspDocument {
  const d = createEmptyDocument({
    title: "T", startYear: 2028, endYear: 2030, amendmentNumber: 0,
    scope: "AGENCY_WIDE", agencyHeadName: "X",
    agency: { name: "N", acronym: "N", type: "NGA", websiteUrl: "", logoBase64: null },
  });
  return d;
}
function proj(id: string, title: string): IctProject {
  return { id, title, description: "", objectives: "", projectType: "IS_DRIVEN",
    linkedSystemIds: [], strategicAlignment: [], harmonizationFramework: [],
    implementingUnit: "", fundingSource: "", year1Deliverables: "",
    year2Deliverables: "", year3Deliverables: "", duration: "2028" };
}
function sys(id: string, name: string) {
  return { id, name, classification: "" as const, frontline: false,
    frontlineAccessType: "" as const, url: "", description: "", status: "" as const,
    enhancementDetails: "", developmentStrategy: "", developmentPlatform: "",
    databaseName: "", dataStorage: "", internalUsers: "", externalUsers: "",
    owner: "", interoperability: { integrated: false, internalSystems: "",
      externalSystems: "", generatesData: false, processesExternalData: false,
      sharedPlatform: false },
    pia: { processesPersonalInfo: "" as const, piaRequired: false } };
}
function scoped(
  officeId: string,
  editable: string[],
  projectIds: string[] | undefined,
  patch: (d: IsspDocument) => void
): IsspDocument {
  const d = makeMaster();
  d.editScope = {
    office: { id: officeId, name: officeId, displayLabel: officeId },
    editable, generatedAt: "2026-09-17T00:00:00.000Z",
    ...(projectIds ? { projectIds } : {}),
  };
  patch(d);
  return d;
}

// ── (j) replace-by-id: sibling master project untouched, no flags ───────────
{
  const master = makeMaster();
  master.part3.internalProjects = [proj("p1", "One"), proj("p2", "Two")];
  master.part3.performanceFramework = {
    p1: { projectTitle: "One", projectCategory: "internal", rows: [] },
    p2: { projectTitle: "Two", projectCategory: "internal", rows: [] },
  };
  const f = scoped("a", ["part3/e1", "part3/f"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "One (revised)")];
    d.part3.performanceFramework = {
      p1: { projectTitle: "One (revised)", projectCategory: "internal", rows: [] },
    };
  });
  const r = consolidate(master, [f]);
  assert.deepEqual(r.merged.part3.internalProjects.map((p) => p.title),
    ["One (revised)", "Two"], "(j) p1 replaced by id, p2 untouched");
  assert.deepEqual(Object.keys(r.merged.part3.performanceFramework), ["p1", "p2"],
    "(j) PF key p1 replaced, p2 untouched");
  assert.equal(r.reviewFlags.length, 0, "(j) clean replace → no flags");
}

// ── (k) new project: append + review flag on the section ────────────────────
{
  const master = makeMaster();
  master.part3.internalProjects = [proj("p1", "One")];
  const f = scoped("a", ["part3/e1", "part3/f"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "One"), proj("p-new", "Brand New")];
    // Spec edge: KPI set added for a project that exists on the master but
    // whose PF key the master lacks — add + flag (no silent appearance).
    d.part3.performanceFramework = {
      p2: { projectTitle: "Two", projectCategory: "internal", rows: [] },
    };
  });
  master.part3.internalProjects.push(proj("p2", "Two")); // exists, no PF on master
  const r = consolidate(master, [f]);
  assert.deepEqual(r.merged.part3.internalProjects.map((p) => p.id), ["p1", "p2", "p-new"],
    "(k) new project appended");
  assert.ok(r.reviewFlags.includes("part3/e1"), "(k) review flag on part3/e1");
  assert.ok("p2" in r.merged.part3.performanceFramework,
    "(k) PF key added for existing project");
  assert.ok(r.reviewFlags.includes("part3/f"),
    "(k) new PF key flagged for review");
}

// ── (l) deleted-by-office: keep master row + review flag ────────────────────
{
  const master = makeMaster();
  master.part3.internalProjects = [proj("p1", "One"), proj("p2", "Two")];
  const f = scoped("a", ["part3/e1"], ["p1", "p2"], (d) => {
    d.part3.internalProjects = [proj("p1", "One")]; // p2 deleted in the file
  });
  const r = consolidate(master, [f]);
  assert.deepEqual(r.merged.part3.internalProjects.map((p) => p.id), ["p1", "p2"],
    "(l) deleted project kept on master (no silent deletion)");
  assert.ok(r.reviewFlags.includes("part3/e1"), "(l) deletion flagged for review");
}

// ── (m) same project from two offices: differ → flag; equal → no flag ───────
{
  const master = makeMaster();
  master.part3.internalProjects = [proj("p1", "One")];
  const a = scoped("a", ["part3/e1"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "From A")];
  });
  const b = scoped("b", ["part3/e1"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "From B")];
  });
  let r = consolidate(master, [a, b]);
  assert.ok(r.reviewFlags.includes("part3/e1"), "(m) differing double-write flagged");
  assert.equal(r.merged.part3.internalProjects[0].title, "From B",
    "(m) import order applies (later file wins) alongside the flag");

  const b2 = scoped("b", ["part3/e1"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "From A")]; // identical to A
  });
  r = consolidate(master, [a, b2]);
  assert.ok(!r.reviewFlags.includes("part3/e1"), "(m) identical double-write → no flag");
}

// ── (n) resend idempotency: office v1 then v2 — v2 wins, no duplicates ──────
{
  const master = makeMaster();
  master.part3.internalProjects = [proj("p1", "One")];
  const v1 = scoped("a", ["part3/e1"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "v1 edit"), proj("p-extra", "Added by A")];
  });
  const v2 = scoped("a", ["part3/e1"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "v2 edit")]; // p-extra withdrawn
  });
  const r = consolidate(master, [v1, v2]);
  assert.deepEqual(r.merged.part3.internalProjects.map((p) => p.title), ["v2 edit"],
    "(n) only the office's LAST file contributes");
}

// ── (o) mixed batch: unfiltered office adopts replace-by-id too ─────────────
{
  const master = makeMaster();
  master.part3.internalProjects = [proj("p1", "One"), proj("p2", "Two"),
    proj("p3", "Master-only")];
  const filtered = scoped("a", ["part3/e1"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "One (by A)")];
  });
  const unfiltered = scoped("b", ["part3/e1"], undefined, (d) => {
    // B's file was sliced before p3 existed — no p3 row, and it edited p2.
    d.part3.internalProjects = [proj("p1", "One"), proj("p2", "Two (by B)")];
  });
  const r = consolidate(master, [filtered, unfiltered]);
  const byId = Object.fromEntries(r.merged.part3.internalProjects.map((p) => [p.id, p.title]));
  // Import order applies file-by-file: a replaces p1, then b replaces p1 —
  // the LATER file's copy lands, and the differ pre-pass flagged the section.
  assert.equal(byId["p1"], "One", "(o) import order: later file's p1 copy applies");
  assert.equal(byId["p2"], "Two (by B)", "(o) unfiltered office's edits replace by id");
  assert.equal(byId["p3"], "Master-only",
    "(o) master row absent from an unfiltered file SURVIVES (no wholesale overlay)");
  assert.equal(r.merged.part3.internalProjects.length, 3, "(o) no duplicates");
  assert.ok(r.reviewFlags.includes("part3/e1"),
    "(o) differing double-write on p1 flagged despite clean per-id merge");
}

// ── (p) legacy regression: no projectIds anywhere → today's strategies ──────
{
  const master = makeMaster();
  master.part3.internalProjects = [proj("p1", "One")];
  const a = scoped("a", ["part3/e1"], undefined, (d) => {
    d.part3.internalProjects = [proj("pa", "From A")];
  });
  const b = scoped("b", ["part3/e1"], undefined, (d) => {
    d.part3.internalProjects = [proj("pb", "From B")];
  });
  const r = consolidate(master, [a, b]);
  assert.equal(r.merged.part3.internalProjects.length, 3,
    "(p) legacy multi-owner list → union (master + both), unchanged");
  assert.ok(r.reviewFlags.includes("part3/e1"), "(p) legacy union flagged");
}

// ── Part IV imports for the new cases ───────────────────────────────────────
import { applyResolutions } from "../src/lib/scope/consolidate";

function yearBudget(internals: Record<string, ProjectBudget>) {
  return {
    officeProductivity: { capitalOutlay: [], mooe: [] },
    internalProjects: internals,
    crossAgencyProjects: {},
    continuingCosts: { mooe: [] },
  };
}

// ── (q) year budget: replace by project id; category revision does NOT land ─
{
  const master = makeMaster();
  master.part4.year1 = yearBudget({
    p1: { projectTitle: "One", capitalOutlay: [], mooe: [] },
    p2: { projectTitle: "Two", capitalOutlay: [], mooe: [] },
  });
  master.part4.year1.officeProductivity.mooe = [
    { id: "op1", item: "Connectivity", office: "", uacsCode: "", uacsLabel: "",
      fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 100 },
  ];
  const f = scoped("a", ["part4/year1"], ["p1"], (d) => {
    d.part4.year1 = yearBudget({
      p1: { projectTitle: "One (revised)", capitalOutlay: [], mooe: [] },
    });
    d.part4.year1.officeProductivity.mooe = [
      { id: "op1", item: "Connectivity (revised)", office: "", uacsCode: "", uacsLabel: "",
        fundSource: "General Appropriations Act (GAA)", qty: 2, unitCost: 100 },
    ];
  });
  const r = consolidate(master, [f]);
  assert.deepEqual(Object.keys(r.merged.part4.year1.internalProjects), ["p1", "p2"],
    "(q) p1 budget replaced by id, p2 untouched");
  assert.equal(r.merged.part4.year1.internalProjects.p1.projectTitle, "One (revised)",
    "(q) p1 carries the office's revision");
  assert.equal(r.merged.part4.year1.officeProductivity.mooe[0].qty, 1,
    "(q) filtered file's officeProductivity revision does NOT land (agency-wide budget)");
  assert.equal(r.merged.part4.year1.officeProductivity.mooe[0].item, "Connectivity",
    "(q) master's officeProductivity retained");
  assert.equal(r.reviewFlags.length, 0, "(q) clean merge, no flags");
}

// ── (r) two filtered offices, differing officeProductivity: no sub-conflict ──
{
  const master = makeMaster();
  master.part4.year1 = yearBudget({
    p1: { projectTitle: "One", capitalOutlay: [], mooe: [] },
    p2: { projectTitle: "Two", capitalOutlay: [], mooe: [] },
  });
  const a = scoped("a", ["part4/year1"], ["p1"], (d) => {
    d.part4.year1 = yearBudget({ p1: { projectTitle: "One (by A)", capitalOutlay: [], mooe: [] } });
    d.part4.year1.officeProductivity.mooe = [
      { id: "x", item: "From A", office: "", uacsCode: "", uacsLabel: "",
        fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 1 },
    ];
  });
  const b = scoped("b", ["part4/year1"], ["p2"], (d) => {
    d.part4.year1 = yearBudget({ p2: { projectTitle: "Two", capitalOutlay: [], mooe: [] } });
    d.part4.year1.officeProductivity.mooe = [
      { id: "x", item: "From B", office: "", uacsCode: "", uacsLabel: "",
        fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 1 },
    ];
  });
  const r = consolidate(master, [a, b]);
  assert.equal(
    r.scalarConflicts.find((c) => c.fieldKey === "year1.officeProductivity"), undefined,
    "(r) filtered files contribute NOTHING to officeProductivity — no sub-conflict");
  assert.deepEqual(Object.keys(r.merged.part4.year1.internalProjects), ["p1", "p2"],
    "(r) project budgets still merge by id");
  assert.equal(r.merged.part4.year1.officeProductivity.mooe.length, 0,
    "(r) master's officeProductivity retained (file revisions ignored)");
  // MIXED variant: a filtered, b UNFILTERED owning year1 with its own revision.
  const bUn = scoped("b", ["part4/year1"], undefined, (d) => {
    d.part4.year1 = yearBudget({ p2: { projectTitle: "Two (by B)", capitalOutlay: [], mooe: [] } });
    d.part4.year1.officeProductivity.mooe = [
      { id: "x", item: "From B (unfiltered)", office: "", uacsCode: "", uacsLabel: "",
        fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 1 },
    ];
  });
  const r2 = consolidate(master, [a, bUn]);
  assert.equal(
    r2.scalarConflicts.find((c) => c.fieldKey === "year1.officeProductivity"), undefined,
    "(r) single unfiltered sub-object contributor → no conflict");
  assert.equal(r2.merged.part4.year1.officeProductivity.mooe[0].item, "From B (unfiltered)",
    "(r) unfiltered office's officeProductivity overlays");
  assert.equal(r2.merged.part4.year1.internalProjects.p1.projectTitle, "One (by A)",
    "(r) filtered office's project edits still merge");
  assert.equal(r2.merged.part4.year1.internalProjects.p2.projectTitle, "Two (by B)",
    "(r) unfiltered office's project edits still merge");
}

// ── (s) applyResolutions: flat and nested keys ──────────────────────────────
{
  const doc = makeMaster();
  doc.part1.cioName = "old";
  doc.part4.year1.officeProductivity.mooe = [];
  applyResolutions(doc, {
    "part1/b.cioName": "new",
    "part4/year1.year1.officeProductivity": { capitalOutlay: [], mooe: [{ id: "l1" }] },
  });
  assert.equal(doc.part1.cioName, "new", "(s) flat resolution writes the field");
  assert.equal(doc.part4.year1.officeProductivity.mooe.length, 1,
    "(s) nested Part IV resolution writes the SUB-object, not a garbage key");
  assert.ok(!("year1.officeProductivity" in (doc.part4 as unknown as Record<string, unknown>)),
    "(s) no dotted garbage key on part4");
  const before = JSON.stringify(doc);
  applyResolutions(doc, { "definitions.definitions": [{ id: "x" }] });
  assert.equal(JSON.stringify(doc), before, "(s) unknown-section resolution ignored");
}

// ── (u) new project budget key adds + flags; deleted budget key keeps ───────
{
  const master = makeMaster();
  master.part4.year1 = yearBudget({
    p1: { projectTitle: "One", capitalOutlay: [], mooe: [] },
  });
  const f = scoped("a", ["part4/year1"], ["p1", "p2"], (d) => {
    // p1's budget deleted in the file; p-new's budget added.
    d.part4.year1 = yearBudget({
      "p-new": { projectTitle: "Brand New", capitalOutlay: [], mooe: [] },
    });
  });
  const r = consolidate(master, [f]);
  assert.deepEqual(Object.keys(r.merged.part4.year1.internalProjects).sort(), ["p-new", "p1"],
    "(u) p1 kept (deletion does not propagate), p-new added");
  assert.ok(r.reviewFlags.includes("part4/year1"), "(u) year flagged");
}

// ── (v) continuingCosts symmetry: filtered files contribute nothing; ────────
// unfiltered offices in a mixed batch still sub-conflict normally.
{
  const master = makeMaster();
  master.part4.year1 = yearBudget({
    p1: { projectTitle: "One", capitalOutlay: [], mooe: [] },
    p2: { projectTitle: "Two", capitalOutlay: [], mooe: [] },
  });
  master.part4.year1.continuingCosts.mooe = [
    { id: "m", item: "Master licenses", office: "", uacsCode: "", uacsLabel: "",
      fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 1 },
  ];
  const a = scoped("a", ["part4/year1"], ["p1"], (d) => {
    d.part4.year1 = yearBudget({ p1: { projectTitle: "One", capitalOutlay: [], mooe: [] } });
    d.part4.year1.continuingCosts.mooe = [
      { id: "x", item: "From A", office: "", uacsCode: "", uacsLabel: "",
        fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 1 },
    ];
  });
  const b = scoped("b", ["part4/year1"], ["p2"], (d) => {
    d.part4.year1 = yearBudget({ p2: { projectTitle: "Two", capitalOutlay: [], mooe: [] } });
    d.part4.year1.continuingCosts.mooe = [
      { id: "x", item: "From B", office: "", uacsCode: "", uacsLabel: "",
        fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 1 },
    ];
  });
  const r = consolidate(master, [a, b]);
  assert.equal(r.scalarConflicts.length, 0,
    "(v) two filtered offices differing on continuingCosts → NO sub-conflict");
  assert.deepEqual(Object.keys(r.merged.part4.year1.internalProjects), ["p1", "p2"],
    "(v) project budgets still merge by id");
  assert.equal(r.merged.part4.year1.continuingCosts.mooe[0].item, "Master licenses",
    "(v) master's continuingCosts retained (agency-wide budget)");

  // Mixed-batch counterpart: two UNFILTERED year owners + a filtered file in
  // the batch — the sub-conflict machinery between unfiltered offices is
  // unchanged (nested fieldKey, both recorded, master's value kept).
  const u1 = scoped("c", ["part4/year1"], undefined, (d) => {
    d.part4.year1 = yearBudget({ p1: { projectTitle: "One", capitalOutlay: [], mooe: [] } });
    d.part4.year1.continuingCosts.mooe = a.part4.year1.continuingCosts.mooe;
  });
  const u2 = scoped("e", ["part4/year1"], undefined, (d) => {
    d.part4.year1 = yearBudget({ p2: { projectTitle: "Two", capitalOutlay: [], mooe: [] } });
    d.part4.year1.continuingCosts.mooe = b.part4.year1.continuingCosts.mooe;
  });
  const r2 = consolidate(master, [u1, u2, a]);
  const conflict = r2.scalarConflicts.find(
    (c) => c.sectionId === "part4/year1" && c.fieldKey === "year1.continuingCosts"
  );
  assert.ok(conflict, "(v) unfiltered continuingCosts sub-conflict surfaced with nested fieldKey");
  assert.equal(
    r2.scalarConflicts.filter((c) => c.sectionId === "part4/year1").length, 1,
    "(v) exactly one nested conflict (officeProductivity agreed)");
  assert.equal(conflict!.values.length, 2, "(v) both unfiltered offices recorded");
  assert.deepEqual(Object.keys(r2.merged.part4.year1.internalProjects), ["p1", "p2"],
    "(v) project budgets still merged cleanly despite the sub-conflict");
  assert.equal(r2.merged.part4.year1.continuingCosts.mooe[0].item, "Master licenses",
    "(v) conflicted sub-object stays at master's value");
  assert.ok(r2.reviewFlags.includes("part4/year1"), "(v) year flagged for review");
}

// ── (w) proposed systems merge by id: replace / append / keep-on-absence ────
{
  const master = makeMaster();
  master.part3.proposedSystems = [sys("sysA", "System A"), sys("sysB", "System B")];
  master.part3.internalProjects = [proj("p1", "One")];
  const f = scoped("a", ["part3/d", "part3/e1"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "One")];
    d.part3.proposedSystems = [sys("sysA", "System A (revised)"), sys("sysNew", "New")];
  });
  const r = consolidate(master, [f]);
  assert.deepEqual(r.merged.part3.proposedSystems.map((s) => s.id),
    ["sysA", "sysB", "sysNew"],
    "(w) sysA replaced by id, sysB kept, sysNew appended");
  assert.equal(r.merged.part3.proposedSystems[0].name, "System A (revised)",
    "(w) revision lands on the matched id");
  assert.ok(r.reviewFlags.includes("part3/d"), "(w) new system flags part3/d for review");

  // Deleting sysB from the file must NOT flag nor remove it — projectIds
  // addresses projects, not systems; absence may just mean "not linked".
  const f2 = scoped("a", ["part3/d", "part3/e1"], ["p1"], (d) => {
    d.part3.internalProjects = [proj("p1", "One")];
    d.part3.proposedSystems = [sys("sysA", "System A (revised 2)")];
  });
  const r2 = consolidate(master, [f2]);
  assert.deepEqual(r2.merged.part3.proposedSystems.map((s) => s.id), ["sysA", "sysB"],
    "(w) absent system kept (no deletion semantics for systems)");
  assert.ok(!r2.reviewFlags.includes("part3/d"),
    "(w) absence alone flags nothing");
}

console.log("✓ project-consolidate (Part III + Part IV) verification passed");
