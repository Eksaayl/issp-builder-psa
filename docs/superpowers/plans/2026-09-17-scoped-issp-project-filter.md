# Scoped ISSP Per-Project Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the secretariat generate scoped `.issp` files limited to specific projects (recipient edits their project's III-E details, III-F KPIs, and Part IV budgets), with consolidate merging those files back per project id.

**Architecture:** One optional field — `editScope.projectIds?: string[]` (absent = all projects) — drives three coordinated changes: a row filter in `sliceScopedDoc`, a "Projects" panel in the Distribute dialog, and a new `project-keyed` merge strategy in `consolidate()` that replaces rows/keys by project id instead of overlaying whole fields. Part IV year fields decompose into per-project records plus non-project sub-objects.

**Tech Stack:** Next.js 16 (App Router), TypeScript, zustand-like store (`src/lib/store`), shadcn-style components, standalone `scripts/verify-*.ts` assert scripts run with `tsx`, Puppeteer `.mjs` smokes.

**Spec:** `docs/superpowers/specs/2026-09-17-scoped-issp-project-filter-design.md`

## Global Constraints

- **NEVER run `npm run build`, `npm start`, or `pm2 restart issp`** during this work — this is a shared dev+prod tree; a prod build desyncs the live pm2 process (AGENTS.md "Production & deploy safety"). Deploy is a separate, Carlos-gated step.
- **Type gate = `npx tsc --noEmit` AND `npm run lint`.** This is the only build-like step allowed.
- **Unit-verify convention:** standalone assert scripts, `npx tsx scripts/<name>.ts`, using `node:assert/strict` and **relative imports** (`../src/lib/...`) — see `scripts/verify-slice.ts`, `scripts/verify-consolidate.ts`.
- **Puppeteer smokes:** dev server on `http://localhost:3000` (check `ss -tlnp | grep :3000` first; start `npm run dev` in the background only if absent). Chrome at `/root/.cache/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome`. Neutralize `crypto.randomUUID` on every page (non-secure context). Trusted native clicks for buttons that trigger downloads. Fresh page per phase. `networkidle2`, never `networkidle0`.
- **No schemaVersion bump.** `editScope.projectIds` is additive and optional; old files mean "all projects".
- **IDs stay stable and readable** (`proj-sikap`, not random UUIDs) in fixtures.
- Commit messages: conventional style, end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

---

### Task 1: Schema — `EditScope.projectIds` + `PROJECT_BEARING_FIELDS`

**Files:**
- Modify: `src/lib/scope/types.ts:17-25`
- Modify: `src/lib/scope/paths.ts` (add export near `SHARED_TABLE_PATHS`)
- Test: `scripts/verify-scope-paths.ts` (extend)

**Interfaces:**
- Produces: `EditScope.projectIds?: string[]` (absent = all projects; `[]` = start-empty) — consumed by Tasks 2, 3, 6.
- Produces: `export const PROJECT_BEARING_FIELDS: ReadonlySet<string>` in `src/lib/scope/paths.ts`, members in `${sectionId}.${fieldKey}` leaf format — consumed by Tasks 2, 3, 6.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/verify-scope-paths.ts` (add the two imports at the top alongside the existing ones):

```ts
// ── project-bearing fields (per-project distribution filter domain) ─────────
import { SECTION_FIELDS } from "../src/lib/section-fields";
import { PROJECT_BEARING_FIELDS } from "../src/lib/scope/paths";

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/verify-scope-paths.ts`
Expected: FAIL — `PROJECT_BEARING_FIELDS` is not exported (module has no such export).

- [ ] **Step 3: Implement**

In `src/lib/scope/types.ts`, extend `EditScope` (add after `sourceDocId?`):

```ts
export interface EditScope {
  office: OfficeIdentity;
  /** Editable paths at any level (area / section / field). */
  editable: EditPath[];
  /** ISO timestamp when sliced from the master. */
  generatedAt: string;
  /** Master provenance, for idempotent re-merge. */
  sourceDocId?: string;
  /**
   * Project-row filter (per-project distribution). Absent = all projects
   * (legacy files + unfiltered offices). Present = only these project ids
   * travel in the project-bearing fields (see PROJECT_BEARING_FIELDS);
   * an empty array means "start empty" — the office adds its own rows.
   */
  projectIds?: string[];
}
```

In `src/lib/scope/paths.ts`, add directly below `SHARED_TABLE_PATHS`:

```ts
/**
 * Field paths whose value holds per-project data — lists of IctProject or
 * records keyed by project id. `editScope.projectIds` filters these at slice
 * time, and consolidate()'s "project-keyed" strategy merges their rows/keys
 * by project id. Members are leaf paths (`sectionId.fieldKey`).
 */
export const PROJECT_BEARING_FIELDS: ReadonlySet<string> = new Set([
  "part3/e1.internalProjects",
  "part3/e2.crossAgencyProjects",
  "part3/f.performanceFramework",
  "part4/year1.year1",
  "part4/year2.year2",
  "part4/year3.year3",
]);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx scripts/verify-scope-paths.ts`
Expected: `✓ scope-paths verification passed`

- [ ] **Step 5: Type gate**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scope/types.ts src/lib/scope/paths.ts scripts/verify-scope-paths.ts
git commit -m "feat(scope): editScope.projectIds + PROJECT_BEARING_FIELDS registry

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Slice — project filter + read-only context

**Files:**
- Modify: `src/lib/scope/slice.ts`
- Test (create): `scripts/verify-project-slice.ts`

**Interfaces:**
- Consumes: `EditScope.projectIds` (Task 1), `PROJECT_BEARING_FIELDS` (Task 1).
- Produces: `DistributeSpec.projectIds?: string[]` — consumed by the Distribute dialog (Task 6).
- Behavior contract: when `projectIds` is present, the five project-bearing spots are filtered to those ids; selected projects' detail rows are ALWAYS carried (context when III-E1/E2 unowned); linked systems of carried projects are carried when III-D unowned; `officeProductivity`/`continuingCosts` follow field ownership untouched; `editScope.projectIds` written through; absence of `projectIds` = byte-identical legacy behavior.

- [ ] **Step 1: Write the failing verify script**

Create `scripts/verify-project-slice.ts`:

```ts
// Verify script for the per-project slice filter (editScope.projectIds).
// Run: npx tsx scripts/verify-project-slice.ts
import assert from "node:assert/strict";
import { sliceScopedDoc, type DistributeSpec } from "../src/lib/scope/slice";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IctProject, KpiRow, LineItem, ProjectKpiSet } from "../src/lib/store/types";

// ── fixtures ────────────────────────────────────────────────────────────────
function proj(id: string, title: string, linked: string[]): IctProject {
  return {
    id, title, description: "", objectives: "", projectType: "IS_DRIVEN",
    linkedSystemIds: linked, strategicAlignment: [], harmonizationFramework: [],
    implementingUnit: "", fundingSource: "", year1Deliverables: "",
    year2Deliverables: "", year3Deliverables: "", duration: "2028",
  };
}
function kpi(id: string): KpiRow {
  return { id, hierarchy: "Output", indicator: `indicator-${id}`, baseline: "",
    year1Target: "", year2Target: "", year3Target: "", dataCollectionMethod: "",
    responsibleUnit: "" };
}
function kpiSet(title: string, category: "internal" | "crossAgency"): ProjectKpiSet {
  return { projectTitle: title, projectCategory: category, rows: [kpi("k1")] };
}
function line(id: string, item: string): LineItem {
  return { id, item, office: "", uacsCode: "", uacsLabel: "",
    fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 100 };
}

function makeMaster() {
  const d = createEmptyDocument({
    title: "Agency ISSP 2028-2030", startYear: 2028, endYear: 2030,
    amendmentNumber: 0, scope: "AGENCY_WIDE", agencyHeadName: "Dir. X",
    agency: { name: "N", acronym: "N", type: "NGA", websiteUrl: "", logoBase64: null },
  });
  d.part3.proposedSystems = [
    { id: "sys-hris", name: "HRIS", classification: "", frontline: false,
      frontlineAccessType: "", url: "", description: "", status: "",
      enhancementDetails: "", developmentStrategy: "", developmentPlatform: "",
      databaseName: "", dataStorage: "", internalUsers: "", externalUsers: "",
      owner: "", interoperability: { integrated: false, internalSystems: "",
        externalSystems: "", generatesData: false, processesExternalData: false,
        sharedPlatform: false },
      pia: { processesPersonalInfo: "", piaRequired: false } },
    { id: "sys-fin", name: "Finance", classification: "", frontline: false,
      frontlineAccessType: "", url: "", description: "", status: "",
      enhancementDetails: "", developmentStrategy: "", developmentPlatform: "",
      databaseName: "", dataStorage: "", internalUsers: "", externalUsers: "",
      owner: "", interoperability: { integrated: false, internalSystems: "",
        externalSystems: "", generatesData: false, processesExternalData: false,
        sharedPlatform: false },
      pia: { processesPersonalInfo: "", piaRequired: false } },
  ];
  d.part3.internalProjects = [
    proj("proj-sikap", "SIKAP", ["sys-hris"]),
    proj("proj-records", "Records Digitization", ["sys-fin"]),
  ];
  d.part3.crossAgencyProjects = [proj("proj-portal", "Bayanihan Portal", [])];
  d.part3.performanceFramework = {
    "proj-sikap": kpiSet("SIKAP", "internal"),
    "proj-records": kpiSet("Records Digitization", "internal"),
    "proj-portal": kpiSet("Bayanihan Portal", "crossAgency"),
  };
  d.part4.year1 = {
    officeProductivity: { capitalOutlay: [], mooe: [line("op-1", "Office connectivity")] },
    internalProjects: {
      "proj-sikap": { projectTitle: "SIKAP", capitalOutlay: [line("co-1", "Servers")], mooe: [] },
      "proj-records": { projectTitle: "Records Digitization", capitalOutlay: [], mooe: [line("m-1", "Scanning")] },
    },
    crossAgencyProjects: {
      "proj-portal": { projectTitle: "Bayanihan Portal", capitalOutlay: [], mooe: [line("m-2", "Hosting")] },
    },
    continuingCosts: { mooe: [line("cc-1", "Licenses")] },
  };
  d.part4.year2.internalProjects = {
    "proj-sikap": { projectTitle: "SIKAP", capitalOutlay: [], mooe: [line("y2-1", "Maintenance")] },
  };
  return d;
}

// ── (a) full bundle office: E1 + F + all three years, filtered to SIKAP ─────
{
  const master = makeMaster();
  const spec: DistributeSpec = {
    office: { id: "imp", name: "Implementor", displayLabel: "Implementor" },
    editable: ["part3/e1", "part3/f", "part4/year1", "part4/year2", "part4/year3"],
    projectIds: ["proj-sikap"],
  };
  const s = sliceScopedDoc(master, spec);

  assert.deepEqual(s.editScope!.projectIds, ["proj-sikap"], "(a) projectIds written through");
  assert.deepEqual(s.part3.internalProjects.map((p) => p.id), ["proj-sikap"],
    "(a) E1 filtered to selected project");
  assert.deepEqual(s.part3.crossAgencyProjects, [], "(a) unselected cross-agency project stripped");
  assert.deepEqual(Object.keys(s.part3.performanceFramework), ["proj-sikap"],
    "(a) PF filtered to selected project");
  assert.deepEqual(Object.keys(s.part4.year1.internalProjects), ["proj-sikap"],
    "(a) year1 internal budget filtered");
  assert.deepEqual(Object.keys(s.part4.year1.crossAgencyProjects), [],
    "(a) year1 cross-agency budget filtered");
  assert.deepEqual(Object.keys(s.part4.year2.internalProjects), ["proj-sikap"],
    "(a) year2 budget filtered");
  assert.deepEqual(s.part4.year1.officeProductivity.mooe.map((l) => l.id), ["op-1"],
    "(a) officeProductivity NOT project-filtered (owned → copied wholesale)");
  assert.deepEqual(s.part4.year1.continuingCosts.mooe.map((l) => l.id), ["cc-1"],
    "(a) continuingCosts NOT project-filtered");
  assert.deepEqual(s.part3.proposedSystems.map((x) => x.id), ["sys-hris"],
    "(a) linked-system context: only systems of carried projects");
}

// ── (b) Part-IV-only office: project rows carried as read-only context ─────
{
  const master = makeMaster();
  const spec: DistributeSpec = {
    office: { id: "fin", name: "Finance", displayLabel: "Finance" },
    editable: ["part4/year1", "part4/year2", "part4/year3"],
    projectIds: ["proj-sikap"],
  };
  const s = sliceScopedDoc(master, spec);

  assert.ok(
    !s.editScope!.editable.includes("part3/e1"),
    "(b) III-E1 not owned"
  );
  assert.deepEqual(s.part3.internalProjects.map((p) => p.id), ["proj-sikap"],
    "(b) context rows injected even though E1 unowned (Part IV forms need them)");
  assert.deepEqual(s.part3.performanceFramework, {},
    "(b) PF unowned → stays at default (no context needed)");
  assert.deepEqual(Object.keys(s.part4.year1.internalProjects), ["proj-sikap"],
    "(b) year1 budget filtered to selected project");
}

// ── (c) start-empty: projectIds [] strips every project row ─────────────────
{
  const master = makeMaster();
  const s = sliceScopedDoc(master, {
    office: { id: "x", name: "X", displayLabel: "X" },
    editable: ["part3/e1"],
    projectIds: [],
  });
  assert.deepEqual(s.part3.internalProjects, [], "(c) start-empty E1");
  assert.deepEqual(s.editScope!.projectIds, [], "(c) projectIds preserved as []");
}

// ── (d) legacy: no projectIds → wholesale copy (today's behavior) ───────────
{
  const master = makeMaster();
  const s = sliceScopedDoc(master, {
    office: { id: "x", name: "X", displayLabel: "X" },
    editable: ["part3/e1", "part3/f", "part4/year1"],
  });
  assert.equal(s.part3.internalProjects.length, 2, "(d) all internal projects copied");
  assert.equal(Object.keys(s.part3.performanceFramework).length, 3, "(d) all PF keys copied");
  assert.equal(Object.keys(s.part4.year1.internalProjects).length, 2, "(d) all budget keys copied");
  assert.equal(s.editScope!.projectIds, undefined, "(d) projectIds omitted (legacy shape)");
}

// ── (e) unowned year fields + owned III-D: filter/context boundaries ────────
{
  const master = makeMaster();
  const s = sliceScopedDoc(master, {
    office: { id: "x", name: "X", displayLabel: "X" },
    editable: ["part3/e1", "part3/d"], // owns systems; owns NO year, NO F
    projectIds: ["proj-sikap"],
  });
  assert.deepEqual(s.part4.year1.internalProjects, {}, "(e) unowned year stays at default");
  assert.equal(s.part3.proposedSystems.length, 2,
    "(e) owned III-D keeps ALL systems (filter applies to context only)");
}

// ── (f) deep isolation: mutating the slice never touches the master ─────────
{
  const master = makeMaster();
  const s = sliceScopedDoc(master, {
    office: { id: "x", name: "X", displayLabel: "X" },
    editable: ["part3/e1"],
    projectIds: ["proj-sikap"],
  });
  s.part3.internalProjects[0].title = "MUTATED";
  s.part4.year1.officeProductivity.mooe[0].item = "MUTATED";
  assert.equal(master.part3.internalProjects[0].title, "SIKAP", "(f) master project row untouched");
  assert.equal(master.part4.year1.officeProductivity.mooe[0].item, "Office connectivity",
    "(f) master officeProductivity untouched");
}

console.log("✓ project-slice verification passed");
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/verify-project-slice.ts`
Expected: FAIL at case (a) — `s.editScope!.projectIds` is `undefined` (filter not implemented; `DistributeSpec` has no `projectIds`).

- [ ] **Step 3: Implement in `src/lib/scope/slice.ts`**

3a. Extend `DistributeSpec`:

```ts
export interface DistributeSpec {
  office: OfficeIdentity;
  /** Editable paths at any level (area / section / field). */
  editable: EditPath[];
  /** Master provenance, for idempotent re-merge in consolidate(). */
  sourceDocId?: string;
  /**
   * Project-row filter. Absent = all projects. Present = only these project
   * ids travel in the project-bearing fields (empty = start-empty).
   */
  projectIds?: string[];
}
```

3b. Insert this block after `sliced.annexedOffices = [];` and before `const now = ...`:

```ts
  // ── Per-project filter (editScope.projectIds) ─────────────────────────────
  //
  // Filters the five project-bearing spots to the selected ids. Project
  // DETAIL rows are carried even when III-E1/E2 are unowned: the III-F and
  // Part IV forms render from the Part III project lists, so a Part-IV-only
  // office needs the rows as read-only context (they are not in `editable`,
  // so the sections stay hidden and consolidate ignores them). Linked systems
  // of carried projects ride along the same way — the III-E form can then
  // show the links and cannot silently wipe linkedSystemIds via an empty
  // picker. officeProductivity / continuingCosts are NOT project-keyed and
  // follow plain field ownership.
  if (spec.projectIds) {
    const ids = new Set(spec.projectIds);
    const pick = <T extends { id: string }>(rows: T[]): T[] =>
      rows.filter((r) => ids.has(r.id));

    sliced.part3.internalProjects = pick(master.part3.internalProjects);
    sliced.part3.crossAgencyProjects = pick(master.part3.crossAgencyProjects);

    if (resolved.editableFields.has("part3/f.performanceFramework")) {
      sliced.part3.performanceFramework = Object.fromEntries(
        Object.entries(master.part3.performanceFramework).filter(([id]) => ids.has(id))
      );
    }

    for (const y of ["year1", "year2", "year3"] as const) {
      if (!resolved.editableFields.has(`part4/${y}.${y}`)) continue;
      sliced.part4[y] = {
        ...sliced.part4[y],
        internalProjects: Object.fromEntries(
          Object.entries(master.part4[y].internalProjects).filter(([id]) => ids.has(id))
        ),
        crossAgencyProjects: Object.fromEntries(
          Object.entries(master.part4[y].crossAgencyProjects).filter(([id]) => ids.has(id))
        ),
      };
    }

    if (!resolved.editableFields.has("part3/d.proposedSystems")) {
      const carried = [...sliced.part3.internalProjects, ...sliced.part3.crossAgencyProjects];
      const linked = new Set(carried.flatMap((p) => p.linkedSystemIds));
      sliced.part3.proposedSystems = master.part3.proposedSystems.filter((s) =>
        linked.has(s.id)
      );
    }
  }
```

3c. Write `projectIds` through to the emitted scope (only when present, so legacy files stay byte-identical):

```ts
  const editScope: EditScope = {
    office: spec.office,
    editable: spec.editable,
    generatedAt: now,
    sourceDocId: spec.sourceDocId,
    ...(spec.projectIds ? { projectIds: spec.projectIds } : {}),
  };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx scripts/verify-project-slice.ts && npx tsx scripts/verify-slice.ts`
Expected: `✓ project-slice verification passed` AND `✓ slice verification passed` (legacy regression).

- [ ] **Step 5: Type gate**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scope/slice.ts scripts/verify-project-slice.ts
git commit -m "feat(scope): slice filters project-bearing fields to editScope.projectIds

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Consolidate — `project-keyed` strategy for Part III fields

**Files:**
- Modify: `src/lib/scope/consolidate.ts`
- Test (create): `scripts/verify-project-consolidate.ts` (Part III cases; Part IV cases arrive in Task 4)

**Interfaces:**
- Consumes: `EditScope.projectIds` (Task 1), `PROJECT_BEARING_FIELDS` (Task 1).
- Produces: `Strategy` gains `"project-keyed"`; `consolidate()` output shape unchanged.
- Merge contract (Part III): rows/keys **replace by project id**; ids new to the master **append + review flag**; owned ids missing from the file but present on the master **keep the master row + review flag** (no silent deletion); the same id written differently by ≥2 offices → **review flag** (import order applies); identical writes from ≥2 offices → no flag. Active for a field when **any file in the batch declares `projectIds`**; pure-legacy batches keep today's strategies. Only each office's **last file** (batch order) contributes for a project-keyed field (resend idempotency).

- [ ] **Step 1: Write the failing verify script**

Create `scripts/verify-project-consolidate.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/verify-project-consolidate.ts`
Expected: FAIL at case (j) — with today's code the filtered file's single-owner `part3/e1.internalProjects` gets `overlay` (whole-list replace), so `p2` is dropped (`["One (revised)"]` ≠ expected).

- [ ] **Step 3: Implement in `src/lib/scope/consolidate.ts`**

3a. Extend the imports and strategy type:

```ts
import { resolveScope, SHARED_TABLE_PATHS, PROJECT_BEARING_FIELDS } from "@/lib/scope/paths";
```

```ts
type Strategy = "shared-table" | "list-union" | "scalar-conflict" | "overlay" | "project-keyed";
```

3b. Activate the strategy in `strategyFor` — add the parameter and the branch. `strategyFor` is called from `consolidate()`; pass the new flag through:

```ts
function strategyFor(
  key: string,
  sid: string,
  owners: string[],
  files: IsspDocument[],
  anyProjectFilter: boolean
): Strategy {
  if (SHARED_TABLE_PATHS.has(key) || SHARED_TABLE_PATHS.has(sid)) {
    return "shared-table";
  }
  // Per-project distribution: when ANY file in the batch declares a project
  // filter, the five project-bearing fields merge by project id (replace /
  // append / keep-on-delete) instead of overlay/union. Pure-legacy batches
  // keep the strategies below, byte-for-byte.
  if (anyProjectFilter && PROJECT_BEARING_FIELDS.has(key)) {
    return "project-keyed";
  }
  if (owners.length <= 1) return "overlay";
  // ... (rest unchanged)
```

In `consolidate()`, compute the flag before the strategy loop and pass it:

```ts
  const anyProjectFilter = files.some((f) => f.editScope?.projectIds !== undefined);
```

3c. Add the latest-file-per-office map (resend idempotency) next to the strategy map, after the `strategy` loop:

```ts
  // For project-keyed fields, only each office's LAST file (batch order)
  // contributes — a resent file replaces that office's earlier submission
  // instead of duplicating rows (same idempotency contract as shared tables).
  const latestByKey = new Map<string, Map<string, IsspDocument>>();
  if (anyProjectFilter) {
    for (const key of strategy.keys()) {
      if (strategy.get(key) !== "project-keyed") continue;
      const last = new Map<string, IsspDocument>();
      for (const file of files) {
        const officeId = file.editScope!.office.id;
        if (!resolveScope(file.editScope!.editable).editableFields.has(key)) continue;
        last.set(officeId, file);
      }
      latestByKey.set(key, last);
    }
  }
```

3d. Add the multi-writer differ pre-pass (after `latestByKey`, before the main pass):

```ts
  // Same project id written DIFFERENTLY by ≥2 offices → review flag (import
  // order still applies — like multi-owner definitions, the flag is the
  // safety net, not a blocker). Identical writes are implicit agreement.
  if (anyProjectFilter) {
    for (const [key, strat] of strategy) {
      if (strat !== "project-keyed") continue;
      const dot = key.indexOf(".");
      const sid = key.slice(0, dot);
      const writers = new Map<string, Set<string>>(); // projectId -> distinct JSON
      for (const file of latestByKey.get(key)?.values() ?? []) {
        for (const [id, value] of projectEntries(file, key)) {
          const set = writers.get(id) ?? new Set();
          set.add(JSON.stringify(value));
          writers.set(id, set);
        }
      }
      if ([...writers.values()].some((s) => s.size > 1)) reviewFlags.add(sid);
    }
  }
```

And its helper (module scope, above `consolidate`):

```ts
/** (projectId, value) pairs a file contributes for a project-bearing key. */
function projectEntries(file: IsspDocument, key: string): [string, unknown][] {
  const dot = key.indexOf(".");
  const sid = key.slice(0, dot);
  const fk = key.slice(dot + 1);
  if (sid === "part3/e1") return file.part3.internalProjects.map((r) => [r.id, r] as [string, unknown]);
  if (sid === "part3/e2") return file.part3.crossAgencyProjects.map((r) => [r.id, r] as [string, unknown]);
  if (sid === "part3/f") return Object.entries(file.part3.performanceFramework);
  const yb = file.part4[fk as "year1" | "year2" | "year3"];
  if (!yb) return [];
  return [
    ...Object.entries(yb.internalProjects),
    ...Object.entries(yb.crossAgencyProjects),
  ];
}
```

3e. Main pass — skip superseded same-office files, then handle the new case. At the top of the `for (const key of editableFields)` loop body (after the `dot`/`sid`/`fk` destructuring, before the annex1 branch is fine — but simplest right after destructuring):

```ts
      // Project-keyed fields: only the office's latest file in the batch
      // contributes (see latestByKey).
      if (strategy.get(key) === "project-keyed" && latestByKey.get(key)?.get(officeId) !== file) {
        continue;
      }
```

Then add the case to the `switch` (before `default`). `master` is in scope as the pure-merge source; the deletion check consults the MASTER's rows (not the partially-merged `target`, which may already contain another office's additions):

```ts
        case "project-keyed": {
          const pids = scope.projectIds;
          const masterPart = master[partKey] as unknown as Record<string, unknown>;
          let changed = false;

          if (sid === "part3/e1" || sid === "part3/e2") {
            const srcRows = ((src[fk] as { id: string }[]) ?? []);
            const dstRows = (target[fk] as { id: string }[]) ?? [];
            const masterRows = ((masterPart[fk] as { id: string }[]) ?? []);
            const next = [...dstRows];
            for (const row of srcRows) {
              const i = next.findIndex((r) => r.id === row.id);
              if (i >= 0) next[i] = structuredClone(row); // replace by id
              else {
                next.push(structuredClone(row)); // new project
                changed = true;
              }
            }
            if (pids) {
              const present = new Set(srcRows.map((r) => r.id));
              // deleted-by-office: owned id missing from the file but present
              // on the master → KEEP the master row, flag the section.
              if (pids.some((id) => !present.has(id) && masterRows.some((r) => r.id === id))) {
                changed = true;
              }
            }
            target[fk] = next;
          } else if (sid === "part3/f") {
            const srcRec = (src[fk] as Record<string, unknown>) ?? {};
            const dstRec = (target[fk] as Record<string, unknown>) ?? {};
            const masterRec = (masterPart[fk] as Record<string, unknown>) ?? {};
            for (const [id, v] of Object.entries(srcRec)) {
              if (!(id in masterRec)) changed = true; // new KPI set
              dstRec[id] = structuredClone(v); // replace by key
            }
            if (pids) {
              const present = new Set(Object.keys(srcRec));
              if (pids.some((id) => !present.has(id) && id in masterRec)) changed = true;
            }
          }
          // part4/yearN decomposition arrives with the Part IV task.

          if (changed) reviewFlags.add(sid);
          break;
        }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx scripts/verify-project-consolidate.ts && npx tsx scripts/verify-consolidate.ts`
Expected: `✓ project-consolidate (Part III) verification passed` AND `✓ consolidate verification passed` (legacy regression, incl. case (d) union).

- [ ] **Step 5: Type gate**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scope/consolidate.ts scripts/verify-project-consolidate.ts
git commit -m "feat(scope): consolidate project-keyed merge for Part III fields

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Consolidate — Part IV decomposition + `applyResolutions`

**Files:**
- Modify: `src/lib/scope/consolidate.ts`
- Modify: `src/lib/store/index.tsx:1093-1103` (resolution applier swap)
- Test: `scripts/verify-project-consolidate.ts` (append Part IV cases)

**Interfaces:**
- Consumes: Task 3's `project-keyed` scaffolding (`latestByKey`, pre-pass structure).
- Produces: `export function applyResolutions(merged: IsspDocument, resolutions: Record<string, unknown>): void` in `src/lib/scope/consolidate.ts` — consumed by the store (Task 4 Step 3) and testable standalone. Supports nested Part IV field keys (`"year1.officeProductivity"`).
- Part IV contract: when `project-keyed` is active for `part4/yearN.yearN`, `.internalProjects`/`.crossAgencyProjects` merge per project id (Task 3 rules); `officeProductivity`/`continuingCosts` overlay when all contributing offices agree, and surface as a `ScalarConflict` with nested fieldKey (`"year1.officeProductivity"`) when they differ (merged keeps master's value).

- [ ] **Step 1: Append the failing Part IV + applyResolutions cases**

Append to `scripts/verify-project-consolidate.ts` (before the final `console.log`):

```ts
// ── Part IV imports for the new cases ───────────────────────────────────────
import { applyResolutions } from "../src/lib/scope/consolidate";

function yearBudget(internals: Record<string, { projectTitle: string; capitalOutlay: unknown[]; mooe: unknown[] }>) {
  return {
    officeProductivity: { capitalOutlay: [], mooe: [] },
    internalProjects: internals,
    crossAgencyProjects: {},
    continuingCosts: { mooe: [] },
  };
}

// ── (q) year budget: replace by project id; officeProductivity overlays ─────
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
  assert.equal(r.merged.part4.year1.officeProductivity.mooe[0].qty, 2,
    "(q) single-writer officeProductivity overlays");
  assert.equal(r.reviewFlags.length, 0, "(q) clean merge, no flags");
}

// ── (r) two filtered offices on the same year, officeProductivity differs ───
{
  const master = makeMaster();
  master.part4.year1 = yearBudget({
    p1: { projectTitle: "One", capitalOutlay: [], mooe: [] },
    p2: { projectTitle: "Two", capitalOutlay: [], mooe: [] },
  });
  const a = scoped("a", ["part4/year1"], ["p1"], (d) => {
    d.part4.year1 = yearBudget({ p1: { projectTitle: "One", capitalOutlay: [], mooe: [] } });
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
  const conflict = r.scalarConflicts.find(
    (c) => c.sectionId === "part4/year1" && c.fieldKey === "year1.officeProductivity"
  );
  assert.ok(conflict, "(r) sub-field conflict surfaced with nested fieldKey");
  assert.equal(conflict!.values.length, 2, "(r) both offices recorded");
  assert.deepEqual(Object.keys(r.merged.part4.year1.internalProjects), ["p1", "p2"],
    "(r) project budgets still merged cleanly despite the sub-conflict");
  assert.ok(r.reviewFlags.includes("part4/year1"), "(r) year flagged for review");
  // agreed sub-object → no conflict (single distinct value)
  const b2 = scoped("b", ["part4/year1"], ["p2"], (d) => {
    d.part4.year1 = yearBudget({ p2: { projectTitle: "Two", capitalOutlay: [], mooe: [] } });
    d.part4.year1.officeProductivity.mooe = a.part4.year1.officeProductivity.mooe;
  });
  const r2 = consolidate(master, [a, b2]);
  assert.equal(
    r2.scalarConflicts.find((c) => c.fieldKey === "year1.officeProductivity"), undefined,
    "(r) agreeing sub-objects → no conflict");
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

console.log("✓ project-consolidate (Part III + Part IV) verification passed");
```

(Replace the final `console.log` line of Task 3 with the one above.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/verify-project-consolidate.ts`
Expected: FAIL — case (q): `part4/year1.year1` still hits `overlay` (whole YearBudget replaced → `p2` gone), or a type error for the missing `applyResolutions` export.

- [ ] **Step 3: Implement in `src/lib/scope/consolidate.ts`**

3a. Part IV sub-conflict pre-pass — insert immediately after the Task 3 multi-writer pre-pass:

```ts
  // Part IV sub-object conflicts (officeProductivity / continuingCosts):
  // decided batch-wide, once per year field, exactly once like scalar
  // conflicts. FieldKey is NESTED ("year1.officeProductivity") so the store's
  // resolution applier can address the sub-object.
  const subConflicts = new Set<string>(); // `${sid}.${fk}.${sub}`
  if (anyProjectFilter) {
    for (const [key, strat] of strategy) {
      if (strat !== "project-keyed") continue;
      const dot = key.indexOf(".");
      const sid = key.slice(0, dot);
      if (!sid.startsWith("part4/")) continue;
      const fk = key.slice(dot + 1);
      for (const sub of ["officeProductivity", "continuingCosts"] as const) {
        const values: { officeId: string; value: unknown }[] = [];
        for (const file of latestByKey.get(key)?.values() ?? []) {
          const yb = file.part4[fk as "year1" | "year2" | "year3"];
          values.push({ officeId: file.editScope!.office.id, value: yb[sub] });
        }
        const distinct = new Set(values.map((v) => JSON.stringify(v.value)));
        if (distinct.size > 1) {
          subConflicts.add(`${sid}.${fk}.${sub}`);
          reviewFlags.add(sid);
          scalarConflicts.push({ sectionId: sid, fieldKey: `${fk}.${sub}`, values });
        }
      }
    }
  }
```

3b. Complete the `case "project-keyed"` from Task 3 — replace the trailing comment `// part4/yearN decomposition arrives with the Part IV task.` with:

```ts
          } else {
            // part4/yearN — decompose the YearBudget: project sub-records
            // merge by id; the two non-project sub-objects overlay when every
            // contributor agrees and stay at master's value when conflicted
            // (the sub-conflict pre-pass already surfaced the pick).
            const srcYB = src[fk] as typeof master.part4.year1;
            const dstYB = target[fk] as typeof master.part4.year1;
            const masterYB = masterPart[fk] as typeof master.part4.year1;
            for (const bucket of ["internalProjects", "crossAgencyProjects"] as const) {
              for (const [id, v] of Object.entries(srcYB[bucket])) {
                if (!(id in masterYB[bucket])) changed = true; // new project budget
                dstYB[bucket][id] = structuredClone(v); // replace by key
              }
              if (pids) {
                const present = new Set(Object.keys(srcYB[bucket]));
                if (
                  pids.some(
                    (id) => !present.has(id) && id in masterYB[bucket]
                  )
                ) {
                  changed = true; // deleted-by-office → keep master, flag
                }
              }
            }
            for (const sub of ["officeProductivity", "continuingCosts"] as const) {
              if (!subConflicts.has(`${sid}.${fk}.${sub}`)) {
                dstYB[sub] = structuredClone(srcYB[sub]);
              }
            }
          }
```

3c. Export `applyResolutions` (module scope, below `consolidate`). The store's current inline applier only handles flat keys; this one adds the nested Part IV form:

```ts
/**
 * Apply the secretariat's scalar-conflict resolutions onto a merged doc.
 * Keys are `${sectionId}.${fieldKey}`; Part IV sub-field conflicts use a
 * NESTED fieldKey (`"part4/year1" + "." + "year1.officeProductivity"`).
 * Deep-clones values so the merged doc shares no reference with the dialog's
 * choice state. Unknown sections are ignored (definitions/annex never
 * produce scalar conflicts).
 */
export function applyResolutions(
  merged: IsspDocument,
  resolutions: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(resolutions)) {
    const dot = key.indexOf(".");
    const sid = key.slice(0, dot);
    const fk = key.slice(dot + 1);
    const partKey = SECTION_FIELDS[sid]?.partKey;
    if (!partKey) continue;
    const target = merged[partKey] as unknown as Record<string, unknown>;
    const nested = fk.indexOf(".");
    if (nested >= 0) {
      const outer = fk.slice(0, nested);
      const inner = fk.slice(nested + 1);
      (target[outer] as Record<string, unknown>)[inner] = structuredClone(value);
    } else {
      target[fk] = structuredClone(value);
    }
  }
}
```

Add the `SECTION_FIELDS` import at the top of `consolidate.ts`:

```ts
import { SECTION_FIELDS } from "@/lib/section-fields";
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx scripts/verify-project-consolidate.ts && npx tsx scripts/verify-consolidate.ts`
Expected: both print their ✓ lines.

- [ ] **Step 5: Swap the store applier**

In `src/lib/store/index.tsx` (`consolidateFiles`, the loop at ~1093-1103): delete the inline `for (const [key, value] of Object.entries(resolutions)) {...}` block and its comment, replace with:

```ts
      // Apply the secretariat's scalar-conflict resolutions (flat Part I–IV
      // keys + nested Part IV sub-field keys) as a UI-layer overlay.
      applyResolutions(merged, resolutions);
```

Extend the existing import from `@/lib/scope/consolidate` (currently `consolidate` + `type ScalarConflict`) to also import `applyResolutions`.

- [ ] **Step 6: Type gate**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scope/consolidate.ts src/lib/store/index.tsx scripts/verify-project-consolidate.ts
git commit -m "feat(scope): Part IV project-keyed decomposition + applyResolutions

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Distribute dialog — "Projects" panel

**Files:**
- Modify: `src/components/editor/distribute-dialog.tsx`

**Interfaces:**
- Consumes: `DistributeSpec.projectIds` (Task 2), `PROJECT_BEARING_FIELDS` (Task 1).
- Produces: per-office UI state `projectMode: "all" | "selected" | "empty"` + `projectIds: Set<string>` on `OfficeEntry`; generated files carry `editScope.projectIds` when mode ≠ all; single-project filenames use the project title slug.

- [ ] **Step 1: Extend `OfficeEntry` and imports**

```ts
import { PROJECT_BEARING_FIELDS } from "@/lib/scope/paths";
import type { IsspDocument } from "@/lib/store/types";
```

```ts
interface OfficeEntry {
  /** OfficeIdentity.id — a uuid, stable for this dialog session. */
  officeId: string;
  /** Office name (also used as displayLabel). */
  name: string;
  /** Selected leaf paths for this office. */
  leaves: Set<string>;
  /** Per-project distribution mode for this office. */
  projectMode: "all" | "selected" | "empty";
  /** Selected project ids (used when projectMode === "selected"). */
  projectIds: Set<string>;
}

function newOffice(): OfficeEntry {
  return { officeId: uuid(), name: "", leaves: new Set(), projectMode: "all", projectIds: new Set() };
}
```

- [ ] **Step 2: Add helpers (module scope, below `nodeState`)**

```ts
/** Leaves that can carry an internal / cross-agency project respectively. */
const INTERNAL_CARRIER_LEAVES = [
  "part3/e1.internalProjects",
  "part3/f.performanceFramework",
  "part4/year1.year1",
  "part4/year2.year2",
  "part4/year3.year3",
];
const CROSS_CARRIER_LEAVES = [
  "part3/e2.crossAgencyProjects",
  "part3/f.performanceFramework",
  "part4/year1.year1",
  "part4/year2.year2",
  "part4/year3.year3",
];

function canCarryInternal(leaves: Set<string>): boolean {
  return INTERNAL_CARRIER_LEAVES.some((l) => leaves.has(l));
}
function canCarryCross(leaves: Set<string>): boolean {
  return CROSS_CARRIER_LEAVES.some((l) => leaves.has(l));
}

/** Titles of the office's selected projects, for the roster + filename. */
function projectTitlesFor(doc: IsspDocument, ids: Set<string>): string[] {
  const all = [...doc.part3.internalProjects, ...doc.part3.crossAgencyProjects];
  return all.filter((p) => ids.has(p.id)).map((p) => p.title || "(untitled)");
}
```

- [ ] **Step 3: Add the toggle + panel visibility (component body, near `toggleGroup`)**

```ts
  function toggleProject(idx: number, id: string) {
    patchEntry(idx, (e) => {
      const next = new Set(e.projectIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...e, projectIds: next };
    });
  }

  // The Projects panel appears only when the office owns ≥1 project-bearing
  // field AND the master actually has projects to pick.
  const showProjectsPanel =
    current &&
    doc.part3.internalProjects.length + doc.part3.crossAgencyProjects.length > 0 &&
    [...PROJECT_BEARING_FIELDS].some((l) => current.leaves.has(l));
```

- [ ] **Step 4: Render the panel** — insert between the Tree `div` (`{/* Tree */}` block ending with `</ul></div>`) and the `{/* Roster */}` block:

```tsx
        {/* Projects — per-project distribution */}
        {showProjectsPanel && (
          <div className="space-y-2 rounded-lg border border-border bg-card/40 px-3 py-2.5">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                Projects
              </legend>
              <div className="mt-1 space-y-1">
                {(["all", "selected", "empty"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`project-mode-${current.officeId}`}
                      checked={current.projectMode === mode}
                      onChange={() =>
                        patchEntry(selectedIdx, (e) => ({ ...e, projectMode: mode }))
                      }
                    />
                    {mode === "all" && "All projects (pre-populate everything)"}
                    {mode === "selected" && "Selected projects only"}
                    {mode === "empty" && "Start empty (office adds its own)"}
                  </label>
                ))}
              </div>
            </fieldset>
            {current.projectMode === "selected" && (
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {canCarryInternal(current.leaves) && (
                  <ProjectChecklist
                    label="Internal"
                    projects={doc.part3.internalProjects}
                    checked={current.projectIds}
                    onToggle={(id) => toggleProject(selectedIdx, id)}
                  />
                )}
                {canCarryCross(current.leaves) && (
                  <ProjectChecklist
                    label="Cross-Agency"
                    projects={doc.part3.crossAgencyProjects}
                    checked={current.projectIds}
                    onToggle={(id) => toggleProject(selectedIdx, id)}
                  />
                )}
                {!canCarryInternal(current.leaves) && (
                  <p className="text-[11px] leading-snug text-muted-foreground/70">
                    Own Part III-E1, III-F, or Part IV to include internal projects.
                  </p>
                )}
                {!canCarryCross(current.leaves) && (
                  <p className="text-[11px] leading-snug text-muted-foreground/70">
                    Own Part III-E2, III-F, or Part IV to include cross-agency projects.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
```

And the subcomponent (below `StandaloneSectionRow`):

```tsx
function ProjectChecklist({
  label,
  projects,
  checked,
  onToggle,
}: {
  label: string;
  projects: { id: string; title: string }[];
  checked: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <ul>
        {projects.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-0.5">
            <Checkbox
              checked={checked.has(p.id)}
              onCheckedChange={() => onToggle(p.id)}
              aria-label={p.title || "Untitled project"}
            />
            <span className="truncate text-sm text-muted-foreground">
              {p.title || "(untitled project)"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Validation** — inside `handleGenerate`'s `incomplete` mapper, after the two existing `reasons.push` lines:

```ts
        if (e.projectMode === "selected" && e.projectIds.size === 0)
          reasons.push("has no projects selected");
```

- [ ] **Step 6: Generate + filename** — in `handleGenerate`'s loop, pass the filter and use the project slug for single-project files:

```ts
        const editable = leavesToEditPaths(entry.leaves);
        const projectIds =
          entry.projectMode === "all"
            ? undefined
            : [...entry.projectIds];
        const sliced = sliceScopedDoc(doc, {
          office,
          editable,
          projectIds,
          // sourceDocId intentionally omitted: IsspDocument carries no stable
          // id (see src/lib/store/types.ts). Consolidate is the only consumer.
        });
```

```ts
        const projectTitles = projectTitlesFor(doc, entry.projectIds);
        const nameBase =
          projectIds && projectIds.length === 1 && projectTitles.length === 1
            ? projectTitles[0]
            : office.displayLabel;
        const slug = slugify(nameBase) || "office";
```

(The old `const slug = slugify(office.displayLabel) || "office";` line is replaced.)

- [ ] **Step 7: Roster line** — inside the roster `<button>`, after the paths span and its `: (` fallback, add:

```tsx
                    {e.projectMode !== "all" && (
                      <span className="block text-muted-foreground/70 truncate">
                        {e.projectMode === "empty"
                          ? "Projects: none (start empty)"
                          : `Projects: ${projectTitlesFor(doc, e.projectIds).join(", ")}`}
                      </span>
                    )}
```

- [ ] **Step 8: Type gate**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/editor/distribute-dialog.tsx
git commit -m "feat(scope): Distribute dialog per-office Projects panel

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Consolidate dialog — sub-field conflict labels

**Files:**
- Modify: `src/components/editor/consolidate-dialog.tsx:50-52`

**Interfaces:**
- Consumes: nested `ScalarConflict.fieldKey` (`"year1.officeProductivity"`) from Task 4.
- Produces: human labels for the six nested keys; no structural change to the dialog.

- [ ] **Step 1: Implement**

Replace the `fieldLabel` helper:

```ts
/** Nested Part IV sub-field conflicts (project-keyed merge) — human labels. */
const SUB_FIELD_LABELS: Record<string, string> = {
  "part4/year1.year1.officeProductivity": "Office Productivity (Year 1)",
  "part4/year1.year1.continuingCosts": "Continuing Costs (Year 1)",
  "part4/year2.year2.officeProductivity": "Office Productivity (Year 2)",
  "part4/year2.year2.continuingCosts": "Continuing Costs (Year 2)",
  "part4/year3.year3.officeProductivity": "Office Productivity (Year 3)",
  "part4/year3.year3.continuingCosts": "Continuing Costs (Year 3)",
};

function fieldLabel(sectionId: string, fieldKey: string): string {
  return (
    SUB_FIELD_LABELS[`${sectionId}.${fieldKey}`] ??
    SECTION_FIELDS[sectionId]?.fields.find((f) => f.key === fieldKey)?.label ??
    fieldKey
  );
}
```

- [ ] **Step 2: Type gate**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/consolidate-dialog.tsx
git commit -m "feat(scope): labels for Part IV sub-field consolidate conflicts

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Fixture builder + end-to-end Puppeteer smoke

**Files:**
- Create: `scripts/make-project-filter-fixture.ts`
- Create: `scripts/smoke-project-filter.mjs`

**Interfaces:**
- Consumes: all previous tasks (slice via the real dialog, editor visibility, consolidate via the real dialog).
- Produces: `/tmp/smoke-project-filter/master.issp` (fixture) and a passing end-to-end gate.

- [ ] **Step 1: Write the fixture builder**

Create `scripts/make-project-filter-fixture.ts`:

```ts
// Builds the master fixture used by scripts/smoke-project-filter.mjs.
// Run: npx tsx scripts/make-project-filter-fixture.ts
import fs from "node:fs";
import assert from "node:assert/strict";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IctProject, KpiRow, LineItem, ProposedSystem } from "../src/lib/store/types";

const OUT_DIR = "/tmp/smoke-project-filter";
const OUT = `${OUT_DIR}/master.issp`;

function sys(id: string, name: string): ProposedSystem {
  return { id, name, classification: "", frontline: false, frontlineAccessType: "",
    url: "", description: "", status: "", enhancementDetails: "", developmentStrategy: "",
    developmentPlatform: "", databaseName: "", dataStorage: "", internalUsers: "",
    externalUsers: "", owner: "",
    interoperability: { integrated: false, internalSystems: "", externalSystems: "",
      generatesData: false, processesExternalData: false, sharedPlatform: false },
    pia: { processesPersonalInfo: "", piaRequired: false } };
}
function proj(id: string, title: string, linked: string[]): IctProject {
  return { id, title, description: "smoke", objectives: "", projectType: "IS_DRIVEN",
    linkedSystemIds: linked, strategicAlignment: [], harmonizationFramework: [],
    implementingUnit: "IMD", fundingSource: "General Appropriations Act (GAA)",
    year1Deliverables: "", year2Deliverables: "", year3Deliverables: "", duration: "2028" };
}
function kpiRow(id: string): KpiRow {
  return { id, hierarchy: "Output", indicator: `ind-${id}`, baseline: "", year1Target: "",
    year2Target: "", year3Target: "", dataCollectionMethod: "", responsibleUnit: "IMD" };
}
function line(id: string, item: string): LineItem {
  return { id, item, office: "IMD", uacsCode: "", uacsLabel: "",
    fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 1000 };
}

const doc = createEmptyDocument({
  title: "Smoke Master ISSP", startYear: 2028, endYear: 2030, amendmentNumber: 0,
  scope: "AGENCY_WIDE", agencyHeadName: "Dir. Smoke",
  agency: { name: "Smoke Agency", acronym: "SMK", type: "NGA", websiteUrl: "", logoBase64: null },
});

doc.part3.proposedSystems = [sys("sys-hris", "HRIS"), sys("sys-fin", "Finance")];
doc.part3.internalProjects = [
  proj("proj-sikap", "SIKAP", ["sys-hris"]),
  proj("proj-records", "Records Digitization", ["sys-fin"]),
];
doc.part3.crossAgencyProjects = [proj("proj-portal", "Bayanihan Portal", [])];
doc.part3.performanceFramework = {
  "proj-sikap": { projectTitle: "SIKAP", projectCategory: "internal", rows: [kpiRow("k-sikap")] },
  "proj-records": { projectTitle: "Records Digitization", projectCategory: "internal", rows: [kpiRow("k-rec")] },
  "proj-portal": { projectTitle: "Bayanihan Portal", projectCategory: "crossAgency", rows: [kpiRow("k-por")] },
};
doc.part4.year1 = {
  officeProductivity: { capitalOutlay: [], mooe: [line("op-1", "Office connectivity")] },
  internalProjects: {
    "proj-sikap": { projectTitle: "SIKAP", capitalOutlay: [line("co-1", "Servers")], mooe: [] },
    "proj-records": { projectTitle: "Records Digitization", capitalOutlay: [], mooe: [line("m-1", "Scanning")] },
  },
  crossAgencyProjects: {
    "proj-portal": { projectTitle: "Bayanihan Portal", capitalOutlay: [], mooe: [line("m-2", "Hosting")] },
  },
  continuingCosts: { mooe: [line("cc-1", "Licenses")] },
};
doc.part4.year2.internalProjects = {
  "proj-sikap": { projectTitle: "SIKAP", capitalOutlay: [], mooe: [line("y2-1", "Maintenance")] },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));

// self-check
const back = JSON.parse(fs.readFileSync(OUT, "utf8"));
assert.equal(back.fileType, "issp-main");
assert.equal(back.part3.internalProjects.length, 2);
assert.equal(back.part4.year1.officeProductivity.mooe.length, 1);
console.log(`✓ fixture written: ${OUT}`);
```

Run: `npx tsx scripts/make-project-filter-fixture.ts`
Expected: `✓ fixture written: /tmp/smoke-project-filter/master.issp`

- [ ] **Step 2: Write the smoke**

Create `scripts/smoke-project-filter.mjs`. Model the helpers on `scripts/smoke-roundtrip.mjs` (copy `freshPage`, `captureDownload`, `readDoc`, `loadFile`, `kebabClick`, `visibleKebab`, `sleep`, `ok`/`fail` verbatim; `DOWNLOAD_DIR = "/tmp/smoke-project-filter-downloads"`), then:

```js
const MASTER = "/tmp/smoke-project-filter/master.issp";
// Phase A — generate a project-filtered scoped file -------------------------
page = await freshPage({ downloads: true });
await loadFile(page, MASTER);
await kebabClick(page, /Distribute to offices/);
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
await sleep(300);

// Tick Part III E1 + F (expand the Part III area, check both rows) and the
// whole Part IV area checkbox — mirror smoke-roundtrip's evaluate pattern:
await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const rows = [...dlg.querySelectorAll("li li")];
  for (const re of [/E1\./, /F\./]) {
    const row = rows.find((li) => re.test(li.textContent || ""));
    row?.querySelector("[role='checkbox']")?.click();
  }
  const areas = [...dlg.querySelectorAll("li")];
  const p4 = areas.find((li) => /Part IV/.test(li.querySelector("div span")?.textContent || ""));
  p4?.querySelector("[role='checkbox']")?.click();
});
await sleep(250);

// Projects panel must now exist; switch to Selected and check SIKAP only.
const panelText = await page.$eval('[role="dialog"]', (e) => e.textContent || "");
if (!/Projects/.test(panelText)) fail("Projects panel did not appear");
else ok("Projects panel appeared after ticking project-bearing fields");

await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const label = [...dlg.querySelectorAll("label")].find((l) =>
    /Selected projects only/.test(l.textContent || ""));
  label?.click();
});
await sleep(200);
await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const cb = dlg?.querySelector("[role='checkbox'][aria-label='SIKAP']");
  cb?.click();
});
await sleep(200);

// Office name, then Generate (trusted click) and capture the download.
await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const inp = dlg?.querySelector('input[aria-label="Office name"]');
  if (inp) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(inp, "Maria Santos");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }
});
await sleep(250);
const gen = await page.evaluateHandle(() => {
  const dlg = document.querySelector('[role="dialog"]');
  return [...dlg.querySelectorAll("button")].find((x) => /Generate/.test(x.textContent || ""));
});
await gen.asElement()?.click();
const scopedPath = await captureDownload("A");
if (scopedPath && !/sikap\.issp$/i.test(scopedPath))
  fail(`expected project-slug filename, got: ${path.basename(scopedPath)}`);
else ok("single-project filename uses project slug");

// Node-side JSON asserts on the generated file.
const scopedJson = JSON.parse(fs.readFileSync(scopedPath, "utf8"));
const assertE = (cond, msg) => { if (!cond) fail(msg); else ok(msg); };
assertE(JSON.stringify(scopedJson.editScope.projectIds) === '["proj-sikap"]',
  "editScope.projectIds = [proj-sikap]");
assertE(scopedJson.part3.internalProjects.length === 1
  && scopedJson.part3.internalProjects[0].id === "proj-sikap", "E1 carries only SIKAP");
assertE(Object.keys(scopedJson.part3.performanceFramework).length === 1, "PF carries only SIKAP");
assertE(Object.keys(scopedJson.part4.year1.internalProjects).length === 1, "year1 budget only SIKAP");
assertE(scopedJson.part4.year1.officeProductivity.mooe.length === 1,
  "officeProductivity intact (owned, not project-filtered)");
assertE(scopedJson.part3.proposedSystems.length === 1
  && scopedJson.part3.proposedSystems[0].id === "sys-hris", "linked-system context = HRIS only");

// Phase B — open the scoped file in the editor ------------------------------
await page.close();
page = await freshPage();
await loadFile(page, scopedPath);
const navText = await page.$eval("aside nav", (e) => e.textContent || "");
if (!/E1/.test(navText)) fail("sidebar missing III-E1");
if (/A\. Mandate/.test(navText)) fail("sidebar shows Part I (should be stripped)");
if (!/Year 1/.test(navText)) fail("sidebar missing Part IV Year 1");
else ok("sidebar shows only project-bearing sections");
await page.evaluate(() => {
  const link = [...document.querySelectorAll("aside nav a")].find((a) => /E1/.test(a.textContent || ""));
  link?.click();
});
await sleep(600);
const e1Text = await page.evaluate(() => document.body.textContent || "");
if (!/SIKAP/.test(e1Text)) fail("E1 page missing SIKAP");
if (/Records Digitization/.test(e1Text)) fail("E1 page shows unselected project");
if (!/Add project/.test(e1Text)) fail("Add project button missing");
else ok("E1 shows only SIKAP + Add project available");

// Phase C — edit the scoped JSON on disk, consolidate back into the master --
const edited = "/tmp/smoke-project-filter/edited.issp";
scopedJson.part3.internalProjects[0].title = "SIKAP (revised)";
scopedJson.part3.internalProjects.push(
  { id: "proj-new", title: "Training Program", description: "", objectives: "",
    projectType: "STANDALONE", linkedSystemIds: [], strategicAlignment: [],
    harmonizationFramework: [], implementingUnit: "HR", fundingSource: "",
    year1Deliverables: "", year2Deliverables: "", year3Deliverables: "", duration: "2028" });
scopedJson.part4.year1.internalProjects["proj-sikap"].mooe.push(
  { id: "li-new", item: "Connectivity", office: "IMD", uacsCode: "", uacsLabel: "",
    fundSource: "General Appropriations Act (GAA)", qty: 1, unitCost: 12000 });
fs.writeFileSync(edited, JSON.stringify(scopedJson, null, 2));

await page.close();
page = await freshPage();
await loadFile(page, MASTER);
await kebabClick(page, /Consolidate returned files/);
await page.waitForSelector('[role="dialog"] input[type="file"]', { timeout: 5000 });
const fileInput = await page.$('[role="dialog"] input[type="file"]');
await fileInput.uploadFile(edited);
await sleep(800);
const applyBtn = await page.evaluateHandle(() => {
  const dlg = document.querySelector('[role="dialog"]');
  return [...dlg.querySelectorAll("button")].find((x) => /Apply merge/.test(x.textContent || ""));
});
await applyBtn.asElement()?.click();
await sleep(1000);

const merged = await readDoc(page);
const titles = merged.part3.internalProjects.map((p) => p.title);
if (!titles.includes("SIKAP (revised)")) fail("merged master missing revised title");
if (!titles.includes("Records Digitization")) fail("merged master lost untouched project");
if (!titles.includes("Training Program")) fail("new project not unioned in");
if (!merged.part4.year1.internalProjects["proj-sikap"].mooe.some((l) => l.id === "li-new"))
  fail("new budget line not merged");
if (merged.part4.year1.officeProductivity.mooe.length !== 1)
  fail("officeProductivity corrupted");
if (!(merged.consolidationFlags ?? []).includes("part3/e1"))
  fail("new-project review flag missing");
else ok("consolidate: replace-by-id + union + flags all correct");
```

End the script with the standard `fails.length` summary + `process.exit(fails.length ? 1 : 0)` + `await browser.close()` in a `finally`, exactly like `smoke-roundtrip.mjs`.

- [ ] **Step 3: Run the smoke**

Pre: `ss -tlnp | grep :3000` (start `npm run dev` in the background only if absent). Then:

Run: `node scripts/smoke-project-filter.mjs`
Expected: every line prints `ok:`; exit code 0. If a selector misses (UI text drift), fix the SELECTOR in the smoke, not the app, and note it — the assertions' intent is described by their messages.

- [ ] **Step 4: Commit**

```bash
git add scripts/make-project-filter-fixture.ts scripts/smoke-project-filter.mjs
git commit -m "test(scope): project-filter fixture + end-to-end smoke

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Docs + memory

**Files:**
- Modify: `docs/scoped-distribution-usage.md`
- Modify: `CONTEXT.md`
- Modify: `docs/project-status.md`
- Modify (outside repo, no commit): `/root/.claude/projects/-root-apps-issp/memory/issp-schema.md`

- [ ] **Step 1: Usage doc** — append a section to `docs/scoped-distribution-usage.md`:

```markdown
## Distribute a single project (per-project files)

When an office's scope includes any project-bearing field (Part III-E1/E2,
III-F, or a Part IV year), the Distribute dialog shows a **Projects** panel:

- **All projects** — the office receives every project row (previous behavior).
- **Selected projects only** — pick exact projects; the file carries only
  those rows in III-E/F and the Part IV budgets, pre-populated from the
  master. Single-project files are named after the project
  (`SMK-ISSP-2028-2030-sikap.issp`).
- **Start empty** — no project rows travel; the office adds its own.

Recipients edit their project's details, KPIs, and budget lines, and may add
new projects. On **Consolidate**, project data merges **by project id**:
edits replace the master's rows, new projects union in with a review flag,
and a project the recipient deleted is kept on the master and flagged —
deletion never propagates silently.
```

- [ ] **Step 2: CONTEXT.md** — find the scoped-distribution concept paragraph and append:

```markdown
Per-project distribution: `editScope.projectIds` (absent = all projects)
filters the five project-bearing fields at slice time — `part3/e1/e2` project
lists, `part3/f.performanceFramework`, and the `part4/yearN` project budget
records. Consolidate merges these by project id (replace / union-new /
keep-on-delete) whenever any file in the batch declares the filter; Part IV
year fields decompose so `officeProductivity`/`continuingCosts` keep scalar
conflict semantics under the nested fieldKey `yearN.officeProductivity`.
```

- [ ] **Step 3: Session log** — append a dated entry to `docs/project-status.md` describing the feature and its verify scripts (`verify-project-slice.ts`, `verify-project-consolidate.ts`, `smoke-project-filter.mjs`).

- [ ] **Step 4: Memory** — in `/root/.claude/projects/-root-apps-issp/memory/issp-schema.md`, extend the EditScope line in "Annex 1 + scoped distribution" (verify the exact wording against `src/lib/scope/types.ts` first):

```markdown
`EditScope = {office:{id,name,displayLabel}, editable:EditPath[], generatedAt, sourceDocId?, projectIds?:string[]}`. `projectIds` absent = all projects; present = per-project slice + "project-keyed" consolidate (replace by project id, union new + flag, keep master on office deletion; Part IV year fields decompose — officeProductivity/continuingCosts conflicts surface as nested fieldKeys `yearN.officeProductivity`).
```

- [ ] **Step 5: Commit repo docs**

```bash
git add docs/scoped-distribution-usage.md CONTEXT.md docs/project-status.md
git commit -m "docs(scope): per-project distribution usage + context

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: Full verification pass (gate before reporting done)

- [ ] **Step 1:** Run every verify script:

```bash
npx tsx scripts/verify-scope-paths.ts \
  && npx tsx scripts/verify-slice.ts \
  && npx tsx scripts/verify-project-slice.ts \
  && npx tsx scripts/verify-consolidate.ts \
  && npx tsx scripts/verify-project-consolidate.ts
```

Expected: all five print ✓.

- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` — both clean.

- [ ] **Step 3:** `node scripts/smoke-project-filter.mjs` — exit 0.

- [ ] **Step 4:** Report results to Carlos. **Deploy (`git checkout main` → `npm run build` → `pm2 restart issp` → verify) is a separate, Carlos-gated step — never run it as part of this plan.**

---

## Self-Review Notes (already applied)

- Spec coverage: every spec section maps to a task — data model (T1), slice + context (T2), Part III merge (T3), Part IV decomposition + resolutions (T4), dialog panel (T5), dialog labels (T6), smokes (T7), docs/memory (T8), gate (T9).
- Type consistency: `projectIds?: string[]` on both `EditScope` and `DistributeSpec`; `PROJECT_BEARING_FIELDS` members are leaf-format strings consumed identically in slice, consolidate, and dialog; nested conflict fieldKey `"yearN.officeProductivity"` matches between `consolidate.ts`, `applyResolutions`, and `SUB_FIELD_LABELS` keys.
- The "Start empty" mode flows through as `projectIds: []` end-to-end (dialog → spec → editScope → slice → consolidate `pids` truthiness guards use `if (pids)` on the ARRAY, never on `.length`).
