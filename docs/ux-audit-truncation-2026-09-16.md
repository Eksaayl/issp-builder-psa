# UX Audit — Text Truncation Family (2026-09-16)

Trigger: Carlos reported (1) the Part III-E duration "Year range" selector truncates its text,
(2) Part III-F truncates throughout. Per usability-principles ("flag the family, not the
instance"), this audit covers the whole defect family. Sources: Puppeteer reproduction
(390/700/1400px), vision inspection, and a codebase-wide agent audit.

## Root causes (two distinct mechanisms)

**RC1 — Shared select component** (`src/components/ui/select.tsx`)
- Trigger (`:78`): `whitespace-nowrap` + star-selector `*:data-[slot=select-value]:line-clamp-1`
  applied to a flex value element — flex-child text hard-clips with **no ellipsis**.
- Value (`:39`): no `min-w-0`, so width-constrained triggers clip instead of ellipsize.
- Popup (`:120`): `w-(--anchor-width)` locks the open list to the trigger's width
  (`min-w-36` floor) — narrow trigger → truncated options too.
- Affects every select in the app. Worst: II-A outcome/program multi-selects (joined long
  names), III-E duration mode, III-E funding source in a 1-of-4 grid cell.

**RC2 — Layout geometry** (fixed px columns + viewport breakpoints on unbounded text)
- III-E DurationPicker (`part3-e1-form.tsx:167`): inner `sm:grid-cols-3` row lives inside the
  parent `md:grid-cols-4` implementation grid — at ≥768px the picker column is ~1/4 of content
  (~235px at 1000px) → each select ~73px. The viewport breakpoint cannot see the parent column.
- III-F desktop table (`part3-f-form.tsx:220-235`): 9 columns with fixed/min widths
  (w-36 hierarchy, min-w-200 KPI, w-24 baseline, w-20 ×3 targets, min-w-140/120) ≈ 1030px
  minimum, served from the 768px `md` breakpoint behind `overflow-x-auto`; single-line
  `input`s in 80px year columns hold prose ("At least 95% of transactions online").
  30+ hard mid-word clips on desktop (verified by vision inspection).
  NOTE: III-F uses **native** `<select>`/`<input>`, not the shared component — RC1's fix
  does not touch it.

## Findings register

| # | Finding | file:line | Severity | Status |
|---|---|---|---|---|
| 1 | Select value hard-clips, no ellipsis | select.tsx:39,78 | High | **FIXED 2026-09-16** (min-w-0 + inner `truncate` span + `title` tooltip) |
| 2 | Duration mode "Year ran" clip | part3-e1-form.tsx:167-206 | High | **FIXED** by #1 + #3 (verified in full at 700px) |
| 3 | DurationPicker squeezed by parent 1-of-4 grid | part3-e1-form.tsx:578 | High | **FIXED 2026-09-16** — Duration field spans 2 parent columns |
| 4 | II-A outcome/program multi-select joined-value clip | part2-a-form.tsx:200,232 | High | Fixed by #1 (ellipsis + tooltip; multi-join renders "…") |
| 5 | III-E funding source clip in 1-of-4 cell | part3-e1-form.tsx:595 | High | Fixed by #1 (graceful); geometry noted |
| 6 | III-F desktop table — 30+ clips (columns, inputs, native select) | part3-f-form.tsx:220-306 | **High** | **FIXED 2026-09-16** — rebuilt as read table + edit drawer (Phase 3) |
| 7 | Stakeholder entity name uses `truncate` (should be line-clamp-2 break-words per principle 9) | part1-c-form.tsx:874 | Med | **FIXED 2026-09-16** |
| 8 | UACS combobox closed-state label `truncate` with no `title` — value never fully verifiable | uacs-combobox.tsx:304 | Med | **FIXED 2026-09-16** (title tooltip) |
| 9 | Popup width locked to trigger (`w-(--anchor-width)`) | select.tsx:120 | Med | Deferred — most popups carry short enums; floor min-w-36 keeps options legible; revisit if long-option popups hurt |
| 10 | II-C/III-D classification, status, project-type clips in 1-of-4/1-of-3 cells | part2-c-form.tsx:277; part3-d-form.tsx:297,311; part3-e1-form.tsx:397 | Med | Fixed by #1 (graceful ellipsis) |
| 11 | I-C table fixed columns (w-52/auto/w-44/w-48) squeeze transaction text | part1-c-form.tsx:622-631 | Med | Deferred — transaction column is already the flexible track; fixed columns hold short values |
| 12 | Dialog `truncate` on user-authored office labels | consolidate-dialog.tsx:429; distribute-dialog.tsx:441 | Low | Deferred (single-line dialog rows, acceptable) |

## Phase plan

- **Phase 1 (done, commit 9639b04):** shared select fix (finding 1) — verified at 390/700px:
  "Year range" renders in full; II-A long values show "…" instead of mid-word cuts.
- **Phase 2 (done, same session):** DurationPicker `sm:col-span-2` (3); I-C entity name
  line-clamp-2 + title (7); UACS title tooltip (8). Finding 11 re-classified Deferred —
  the transaction column is already the flexible track; fixed columns hold short values.
- **Phase 3 (done, same session — Carlos chose A):** Part III-F rebuilt as read table +
  edit drawer. Desktop: read-only wrapping table (hierarchy / indicator + muted
  method·resp sub-line / baseline / Y1-3 / pencil). Mobile: read cards with the same
  drawer (replaces the old inline-input cards — one editing paradigm everywhere).
  Add KPI and row Edit open the drawer; delete lives in the drawer footer behind the
  two-step confirm. Verified: previously-clipped strings fully visible, edit/add persist
  to IDB, zero console errors.

## Verification notes

- Repro screenshots: `/tmp/verify-shots/trunc-*.png` (before), `fix-duration-700.png`,
  `fix-iia-mobile.png` (after Phase 1).
- tsc clean after Phase 1.
