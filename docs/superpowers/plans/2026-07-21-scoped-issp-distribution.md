# Scoped `.issp` Distribution & Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the secretariat slice field-scoped `.issp` files from a master, let offices edit only their assigned fields, and consolidate returned files back into the master with overlap review.

**Architecture:** A doc-level optional `editScope` field drives editor filtering (hide + strip non-owned fields/sections). A pure `sliceScopedDoc()` produces scoped files; a pure `consolidate()` merges them back with a review screen. Scoped files carry no PDF export; only the consolidated master exports PDF. Annex 1 reuses its existing `annexedOffices` bucket (Direction C bridge).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind v4, `@base-ui/react`, `lucide-react`, `sonner`, `zod`, IndexedDB (local-first), Puppeteer (verification).

## Global Constraints

- **No test framework exists.** Verification uses two mechanisms: (1) runnable `.ts` scripts under `scripts/` executed with `npx tsx` using `node:assert` for pure logic (resolver/slice/consolidate), and (2) the `verify-feature` skill (typecheck + Puppeteer browser/PDF smoke + build + deploy) for UI. **Task 1 adds `tsx` as a devDependency.**
- **Type gate:** `npm run build` (runs `tsc` via `next build`). Every task ends green on `npm run build` and `npm run lint`.
- **Schema version:** bump `CURRENT_SCHEMA_VERSION` from **10 → 11** (`src/lib/migration-review.ts:1`). Also fix the stale comment at `src/lib/store/types.ts:417` ("9 = current" → "11 = current"). The data-model task uses the **`schema-change`** skill (its full checklist applies: types, defaults, migration, forms, PDF, section-fields map, demo file).
- **Scoped files keep `fileType: "issp-main"`** (they are full `IsspDocument`s carrying `editScope`), so they pass `loadFromFile`'s existing gate (`index.tsx:122`) unchanged. No new `fileType`.
- **Soft lock only** — no crypto/tamper-proofing (per spec non-goals).
- **Commit style:** conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`), matching repo history. Commit per task. End every commit message with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Reference doc:** `docs/scoped-issp-distribution-design-2026-07-21.md` is authoritative. If plan and spec disagree, the spec wins — flag it.

## Phasing & Coordination

This is a large feature organized into **5 phases**, each a reviewable milestone with independently testable deliverables. Execute phase-by-phase with a review checkpoint between phases. Dependencies run top-down (each phase builds on the prior).

- **Phase 0 — Foundation:** schema/types + path resolver (no UI; pure logic, fully script-verified).
- **Phase 1 — Scoped editing:** opening a hand-crafted scoped file hides/strips correctly, banner shows, PDF disabled, rows stamped. Usable end-to-end with a manually-crafted file.
- **Phase 2 — Distribute:** secretariat slices real scoped files via a tree-picker dialog.
- **Phase 3 — Consolidate:** merge engine + review screen.
- **Phase 4 — Annex 1 bridge + release:** Direction C verification + full verify-feature pass + docs.

> If a phase feels too large to review as one PR, split at the phase boundary — each phase already produces working software.

> **⚠️ Before executing Task 4 (Phase 1):** its exact per-field JSX is deliberately deferred until the section forms settle — it's the one pattern-level task. See the re-sync note on Task 4. **Nudge Claude to fill it in then.**

---

## Phase 0 — Foundation

### Task 1: Add `tsx` devDependency + schema bump 10→11 + `editScope`/`consolidationFlags` types

**REQUIRED SUB-SKILL:** `schema-change` (follow its full checklist; the edits below are this feature's specifics).

**Files:**
- Modify: `package.json` (add `tsx` devDep)
- Modify: `src/lib/migration-review.ts:1` (`CURRENT_SCHEMA_VERSION` 10 → 11)
- Modify: `src/lib/store/types.ts:411-446` (`IsspDocument` — add `editScope?`, `consolidationFlags?`)
- Modify: `src/lib/store/types.ts:416` (fix stale comment — the `schemaVersion?` field is on 417)
- Modify: `src/lib/store/index.tsx:344` (`migrateLegacyDoc` — add v10→v11 step)
- Create: `src/lib/scope/types.ts` (`EditScope`, `EditPath`, `OfficeId`)

**Interfaces:**
- Produces: `EditScope` and `EditPath` types (consumed by every later task).

- [ ] **Step 1: Add `tsx` and bump schema version**

`package.json` devDependencies — add `"tsx": "^4.19.0"` (run `npm install -D tsx@^4.19.0`).

`src/lib/migration-review.ts:1`:
```ts
export const CURRENT_SCHEMA_VERSION = 11;
```

- [ ] **Step 2: Define `EditScope` / `EditPath`**

Create `src/lib/scope/types.ts`:
```ts
/**
 * A scope path. Three levels; "owns everything under it":
 *   "part1"            → whole area
 *   "part1/b"          → whole section (section id from sections.ts)
 *   "part1/b.cioName"  → one field (section id + "." + field key from section-fields.ts)
 * Annex uses the section id "annexes/annex1" at both area and section level.
 */
export type EditPath = string;

export interface OfficeIdentity {
  /** Stable merge key (not the display label). */
  id: string;
  name: string;
  displayLabel: string;
}

export interface EditScope {
  office: OfficeIdentity;
  /** Editable paths at any level (area / section / field). */
  editable: EditPath[];
  /** ISO timestamp when sliced from the master. */
  generatedAt: string;
  /** Master provenance, for idempotent re-merge. */
  sourceDocId?: string;
}
```

- [ ] **Step 3: Add fields to `IsspDocument`**

`src/lib/store/types.ts` — import and add optional fields (do NOT make them required; absence ⇒ full editor):
```ts
import type { EditScope } from "@/lib/scope/types";
// ...
export interface IsspDocument {
  // ...existing fields...
  /** Present ⇒ scoped file; editor hides/strips non-owned paths. */
  editScope?: EditScope;
  /** Section ids flagged for review after a consolidate() merge. */
  consolidationFlags?: string[];
  // ...
}
```
Also fix the stale comment at line 416 (the `schemaVersion?: number;` field is on 417): `/** Schema version for migration. 11 = current. */`

- [ ] **Step 4: Add v10→v11 migration step (idempotent normalization)**

`src/lib/store/index.tsx` inside `migrateLegacyDoc` (after the v9→v10 block at lines 612–625), add:
```ts
// v10 → v11: scoped-distribution fields are optional; no data transform needed.
// Variable is `base` (matches every prior step's convention); guard is `?? 1`.
if ((base.schemaVersion ?? 1) < 11) {
  base = { ...base, schemaVersion: 11 };
}
```
(No older document carries `editScope`, so there is nothing to transform — this step just advances the version. Confirm against the `schema-change` checklist that defaults/migration-review sections don't need updating; they don't for an additive optional field.)

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build` → Expected: success.
```bash
git add package.json package-lock.json src/lib/migration-review.ts src/lib/store/types.ts src/lib/store/index.tsx src/lib/scope/types.ts
git commit -m "feat(scope): add editScope types + schema bump 10→11

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Path resolver + scope predicates (pure logic)

**Files:**
- Create: `src/lib/scope/paths.ts`
- Create: `scripts/verify-scope-paths.ts`

**Interfaces:**
- Consumes: `PARTS`, `FRONT_MATTER_SECTIONS`, `ANNEX_SECTIONS` (`src/lib/sections.ts`); `SECTION_FIELDS` (`src/lib/section-fields.ts`); `EditPath`, `EditScope` (Task 1).
- Produces: `SHARED_TABLE_PATHS`, `LeafField`, `ResolvedScope`, `resolveScope()`, `resolvePath()`, `isSectionVisible()`, `isFieldEditable()`, `officeOwnsPath()`. Consumed by Tasks 3–10.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-scope-paths.ts`:
```ts
import assert from "node:assert/strict";
import {
  SHARED_TABLE_PATHS, resolvePath, resolveScope,
  isSectionVisible, isFieldEditable, ALL_SECTION_IDS,
} from "../src/lib/scope/paths";

// resolvePath: area → all leaf fields under it
const part1bFields = resolvePath("part1/b").map(f => f.fieldKey);
assert.ok(part1bFields.includes("cioName"), "part1/b should include cioName");
assert.ok(part1bFields.includes("humanCapital"), "part1/b should include humanCapital");

// resolvePath: section → its fields
assert.equal(resolvePath("part1/a").length, 5, "part1/a has 5 fields");

// resolvePath: single field → one leaf
assert.equal(resolvePath("part1/b.cioName").length, 1);

// resolveScope: visibility + editability
const scope = resolveScope(["part1/b.cioName", "part4"]);
assert.equal(isSectionVisible(scope, "part1/b"), true,  "part1/b visible (1 owned field)");
assert.equal(isSectionVisible(scope, "part1/a"), false, "part1/a hidden (0 owned fields)");
assert.equal(isFieldEditable(scope, "part1/b", "cioName"), true);
assert.equal(isFieldEditable(scope, "part1/b", "cioEmail"), false, "only cioName editable");
assert.equal(isSectionVisible(scope, "part4/year1"), true);

// shared tables
assert.equal(SHARED_TABLE_PATHS.has("annexes/annex1"), true);
assert.equal(SHARED_TABLE_PATHS.has("part1/c.stakeholders"), true);

// every known section id resolves
assert.ok(ALL_SECTION_IDS.includes("part1/b"));
assert.ok(ALL_SECTION_IDS.includes("annexes/annex1"));
assert.ok(ALL_SECTION_IDS.includes("definitions"));

console.log("✓ scope-paths verification passed");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/verify-scope-paths.ts`
Expected: FAIL (module `../src/lib/scope/paths` does not exist / exports missing).

- [ ] **Step 3: Implement `paths.ts`**

Create `src/lib/scope/paths.ts`:
```ts
import { PARTS, FRONT_MATTER_SECTIONS, ANNEX_SECTIONS } from "@/lib/sections";
import { SECTION_FIELDS } from "@/lib/section-fields";
import type { EditPath, EditScope } from "@/lib/scope/types";

/** Field paths that are shared tables (row-merge semantics, multi-office). */
export const SHARED_TABLE_PATHS: ReadonlySet<string> = new Set([
  "annexes/annex1",
  "part1/c.stakeholders",
]);

export interface LeafField {
  sectionId: string;
  fieldKey: string;
}

export const ALL_SECTION_IDS: readonly string[] = [
  ...FRONT_MATTER_SECTIONS.map((s) => s.id),
  ...PARTS.flatMap((p) => p.sections.map((s) => s.id)),
  ...ANNEX_SECTIONS.map((s) => s.id),
];

const AREA_TO_SECTIONS: Record<string, string[]> = {
  part1: PARTS[0].sections.map((s) => s.id),
  part2: PARTS[1].sections.map((s) => s.id),
  part3: PARTS[2].sections.map((s) => s.id),
  part4: PARTS[3].sections.map((s) => s.id),
  definitions: ["definitions"],
  // No "annex1" key: the annex path "annexes/annex1" is also its section id,
  // so resolvePath resolves it via the section branch (ALL_SECTION_IDS) below.
};

/** All field keys for a section id (from SECTION_FIELDS; definitions/annex1 special-cased). */
function fieldKeysForSection(sectionId: string): string[] {
  if (sectionId === "definitions") return ["definitions"];
  if (sectionId === "annexes/annex1") return ["annexes/annex1"];
  return SECTION_FIELDS[sectionId]?.fields.map((f) => f.key) ?? [];
}

/** Resolve a single path to its leaf (sectionId, fieldKey) pairs. */
export function resolvePath(path: EditPath): LeafField[] {
  // Single field: "sectionId.fieldKey"
  const dot = path.indexOf(".");
  if (dot >= 0) {
    const sectionId = path.slice(0, dot);
    const fieldKey = path.slice(dot + 1);
    return [{ sectionId, fieldKey }];
  }
  // Area → all sections × all fields
  if (AREA_TO_SECTIONS[path]) {
    return AREA_TO_SECTIONS[path].flatMap((sid) =>
      fieldKeysForSection(sid).map((fk) => ({ sectionId: sid, fieldKey: fk }))
    );
  }
  // Section → all its fields
  if (ALL_SECTION_IDS.includes(path)) {
    return fieldKeysForSection(path).map((fk) => ({ sectionId: path, fieldKey: fk }));
  }
  return []; // unknown path (e.g. removed by schema change) → contributes nothing
}

export interface ResolvedScope {
  /** Set of `${sectionId}.${fieldKey}` the office may edit. */
  editableFields: Set<string>;
  /** Section ids with ≥1 owned field. */
  visibleSections: Set<string>;
  /** Section ids owned as a shared table. */
  ownedSharedTables: Set<string>;
}

export function resolveScope(paths: EditPath[]): ResolvedScope {
  const editableFields = new Set<string>();
  const visibleSections = new Set<string>();
  const ownedSharedTables = new Set<string>();
  for (const p of paths) {
    for (const leaf of resolvePath(p)) {
      editableFields.add(`${leaf.sectionId}.${leaf.fieldKey}`);
      visibleSections.add(leaf.sectionId);
    }
    // a path that names a shared table (directly or as an area/section) owns that table
    for (const leaf of resolvePath(p)) {
      const key = SHARED_TABLE_PATHS.has(`${leaf.sectionId}.${leaf.fieldKey}`)
        ? `${leaf.sectionId}.${leaf.fieldKey}`
        : SHARED_TABLE_PATHS.has(leaf.sectionId) ? leaf.sectionId : null;
      if (key) ownedSharedTables.add(key);
    }
  }
  return { editableFields, visibleSections, ownedSharedTables };
}

/** Null scope (no editScope on doc) ⇒ everything visible/editable. */
export function isSectionVisible(scope: ResolvedScope | null, sectionId: string): boolean {
  if (!scope) return true;
  return scope.visibleSections.has(sectionId);
}

export function isFieldEditable(
  scope: ResolvedScope | null,
  sectionId: string,
  fieldKey: string
): boolean {
  if (!scope) return true;
  return scope.editableFields.has(`${sectionId}.${fieldKey}`);
}

/** True if an office (via editScope) owns any path under the given section. */
export function officeOwnsSection(editScope: EditScope | undefined, sectionId: string): boolean {
  if (!editScope) return true;
  return resolveScope(editScope.editable).visibleSections.has(sectionId);
}
```

- [ ] **Step 4: Run verification → pass**

Run: `npx tsx scripts/verify-scope-paths.ts`
Expected: `✓ scope-paths verification passed`.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build` → success.
```bash
git add src/lib/scope/paths.ts scripts/verify-scope-paths.ts
git commit -m "feat(scope): path resolver + scope predicates

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 1 — Scoped editing

> **Manual test fixture:** until Phase 2 exists, create a scoped file by hand to drive Phase 1: load the NCWTR demo (`public/demo/ncwtr-issp-2026-2028.issp`), then in the browser console set `editScope` and re-save, OR author a tiny `.issp` with `editScope: { office: {id:"b",name:"IS Div",displayLabel:"Information Systems Division"}, editable:["part1/b.cioName","part4"], generatedAt:"2026-07-21T00:00:00.000Z" }`. Task 3 onward is verified against this fixture.

### Task 3: Section-level filtering (sidebar + overview + section-shell) + route guard

**Files:**
- Modify: `src/components/editor/editor-sidebar.tsx:309,510-634` (filter `FRONT_MATTER_SECTIONS`/`PARTS`/`ANNEX_SECTIONS` by resolved scope)
- Modify: `src/components/editor/overview/part-card.tsx` (filter parts)
- Modify: `src/components/editor/section-shell.tsx:65-79` (prev/next skips hidden sections)
- Create: `src/hooks/use-resolved-scope.ts`

**Interfaces:**
- Consumes: `resolveScope`, `isSectionVisible` (Task 2); `doc.editScope` (Task 1).
- Produces: `useResolvedScope()` hook returning `ResolvedScope | null` (consumed by Tasks 4–5).

- [ ] **Step 1: Create the `useResolvedScope` hook**

Create `src/hooks/use-resolved-scope.ts`. **`useIsspStore()` takes NO selector argument** (it returns the whole value via context — confirmed at `src/lib/store/index.tsx`); use the destructure form:
```ts
import { useMemo } from "react";
import { useIsspStore } from "@/lib/store";
import { resolveScope, type ResolvedScope } from "@/lib/scope/paths";

/** Returns the resolved edit scope for the current doc, or null when unscoped. */
export function useResolvedScope(): ResolvedScope | null {
  const { doc } = useIsspStore();
  const editScope = doc?.editScope;
  return useMemo(
    () => (editScope ? resolveScope(editScope.editable) : null),
    [editScope]
  );
}
```

- [ ] **Step 2: Filter the sidebar**

In `editor-sidebar.tsx`, obtain scope near line 309: `const scope = useResolvedScope();`. Then filter each section list before rendering:
- Front matter (lines ~510–520): `FRONT_MATTER_SECTIONS.filter((s) => isSectionVisible(scope, s.id))`.
- Inside `PARTS.map(...)` (lines ~545–600): skip a part entirely if none of its sections are visible; otherwise filter `part.sections.filter((s) => isSectionVisible(scope, s.id))`.
- Annexes (lines ~604–633): `ANNEX_SECTIONS.filter((s) => isSectionVisible(scope, s.id))`.

Import: `import { isSectionVisible } from "@/lib/scope/paths";` and `import { useResolvedScope } from "@/hooks/use-resolved-scope";`.

- [ ] **Step 3: Filter overview cards**

The overview grid's `PARTS.map` lives in **`src/app/editor/page.tsx:68`**, not `part-card.tsx` (which renders a single `part`). Filter at the map site — `PARTS.filter((p) => p.sections.some((s) => isSectionVisible(scope, s.id)))` — using `useResolvedScope()` + `isSectionVisible` in that page. (PartCard itself is unchanged.)

- [ ] **Step 4: Prev/next nav skips hidden sections + route guard**

In `section-shell.tsx` (lines 65–79), build the prev/next from `ALL_SECTIONS.filter((s) => isSectionVisible(scope, s.id))` instead of raw `ALL_SECTIONS`. Also add a guard at the top of the component: if the current section is not visible (`!isSectionVisible(scope, currentSectionId)`), render a small "This section isn't part of your assigned scope." panel and hide the form (do not crash).

- [ ] **Step 5: Browser smoke + typecheck + commit**

Run dev server; load the manual scoped fixture → confirm sidebar/overview show only `part1/b` (within Part I) and Part IV; direct navigation to `/editor/part1/a` shows the guard panel.
Run: `npm run build` → success.
```bash
git add src/hooks/use-resolved-scope.ts src/components/editor/editor-sidebar.tsx src/components/editor/overview/part-card.tsx src/components/editor/section-shell.tsx
git commit -m "feat(scope): hide non-owned sections in sidebar/overview/shell

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Field-level visibility in multi-field forms

> **Re-synced 2026-08-03** against the current forms. Fields are not uniform `FormField` blocks — each maps to a specific element (a `FormField`, a bare input, a `<div>` block, or a whole `<Card>`). Wrap each element in its `can(key)` guard as specified below; do **not** modify the elements themselves.

**Shared pattern (all four forms).** At the top of each component body:
```ts
import { useResolvedScope } from "@/hooks/use-resolved-scope";
import { isFieldEditable } from "@/lib/scope/paths";
// inside the component:
const scope = useResolvedScope();
const can = (k: string) => isFieldEditable(scope, SECTION_ID, k);  // SECTION_ID per form (matches the SectionShell sectionId)
```
Then wrap each field's element: `{can("fieldKey") && (<existingElement/>)}`.

**Files:**
- Modify: `src/components/issp-editor/part1/part1-a-form.tsx` (5 fields)
- Modify: `src/components/issp-editor/part1/part1-b-form.tsx:77-137,266-310,316-426` (12 fields + human-capital table)
- Modify: `src/components/issp-editor/part2/part2-b-form.tsx` (3 fields)
- Modify: `src/components/issp-editor/part3/part3-a-form.tsx` (3 fields)

**Interfaces:**
- Consumes: `useResolvedScope()` (Task 3), `isFieldEditable` (Task 2). Each form knows its own `sectionId` (e.g. `"part1/b"`).

- [ ] **Step 1: Part I-A** (`sectionId="part1/a"`)
  - `legalBasis` → the `<FormField label="Legal Basis">` block (A.1 card)
  - `mandateFunction` → the `<FormField label="Mandate / Functions">` block (A.1 card)
  - `visionStatement` → the `<FormField label="Vision Statement">` block (A.2–A.3 card)
  - `missionStatement` → the `<FormField label="Mission Statement">` block (A.2–A.3 card)
  - `orgOutcomes` → the **entire `{/* A.4 Org Outcomes */}` `<Card>`** (the outcomes list)
  Wrap each in `{can("…") && (…)}`. (A card whose fields are all hidden renders empty — acceptable per spec; add no empty-state logic.)

- [ ] **Step 2: Part I-B** (`sectionId="part1/b"`) — the 12-field section
  - **CIO + Focal person fields render through the `PersonFields` sub-component** (5 `FormField`s each: name, position, unit, email, contact). Add an optional `visibleKeys?: Set<string>` prop to `PersonFields` (a set of *generic* field names to show). Inside `PersonFields`, wrap each `<FormField>` in `{(!visibleKeys || visibleKeys.has("name")) && (…)}` etc. (no prop ⇒ all visible — preserves unscoped behavior). In `Part1BForm`, build the two sets from `scope`:
    ```ts
    const cap = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);
    const personKeys = (prefix: "cio" | "focal") =>
      new Set(["name", "position", "unit", "email", "contact"].filter((f) => can(`${prefix}${cap(f)}`)));
    ```
    Pass `visibleKeys={personKeys("cio")}` to the CIO `<PersonFields>` and `personKeys("focal")` to the Focal one.
  - `focalSameAsCio` → the "Concurrently held by the CIO" `<label>` checkbox block — wrap in `{can("focalSameAsCio") && (…)}`.
  - `humanCapital` → the **entire `{/* B.2 Human Capital */}` `<Card>`** — wrap in `{can("humanCapital") && (…)}`.

- [ ] **Step 3: Part II-B** (`sectionId="part2/b"`) and Part III-A (`sectionId="part3/a"`)
  - Part II-B: `networkDescription` → the bare `<Textarea>` (B.1 card); `networkDiagrams` → the diagrams upload `<div className="space-y-3">` block (B.1 card); `cybersecurityControls` → the **entire `{/* B.2 Cybersecurity checklist */}` `<Card>`**.
  - Part III-A: `proposedNetworkDesc` → the bare `<Textarea>` (A.1 card); `proposedNetworkDataUrl` → the `<DiagramUploadField>` (A.1 card); `proposedCybersecControls` → the **entire `{/* A.2 Cybersecurity */}` `<Card>`**.

- [ ] **Step 4: Browser smoke + typecheck + commit**

Load scoped fixture with `editable:["part1/b.cioName"]` → Part I-B shows only Full Name; everything else gone, no layout gaps. Edit `cioName` → persists normally.
Run: `npm run build` → success.
```bash
git add src/components/issp-editor/part1/part1-a-form.tsx src/components/issp-editor/part1/part1-b-form.tsx src/components/issp-editor/part2/part2-b-form.tsx src/components/issp-editor/part3/part3-a-form.tsx
git commit -m "feat(scope): field-level visibility in multi-field forms

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Scope banner + disable PDF export in scoped mode

**Files:**
- Modify: `src/components/editor/editor-sidebar.tsx:431-502` (gate `handleExportPdf`), `:782-790,1092-1101` (hide both PDF buttons)
- Modify: `src/components/editor/section-shell.tsx` or sidebar header (banner)

**Interfaces:**
- Consumes: `doc.editScope` (Task 1).

- [ ] **Step 1: Gate PDF export**

In `editor-sidebar.tsx`, top of `handleExportPdf` (line 432), add:
```ts
if (doc?.editScope) {
  toast.info("PDF export is available in the consolidated master, not a scoped file.");
  return;
}
```
(`toast` is already imported from `sonner` in this file — confirm at top.) Then hide both buttons conditionally: wrap the mobile PDF button (782–790) and desktop Export PDF button (1092–1101) in `{!doc?.editScope && (...)}`.

- [ ] **Step 2: Add the scope banner**

Add a small persistent badge in the sidebar header area (near the doc title, ~line 400–500 region where the title block renders). When `doc?.editScope`, render:
```tsx
{doc?.editScope && (
  <div className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900">
    <div className="font-medium">Scoped file — {doc.editScope.office.displayLabel}</div>
    <div className="text-blue-700">Edits: {doc.editScope.editable.join(", ")}</div>
  </div>
)}
```

- [ ] **Step 3: Browser smoke + typecheck + commit**

Scoped fixture → PDF buttons gone; banner shows office + paths. Non-scoped doc → buttons present, no banner.
Run: `npm run build` → success.
```bash
git add src/components/editor/editor-sidebar.tsx
git commit -m "feat(scope): scope banner + disable PDF export for scoped files

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Shared-table row stamping (stakeholders + Annex 1)

**Files:**
- Modify: `src/components/issp-editor/part1/part1-c-form.tsx` (stakeholder add handler)
- Modify: `src/app/editor/annex1/page.tsx` (Annex 1 row add handlers; also the attach flow)
- Modify: `src/lib/store/types.ts` — add optional `rowId?`, `officeId?` to `Stakeholder` (line 52–56) and to the Annex 1 row types (`EquipmentRow`, `SoftwareRow` in `src/lib/annex1/types.ts`).
- Modify: `src/lib/store/defaults.ts` — default factories must tolerate missing stamps (no change needed if optional; confirm via schema-change checklist).

**Interfaces:**
- Consumes: `doc.editScope.office.id` (Task 1). Stamps are written when a row is added in scoped mode; unscoped mode leaves them absent.

> This task adds two optional fields to existing row types — treat it under the same `schema-change` umbrella (Task 1). No migration of old rows (absent stamps ⇒ treated as secretariat/legacy-owned).

- [ ] **Step 1: Add optional stamp fields**

`Stakeholder` (`src/lib/store/types.ts:52-56`): add `rowId?: string; officeId?: string;` (stakeholders row-merge across offices by `officeId`).
`Annex1FilePayload` — add `officeId?: string;` to **both** definitions: canonical `src/lib/annex1/types.ts:81-88` AND the inline duplicate at `src/lib/store/types.ts:391-409` (the comment at :388 already warns to keep them in sync). This `officeId` is the key `consolidate()` replaces Annex 1 by (Task 9). **Do NOT stamp individual `EquipmentRow`/`SoftwareRow`** — Annex 1 merges at the payload level (one payload per office).

- [ ] **Step 2: Stamp on add — stakeholders**

`useIsspStore` has **no `.getState()`** (it's a React context hook). Thread the office id as a prop: in `src/app/editor/part1/c/page.tsx` (which reads the store) read `const officeId = doc?.editScope?.office.id;` and pass `officeId?: string` to `<Part1CForm>`. In `part1-c-form.tsx`, stamp new stakeholders in **both** creation paths — `addStakeholder` (table mode, ~:468) and the new-stakeholder branch of `handleDrawerSave` (list mode, ~:524-529). Cleanest: extend `makeStakeholder(officeId?)` to set `rowId: generateId(), officeId` when an officeId is passed, and pass `officeId` at both call sites. Unscoped (`officeId` undefined) ⇒ no stamps (unchanged behavior).

- [ ] **Step 3: Stamp on add — Annex 1 (payload-level)**

The Annex 1 editor was refactored: there are **no** per-row add handlers — rows are a fixed taxonomy filled in via `<InventoryEditor>`. The merge unit is the **`Annex1FilePayload`** (one per office), so stamp `officeId` on the *payload*, not on rows:
- `src/app/editor/annex1/edit/content.tsx`: in `handleAdd` (~:86-95) and `handleUpdate` (~:40-49), when `doc.editScope` is set, spread `officeId: doc.editScope.office.id` onto the payload before pushing/replacing it in `doc.annexedOffices`.
- `src/app/editor/annex1/page.tsx`: in `handleFiles` (attach flow, ~:39-60), when the current doc is scoped, stamp each attached payload with `officeId` from `doc.editScope.office.id` if the payload doesn't already carry one (a returned scoped file keeps its own `editScope.office.id`).
- Both components already read `doc` via `useIsspStore()`.

- [ ] **Step 4: Browser smoke + typecheck + commit**

Scoped fixture → add a stakeholder row → reload → inspect stored doc (devtools / a temp `console.log`) → row has `rowId` + `officeId` = office id. Unscoped doc → rows have no stamps.
Run: `npm run build` → success.
```bash
git add src/lib/store/types.ts src/lib/annex1/types.ts src/components/issp-editor/part1/part1-c-form.tsx src/app/editor/annex1/page.tsx
git commit -m "feat(scope): stamp shared-table rows with officeId + rowId

Co-Authored-By: Claude <noreply@anthropic.com>"
```

> **Phase 1 checkpoint:** a hand-crafted scoped file now opens correctly — only owned sections/fields render, banner shows, PDF disabled, rows stamp. Review before Phase 2.

---

## Phase 2 — Distribute

### Task 7: `sliceScopedDoc()` pure helper + leakage verification

**Files:**
- Create: `src/lib/scope/slice.ts`
- Create: `scripts/verify-slice.ts`

**Interfaces:**
- Consumes: `resolveScope`, `SHARED_TABLE_PATHS` (Task 2); `createEmptyDocument`, `makeDefaultPart1..4` (`src/lib/store/defaults.ts`); `EditScope` (Task 1).
- Produces: `DistributeSpec`, `sliceScopedDoc(master, spec): IsspDocument`. Consumed by Task 8.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-slice.ts`:
```ts
import assert from "node:assert/strict";
import { sliceScopedDoc, type DistributeSpec } from "../src/lib/scope/slice";
import { createEmptyDocument } from "../src/lib/store/defaults";

const base = createEmptyDocument({
  title: "T", startYear: 2026, endYear: 2028, amendmentNumber: 0,
  scope: "AGENCY_WIDE", agencyHeadName: "X",
  agency: { name: "N", acronym: "N", category: "Department", region: null } as any,
});
// seed a CIO name + a stakeholder in the master
base.part1.cioName = "Atty. Cruz";
(base.part1 as any).stakeholders = [{ id: "s1", name: "OfficeA", services: [] }];

const spec: DistributeSpec = {
  office: { id: "b", name: "IS Div", displayLabel: "Information Systems Division" },
  editable: ["part1/b.cioName", "part1/c.stakeholders"],
  sourceDocId: "master-1",
};
const sliced = sliceScopedDoc(base, spec);

// editScope set
assert.equal(sliced.editScope?.office.id, "b");
assert.deepEqual(sliced.editScope?.editable, spec.editable);

// owned field retained
assert.equal((sliced.part1 as any).cioName, "Atty. Cruz");

// leakage check: non-owned fields stripped (cioEmail gone)
assert.equal((sliced.part1 as any).cioEmail, undefined || (sliced.part1 as any).cioEmail === "");

// shared table emptied in the slice (office adds its own rows)
assert.deepEqual((sliced.part1 as any).stakeholders, []);

// agency header retained
assert.equal(sliced.agency.name, "N");
console.log("✓ slice verification passed");
```

- [ ] **Step 2: Run → fail**

Run: `npx tsx scripts/verify-slice.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `slice.ts`**

Create `src/lib/scope/slice.ts`:
```ts
import type { IsspDocument } from "@/lib/store/types";
import type { EditScope, OfficeIdentity, EditPath } from "@/lib/scope/types";
import { resolveScope, SHARED_TABLE_PATHS } from "@/lib/scope/paths";
import { createEmptyDocument, type NewDocOptions } from "@/lib/store/defaults";

export interface DistributeSpec {
  office: OfficeIdentity;
  editable: EditPath[];
  sourceDocId?: string;
}

/**
 * Produce a scoped .issp from a master. Keeps owned-path data + agency header;
 * strips everything else to defaults; empties shared tables (office re-adds rows).
 */
export function sliceScopedDoc(master: IsspDocument, spec: DistributeSpec): IsspDocument {
  const resolved = resolveScope(spec.editable);

  // Start from a blank doc of identical header shape, then overlay owned data.
  const header: NewDocOptions = {
    title: master.title,
    startYear: master.startYear,
    endYear: master.endYear,
    amendmentNumber: master.amendmentNumber,
    scope: master.scope,
    agencyHeadName: master.agencyHeadName,
    agency: master.agency,
  };
  const sliced = createEmptyDocument(header);

  // Helper: copy a field from master only if owned.
  const copyIfOwned = (sectionId: string, fieldKey: string, target: Record<string, unknown>, partKey: string) => {
    if (resolved.editableFields.has(`${sectionId}.${fieldKey}`)) {
      const src = master[partKey] as Record<string, unknown>;
      target[fieldKey] = src[fieldKey];
    }
  };

  // Part fields (part1–4) — overlay owned fields onto the blank parts.
  for (const partKey of ["part1", "part2", "part3", "part4"] as const) {
    const target = sliced[partKey] as Record<string, unknown>;
    // iterate the section-fields map for this part
    // (import SECTION_FIELDS in practice; here via resolveScope-derived set)
    for (const key of Array.from(resolved.editableFields)) {
      const [sid, fk] = key.split(".");
      // only copy fields belonging to this part
      if (sid.startsWith(partKey)) {
        const src = master[partKey] as Record<string, unknown>;
        target[fk] = src[fk];
      }
    }
    // shared-table fields owned by this office are emptied (office re-adds rows)
    for (const key of Array.from(resolved.editableFields)) {
      const [sid, fk] = key.split(".");
      if (sid.startsWith(partKey) && SHARED_TABLE_PATHS.has(`${sid}.${fk}`)) {
        target[fk] = [];
      }
    }
  }

  // definitions (front matter, at doc root)
  if (resolved.editableFields.has("definitions.definitions")) {
    sliced.definitions = master.definitions;
  }

  // Annex 1 (shared table) — emptied; office adds rows stamped on creation.
  sliced.annexedOffices = [];

  const editScope: EditScope = {
    office: spec.office,
    editable: spec.editable,
    generatedAt: new Date().toISOString(),
    sourceDocId: spec.sourceDocId,
  };
  return { ...sliced, editScope, exportedAt: new Date().toISOString() };
}
```
> The implementation above is the intent; tighten the per-part field copy in Step 3 to use `SECTION_FIELDS` directly for correctness (resolve which `(sectionId, fieldKey)` belong to each `partKey`). Keep the contract: owned non-shared fields copied, shared tables emptied, everything else default, header retained, `editScope` set.

- [ ] **Step 4: Run → pass**

Run: `npx tsx scripts/verify-slice.ts` → `✓ slice verification passed`.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build` → success.
```bash
git add src/lib/scope/slice.ts scripts/verify-slice.ts
git commit -m "feat(scope): sliceScopedDoc pure helper + leakage verification

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Distribute dialog (tree picker) + generate/download

**Files:**
- Create: `src/components/editor/distribute-dialog.tsx` (tree picker: area → section → field, tri-state checkboxes)
- Modify: `src/components/editor/editor-sidebar.tsx` (add "Distribute to offices" action; hide when `doc.editScope` is set — only the master distributes)

**Interfaces:**
- Consumes: `PARTS`, `SECTION_FIELDS` (tree data); `sliceScopedDoc` (Task 7); `doc` + `saveToFile`-style download (the slice is a separate JSON download, not the live doc).

- [ ] **Step 1: Build the tree-picker dialog**

Create `distribute-dialog.tsx`. Data model: a recursive node list built from `PARTS` (area → section) and `SECTION_FIELDS` (section → field), plus `definitions` and `annex1`. UI: office name input, tri-state checkbox tree (use `@base-ui/react` Checkbox + `lucide-react` ChevronRight for collapse), an "add another office" list, and a "Generate files" button. State: `Array<{ office: OfficeIdentity; editable: EditPath[] }>`. Office `id` = `crypto.randomUUID()`.

- [ ] **Step 2: Wire generate + download**

On "Generate files," for each entry:
```ts
import { sliceScopedDoc } from "@/lib/scope/slice";
// master = current doc from useIsspStore()
const sliced = sliceScopedDoc(master, { office, editable, sourceDocId: masterId });
const blob = new Blob([JSON.stringify(sliced, null, 2)], { type: "application/json" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `${master.agency.acronym}-ISSP-${master.startYear}-${master.endYear}-${slugify(office.displayLabel)}.issp`;
a.click();
URL.revokeObjectURL(url);
```
`toast.success("Generated N scoped files")`.

- [ ] **Step 3: Add the entry point in the sidebar**

In `editor-sidebar.tsx`, add a secondary action button "Distribute to offices" (next to Properties/Export PDF, ~line 1092 region), shown only when `!doc?.editScope` (masters only). It opens `<DistributeDialog>`.

- [ ] **Step 4: Browser smoke (full distribute→edit round-trip) + typecheck + commit**

Master → Distribute → pick office + `["part1/b.cioName","part4"]` → generate → load the generated `.issp` → confirm it opens in scoped mode (Phase 1 behavior). 
Run: `npm run build` → success.
```bash
git add src/components/editor/distribute-dialog.tsx src/components/editor/editor-sidebar.tsx
git commit -m "feat(scope): Distribute dialog with field-level tree picker

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 3 — Consolidate

### Task 9: `consolidate()` merge engine (pure logic)

**Files:**
- Create: `src/lib/scope/consolidate.ts`
- Create: `scripts/verify-consolidate.ts`

**Interfaces:**
- Consumes: `resolveScope`, `SHARED_TABLE_PATHS` (Task 2); `EditScope` (Task 1).
- Produces: `ConsolidateResult`, `consolidate(master, files)`. Consumed by Task 10.

- [ ] **Step 1: Write the failing verification script (incl. idempotent re-import timeline)**

Create `scripts/verify-consolidate.ts` covering: (a) unique-owner field overlay; (b) shared-table replace-by-office; (c) multi-office shared-table merge; (d) overlap on a list field → union + review flag; (e) scalar conflict surfaced; (f) **idempotent re-import** (the spec's timeline — import B v1, then B v2, assert no duplicates, A untouched). Skeleton:
```ts
import assert from "node:assert/strict";
import { consolidate } from "../src/lib/scope/consolidate";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IsspDocument } from "../src/lib/store/types";

function scoped(officeId: string, editable: string[], patches: any): IsspDocument {
  const d = createEmptyDocument({ title:"T", startYear:2026, endYear:2028, amendmentNumber:0,
    scope:"AGENCY_WIDE", agencyHeadName:"X", agency:{name:"N",acronym:"N",category:"Department",region:null} as any });
  d.editScope = { office:{id:officeId,name:officeId,displayLabel:officeId}, editable, generatedAt:"2026-07-21T00:00:00.000Z" };
  Object.assign(d.part1, patches.part1 ?? {});
  return d;
}

// (b) shared-table replace-by-office
let master = createEmptyDocument({ title:"T", startYear:2026, endYear:2028, amendmentNumber:0,
  scope:"AGENCY_WIDE", agencyHeadName:"X", agency:{name:"N",acronym:"N",category:"Department",region:null} as any });
(master.part1 as any).stakeholders = [];
const bV1 = scoped("b", ["part1/c.stakeholders"], { part1:{ stakeholders:[
  {id:"1",rowId:"r1",officeId:"b",name:"S1",services:[]},{id:"2",rowId:"r2",officeId:"b",name:"S2",services:[]}]}});
const a1 = scoped("a", ["part1/c.stakeholders"], { part1:{ stakeholders:[
  {id:"3",rowId:"r3",officeId:"a",name:"S3",services:[]}]}});
let r = consolidate(master, [bV1, a1]);
assert.equal((r.merged.part1 as any).stakeholders.length, 3, "B(2)+A(1)");

// (f) idempotent re-import: B v2 has 2 different rows (typos) — replaces B's 2, keeps A's 1
const bV2 = scoped("b", ["part1/c.stakeholders"], { part1:{ stakeholders:[
  {id:"1b",rowId:"r1b",officeId:"b",name:"S1-fixed",services:[]},
  {id:"2b",rowId:"r2b",officeId:"b",name:"S2-fixed",services:[]}]}});
r = consolidate(master, [bV1, a1, bV2]);
const rows = (r.merged.part1 as any).stakeholders;
assert.equal(rows.length, 3, "B replaced (2) + A(1) = 3, no duplicates");
assert.ok(rows.every((x:any)=>x.officeId!=="b" || ["r1b","r2b"].includes(x.rowId)), "B rows are v2");
console.log("✓ consolidate verification passed");
```
Add assertions for (a) overlay, (d) overlap union+flag, (e) scalar conflict into `r.scalarConflicts`.

- [ ] **Step 2: Run → fail** — `npx tsx scripts/verify-consolidate.ts`.

- [ ] **Step 3: Implement `consolidate.ts`**

Create `src/lib/scope/consolidate.ts`:
```ts
import type { IsspDocument } from "@/lib/store/types";
import { resolveScope, SHARED_TABLE_PATHS } from "@/lib/scope/paths";

export interface ScalarConflict {
  sectionId: string;
  fieldKey: string;
  values: { officeId: string; value: unknown }[];
}
export interface ConsolidateResult {
  merged: IsspDocument;
  reviewFlags: string[];     // section ids flagged for dedup review
  scalarConflicts: ScalarConflict[];
}

type Partition = "annexes/annex1";

/**
 * Merge returned scoped files into master.
 *  - non-shared path, unique owner: write leaf fields (path-keyed overlay)
 *  - shared table: replace that office's rows by officeId; multi-office merges cleanly
 *  - same non-shared path, ≥2 owners (list field): union + review flag
 *  - same scalar field, ≥2 owners: record scalar conflict
 */
export function consolidate(master: IsspDocument, files: IsspDocument[]): ConsolidateResult {
  const merged: IsspDocument = structuredClone(master);
  const reviewFlags = new Set<string>();
  const scalarConflicts: ScalarConflict[] = [];

  // Track field ownership across the batch to detect overlaps.
  const fieldOwners = new Map<string, string[]>(); // `${sid}.${fk}` -> officeIds (in order)

  for (const file of files) {
    const scope = file.editScope!;
    const resolved = resolveScope(scope.editable);
    const officeId = scope.office.id;

    for (const key of resolved.editableFields) {
      fieldOwners.set(key, [...(fieldOwners.get(key) ?? []), officeId]);
    }
  }

  for (const file of files) {
    const scope = file.editScope!;
    const resolved = resolveScope(scope.editable);
    const officeId = scope.office.id;

    for (const key of resolved.editableFields) {
      const [sid, fk] = key.split(".");
      const isSharedTable = SHARED_TABLE_PATHS.has(key) || SHARED_TABLE_PATHS.has(sid);

      if (sid === "annexes/annex1") {
        // Annex 1 bucket: replace this office's Annex1FilePayload by office.id
        merged.annexedOffices = [
          ...(merged.annexedOffices ?? []).filter((o) => o.officeId !== officeId),
          // ...the office's payload from `file.annexedOffices` (stamped with officeId)
          ...(file.annexedOffices ?? []).map((o) => ({ ...o, officeId })),
        ];
        continue;
      }

      // Map section id -> part key for part1–4
      const partKey = (["part1","part2","part3","part4"] as const).find((p) => sid.startsWith(p));
      if (!partKey) {
        if (sid === "definitions" && fk === "definitions") {
          // definitions: union list + flag if overlap
          // (simplify: last-write-wins; flag if >1 owner)
          merged.definitions = file.definitions;
        }
        continue;
      }
      const target = merged[partKey] as Record<string, unknown>;
      const src = file[partKey] as Record<string, unknown>;
      const owners = fieldOwners.get(key) ?? [];

      if (isSharedTable) {
        // part1/c.stakeholders: replace this office's rows by officeId
        const allRows = (target[fk] as any[]) ?? [];
        const others = allRows.filter((r: any) => r.officeId !== officeId);
        const mine = ((src[fk] as any[]) ?? []).filter((r: any) => r.officeId === officeId || !r.officeId);
        target[fk] = [...others, ...mine];
      } else if (Array.isArray(src[fk]) && owners.length > 1) {
        // list field owned by >1 office → union + flag
        const existing = (target[fk] as any[]) ?? [];
        target[fk] = [...existing, ...(src[fk] as any[])];
        reviewFlags.add(sid);
      } else if (owners.length > 1) {
        // scalar field owned by >1 office → conflict
        scalarConflicts.push({
          sectionId: sid, fieldKey: fk,
          values: owners.map((oid) => {
            const f = files.find((x) => x.editScope!.office.id === oid)!;
            return { officeId: oid, value: (f[partKey] as any)[fk] };
          }),
        });
      } else {
        // unique owner: overlay
        target[fk] = src[fk];
      }
    }
  }

  merged.consolidationFlags = [...reviewFlags];
  return { merged, reviewFlags: [...reviewFlags], scalarConflicts };
}
```
> `Annex1FilePayload` currently has no `officeId` field — Task 6 / the Annex 1 bridge adds it (or the consolidate maps by `office.displayLabel`/a new id). Confirm the exact key used to match an office's Annex 1 payload and align the filter (`o.officeId !== officeId`) to whatever field Task 6 introduces. Keep the contract: replace that office's annex1 rows, keep others.

- [ ] **Step 4: Run → pass** — `npx tsx scripts/verify-consolidate.ts` → `✓ consolidate verification passed`.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build` → success.
```bash
git add src/lib/scope/consolidate.ts scripts/verify-consolidate.ts
git commit -m "feat(scope): consolidate() merge engine + idempotent re-import verification

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Consolidate UI (batch picker + review screen + apply)

**Files:**
- Create: `src/components/editor/consolidate-dialog.tsx`
- Modify: `src/lib/store/index.tsx` — add `consolidateFiles(files: File[]): Promise<StoreActionResult>` to `IsspStoreValue` (lines 25–56 interface + 974–996 provider value).
- Modify: `src/components/editor/editor-sidebar.tsx` — add "Consolidate returned files" action (masters only).

**Interfaces:**
- Consumes: `consolidate()` (Task 9); `loadFromFile`-style file parsing (`normalizeImportShape`, `index.tsx:120`).

- [ ] **Step 1: Add the store action**

In `index.tsx`, add to `IsspStoreValue`:
```ts
consolidateFiles: (files: File[]) => Promise<StoreActionResult>;
```
Implement in the provider: read each file, `JSON.parse`, run through `normalizeImportShape` (reject if not a valid scoped file — `fileType === "issp-main"` AND has `editScope`), collect valid `IsspDocument[]`, call `consolidate(currentDoc, docs)`, then `setDoc(result.merged)` + `scheduleSave()`. Return `{ success: true }` or `{ success: false, error }`. Surface `result.reviewFlags`/`scalarConflicts` via a callback or a transient state field the dialog reads (e.g. return them in a module-level ref or extend `StoreActionResult`).

- [ ] **Step 2: Build the review-screen dialog**

Create `consolidate-dialog.tsx`: (1) file picker (multi-select `.issp`); (2) on select, call a pure preview — parse + `consolidate(currentDoc, docs)` — and render the per-file summary (overlay / replace-N-rows / overlap-flagged / scalar-conflict) exactly as in the design's review-screen mock; (3) "Apply" calls `consolidateFiles(files)`; (4) on success, show review flags via toast + the editor banner (Task 11).

- [ ] **Step 3: Add the entry point**

In `editor-sidebar.tsx`, add "Consolidate returned files" (masters only, next to Distribute) → opens `<ConsolidateDialog>`.

- [ ] **Step 4: End-to-end smoke + typecheck + commit**

Master → Distribute office B (`part1/c.stakeholders`) → in the B file add 2 stakeholders, save → back in master, Consolidate → select B file → review screen shows "replace 0 → 2 rows" → Apply → master has 2 rows. Repeat the idempotent re-import in the browser (edit B to 2 different rows, re-consolidate) → still 2 B rows, no duplicates.
Run: `npm run build` → success.
```bash
git add src/components/editor/consolidate-dialog.tsx src/lib/store/index.tsx src/components/editor/editor-sidebar.tsx
git commit -m "feat(scope): Consolidate UI with review screen

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Surface consolidation review flags in the editor

**Files:**
- Modify: `src/components/editor/section-shell.tsx:188-198` (the existing `pendingSectionIds` banner) — also show when `doc.consolidationFlags?.includes(sectionId)`.
- Modify: `src/components/editor/editor-sidebar.tsx:583-594` (the "Review" badge) — same condition.

**Interfaces:**
- Consumes: `doc.consolidationFlags` (Task 1).

- [ ] **Step 1: Extend the banner/badge condition**

Where the existing migration-review banner/badge checks `migrationReview?.pendingSectionIds?.includes(id)`, OR-in `doc?.consolidationFlags?.includes(id)`. Reuse the exact same UI (banner text can say "Flagged during consolidation — review for duplicates").

- [ ] **Step 2: Smoke + typecheck + commit**

Consolidate with an overlap → flagged section shows the banner + sidebar badge. Clearing: provide a small "Mark reviewed" on the banner that removes the id from `consolidationFlags` via `update`.
Run: `npm run build` → success.
```bash
git add src/components/editor/section-shell.tsx src/components/editor/editor-sidebar.tsx
git commit -m "feat(scope): surface consolidation review flags via existing banner/badge

Co-Authored-By: Claude <noreply@anthropic.com>"
```

> **Phase 3 checkpoint:** full distribute → edit → consolidate → review-flag cycle works. Review before Phase 4.

---

## Phase 4 — Annex 1 bridge + release

### Task 12: Annex 1 Direction C bridge (legacy + new coexist)

**Files:**
- Verify: `src/app/editor/annex1/page.tsx` (legacy attach still works)
- Verify: `src/lib/pdf/render-issp-html.ts:1769-1842` (consolidated render still works)
- Possibly Modify: `src/lib/annex1/types.ts` + inline `types.ts:391-409` (`Annex1FilePayload` gains `officeId?` to key consolidate replace-by-office — see Task 6/9 alignment note).

**Interfaces:**
- Consumes: `consolidate()` (Task 9), `annexedOffices` bucket.

- [ ] **Step 1: Confirm legacy path intact**

Load a legacy `fileType:"annex1"` file via the Annex 1 attach flow → it still attaches (dedupe by `displayLabel`), still renders in the PDF. No regression.

- [ ] **Step 2: Confirm new path**

Distribute an Annex-1-scoped file (`editable:["annexes/annex1"]`) → office adds inventory rows (stamped) → consolidate → master's `annexedOffices` gains/replaces that office's payload by `officeId`. Both old (displayLabel-deduped, attached manually) and new (officeId-replaced, consolidated) entries coexist in `annexedOffices` and render.

- [ ] **Step 3: Align the office-key field**

Decide and implement the single field `consolidate()` uses to match an office's Annex 1 payload (`officeId` preferred — add it to `Annex1FilePayload` in both the canonical and inline type defs). Update the consolidate filter (Task 9 Step 3) and the attach dedupe to tolerate both legacy (no `officeId`) and new rows.

- [ ] **Step 4: Smoke (both paths) + typecheck + commit**

Run: `npm run build` → success.
```bash
git add <touched files>
git commit -m "feat(scope): Annex 1 Direction C bridge — legacy + scoped coexist

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Full verify-feature pass + demo/sample

**REQUIRED SUB-SKILL:** `verify-feature` (and `verifier-web` for Puppeteer mechanics).

**Files:**
- Possibly Create: `public/demo/<agency>-issp-scoped-sample.issp` (optional sample scoped file).

- [ ] **Step 1: Type + lint** — `npm run build`, `npm run lint` → both clean.

- [ ] **Step 2: Browser smoke (Puppeteer, dev server :3000)** — drive the full cycle: master → Distribute (field-level pick + Annex 1) → open scoped file (only owned fields render, banner, PDF disabled, rows stamp) → fill + add rows → save → master → Consolidate → review screen → Apply → confirm overlay/replace/no-dupes/review-flag → export PDF **from master only** (succeeds); attempt PDF in scoped file (blocked).

- [ ] **Step 3: Edge cases** — non-scoped file in Consolidate (rejected); unknown path in scope (skipped/flagged); same file twice (deduped); office rename between rounds (stable id → replace works); legacy `annexedOffices` file loads.

- [ ] **Step 4: Build + deploy + prod verify** — per `verify-feature` / project deploy routine (`basePath /issp`, pm2 — see memory). Confirm on prod.

- [ ] **Step 5: Commit** any sample/fixes.

---

### Task 14: Docs

**Files:**
- Update: `docs/roadmap.md`, `docs/session-handoff.md` (or `docs/project-status.md`) — note scoped distribution shipped.
- Update: `references/` — no change (fields unchanged).
- Optional: a short `docs/scoped-distribution-usage.md` end-user note for the secretariat.

- [ ] **Step 1: Write the usage note + update status docs. Commit.**
```bash
git add docs/
git commit -m "docs: scoped .issp distribution & consolidation usage + status

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review (completed during authoring)

**Spec coverage:** every spec section maps to a task — data model (T1), path resolver/SHARED_TABLE_PATHS (T2), Phase 1 scoped editing incl. hide+strip + banner + no-PDF + row stamping (T3–T6), Phase 1 Distribute slice + tree picker (T7–T8), Phase 3 consolidate merge + review + flags (T9–T11), Annex 1 Direction C (T12), leakage/edge/testing (T13), docs (T14). The "stable office id" merge key is in T1's `OfficeIdentity.id` and used in T9.

**Open risks flagged inline (not placeholders — they are real decisions for the implementer):**
- `useIsspStore` selector support (T3 Step 1) — verify; adjust hook internals, keep contract.
- Form store-access pattern for `officeId` stamping (T6 Step 2) — thread as prop, keep forms store-agnostic.
- Exact Annex 1 office-key field used by consolidate (T9/T12) — `officeId` on `Annex1FilePayload`; align both type defs.
- The per-part field copy in `sliceScopedDoc` (T7 Step 3) — tighten with `SECTION_FIELDS`.

**Type consistency:** `EditScope`/`EditPath` (T1) → `resolveScope`/`ResolvedScope`/`isSectionVisible`/`isFieldEditable` (T2) → `useResolvedScope` (T3) → `sliceScopedDoc`/`DistributeSpec` (T7) → `consolidate`/`ConsolidateResult` (T9) → `consolidateFiles` store action (T10). Names match across tasks.
