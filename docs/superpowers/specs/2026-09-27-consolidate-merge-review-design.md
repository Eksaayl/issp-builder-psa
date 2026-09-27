# Consolidate Merge Review — compare master vs returned files before merging — design

**Date:** 2026-09-27
**Status:** Approved — Q1–Q19 and D1–D4 settled with Carlos in a grilling session (2026-09-27)
**Extends:** `docs/scoped-issp-distribution-design-2026-07-21.md` (merge contract), `docs/superpowers/specs/2026-09-17-scoped-issp-project-filter-design.md` (project-keyed merge)
**Usage doc to update:** `docs/scoped-distribution-usage.md` §3 "Consolidate"

## Problem

The Consolidate dialog (`src/components/editor/consolidate-dialog.tsx`) previews a
merge as per-file counts: "contribute 3 items", "Replace 2 stakeholder rows",
"Vision Statement: <new value>". The secretariat cannot see:

- what master value a field **overwrites** or **clears**;
- which rows are **added**, **replaced** (and which cells changed), or **removed**;
- where two offices' lists are **appended** together;
- whether a returned file even belongs to this ISSP.

A schema-alignment audit of the consolidate path (same session) also found:

- **Gap A — returned files are not upgraded.** `parseScopedIsspFile`
  (`src/lib/store/index.tsx:251`) runs `normalizeImportShape` but never
  `migrateLegacyDoc`; its comment ("scoped files are v11+ by construction") went
  stale when v12 (programs → `{id,name}`, `programIds`) and v13
  (`plantillaUnfilled`, KPI `targetedResult`) changed shapes. A v11/v12 file that
  was never re-saved in the current app merges old-shaped data into a v13
  master: a Part I-B owner's `humanCapital` overlay erases the master's
  Plantilla (Unfilled) counts; version-shape differences produce false scalar
  conflicts.
- **Gap B — no provenance check.** `editScope.sourceDocId` exists but Distribute
  never fills it (`distribute-dialog.tsx:357`); consolidate compares nothing, so a
  scoped file from another agency or another planning cycle merges silently.
- **C** — `editScope` shape is not validated; a hand-edited file can crash the preview.
- **D** — cross-part links are not checked after a merge (e.g. an I-A owner deletes
  a program a II-A concern still references).
- **E** — the Annex 1 unsaved-changes tracker keys offices by `displayLabel`
  (`section-fields.ts` `getChangedFields`), the merge by `officeId`.
- **F** — stale version text: `types.ts:451` and `docs/scoped-distribution-usage.md`
  still say "12 = current" (current is 13).
- **Q14 finding — duplicate rows on multi-owner lists.** Distribute copies the
  master's rows into every owning office's file. The `list-union` strategy then
  appends `master + A's full list + B's full list`, so each master row appears
  three times. `scripts/verify-consolidate.ts` case (d) uses an empty master list
  and never exercises this.
- **Q13 finding — silent row deletion.** A single-owner list field is overlaid
  wholesale; a row the office deleted disappears from the master with no signal.

Registry coverage is otherwise sound: every Part I–IV data key maps to one
`SECTION_FIELDS` entry; v13's additions are nested inside existing fields and
travel with them; `PROJECT_BEARING_FIELDS` matches the three cross-reference
contracts; the PDF resolves project titles from Part III, so Part IV
`projectTitle` copies cannot go stale.

## Settled decisions (grilling session, 2026-09-27)

| # | Decision |
|---|---|
| Q1 | The Consolidate dialog becomes a **full-screen, stepped review**: 1 Select files → 2 Review → Apply. |
| Q2 | Detail: field level + row level for lists + the **changed cells inside a replaced row** (collapsed by default). |
| Q3 | Change kinds: **New**, **Overwritten**, **Cleared**, **Appended**, **Added row**, **Replaced row**, **Kept (office deleted)**, **Office rows replaced**, **Conflict**, **No change** (hidden by default, toggle to show). |
| Q13 | Add **Removed row** to the kinds. |
| Q4 | **Keep master** is offered on Overwritten, Cleared, Replaced row, Removed row (Q13). |
| Q5 | Group changes **by section in document order**; each change carries an office tag; an **office filter** narrows the view. |
| Q6 | No merge record this round; backlog issue for a downloadable merge report. |
| Q7 | Gap A is a **separate fix shipped first**: upgrade each returned file before preview; the review shows "Upgraded from schema vN". |
| Q8 | Gap B: **warn** (never block) when a file's agency name, title, start year or end year differs from the master. No schema change. |
| Q9 | The review has a **Broken links** group covering the three link contracts. |
| Q10 | Text changes: side by side with **word-level highlights**, via the `diff` (jsdiff) package. Rich text compares plain text; formatting-only edits show "Formatting changed". |
| Q11 | Images: old/new thumbnails side by side. Objects (cyber controls, EGP checklist, Human Capital): table of **changed sub-items only**. Part IV: line items as rows with Qty / Unit Cost / Total and deltas, plus project-subtotal delta. **No raw JSON anywhere.** |
| Q12 | New pure module **`src/lib/scope/merge-review.ts`** wraps `consolidate()`; dialog preview and store apply both call it. `consolidate()` only gains an exported per-field strategy map. |
| Q14 | Multi-owner lists merge **by row id** (one row per id; differing content → row conflict with the same pick UI as field conflicts; new ids appended). **Separate engine fix, shipped before the review feature.** |
| Q15 | Order: merge Cycle View (if it passed review) → Gap A + Q14 on `main` → review feature on a new worktree branch, with C and F alongside. |
| Q16 | Artifacts: this spec → `CONTEXT.md` glossary (domain-modeling) → GitHub issues (after approval) → an implementation plan per issue. |
| Q17 | Cycle View first if it passed review; otherwise start Gap A / Q14 in parallel (disjoint files). |
| Q18 | Keep master acts at **row level** (whole row / whole field). Stakeholder and Annex 1 office rows also diff as Added/Replaced/Removed rows with Keep master. Every field and row conflict also offers **"Keep master value"**. |
| Q19 | A section's review flag is **dropped** when every change that raised it was rejected; conflicts always keep their flag. |

**Q17 fact:** `feat/part4-cycle-view` has final-review fixes (`a553dc6`) and an
end-to-end smoke (`addb3c1`); one later commit (`f0f7f1b`, List mode) landed
after that review. It adds section `part4/cycle`, which has no `SECTION_FIELDS`
entry — no merge effect, but it appears in the Distribute tree.

## Refinements D1–D4 (surfaced while writing this spec; approved 2026-09-27)

- **D1 — Migration backfills must not overwrite the master (refines Q7).**
  Upgrading a v12 file fills `humanCapital.plantillaUnfilled = {it:0, nonIt:0}`;
  the whole-field overlay would still replace the master's real counts with
  zeros. Same shape: v11 concerns get `programIds: []`, v12 KPI rows get
  `targetedResult: ""`. **Decision:** a small registry
  `MIGRATION_BACKFILLS` (`{ introducedIn, apply(fileDoc, masterDoc) }`) runs after
  `migrateLegacyDoc` for files whose `sourceSchemaVersion < introducedIn`, copying
  the master's value for that sub-path into the file (matched by row id for
  concerns / KPI rows). The file then contributes "no opinion" on data it could
  not have held.
- **D2 — Row merge uses the master as the base (three-way; refines Q14).** Every
  owning office's file starts from the same master rows, so comparing office
  versions only against each other would conflict whenever one office edits a
  row and another leaves it untouched. Per row id, with the master as base:
  - all versions equal the master → No change;
  - one distinct non-master version → that version wins (Replaced row);
  - two or more distinct non-master versions → **row conflict**;
  - absent from a file but present in the master: if no other owner changed
    it → **Removed row** (attributed to the deleting office); if another owner
    changed it → row conflict ("edited by A / removed by B / keep master");
  - id not in the master → **Added row**; the same new id with different content
    from two offices → row conflict.
  - Row order: master order kept; added rows appended in batch order.
- **D3 — Scalar and Part IV sub-object conflicts also become three-way.** Today
  a conflict fires when owners differ from each other, even if only one office
  changed the value. With the master as base, "A unchanged, B changed" becomes a
  plain Overwritten by B. Ships with Q14 in the same engine slice.
- **D4 — "Skip this row" for Added row and Appended rows in flagged sections.**
  Q19 as written can almost never fire: flags are raised by appended/added rows
  and conflicts, and Q4 makes neither rejectable. Offering "Skip this row" (do
  not add) on added rows in a flagged section lets the secretariat drop an
  obvious duplicate at review time, and makes Q19 meaningful.

## Work breakdown (vertical slices, in order)

### Slice 1 — Upgrade returned files (Gap A; D1)

- `parseScopedIsspFile` → after the `editScope` presence check, run
  `migrateLegacyDoc`, then the D1 backfill pass (the backfill needs the master,
  so it runs in `merge-review`/`consolidateFiles`, not the parser — the parser
  only returns `sourceSchemaVersion`).
- Return type gains `sourceSchemaVersion: number` (the file's pre-upgrade
  version). Strip `migrationReview` from the upgraded file (merge never reads
  it; keeps the doc honest).
- v12's deterministic program ids (`` `${oo.id}-pg-${n}` ``) equal the master's own
  migration output, so upgraded I-A / II-A links stay consistent.
- Current dialog: show "Upgraded from schema vN" on the file chip (the full
  review replaces this later).
- Verify: `scripts/verify-consolidate-upgrade.ts` — v12 file owning
  `part1/b.humanCapital` (no `plantillaUnfilled`) into a master with `{it:3,nonIt:2}`
  keeps 3/2; v11 file owning `part1/a` yields `{id,name}` programs; v12 file
  owning `part3/f` keeps the master's `targetedResult` per KPI row id.

### Slice 2 — Row-id list merge + three-way conflicts (Q14; D2, D3)

- Replace `list-union` concatenation in `consolidate.ts` with the D2 per-id
  three-way merge. Applies to every multi-owner id-bearing list:
  `orgOutcomes`, `strategicConcerns`, `networkDiagrams`, `informationSystems`,
  `proposedHumanCapital`, `proposedSystems` / `internalProjects` /
  `crossAgencyProjects` (when no project filter in the batch),
  `definitions`.
- Row conflicts extend `ScalarConflict` into a union
  `MergeConflict = FieldConflict | RowConflict` (`RowConflict` carries
  `rowId`, per-office versions, and "removed" as a possible version). The
  current dialog renders row conflicts with the existing radio list, labelled
  by row name, plus a "Keep master value" option.
- D3: `strategyFor` compares each owner's value to the master; only ≥2 distinct
  non-master values conflict. Same for the Part IV `officeProductivity` /
  `continuingCosts` sub-conflicts.
- Review flags: still raised on sections with added rows from ≥2 offices or any
  conflict (duplicates by meaning, not id, stay possible).
- Verify: extend `scripts/verify-consolidate.ts` case (d) with a non-empty
  master list (no triplicates); new cases for edit-vs-untouched,
  edit-vs-edit, edit-vs-delete, delete-vs-untouched, same-new-id; D3 scalar
  cases; `verify-project-consolidate.ts` must still pass unchanged.

### Slice 3 — `merge-review` module (Q12, Q3/Q13, Q9, Q8, Q18, Q19, D4)

`src/lib/scope/merge-review.ts` — pure, no React, no store.

```ts
export type ChangeKind =
  | "new" | "overwritten" | "cleared"
  | "appended" | "added-row" | "replaced-row" | "removed-row"
  | "kept-office-deleted" | "office-rows-replaced"
  | "unchanged";

export interface CellDiff { label: string; before: unknown; after: unknown }

export interface ReviewChange {
  id: string;                 // stable: `${sectionId}.${fieldKey}[/subPath][#rowId]`
  sectionId: string;
  fieldKey: string;
  rowId?: string;
  label: string;              // field label, or "Project SIKAP › Laptop (CO)"
  kind: ChangeKind;
  officeIds: string[];
  before: unknown;            // master value at this location
  after: unknown;             // merged value at this location
  cells?: CellDiff[];         // replaced rows / changed object sub-items
  valueShape: "text" | "rich-text" | "image" | "number" | "boolean" | "object" | "row";
  decision: "keep-master" | "skip-row" | null; // which rejection this change allows
}

export interface BrokenLink { from: string; to: string; message: string } // named, not ids
export interface ProvenanceWarning { officeId: string; field: "agency" | "title" | "startYear" | "endYear"; file: string; master: string }

export interface MergeReview {
  changes: ReviewChange[];
  conflicts: MergeConflict[];          // from consolidate(), each with a master option
  reviewFlags: string[];
  provenance: ProvenanceWarning[];
  upgraded: { officeId: string; fromVersion: number }[];
}

export interface ReviewDecisions {
  rejected: Set<string>;                             // change ids (keep-master / skip-row)
  resolutions: Record<string, string | "master">;    // conflict id → officeId | "master"
}

export function buildMergeReview(master: IsspDocument, files: ParsedScopedFile[]): MergeReview;
export function applyReviewDecisions(master: IsspDocument, files: ParsedScopedFile[], d: ReviewDecisions): { doc: IsspDocument; reviewFlags: string[] };
export function findBrokenLinks(doc: IsspDocument, master: IsspDocument): BrokenLink[];
```

- **Change extraction.** Compare `master` vs the engine's `merged` for each owned
  leaf field, walking a per-field **shape registry**:
  - scalar text / rich text / number / boolean → New / Overwritten / Cleared / No change;
  - image fields (`networkDiagrams[].dataUrl`, `proposedNetworkDataUrl`,
    `enterpriseArchDataUrl`) → same kinds, `valueShape: "image"`;
  - objects (`humanCapital`, `cybersecurityControls`, `proposedCybersecControls`,
    `egpChecklist`) → one change with `cells` for changed sub-items, labelled
    via `cyber-controls.ts` / `issp-labels.ts`;
  - id lists → per-row Added / Replaced (with `cells`) / Removed / Kept;
  - `performanceFramework` → per project, then per KPI row;
  - `part4/yearN` → per bucket › project › line item (Qty, Unit Cost, Total
    deltas) and project-subtotal delta; `officeProductivity` / `continuingCosts`
    line items the same way;
  - `part1/c.stakeholders`, `annexes/annex1` → per office, per row / entry id →
    "Office rows replaced" group with row-level Added / Replaced / Removed.
  Attribution comes from the engine's owner map + exported strategy map.
- **Keep master / Skip row** (`applyReviewDecisions`): re-run `consolidate()`,
  apply conflict resolutions (office value or master), then for each rejected
  change restore the master value (field) or master row (by id, at its master
  index), or drop the added row (D4). Row level only (Q18). Preview and apply
  call the same function, so they cannot drift.
- **Flags (Q19):** each flag carries its causing change ids; a flag whose
  causes are all rejected is dropped. Conflict flags always stay.
- **Broken links (Q9)** — computed on the post-decision doc, reported only if
  not already broken in the master, named per principle #4 ("Concern
  'Paper-based HR' links to program 'Scholarship', which Office A removed"):
  1. II-A `outcomeIds` → I-A outcome ids (the `"general"` sentinel is valid);
     II-A `programIds` → I-A program ids;
  2. III-E1/E2 `linkedSystemIds` → III-D system ids;
  3. III-F keys and Part IV `internalProjects` / `crossAgencyProjects` keys →
     III-E1 / III-E2 project ids.
- **Provenance (Q8):** per file, compare `agency.name`, `title`, `startYear`,
  `endYear` with the master; one warning per differing field.
- Verify: `scripts/verify-merge-review.ts` — one case per change kind, per value
  shape, Keep master restore (field, row, removed row at original index), skip
  row, flag drop, each broken-link contract, provenance mismatch, and the
  invariant `applyReviewDecisions(no decisions).doc` deep-equals today's
  `consolidate()+applyResolutions` output.

### Slice 4 — Full-screen review UI (Q1, Q2, Q5, Q10, Q11)

- `ConsolidateDialog` becomes a near-full-viewport dialog
  (`w-[min(96vw,1400px)] h-[92vh]`), steps **Select files → Review**, Apply in the
  footer. Step 1 keeps today's picker, rejection list and file chips (office,
  file name, "Upgraded from vN", provenance ⚠).
- **Review layout** (compact per principle #9):
  - Top summary bar leads with what needs attention (principle #11): counts for
    unresolved conflicts, overwrites, clears, removals, broken links,
    provenance warnings — each a jump link. Office filter chips. "Show unchanged"
    toggle (off).
  - Left rail: sections in document order with per-section change counts;
    sections without changes hidden unless "Show unchanged".
  - Main pane: sections in document order; each change is one compact row —
    kind badge (word + colour, never colour alone), office tag, label,
    **Master | Incoming** columns. Replaced rows collapsed with "N cells
    changed"; expand for the cell table (read-optimized, principle #2).
  - Text: side-by-side with jsdiff word highlights (`diffWords`); rich text
    compared as plain text; formatting-only → "Formatting changed".
  - Images: two thumbnails. Objects: changed sub-items table. Budgets: line-item
    rows with Qty / Unit Cost / Total and signed deltas (₱ formatting from the
    existing money formatter), project-subtotal delta line.
  - Keep master control label names source and consequence (principle #3):
    "Keep the master's value (discard Office A's change)"; for Removed row
    "Keep this row in the master"; for D4 "Don't add this row".
  - Conflicts (field + row) render inside their section with radios for each
    office's value plus "Keep master value"; Apply stays disabled until all are
    answered; the summary bar links to the first unresolved one.
  - Broken links and provenance warnings: own groups above the sections.
- Footer: "Apply merge — N changes, M kept from master" + Cancel.
- Store: `consolidateFiles(files, decisions)` re-parses, then calls
  `applyReviewDecisions` → `setDoc` → awaited `idbSave` (unchanged persistence).
- Dependency: `npm install diff` (targeted install; allowed while prod is live).
- Verify: `scripts/smoke-merge-review.mjs` (Puppeteer on dev :3000) — load a
  master, select two fixture files, assert each change kind renders, toggle Keep
  master, resolve a conflict, apply, assert the resulting doc.

### Slice 5 — Small items (C, F)

- **C:** `parseScopedIsspFile` validates `editScope`: `office.id` non-empty
  string, `office.displayLabel` string, `editable` string[], `projectIds`
  absent or string[]; rejection names the file and the bad key.
- **F:** fix `types.ts:451` comment and `docs/scoped-distribution-usage.md`;
  refresh the `issp-schema` memory to v13.

## Gates and safety

- Dev gate per slice: `npx tsc --noEmit` + `npm run lint` + the slice's
  `npx tsx scripts/verify-*.ts` + Puppeteer smoke on dev :3000.
- **Never `npm run build`** during feature work (shared dev+prod tree — ADR 0004).
  Deploy only via: checkout `main` → build → `pm2 restart issp` → verify.
- Existing verify scripts (`verify-consolidate.ts`,
  `verify-project-consolidate.ts`, `verify-slice.ts`, `verify-scope-paths.ts`)
  must stay green; Slice 2 intentionally updates case (d).

## Docs to update when shipping

`docs/scoped-distribution-usage.md` §3 (review screen, Keep master, broken links,
provenance, upgraded files), `CONTEXT.md` glossary, What's New entry (extend the
latest dated window per the ≥1-week rule), `docs/project-status.md`.

## Out of scope / backlog

- Downloadable merge report (Q6).
- Stable document id in the schema + `sourceDocId` check (Q8 option c).
- Annex 1 unsaved-changes tracker keyed by `officeId` (E).
- Cell-level Keep master (Q18 option b).

## Implementation notes (after the two-axis review, 2026-09-27)

Where the build differs from the text above, deliberately:

- **Attribution without an exported strategy map (Q12).** `consolidate()`
  stays unchanged; `merge-review.ts` attributes each change by comparing each
  owning office's latest file with the master, counting only offices whose
  file holds that list (a project file never "removed" another project's rows).
  The engine's output is still the only source of *what* changes.
- **Q19 flags are recomputed, not tracked by cause.** A decision is applied by
  restoring the master in the returning office's file and re-running
  `consolidate()`, so a flag disappears exactly when its engine condition no
  longer holds (e.g. skipping one of two offices' added rows leaves only one
  office adding rows → no "possible duplicates" flag). Conflicts always keep
  their flag.
- **Keep master on a removed shared-table row** restores the row among that
  office's rows; the engine places each office's rows after the others, so the
  row's position in the whole stakeholder list is not preserved (same as any
  shared-table merge).
- **Conflicts have no default choice** in the review; Apply stays off until each
  one is answered.
- **Part IV totals** are per budget group (Office Productivity, each project,
  Continuing Costs), computed from the master and the merge result documents.
