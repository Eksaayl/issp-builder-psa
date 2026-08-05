# Annex 1 — Unsaved-Changes Tracker & Status Dot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Annex 1 (ICT Asset Inventory) changes visible in the master ISSP file's unsaved-changes tracker — both the expandable "what changed" list in the sidebar (per office) and a status dot on the Annex 1 nav item — so adding/editing/removing an office is reflected exactly like edits to Parts I–IV.

**Architecture:** No schema change. `sectionMeta` is already a free-form `Record<string, SectionMeta>`, so we simply start populating the existing `"annexes/annex1"` key. Two surgical fixes: (1) the sidebar's changed-sections loop and `getChangedFields` currently ignore annex sections entirely — add `ANNEX_SECTIONS` to the loop and special-case `"annexes/annex1"` with a per-office diff; (2) the Annex 1 editor pages never write `sectionMeta.lastEditedAt`, so we stamp it on every add/edit/remove and extend `deriveMetaFromContent` so a loaded master that already has offices shows the dot without requiring an edit first.

**Tech Stack:** Next.js (App Router, client components), React, TypeScript, Tailwind, `lucide-react`, `sonner`, Zustand store (`useIsspStore`). Verification: `npx tsc --noEmit` + `npm run lint` + Puppeteer smoke on the dev server (no unit-test framework in this project).

## Global Constraints

- **NEVER run `npm run build` during this feature work.** This is a shared dev+prod tree; the pm2 process `issp` on :3100 IS production and reads `.next/` at request time. Rebuilding desyncs prod (manifest 500s). Dev type-gate = `npx tsc --noEmit` + `npm run lint` only. (`npm run build` is deploy-only.)
- **No schema or migration change.** `sectionMeta: Record<string, SectionMeta>` already accepts `"annexes/annex1"` as a key; `annexedOffices` is unchanged. No `schemaVersion` bump, no `migrateLegacyDoc` change, no demo-file change, no PDF change. If a reviewer thinks the `schema-change` skill applies — it does not; we are populating an existing free-form record, not adding/renaming a field.
- **`docContentHash` already includes `annexedOffices`** (`src/lib/store/index.tsx:786` spreads the whole doc), so the `unsavedToFile` boolean already flips on Annex 1 edits — do NOT touch it. This plan fixes only the *detailed tracker list* and adds the *dot*. Confirmed by repro: adding one office flips the boolean to `true`.
- **`docContentHash` strips `sectionMeta.lastEditedAt`** (keeps only `userMarkedDone`). So stamping `lastEditedAt` does NOT create a false unsaved state — the boolean stays driven purely by `annexedOffices` content. Verified at `src/lib/store/index.tsx:779-786`.
- **Annex 1 has no "Mark as done" control.** Its dot will only ever be `empty` (gray) or `in_progress` (amber) — never `done` (green). This is intended (Annex 1 is an optional supplement). Do not add a mark-done button.
- **Scoped-distribution interaction is unchanged.** Scoped offices already stamp `officeId` on payloads (`src/app/editor/annex1/edit/content.tsx:52-54,103-105`). This plan's stamping of `lastEditedAt` is orthogonal. Whether `consolidate()` stamps the *master's* annex1 `lastEditedAt` after a merge is **out of scope** — the reported bug is about direct edits in the master.
- **Palette/components:** reuse `@/components/ui/status-dot`, `computeStatus` from `@/lib/sections`, existing Tailwind tokens. Match the Part-leaf `StatusDot` pattern exactly (`src/components/editor/editor-sidebar.tsx` Part-leaf rendering).
- **Commit only the files each task touches.** End commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>`.

### Exact signatures this plan depends on (verified in-tree)

```ts
// src/lib/sections.ts
type SectionStatus = "empty" | "in_progress" | "done";
interface SectionMeta { userMarkedDone: boolean; lastEditedAt: string | null; }   // src/lib/store/types.ts:374
function computeStatus(meta: SectionMeta | undefined): SectionStatus;              // sections.ts:77 → !meta?"empty": meta.userMarkedDone?"done": meta.lastEditedAt?"in_progress":"empty"
const ANNEX_SECTIONS: readonly SectionDef[];                                       // sections.ts:66 → [{ id:"annexes/annex1", label:"Annex 1 — ICT Asset Inventory", href:"/editor/annex1" }]

// src/lib/section-fields.ts
interface SectionField { key: string; label: string; }
function getChangedFields(sectionId: string, current: IsspDocument, snapshot: IsspDocument): SectionField[];  // :135

// src/lib/store/index.tsx
useIsspStore() → { doc, loading, update, updateSectionMeta, ... }
updateSectionMeta: (sectionId: string, patch: Partial<SectionMeta>) => void;        // :59, :894
function deriveMetaFromContent(doc): Record<string, SectionMeta>                     // :352 — has maybeSet(id, hasContent) helper

// Annex1FilePayload (src/lib/annex1/types.ts:81): { office: { displayLabel, ... }, annex1: { equipment, software }, exportedAt, officeId?, ... }
```

`ANNEX_SECTIONS`, `computeStatus`, `getChangedFields`, `StatusDot` are already imported in `editor-sidebar.tsx` (lines 50-51). `updateSectionMeta` is already exposed by the store.

---

## File Structure

- **Modify** `src/lib/section-fields.ts` — add `"annexes/annex1"` branch to `getChangedFields` (per-office added/edited/removed diff).
- **Modify** `src/components/editor/editor-sidebar.tsx` — (a) add `ANNEX_SECTIONS` to the changed-sections `groups` array; (b) add a `<StatusDot>` to the Annex 1 nav leaf.
- **Modify** `src/lib/store/index.tsx` — add one `maybeSet("annexes/annex1", …)` line to `deriveMetaFromContent`.
- **Modify** `src/app/editor/annex1/page.tsx` — stamp `lastEditedAt` in `handleFiles` (attach) and `removeOffice`.
- **Modify** `src/app/editor/annex1/edit/content.tsx` — stamp `lastEditedAt` in `handleAdd` and `handleUpdate`.
- **Create** `scripts/verify-annex1-tracker.mjs` — Puppeteer repro/smoke (models setup on `scripts/smoke-task6.mjs`).

No new types, no new components, no PDF/export changes.

---

### Task 1: Make the tracker list Annex 1 changes per office

**Files:**
- Modify: `src/lib/section-fields.ts:135-167` (`getChangedFields`)
- Modify: `src/components/editor/editor-sidebar.tsx:344-347` (`groups` array)
- Create: `scripts/verify-annex1-tracker.mjs`

**Interfaces:**
- Consumes: `IsspDocument.annexedOffices?: Annex1FilePayload[]` (each has `office.displayLabel` + `annex1: {equipment, software}` + `office`).
- Produces: `getChangedFields("annexes/annex1", current, snapshot)` returns one `SectionField` per changed office: `{ key: "annex1:add:<label>" | "annex1:edit:<label>" | "annex1:del:<label>", label: "<label> — added|edited|removed" }`.

- [ ] **Step 1: Write the failing Puppeteer repro**

Create `scripts/verify-annex1-tracker.mjs`. Model the launch + IDB-load boilerplate on `scripts/smoke-task6.mjs` (Chrome at `/root/.cache/puppeteer/chrome/linux-148.0.7778.167/chrome-linux64/chrome`, dev server `http://localhost:3000`, inject the demo doc into IndexedDB so `/editor` loads a document — copy that pattern verbatim from `smoke-task6.mjs`). The assertion body is:

```js
// After a doc is loaded in IDB and we're on /editor:
// 1. Go to the Annex 1 management list and add Central Office inline.
await page.goto("http://localhost:3000/editor/annex1", { waitUntil: "networkidle0" });
await page.waitForSelector('a[href="/editor/annex1/new"]', { timeout: 5000 });
// "Add office" button navigates to the picker
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0" }),
  page.click('button:has-text("Add office")'),
]);
// Picker: Central Office is the first office-type button; Continue is disabled until selected
await page.click('button:has-text("Central Office")');
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0" }),
  page.click('button:has-text("Continue")'),
]);
// Now on /editor/annex1/edit?type=central — type a count so the save is meaningful
await page.waitForSelector('input[placeholder="0"]', { timeout: 5000 });
const firstCount = await page.$('input[placeholder="0"]');
await firstCount.type("5");
// Save -> returns to /editor/annex1
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0" }),
  page.click('button:has-text("Add office")'),
]);
await page.waitForSelector('text=Central Office', { timeout: 5000 });

// 2. Open the sidebar "Unsaved changes" expander and assert Annex 1 + the office appear.
//    (Sidebar save button reads "Save changes" when unsavedToFile is true.)
const sidebarText = await page.evaluate(() => {
  // click the "Unsaved changes" toggle in the sidebar footer, then read its panel
  const toggle = [...document.querySelectorAll("button")].find((b) => /Unsaved changes/i.test(b.textContent || ""));
  if (toggle) toggle.click();
  return document.body.innerText;
});
const ok = /Annex 1/i.test(sidebarText) && /Central Office/i.test(sidebarText);
console.log(ok ? "PASS: tracker lists Annex 1 / Central Office" : "FAIL: tracker missing Annex 1");
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Run the repro to verify it fails (before the fix)**

Start dev server if not running: `npm run dev` (port 3000). Then:
```bash
node scripts/verify-annex1-tracker.mjs
```
Expected (bug present): prints `FAIL: tracker missing Annex 1`, exit 1. (The save button turns amber — boolean works — but the expanded list does not mention Annex 1.)

- [ ] **Step 3: Add the `"annexes/annex1"` branch to `getChangedFields`**

In `src/lib/section-fields.ts`, inside `getChangedFields` (after the `definitions` block at line 144-148, before the `if (def && def.fields.length > 0)` block at line 150), insert:

```ts
  // Annex 1 office inventory lives at doc.annexedOffices (not under a part key).
  // Surface each office that was added, edited, or removed since the snapshot.
  if (sectionId === "annexes/annex1") {
    const cur = current.annexedOffices ?? [];
    const snap = snapshot.annexedOffices ?? [];
    const curByKey = new Map(cur.map((o) => [o.office.displayLabel, o]));
    // Added or edited
    for (const o of cur) {
      const prev = snap.find((s) => s.office.displayLabel === o.office.displayLabel);
      if (!prev) {
        changed.push({ key: `annex1:add:${o.office.displayLabel}`, label: `${o.office.displayLabel} — added` });
      } else if (JSON.stringify(prev.annex1) !== JSON.stringify(o.annex1) || JSON.stringify(prev.office) !== JSON.stringify(o.office)) {
        changed.push({ key: `annex1:edit:${o.office.displayLabel}`, label: `${o.office.displayLabel} — edited` });
      }
    }
    // Removed
    for (const o of snap) {
      if (!curByKey.has(o.office.displayLabel)) {
        changed.push({ key: `annex1:del:${o.office.displayLabel}`, label: `${o.office.displayLabel} — removed` });
      }
    }
  }
```

Rationale for comparing `prev.annex1` + `prev.office` (not the whole payload): this excludes `exportedAt` and `officeId`, so a no-op save (open edit, change nothing, save → fresh `exportedAt`) is NOT flagged as "edited". Only real count/identity changes are. (The boolean `unsavedToFile` will still flip on a no-op save because `exportedAt` is in the hash; that mismatch is the same accepted behavior as other sections' init-normalization false positives.)

- [ ] **Step 4: Add `ANNEX_SECTIONS` to the sidebar changed-sections `groups`**

In `src/components/editor/editor-sidebar.tsx`, the `groups` array (line 344-347) currently is:
```ts
    const groups: { part: PartDef | null; sections: readonly SectionDef[] }[] = [
      { part: null, sections: FRONT_MATTER_SECTIONS },
      ...PARTS.map((part) => ({ part, sections: part.sections })),
    ];
```
Append one entry:
```ts
    const groups: { part: PartDef | null; sections: readonly SectionDef[] }[] = [
      { part: null, sections: FRONT_MATTER_SECTIONS },
      ...PARTS.map((part) => ({ part, sections: part.sections })),
      { part: null, sections: ANNEX_SECTIONS },
    ];
```
This makes both the snapshot path (line 348-356) and the fresh-load fallback path (357-372) iterate Annex 1. The fallback path uses `lastEditedAt` — it will start working once Task 2 stamps it. `ANNEX_SECTIONS` is already imported (line 50). The changed-sections renderer (line 953-977) already handles `part: null` (the `{part && …}` guard at 960).

- [ ] **Step 5: Typecheck + lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 6: Run the repro to verify it now passes**

```bash
node scripts/verify-annex1-tracker.mjs
```
Expected: prints `PASS: tracker lists Annex 1 / Central Office`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/section-fields.ts src/components/editor/editor-sidebar.tsx scripts/verify-annex1-tracker.mjs
git commit -m "fix(annex1): show office changes in unsaved-changes tracker

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Status dot on the Annex 1 nav item + activity stamping

**Files:**
- Modify: `src/components/editor/editor-sidebar.tsx:637-660` (Annex leaf — add `StatusDot`)
- Modify: `src/lib/store/index.tsx` (`deriveMetaFromContent`, ~line 352-388 — add one `maybeSet`)
- Modify: `src/app/editor/annex1/page.tsx` (`handleFiles`, `removeOffice`)
- Modify: `src/app/editor/annex1/edit/content.tsx` (`handleAdd`, `handleUpdate`)
- Extend: `scripts/verify-annex1-tracker.mjs` (dot assertions)

**Interfaces:**
- Consumes: `computeStatus`, `StatusDot`, `updateSectionMeta`, `deriveMetaFromContent`'s `maybeSet` helper.
- Produces: Annex 1 leaf renders a `StatusDot` driven by `sectionMeta["annexes/annex1"]`; every add/edit/remove stamps `lastEditedAt`; a loaded master with offices derives `lastEditedAt` so the dot is amber on load.

- [ ] **Step 1: Extend the repro with dot assertions (will fail until the dot exists)**

Append to `scripts/verify-annex1-tracker.mjs`, after the Task 1 assertions (keep the existing PASS/FAIL for the list; add a second check for the dot, and a reload check for `deriveMetaFromContent`):

```js
// 3. The Annex 1 nav leaf should now carry an amber (in_progress) StatusDot.
//    StatusDot renders a <span> with a background color; "in_progress" uses the warning/amber token.
const dotAmber = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[href="/editor/annex1"]')];
  const leaf = links.find((a) => /Annex 1/i.test(a.textContent || ""));
  if (!leaf) return false;
  const dot = leaf.querySelector("span.rounded-full, .status-dot, span[class*='bg-warning'], span[class*='bg-amber']");
  return !!dot;
});
console.log(dotAmber ? "PASS: annex1 dot present" : "FAIL: annex1 dot missing");

// 4. Reload — deriveMetaFromContent should keep the dot amber because offices exist.
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector('a[href="/editor/annex1"]', { timeout: 5000 });
const dotAmberAfterReload = await page.evaluate(() => {
  const leaf = [...document.querySelectorAll('a[href="/editor/annex1"]')].find((a) => /Annex 1/i.test(a.textContent || ""));
  return !!leaf?.querySelector("span.rounded-full, .status-dot, span[class*='bg-warning'], span[class*='bg-amber']");
});
console.log(dotAmberAfterReload ? "PASS: annex1 dot amber after reload" : "FAIL: annex1 dot not amber after reload");

const allOk = ok && dotAmber && dotAmberAfterReload;
process.exit(allOk ? 0 : 1);
```

- [ ] **Step 2: Run the repro to verify the new assertions fail**

```bash
node scripts/verify-annex1-tracker.mjs
```
Expected: Task 1 assertions PASS, the two dot assertions FAIL (exit 1).

- [ ] **Step 3: Add `<StatusDot>` to the Annex 1 nav leaf**

In `src/components/editor/editor-sidebar.tsx`, the Annex leaf `Link` (line 641-658) currently begins:
```tsx
            <Link
              key={section.id}
              href={section.href}
              onClick={handleNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-[var(--sidebar-active)] text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <span className="truncate flex-1">{section.label}</span>
```
Insert a `StatusDot` (matching the Part-leaf pattern at line ~600: `{!section.readOnly && <StatusDot status={status} size={6} className="shrink-0" />}`). The `visibleAnnexes.map((section) => { … })` block (line 637) needs a `status` local. Change the block to:

```tsx
          {visibleAnnexes.map((section) => {
          const isActive = pathname === section.href || pathname.startsWith(section.href + "/");
          const count = section.id === "annexes/annex1" ? (doc?.annexedOffices?.length ?? 0) : 0;
          const status = computeStatus(sectionMeta[section.id]);
          return (
            <Link
              key={section.id}
              href={section.href}
              onClick={handleNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-[var(--sidebar-active)] text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <StatusDot status={status} size={6} className="shrink-0" />
              <span className="truncate flex-1">{section.label}</span>
              {count > 0 && (
                <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 leading-none">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
```

(Only two lines are added vs. the current block: the `const status = …` line and the `<StatusDot …/>` line before the label span. `StatusDot` and `computeStatus` are already imported; `sectionMeta` is already in scope at line 519.)

- [ ] **Step 4: Extend `deriveMetaFromContent` so a loaded master with offices shows the dot**

In `src/lib/store/index.tsx`, inside `deriveMetaFromContent`, after the last `maybeSet("part4/summary", anyYear);` line and before `return result;`, add:

```ts
  maybeSet("annexes/annex1", (doc.annexedOffices?.length ?? 0) > 0);
```

This makes a freshly loaded master that already has attached/added offices show the Annex 1 dot as `in_progress` (amber) without requiring an edit, and lets the fresh-load fallback tracker (Task 1, line 357-372) pick it up.

- [ ] **Step 5: Stamp `lastEditedAt` in the editor Annex 1 list page (attach + remove)**

In `src/app/editor/annex1/page.tsx`:

(a) Pull `updateSectionMeta` from the store. Change (line ~32):
```tsx
  const { doc, loading, update } = useIsspStore();
```
to:
```tsx
  const { doc, loading, update, updateSectionMeta } = useIsspStore();
```

(b) In `handleFiles`, inside the `if (toAdd.length > 0) { … }` block (line 72-75), after the `update(...)` call and before/after the toast, add:
```tsx
      updateSectionMeta("annexes/annex1", { lastEditedAt: new Date().toISOString() });
```
(Full block becomes:)
```tsx
    if (toAdd.length > 0) {
      update((prev) => ({ ...prev, annexedOffices: [...(prev.annexedOffices ?? []), ...toAdd] }));
      updateSectionMeta("annexes/annex1", { lastEditedAt: new Date().toISOString() });
      toast.success(`${toAdd.length} office${toAdd.length > 1 ? "s" : ""} attached`);
    }
```

(c) In `removeOffice` (line 80-86), after the `update(...)` call, add:
```tsx
    updateSectionMeta("annexes/annex1", { lastEditedAt: new Date().toISOString() });
```
(Full function becomes:)
```tsx
  function removeOffice(displayLabel: string) {
    update((prev) => ({
      ...prev,
      annexedOffices: (prev.annexedOffices ?? []).filter((a) => a.office.displayLabel !== displayLabel),
    }));
    updateSectionMeta("annexes/annex1", { lastEditedAt: new Date().toISOString() });
    toast.success("Office removed");
  }
```

- [ ] **Step 6: Stamp `lastEditedAt` in the editor edit page (add + update)**

In `src/app/editor/annex1/edit/content.tsx`:

(a) Pull `updateSectionMeta` from the store. Change (line ~26):
```tsx
  const { doc, loading, update } = useIsspStore();
```
to:
```tsx
  const { doc, loading, update, updateSectionMeta } = useIsspStore();
```

(b) In `handleUpdate` (the `key` branch, line 56-66), after the `update(...)` call and before `return true;`, add:
```tsx
      updateSectionMeta("annexes/annex1", { lastEditedAt: new Date().toISOString() });
```

(c) In `handleAdd` (the `typeParam` branch, line 107-117), inside the success path (after the `update(...)` call, before `toast.success`/`return true`), add:
```tsx
      update((prev) => ({ ...prev, annexedOffices: [...(prev.annexedOffices ?? []), stamped] }));
      updateSectionMeta("annexes/annex1", { lastEditedAt: new Date().toISOString() });
      toast.success("Office added");
      return true;
```
Do NOT stamp when the duplicate check returns `false` (line 110-112) — no change occurred.

The standalone `/annex1` form (download mode) is untouched: it does not write to `doc`, so it must not stamp.

- [ ] **Step 7: Typecheck + lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 8: Run the repro to verify all assertions pass**

```bash
node scripts/verify-annex1-tracker.mjs
```
Expected: all four lines `PASS …`, exit 0.

- [ ] **Step 9: Manual edge-case smoke (Puppeteer or by hand on :3000)**

- Add a 2nd office (e.g. Regional Office — NCR) → tracker lists both offices; dot stays amber; count badge shows 2.
- Edit Central Office's counts and save → tracker shows `Central Office — edited` (and the regional office is NOT listed as changed).
- Remove Central Office → tracker shows `Central Office — removed`.
- Reload after remove → with offices still present, dot stays amber; if all offices removed, dot returns to gray on reload (because `deriveMetaFromContent` only sets `lastEditedAt` when `length > 0`).
- A scoped office without annex1 ownership still sees `<ScopeGuardPanel />` (unchanged — stamping only runs inside the guarded handlers).

- [ ] **Step 10: Commit**

```bash
git add src/components/editor/editor-sidebar.tsx src/lib/store/index.tsx src/app/editor/annex1/page.tsx src/app/editor/annex1/edit/content.tsx scripts/verify-annex1-tracker.mjs
git commit -m "feat(annex1): status dot + activity tracking on the master file

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage (the reported bug + the two approved decisions):**
  - "unsaved changes tracker does not reflect annex 1 changes" → Task 1 (list) + Task 2 (dot + fresh-load). ✓
  - "dot is ok" → Task 2 Step 3 adds the dot. ✓
  - "granularity: break it out per changed office" → Task 1 Step 3 per-office diff (added/edited/removed). ✓
- **Placeholder scan:** every code step shows the exact code; the Puppeteer script references the proven `smoke-task6.mjs` for launch/IDB boilerplate (an existing repo file, not another task) and writes the assertion body in full. No TBD/TODO. ✓
- **Type consistency:** `getChangedFields` returns `SectionField[]` (`{key,label}`) — Task 1's entries match; the renderer (sidebar:967-973) reads `f.key`/`f.label`. `updateSectionMeta(sectionId, Partial<SectionMeta>)` — Task 2 calls pass `{ lastEditedAt: string }`, a valid `Partial<SectionMeta>`. `computeStatus(sectionMeta[section.id])` matches the Part-leaf usage. ✓
- **No-schema-change check:** `sectionMeta` is `Record<string, SectionMeta>` (free-form keys) — adding `"annexes/annex1"` needs no type edit. `annexedOffices` unchanged. No `schemaVersion` bump. The `schema-change` skill is correctly NOT triggered. ✓
- **Out of scope, stated:** consolidate() stamping the master's `lastEditedAt`; mark-done/green state for Annex 1; demo-file annex data; PDF changes. ✓

---

## Notes for the implementer

- This branch is `feat/scoped-issp-distribution`. The scoped-distribution code paths (`src/lib/scope/*`, the distribute/consolidate dialogs) are NOT modified by this plan. If a scoped doc is loaded, the existing `ScopeGuardPanel` guards still run before any stamping handler — verified behavior preserved.
- `scripts/smoke-task6.mjs` already drives `/editor/annex1` with Puppeteer and is the source of truth for the IDB-injection + Chrome-launch pattern. Copy that setup; only the assertion body in `verify-annex1-tracker.mjs` is new.
- After both tasks land, the four tracker surfaces agree: boolean save-state (already worked), detailed list (Task 1), status dot (Task 2), and fresh-load fallback (Task 1 groups + Task 2 stamping/derive).
