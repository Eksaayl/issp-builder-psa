# Scoped ISSP Project Filter — Follow-up (budget categories + linked IS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In project-filtered scoped files, exclude Office Productivity + Continuing Costs entirely, and make the carried projects' linked systems the only Proposed IS in the file (merged back by system id).

**Architecture:** Delta on the shipped `editScope.projectIds` feature (spec addendum in `docs/superpowers/specs/2026-09-17-scoped-issp-project-filter-design.md`). Slice stops carrying the two non-project categories and applies one system rule; consolidate gains `part3/d.proposedSystems` to the project-keyed registry and excludes filtered files from sub-object merging; the Part IV year form hides the two categories when the doc is project-filtered.

**Tech Stack:** unchanged. All Global Constraints from `docs/superpowers/plans/2026-09-17-scoped-issp-project-filter.md` apply verbatim (never build/pm2; type gate = `npx tsc --noEmit` + `npm run lint`; verify scripts via `npx tsx`; smoke conventions from `scripts/smoke-roundtrip.mjs`).

**Landed baseline to build on:** branch base = `ef30171` (all files below already carry the feature).

---

### Task 1: Engine — slice + consolidate + verify updates (TDD)

**Files:**
- Modify: `src/lib/scope/paths.ts` (PROJECT_BEARING_FIELDS += part3/d)
- Modify: `src/lib/scope/slice.ts` (system rule unified; categories not copied)
- Modify: `src/lib/scope/consolidate.ts` (part3/d branch; filtered files excluded from sub-objects)
- Test: `scripts/verify-scope-paths.ts`, `scripts/verify-project-slice.ts`, `scripts/verify-project-consolidate.ts`

**Interfaces:**
- `PROJECT_BEARING_FIELDS` gains `"part3/d.proposedSystems"` (7 members) — consumed by slice, consolidate, and the dialog panel-visibility logic (a III-D-only office now also sees the Projects panel — correct: systems travel per project).
- No new exports. `applyResolutions` untouched.

- [ ] **Step 1: RED — update the three verify scripts first**

1a. `scripts/verify-scope-paths.ts`: change `assert.equal(PROJECT_BEARING_FIELDS.size, 6, ...)` → `7` and add `assert.ok(PROJECT_BEARING_FIELDS.has("part3/d.proposedSystems"));`.

1b. `scripts/verify-project-slice.ts`:
- Case (a) (E1+F+years filtered to proj-sikap): FLIP both category asserts —
  ```ts
  assert.deepEqual(s.part4.year1.officeProductivity, { capitalOutlay: [], mooe: [] },
    "(a) officeProductivity STRIPPED from project-filtered file (not the office's to edit)");
  assert.deepEqual(s.part4.year1.continuingCosts, { mooe: [] },
    "(a) continuingCosts STRIPPED from project-filtered file");
  ```
- Case (e) (owns part3/d + e1, filtered): FLIP the systems assert —
  ```ts
  assert.deepEqual(s.part3.proposedSystems.map((x) => x.id), ["sys-hris"],
    "(e) owned III-D also carries ONLY the carried projects' systems (one rule)");
  ```
- Add case (g) (owns ONLY part4/year1..3, filtered to proj-sikap): assert `officeProductivity` + `continuingCosts` are empty defaults AND `internalProjects` has only proj-sikap.

1c. `scripts/verify-project-consolidate.ts`:
- Case (q) (single filtered office, year1): the file's `officeProductivity` revision must NOT land — assert the merged value keeps master's (`qty` stays 1, item "Connectivity"), and `r.reviewFlags.length === 0` still holds. Update the case comment.
- Case (r): two FILTERED offices differing on officeProductivity → now NO sub-conflict and no flag from sub-objects; assert `r.scalarConflicts` has no `year1.officeProductivity` entry, project buckets still merge by id, and master's officeProductivity is retained. Then add a MIXED variant: office a filtered, office b UNFILTERED owning year1 with its own officeProductivity revision → b's value overlays (single sub-object contributor), a's project edits still merge.
- New case (w) — systems merge by id: master has systems sysA + sysB; filtered office owning `part3/d` + `part3/e1` returns a file with systems `[sysA(revised), sysNew]` → merged: sysA replaced, sysB kept, sysNew appended, `reviewFlags` includes `"part3/d"`. Also: deleting sysB from the file must NOT flag nor remove it (no deletion semantics for systems).
- Run all three → FAIL for the right reasons (size 7, category asserts, systems asserts).

- [ ] **Step 2: Implement**

2a. `paths.ts`: add `"part3/d.proposedSystems",` to `PROJECT_BEARING_FIELDS`; extend the doc comment: systems are linked via `linkedSystemIds` (not keyed by project id) and have NO deletion semantics in the merge.

2b. `slice.ts`, inside the `if (spec.projectIds)` block:
- Replace the year-record construction so the two categories never carry over:
  ```ts
  sliced.part4[y] = {
    officeProductivity: { capitalOutlay: [], mooe: [] },
    internalProjects: Object.fromEntries(
      Object.entries(master.part4[y].internalProjects).filter(([id]) => ids.has(id))
    ),
    crossAgencyProjects: Object.fromEntries(
      Object.entries(master.part4[y].crossAgencyProjects).filter(([id]) => ids.has(id))
    ),
    continuingCosts: { mooe: [] },
  };
  ```
- Replace the `if (!resolved.editableFields.has("part3/d.proposedSystems")) { ... }` context block with an unconditional single rule:
  ```ts
  // Linked systems of carried projects are the ONLY systems in the file —
  // owned III-D included. Systems the office adds ride the owned field.
  const carried = [...sliced.part3.internalProjects, ...sliced.part3.crossAgencyProjects];
  const linked = new Set(carried.flatMap((p) => p.linkedSystemIds));
  sliced.part3.proposedSystems = master.part3.proposedSystems.filter((s) => linked.has(s.id));
  ```
- Update the block's leading comment (categories excluded — agency-wide budget, not the office's; naive copy would also wipe master on merge).

2c. `consolidate.ts`:
- `projectEntries`: add `if (sid === "part3/d") return file.part3.proposedSystems.map((r) => [r.id, r] as [string, unknown]);`.
- Main-pass `case "project-keyed"`: widen the list branch to `if (sid === "part3/e1" || sid === "part3/e2" || sid === "part3/d")`, and gate the deletion check to e1/e2 only, with a comment: `projectIds` addresses projects, not systems — absence from the file may just mean "not linked", so systems are kept with no flag.
- Sub-conflict pre-pass: when collecting `values`, skip files that declare a filter — `if (file.editScope?.projectIds !== undefined) continue;` (filtered files contribute nothing to the two sub-objects).
- Main-pass Part IV branch: wrap the sub-object overlay with the same exclusion — `if (!pids && !subConflicts.has(...)) dstYB[sub] = ...`. Update the branch comment.

- [ ] **Step 3: GREEN + regression**

Run: all five verify scripts (`verify-scope-paths`, `verify-slice`, `verify-project-slice`, `verify-consolidate`, `verify-project-consolidate`) — the two legacy ones must pass unchanged.

- [ ] **Step 4: Type gate + commit**

`npx tsc --noEmit && npm run lint`. Commit: `feat(scope): project files exclude agency-wide budget; systems travel per project`.

---

### Task 2: UI — hide categories in the year form + smoke update

**Files:**
- Modify: `src/components/issp-editor/part4/part4-year-form.tsx` (new prop + hides)
- Modify: `src/components/editor/distribute-dialog.tsx` (carrier leaves += part3/d)
- Modify: `src/app/editor/part4/year1/page.tsx`, `year2/page.tsx`, `year3/page.tsx` (pass the prop)
- Test: `scripts/smoke-project-filter.mjs`

**Interfaces:**
- `Part4YearFormProps` gains `hideNonProjectCategories?: boolean` (default false). When true: the Office Productivity and Continuing Costs `SectionCard`s do not render, and their two entries are omitted from the budget legend.

- [ ] **Step 1: Implement the prop + hides**

In `Part4YearFormProps` add `hideNonProjectCategories?: boolean;`; destructure it. The legend block (~line 678) builds a 4-entry array — filter out `Office Productivity` and `Continuing Costs` when the prop is set (keep `--budget-1`/`--budget-4` tokens for the remaining entries). Wrap the two SectionCards (`{/* A — Office Productivity */}` ~707 and `{/* Continuing Costs */}` ~849) in `{!hideNonProjectCategories && (...)}`. Add a one-line comment stating the rule (project-filtered scoped files only; data is also empty by slice).

- [ ] **Step 2: Distribute dialog — let III-D owners pick projects**

In `distribute-dialog.tsx`, add `"part3/d.proposedSystems"` to BOTH `INTERNAL_CARRIER_LEAVES` and `CROSS_CARRIER_LEAVES` (a systems-only office's file carries the selected projects' systems — they must be able to select). The hints in the panel stay accurate automatically (they name E1/E2/F/Part IV; extend each hint string with "or III-D" — e.g. "Own Part III-E1, III-F, Part IV, or III-D to include internal projects."). No other dialog change: panel visibility already derives from `PROJECT_BEARING_FIELDS`.

- [ ] **Step 3: Wire the three year pages**

Each page passes:
```tsx
hideNonProjectCategories={doc.editScope?.projectIds !== undefined}
```

- [ ] **Step 4: Update the smoke**

`scripts/smoke-project-filter.mjs`:
- Phase A JSON assert: FLIP `officeProductivity` — `assertE(scopedJson.part4.year1.officeProductivity.mooe.length === 0, "officeProductivity stripped from project file");` (and capitalOutlay likewise or via deepEqual).
- Phase B: after opening the scoped file, navigate to the Part IV Year 1 page (sidebar link matching /Year 1/) and assert the page text does NOT contain "Office Productivity" nor "Continuing Costs", and DOES contain "SIKAP".
- Phase C: the existing `officeProductivity.mooe.length !== 1 → fail` assert now guards the keep-master path — keep it (it must be master's 1 line).
- Also assert the scoped file's `proposedSystems` is `["sys-hris"]` — already asserted ("linked-system context = HRIS only") — unchanged.

- [ ] **Step 5: Run**

`npx tsc --noEmit && npm run lint`; `node scripts/smoke-project-filter.mjs` → exit 0.

- [ ] **Step 6: Commit**

`feat(scope): hide Office Productivity + Continuing Costs in project-filtered files`.

---

### Task 3: Docs + memory + gate

**Files:**
- Modify: `docs/scoped-distribution-usage.md`, `CONTEXT.md`, `docs/project-status.md`
- Modify (outside repo, no commit): memory `issp-schema.md` + `project_status.md`
- Gate: all verify scripts + type gate + smoke

- [ ] **Step 1: Usage doc** — in the "Distribute a single project" section: recipients see only their project's budget categories (Office Productivity + Continuing Costs are excluded and not merged back from project files); the file's Proposed IS list contains only the carried projects' linked systems (recipients owning III-D can add systems; consolidate replaces systems by id and unions new ones with a flag).

- [ ] **Step 2: CONTEXT.md** — extend the projectIds paragraph with the same two facts.

- [ ] **Step 3: project-status.md** — dated follow-up entry.

- [ ] **Step 4: Memory** — `issp-schema.md`: EditScope line gains "project files carry no officeProductivity/continuingCosts (filtered files contribute nothing to them on merge — sub-conflicts only between unfiltered offices)"; registry note: `PROJECT_BEARING_FIELDS` = 7 members incl. part3/d.proposedSystems (by-id merge, no deletion semantics). `project_status.md`: follow-up entry.

- [ ] **Step 5: Gate + commit**

All five verify scripts + `tsc --noEmit` + lint + smoke, then `docs(scope): follow-up — budget categories + linked IS in project files`.

---

## Self-Review Notes

- Spec addendum coverage: both changes → Tasks 1-2; docs → Task 3; gate included.
- Consistency: the dialog's panel visibility uses the `PROJECT_BEARING_FIELDS` spread, so a III-D-only office now sees the Projects panel — and Task 2 Step 2 adds `part3/d.proposedSystems` to both carrier-leaf lists so that office can actually select projects (their file carries the selected projects' systems). Hints extended to name III-D.
