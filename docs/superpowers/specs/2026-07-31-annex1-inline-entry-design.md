# Annex 1 — Inline Entry & Edit (Design)

- **Date:** 2026-07-31
- **Status:** Approved → writing plan
- **Owner:** Carlos Antonio Albornoz
- **Related:** ISSP Builder · Annex 1 (ICT Asset Inventory) · `docs/annex1-implementation-plan.md`, `docs/scoped-issp-distribution-design-2026-07-21.md`

## Goal

Let the CIO **enter and edit Annex 1 (ICT Asset Inventory) data directly inside the editor**, without the download→attach round-trip — while keeping the existing "attach a file an office sent me" path. Carlos both keys offices in himself *and* collects from multiple offices, so both workflows must be first-class.

## Context (the gap today)

- The editor's Annex 1 page (`/editor/annex1`, `src/app/editor/annex1/page.tsx`) is **attach-only**: it shows an empty state + a file picker for `.issp` files, and a small "Open form" link to the standalone form. There is **no way to type data** from the editor.
- The actual input UI (Equipment + Software tables) lives only on the standalone route: `/annex1` (office picker) → `/annex1/edit` (tables) → downloads a `.issp`.
- Data already supports editing: `doc.annexedOffices: Annex1FilePayload[]`, where each entry holds structured `{ equipment, software }` rows — not opaque blobs. So editability is a UI gap, **not a schema change**. PDF export already reads `annexedOffices`, so no export change either.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Approach | **Approach 1 — editor sub-routes** | Matches the rest of the editor (route-based, sidebar/back-button), gives two tall tables room to breathe |
| Editability | **Editable inline** | CIO maintains the consolidated doc — typos, late updates, corrections need quick edits, not delete-and-recreate |
| Standalone form | **Keep `/annex1` as-is** | Still needed to share with offices that fill their own |
| Keying | **By `office.displayLabel`** | Already the de-facto unique key (today's dedupe uses it); avoids a schema change |
| Office identity | **Fixed at creation** | Counts editable anytime; changing type/region/name = remove + re-add (keeps keying simple) |

## The flow (3 routes, all under `/editor/annex1`)

1. **`/editor/annex1` — the list (management surface).** Replaces today's attach-only page:
   - Office cards. Each card is **clickable → edit** (link to `/editor/annex1/edit?key=<displayLabel>`), shows label + date + a small equipment/software total, and keeps its remove button.
   - Two add actions: **"Add office"** (→ `/editor/annex1/new`, type inline) and **"Attach files"** (existing, for office `.issp` files).
   - Keep the **"Open form"** link to standalone `/annex1` (for sharing).
   - Keep all existing attach/remove logic (`handleFiles`, `removeOffice`, dedupe).
2. **`/editor/annex1/new` — office picker.** Reuses `<OfficeSelector>`: Central / Regional (+region) / Field (+region +name). On continue → `router.push('/editor/annex1/edit?type=…&region=…&name=…')`.
3. **`/editor/annex1/edit` — Equipment + Software tables** (table/card toggle), reusing `<InventoryEditor>`:
   - `?key=<displayLabel>` → **edit existing**: pre-fill rows from `doc.annexedOffices`.
   - `?type=…&region=…&name=…` → **new office**: rows start from defaults.
   - **"Save to doc"** → add (new) or replace (edit) the entry in `doc.annexedOffices` via `update()` → toast → `router.push('/editor/annex1')`.
   - Edge cases: `key` not found → redirect to `/editor/annex1`; no `key` and no `type` → redirect to `/editor/annex1/new`; new office whose `displayLabel` already exists → toast error (reuse dedupe).

The sidebar keeps highlighting "Annex 1" on all three routes (`pathname.startsWith(section.href + "/")` already handles this).

## Component reuse (no duplication)

Extract two shared components, used by **both** the standalone form and the editor:

- **`src/components/annex1/office-selector.tsx`** (new) — pulled out of `src/app/annex1/page.tsx`. Props: `onContinue({ type, region, name })`, optional `submitLabel`. The standalone `/annex1` and the editor `/editor/annex1/new` both render it.
- **`src/components/annex1/inventory-editor.tsx`** (new) — the tables + view-toggle, pulled out of `src/app/annex1/edit/content.tsx`. Props: `mode: "download" | "save"`, office identity (`displayLabel`), initial `equipment`/`software` rows, `onSave?(payload)`, `onSaved?()`. Renders the office header, table/card toggle, Equipment section, Software section, and an action button whose label/behavior depends on `mode`.

Then refactor the two existing pages to consume them (behavior unchanged):
- `src/app/annex1/page.tsx` → uses `<OfficeSelector>`; continue pushes to `/annex1/edit?…`.
- `src/app/annex1/edit/content.tsx` → uses `<InventoryEditor mode="download">`; download behavior unchanged.

## Data & store (no schema change)

- `doc.annexedOffices: Annex1FilePayload[]` — add / update / remove via the existing `update((prev) => …)`.
- **Add:** push new `Annex1FilePayload` (built from rows + office identity); reject if `displayLabel` already present.
- **Update:** replace the entry whose `office.displayLabel === key`.
- **Remove:** existing filter logic.
- An office entered inline and one attached from a file are the **same shape** → both equally editable; no distinction in the doc or UI.
- Persistence: `annexedOffices` is part of `IsspDocument`, so it saves/loads via the existing IDB mechanism. PDF export unchanged.

## Files

- **New:** `src/components/annex1/office-selector.tsx`, `src/components/annex1/inventory-editor.tsx`, `src/app/editor/annex1/new/page.tsx`, `src/app/editor/annex1/edit/page.tsx`
- **Changed:** `src/app/editor/annex1/page.tsx` (list → management surface), `src/app/annex1/page.tsx` + `src/app/annex1/edit/content.tsx` (consume shared components)

## Acceptance criteria

1. From `/editor/annex1`, **Add office → picker → tables → Save** creates an office that appears in the list and **persists across reload**.
2. Clicking an office card opens tables **pre-filled**; changing a count and saving **updates** that office (no duplicate).
3. **Attach files** still works for office `.issp` files, exactly as today.
4. Standalone `/annex1` and `/annex1/edit` still work **exactly as today** (download flow, sharing).
5. **Every** office (typed or attached) is editable via its card.
6. Sidebar highlights **Annex 1** on `/editor/annex1`, `/editor/annex1/new`, and `/editor/annex1/edit`.
7. Removing an office still works.
8. `npm run build` (typecheck + build) passes.

## Out of scope (YAGNI)

- Editing office identity in place (type/region/name) — remove + re-add for now.
- Bulk import of offices.
- Changes to the PDF/export layout.
- Any schema or migration change.
