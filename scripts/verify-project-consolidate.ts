// Verify script for the "project-keyed" consolidate strategy — Part III fields.
// Run: npx tsx scripts/verify-project-consolidate.ts
import assert from "node:assert/strict";
import { consolidate } from "../src/lib/scope/consolidate";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IctProject, IsspDocument } from "../src/lib/store/types";

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

console.log("✓ project-consolidate (Part III) verification passed");
