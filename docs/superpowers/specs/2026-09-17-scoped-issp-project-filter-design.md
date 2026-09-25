# Scoped ISSP per-project distribution (project filter on EditScope) — design

**Date:** 2026-09-17
**Status:** Approved in session (approach + all three design sections)
**Extends:** `docs/scoped-issp-distribution-design-2026-07-21.md` (field-path distribution & consolidation)
**Usage doc to update:** `docs/scoped-distribution-usage.md`

## Problem

Field-path scoping cannot express "this file is for project X". An office that
owns `part3/e1` receives **all** internal projects; Part III-F and the Part IV
year budgets are records keyed by project id and are copied / overlaid
wholesale.

Carlos needs to hand a person a scoped `.issp` pre-populated for **one specific
project** (or a chosen set), so that person can enter the resource requirements
for it and return the file for consolidation. The secretariat pre-defines the
projects in the master; recipients fill in the per-project details.

## Decisions (settled with Carlos, 2026-09-17)

1. **Editable scope of a per-project file = the full project bundle**: Part
   III-E1/E2 project details, Part III-F KPI rows, Part IV year 1–3 budget line
   items — for the selected project(s) only.
2. **Visibility: only their project.** Everything else hidden and stripped,
   same rule as today. Exception: read-only *context data* required by the
   forms (see "Context data").
3. **UI: extend the existing Distribute dialog** with a per-office "Projects"
   panel — not a separate dialog.
4. **Recipients may add new project rows** in their scoped file. Consolidate
   replaces known projects by id and unions new ones in with a review flag.
   Deleting a pre-populated project does not propagate (keep master + flag).

## Data model

`EditScope` (`src/lib/scope/types.ts`) gains one optional field:

```ts
export interface EditScope {
  office: OfficeIdentity;
  editable: EditPath[];
  generatedAt: string;
  sourceDocId?: string;
  /**
   * Project-row filter. Absent/undefined = all projects (legacy + unfiltered
   * offices). Present = only these project ids travel in the project-bearing
   * fields; an empty array means "start empty" (office adds its own rows).
   */
  projectIds?: string[];
}
```

**No schemaVersion bump.** The field is additive, optional, and lives inside
`editScope` (itself optional). Old files and old scoped files mean "all
projects". No migration, no import-gate change, no demo-file change
(`editScope` is absent from the demo).

### The five project-bearing fields (the filter's domain)

| Field path (`section.field`) | Shape |
|---|---|
| `part3/e1.internalProjects` | `IctProject[]` |
| `part3/e2.crossAgencyProjects` | `IctProject[]` |
| `part3/f.performanceFramework` | `Record<projectId, {projectTitle, projectCategory, rows}>` |
| `part4/year1.year1` … `year3.year3` — the `.internalProjects` and `.crossAgencyProjects` sub-records of each `YearBudget` | `Record<projectId, ProjectBudget>` |

Not filtered: `officeProductivity` and `continuingCosts` (Part IV, not
project-keyed) — they follow field ownership exactly as today. Also not
filtered: any other owned field (e.g. an office owning all of `part3` still
gets `proposedSystems` wholesale).

## Slice (`src/lib/scope/slice.ts`)

`DistributeSpec` gains `projectIds?: string[]`, passed through to the emitted
`editScope`.

After the existing field-copy loop, when `projectIds` is **present**:

1. **Lists**: `part3.internalProjects` / `part3.crossAgencyProjects` keep only
   rows whose `id` ∈ `projectIds`.
2. **Records**: `part3.performanceFramework` and each
   `part4.yearN.{internalProjects,crossAgencyProjects}` keep only keys ∈
   `projectIds`.
3. Filtering applies to a field only when that field is owned (unowned fields
   are already at their empty defaults — filtering them is a harmless no-op).

### Context data (read-only, carried in the file, sections stay hidden)

Two kinds of context travel with a project-filtered slice so the forms work
and data cannot be wiped by accident:

- **Selected projects' detail rows always travel**, even when the office owns
  only Part IV / III-F and not III-E1/E2. Reason: the Part IV form
  (`part4-year-form.tsx`) and the III-F form (`part3-f-form.tsx`) render from
  the Part III project lists — without the rows, the recipient sees orphaned
  budget buckets and no place to type. These rows are *not* in `editable`, so
  the III-E sections stay hidden and `resolveScope` keeps them read-only.
  Context rows are never contributed on consolidate (contribution is driven by
  owned paths, as today).
- **Linked systems of carried projects** (`part3.proposedSystems` entries whose
  id appears in a carried project's `linkedSystemIds`) travel as context, so
  the III-E form shows e.g. "2 IS — HRIS, Payroll" instead of an empty picker,
  and stale `linkedSystemIds` are not silently dropped by the form.

## Distribute dialog (`src/components/editor/distribute-dialog.tsx`)

**Panel visibility**: the "Projects" panel appears for the current office when
(a) the master has ≥1 project in Part III, and (b) the office's resolved
editable leaves intersect the five project-bearing field paths (area/section
paths resolve through `resolveScope` as usual). With zero projects in the
master, the panel is hidden.

**Panel contents**:

- Radio mode: **All projects** (default) / **Selected** / **Start empty**.
  - All → `projectIds` omitted (exactly today's behavior).
  - Selected → checklist; `projectIds` = checked ids.
  - Start empty → `projectIds: []` (office starts from a blank project list).
- *Selected* shows two labeled checklist groups — Internal and Cross-Agency —
  listing project titles. **Selectability rule**: an internal project is
  selectable when the office owns at least one of {III-E1, III-F, any Part IV
  year}; a cross-agency project when it owns at least one of {III-E2, III-F,
  any Part IV year} (F and the budgets carry both categories). In practice a
  project is greyed out only when the office owns exactly III-E1 (cross-agency
  greyed, hint: "Own Part III-E2, III-F, or Part IV to include cross-agency
  projects") or exactly III-E2 (internal greyed, mirrored hint) — such a
  project has no owned field that could carry it.
- The office roster line shows the chosen project titles when a filter is set.

**Per-office dialog state** (`OfficeEntry`): add `projectMode: "all" |
"selected" | "empty"` and `projectIds: Set<string>`.

**Validation on Generate** (same toast pattern as the existing
incomplete-office check): mode *Selected* with zero projects checked blocks
generation ("`<office>`: no projects selected").

**Filename**: single-project file → `${agency}-ISSP-${startYear}-${endYear}-${projectSlug}.issp`;
otherwise the office slug as today.

## Scoped editor

**No runtime gating changes.** The file already contains only the allowed
rows; the Part III-E/F and Part IV forms are driven by the Part III project
lists. Consequences:

- "Add project" remains available whenever III-E1/E2 is owned (decision 4).
  A newly added project automatically appears in the III-F form and the Part
  IV year forms (budget buckets are created on demand).
- Deleting a pre-populated project is possible in the file; consolidation
  treats it as keep-master + review flag (never silent deletion).
- Part IV summary (read-only, computed) shows only the office's projects.
- PDF export remains disabled for scoped files, unchanged.

## Consolidate (`src/lib/scope/consolidate.ts`)

New strategy **`project-keyed`** for the five project-bearing fields. It is
active for a field when **any file in the batch declares `projectIds`**.
Pure-legacy batches (no file declares it) keep today's exact strategies — the
new semantics are opt-in via the new field.

Rules, per file (in import order), for lists and record keys:

1. **Replace by id**: a row/key from a returned file replaces the master's
   row/key with the same project id. Other projects are never touched.
2. **New project** (id not in master): append row / add key + review flag on
   the owning section.
3. **Deleted-by-office** (id ∈ the file's `projectIds`, id exists in master,
   but the row/key is absent from the file): **keep the master row/key +
   review flag**. Deletion never propagates silently.
4. **Same project from ≥2 files with different data**: apply in import order
   (each replaces) + review flag — no silent winner. Equal data from all
   files: implicit agreement, no flag (same principle as the existing
   scalar-agreement rule).

**Part IV year fields decompose when `project-keyed` is active** for
`part4/yearN.yearN`: the `.internalProjects` / `.crossAgencyProjects`
sub-records merge per project id (rules above), while `officeProductivity`
and `continuingCosts` keep the existing scalar semantics **at sub-field
granularity**: all contributing files agree → overlay once; differ →
`ScalarConflict` for human pick. (Without the decomposition, a whole-field
overlay would clobber other projects' budget keys.)

Known asymmetry, accepted: an office that deletes its project from III-E but
leaves its budget lines produces keep+flag on III-E and a plain replace on the
untouched budget keys. Both surfaces show a review flag; the secretariat
resolves. No data is lost.

The consolidate dialog needs no structural change: new-project and deletion
flags ride the existing `reviewFlags` → per-section review UI, and Part IV
sub-field conflicts ride `scalarConflicts` → the existing pick-a-value screen.

## Edge cases

- **Office owns Part IV only** (no III-E): context rows make the year forms
  render the projects; the office edits only budget lines. Context rows are
  not contributed on merge (not owned).
- **New project with budget + KPIs**: all keyed by the new id; union/add +
  review flags; cross-ref contract (PF `projectTitle`/`projectCategory` match
  the Part III title) is maintained by the forms themselves.
- **III-F entry added for an existing project** (key missing in master):
  add key + review flag.
- **Office owns all of Part III / Part IV via area paths**: `resolveScope`
  resolves areas to leaves, so the panel appears and the filter applies to the
  five fields only; `proposedSystems`, `officeProductivity`, `continuingCosts`
  still travel/merge wholesale per today's rules.
- **Two filtered offices share a project deliberately**: rule 4 (import order
  + review flag).

## Testing (per `verify-feature` / `verifier-web` skills)

1. Type gate: `npx tsc --noEmit` + `npm run lint`. **Never `npm run build`**
   (shared dev+prod tree — see AGENTS.md).
2. Puppeteer smokes on :3000 (IDB injection pattern, dev server already
   running per `ss` check):
   - Master with 2 internal + 1 cross-agency project. Distribute with an
     office filtered to 1 internal project → assert the downloaded JSON has
     `editScope.projectIds` correct and only that project in all five spots;
     assert `officeProductivity`/`continuingCosts` follow ownership, and the
     unselected projects are absent everywhere.
   - Context data: office owning Part IV only → file carries the project rows
     (context) and linked systems, but `editable` does not include III-E.
   - Open the scoped file in the editor → only their project in III-E/F and
     Part IV; "Add project" available; add a budget line.
   - Consolidate back: replace-by-id holds; a new project (added in the scoped
     file) unions in with a review flag; a deleted owned project keeps the
     master row + review flag.
   - Two files over the same project with different data → review flag and
     import-order application.
3. Legacy regression: a batch with no `projectIds` files merges exactly as
   before (overlay / list-union / scalar-conflict unchanged).

## Addendum (2026-09-17, approved same day): project files carry no agency-wide budget; systems travel with their project

Two behavior changes for **project-filtered files only** (`projectIds` present;
All-projects offices keep the original behavior):

1. **Office Productivity + Continuing Costs are excluded.** The slice does not
   copy them (they stay empty), the Part IV year form hides both cards and
   their legend entries (the recipient cannot see or add such lines; totals are
   project-only), and consolidate treats a project-filtered file as
   contributing NOTHING to those two sub-objects — no overlay, no conflict.
   Rationale: they are agency-wide budget, not the project owner's to edit;
   naively overlaying the file's empty copy would wipe the master's data.
2. **Proposed IS travels with its project.** The linked systems of the carried
   projects are the ONLY systems in the file — including when the office owns
   III-D (previously owned III-D kept all systems). `part3/d.proposedSystems`
   joins `PROJECT_BEARING_FIELDS` and merges by system id: replace by id, new
   systems from the recipient append + review flag, and a system absent from
   the file is KEPT (no deletion semantics — `projectIds` addresses projects,
   not systems; absence may just mean "not linked").

## Docs to update in the implementation plan

- `docs/scoped-distribution-usage.md` — new "Distribute by project" section.
- `CONTEXT.md` — one paragraph under the scoped-distribution concept.
- Memory `issp-schema.md` — add `projectIds` to the EditScope line after the
  code lands (verify against `types.ts` first).
