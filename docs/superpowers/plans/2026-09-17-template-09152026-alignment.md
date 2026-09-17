# Official Template 09152026 Alignment (Cyber Flags + Schema v13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the app with DICT's 09152026 template release and the Agency-Guidelines Performance-Framework rule: fix the 6 "Other Measures" cyber mandatory flags, add `HumanCapital.plantillaUnfilled` (Part I-B), and add `KpiRow.targetedResult` (Part III-F) — one additive migration to schema v13.

**Architecture:** Schema-first additive change, same pattern as v12: extend `types.ts`, extend `defaults.ts`, bump `CURRENT_SCHEMA_VERSION`, add a versioned no-op block + idempotent normalizations in `migrateLegacyDoc`, then surface the fields in the Part I-B form, the Part III-F drawer/table, the export adapter, and the PDF renderer. The cyber fix is data-constant only (flags drive form counters and both checklist renderers automatically).

**Tech Stack:** Next.js (App Router), TypeScript, IndexedDB store (`src/lib/store/`), Puppeteer smokes on the dev server :3000.

## Global Constraints

- **NEVER run `npm run build` during this work** — it desyncs live prod (pm2 `issp` serves from `.next` in this tree). Dev gates are `npx tsc --noEmit` + `npm run lint` (+ `npx tsx scripts/verify-v13.ts` + Puppeteer smokes on :3000). `npm run build` is deploy-only, and only after Carlos approves a deploy.
- Check `ss -tlnp | grep 3000` before starting a dev server — a long-lived `next dev` may already serve :3000 (EADDRINUSE + slow-cold-000 traps).
- Puppeteer smokes use `localhost:3000` (never the public IP), fresh page per phase, `networkidle2`, and neutralize `crypto.randomUUID`.
- Demo file is generator output: edit `scripts/build-demo.js`, run it, never hand-edit `public/demo/ncwtr-issp-2026-2028.issp`.
- Commit style: `type(scope): summary` + trailing `Co-Authored-By: Claude <noreply@anthropic.com>`.
- `npm run lint` currently has 1 pre-existing warning; that count must not grow.
- New field names (exact): `HumanCapital.plantillaUnfilled: { it: number; nonIt: number }`, `KpiRow.targetedResult: string`.

---

### Task 1: Correct "Other Measures" mandatory flags (6M/5O per official template)

The official template (v2 2026-06-12 PDF lines 207–212/412–417 and 09152026 docx) puts 6 of the 11 "Other Measures" controls in the MANDATORY column. Our `cyber-controls.ts` marks all 11 optional because `references/ISSP_Guidelines_2026.md:142` mis-extracted v2. Deployed commit `6d6b259` then added a merged-cell render branch based on that wrong premise — remove it.

**Files:**
- Modify: `src/lib/cyber-controls.ts:76-81`
- Modify: `src/lib/pdf/render-issp-html.ts` (`renderCyberTable`, ~736–773)
- Modify: `references/ISSP_Guidelines_2026.md:142-153`
- Test: `npx tsx` inline assertion (step 3)

**Interfaces:**
- Consumes: `CYBER_GROUPS` shape (`{ key, label, items: {key, label, mandatory}[] }[]`) — unchanged.
- Produces: 28 mandatory controls total (was 22). `part2-b-form.tsx` / `part3-a-form.tsx` counters derive from `group.items.filter(i => i.mandatory)` — no form edits needed. Tasks 2+ rely on nothing here.

- [ ] **Step 1: Flip the 6 flags**

In `src/lib/cyber-controls.ts`, change `mandatory: false` → `mandatory: true` on exactly these 6 keys in the `other` group (lines 76–81): `vulnAssessment`, `patchMgmt`, `strongPasswords`, `mfa`, `accessReviews`, `securityLogs`. Leave `logAnalysis`, `incidentResponse`, `siem`, `penTesting`, `secureSdlc` optional. Example of one line:

```ts
      { key: "vulnAssessment", label: "Vulnerability assessment & management", mandatory: true },
```

- [ ] **Step 2: Remove the merged-cell render branch**

In `src/lib/pdf/render-issp-html.ts`, `renderCyberTable`'s `rows.map(...)` ternary (the `row.mandatory.length === 0` branch added by `6d6b259`) collapses to the single two-column row template:

```ts
      ${rows.map(row => `<tr class="avoid-break">
            <td class="group-cell">${esc(row.group)}</td>
            <td class="mandatory-cell">
              ${row.mandatory.map(m => `${chk(row.src[m.key] as boolean)} ${esc(m.label)}<br>`).join("")}
            </td>
            <td class="optional-cell">
              ${row.optional.map(m => `${chk(row.src[m.key] as boolean)} ${esc(m.label)}<br>`).join("")}
              &nbsp;
            </td>
          </tr>`).join("")}
```

Groups with zero optional items (Data, Application) print an empty optional cell (`&nbsp;`) — same as the pre-`6d6b259` behavior. Delete the now-dead comment ("Template renders all-optional groups…").

- [ ] **Step 3: Assert the flags**

```bash
npx tsx -e '
import { CYBER_GROUPS } from "./src/lib/cyber-controls";
const g = CYBER_GROUPS.find(x => x.key === "other")!;
const m = g.items.filter(i => i.mandatory).map(i => i.key).sort();
if (JSON.stringify(m) !== JSON.stringify(["accessReviews","mfa","patchMgmt","securityLogs","strongPasswords","vulnAssessment"])) throw new Error("bad mandatory set: " + m);
const total = CYBER_GROUPS.reduce((s, x) => s + x.items.filter(i => i.mandatory).length, 0);
if (total !== 28) throw new Error("expected 28 mandatory, got " + total);
console.log("OK: Other Measures 6M/5O, 28 mandatory overall");'
```

Expected: `OK: Other Measures 6M/5O, 28 mandatory overall`.

- [ ] **Step 4: Correct the guidelines extraction**

In `references/ISSP_Guidelines_2026.md`, replace lines 142–153 (the flat "all Optional/Best Practice" block) with:

```markdown
#### Other Measures (6 Mandatory, 5 Optional — corrected 2026-09-17 against the official template PDFs)
Mandatory:
- Vulnerability Assessment
- Patch Management
- Strong Password Policies
- Multi-Factor Authentication (MFA)
- Access Reviews
- Security Logs

Optional / Best Practice:
- Log Analysis
- Incident Response Plan
- Security Information and Event Management (SIEM)
- Penetration Testing
- Secure Software Development Life Cycle (SDLC)
```

- [ ] **Step 5: Gates + commit**

```bash
npx tsc --noEmit && npm run lint
git add src/lib/cyber-controls.ts src/lib/pdf/render-issp-html.ts references/ISSP_Guidelines_2026.md
git commit -m "fix(cyber): mark 6 Other Measures controls mandatory per official template

Both the v2 (2026-06-12) PDF and the 09152026 template place Vulnerability
Assessment, Patch Management, Strong Password Policies, MFA, Access Reviews,
and Security Logs in the MANDATORY column. The guidelines extraction had
them 'all Optional', and 6d6b259 built a merged-cell render branch on that
wrong premise — both corrected.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Schema v13 — types, defaults, migration (TDD)

**Files:**
- Create: `scripts/verify-v13.ts`
- Modify: `src/lib/store/types.ts` (HumanCapital ~44-48, KpiRow ~314-324)
- Modify: `src/lib/store/defaults.ts:50-54` (`makeHumanCapital`)
- Modify: `src/lib/migration-review.ts:1` (`CURRENT_SCHEMA_VERSION`)
- Modify: `src/lib/store/index.tsx` (v12 block ~699-703, normalizations ~717-752)
- Modify: `src/components/issp-editor/part1/part1-b-form.tsx` (`DEFAULT_HC` ~43-47, merge ~204-216) — data plumbing only, UI is Task 3

**Interfaces:**
- Consumes: `createEmptyDocument(opts)` from `src/lib/store/defaults.ts` (fixture builder), `migrateLegacyDoc` from `src/lib/store/index.tsx`.
- Produces (exact, Tasks 3–5 depend on these):
  - `HumanCapital.plantillaUnfilled: { it: number; nonIt: number }` (required in store type)
  - `KpiRow.targetedResult: string` (required in store type)
  - `CURRENT_SCHEMA_VERSION === 13`
  - Migration: v12 docs gain `plantillaUnfilled: {it:0,nonIt:0}` and `targetedResult: ""` on every performance-framework row; already-set values are preserved.

- [ ] **Step 1: Write the failing verify script**

Create `scripts/verify-v13.ts` (pattern of `scripts/verify-duration.ts`):

```ts
// Verify schema v13 migration: Plantilla (Unfilled) counts (Part I-B) and
// per-KPI-row targeted-result statements (Part III-F) are additive — old docs
// gain zeros/empty strings, existing values survive a re-migration untouched.
// Run: npx tsx scripts/verify-v13.ts   (expect: ALL CHECKS PASSED)
import assert from "node:assert";
import { migrateLegacyDoc } from "../src/lib/store/index";
import { createEmptyDocument } from "../src/lib/store/defaults";
import type { IsspDocument } from "../src/lib/store/types";

function makeLegacyV12(): IsspDocument {
  const doc = createEmptyDocument({
    title: "v13 verify fixture",
    startYear: 2028,
    endYear: 2030,
    amendmentNumber: 0,
    scope: "AGENCY_WIDE",
    agencyHeadName: "Fixture Head",
    agency: { name: "Fixture Agency", acronym: "FX", type: "NGA", websiteUrl: "", logoBase64: null },
  });
  doc.schemaVersion = 12;
  // Simulate a pre-v13 doc: no plantillaUnfilled, no targetedResult anywhere.
  delete (doc.part1.humanCapital as Record<string, unknown>).plantillaUnfilled;
  for (const entry of Object.values(doc.part3.performanceFramework)) {
    for (const row of entry.rows) delete (row as Record<string, unknown>).targetedResult;
  }
  return doc;
}

// 1. v12 → v13 backfills defaults
const migrated = migrateLegacyDoc(makeLegacyV12());
assert.strictEqual(migrated.schemaVersion, 13, "schemaVersion must be 13 after migration");
assert.deepStrictEqual(migrated.part1.humanCapital.plantillaUnfilled, { it: 0, nonIt: 0 });
assert.ok(Object.values(migrated.part3.performanceFramework).every(e =>
  e.rows.every(r => r.targetedResult === "")
), "every KPI row gains targetedResult: \"\"");

// 2. Existing v13 values survive untouched (idempotent re-migration)
const modern = makeLegacyV12();
modern.schemaVersion = 13;
modern.part1.humanCapital.plantillaUnfilled = { it: 4, nonIt: 12 };
for (const entry of Object.values(modern.part3.performanceFramework)) {
  entry.rows[0].targetedResult = "Consolidated queue monitoring capability";
}
const remigrated = migrateLegacyDoc(modern);
assert.deepStrictEqual(remigrated.part1.humanCapital.plantillaUnfilled, { it: 4, nonIt: 12 });
assert.strictEqual(
  Object.values(remigrated.part3.performanceFramework)[0].rows[0].targetedResult,
  "Consolidated queue monitoring capability"
);

// 3. New documents are born at 13 with both fields present
assert.strictEqual(createEmptyDocument({
  title: "t", startYear: 2028, endYear: 2030, amendmentNumber: 0, scope: "AGENCY_WIDE",
  agencyHeadName: "h",
  agency: { name: "n", acronym: "a", type: "NGA", websiteUrl: "", logoBase64: null },
}).schemaVersion, 13);

console.log("ALL CHECKS PASSED");
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx tsc --noEmit` then `npx tsx scripts/verify-v13.ts`
Expected: tsc errors (`plantillaUnfilled` does not exist on `HumanCapital`; `targetedResult` does not exist on `KpiRow`), or the script asserts `schemaVersion must be 13`. Either failure mode is a valid red.

- [ ] **Step 3: Implement types + defaults + version bump**

`src/lib/store/types.ts` — HumanCapital gains the field (keep the other three rows unchanged):

```ts
export interface HumanCapital {
  plantilla: { it: { male: number; female: number }; nonIt: { male: number; female: number } };
  contractual: { it: { male: number; female: number }; nonIt: { male: number; female: number } };
  outsourced: { it: { male: number; female: number }; nonIt: { male: number; female: number } };
  /**
   * Official 09152026 template: unfilled plantilla positions. No sex
   * breakdown — the template prints N/A in the Male/Female cells.
   */
  plantillaUnfilled: { it: number; nonIt: number };
}
```

KpiRow gains the field right after `hierarchy`:

```ts
export interface KpiRow {
  id: string;
  hierarchy: "Intermediate Outcome" | "Immediate Outcome" | "Output" | "";
  /**
   * The specific written result for the selected hierarchy level (Agency
   * Guidelines, Performance Measurement Framework: "Write the hierarchy of
   * outcomes of the ICT Project clustered into intermediate outcome,
   * immediate outcome and outputs"). Rendered under the level name in the
   * PDF's "Hierarchy of Targeted Results" column.
   */
  targetedResult: string;
  indicator: string;
  baseline: string;
  year1Target: string;
  year2Target: string;
  year3Target: string;
  dataCollectionMethod: string;
  responsibleUnit: string;
}
```

`src/lib/store/defaults.ts` — `makeHumanCapital` (line 50):

```ts
function makeHumanCapital(): HumanCapital {
  const cell = () => ({ male: 0, female: 0 });
  const row = () => ({ it: cell(), nonIt: cell() });
  return { plantilla: row(), contractual: row(), outsourced: row(), plantillaUnfilled: { it: 0, nonIt: 0 } };
}
```

`src/lib/migration-review.ts` line 1: `export const CURRENT_SCHEMA_VERSION = 13;`

- [ ] **Step 4: Migration + idempotent normalization**

`src/lib/store/index.tsx` — after the v11→v12 block (~line 699-703), add:

```ts
  // v12 → v13: official 09152026 template alignment — Plantilla (Unfilled)
  // counts in Part I-B and per-row targeted-result statements in Part III-F.
  // Additive; the normalization pass below backfills the defaults.
  if ((base.schemaVersion ?? 1) < 13) {
    base = { ...base, schemaVersion: 13 };
  }
```

In the idempotent `normalized` object, inside the `part1: { ...base.part1, ... }` block (next to `stakeholders`/`orgOutcomes`), add:

```ts
      humanCapital: {
        ...base.part1.humanCapital,
        plantillaUnfilled: base.part1.humanCapital.plantillaUnfilled ?? { it: 0, nonIt: 0 },
      },
```

(Cast `base.part1.humanCapital` to `any` with the file's existing eslint-disable pattern if TS complains about the possibly-absent key on older docs.)

Inside the `part3: { ...base.part3, ... }` block, add alongside `proposedHumanCapital`:

```ts
      // v13: KPI rows carry a targeted-result statement; backfill "" on old docs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      performanceFramework: Object.fromEntries(Object.entries(base.part3.performanceFramework).map(([k, e]: [string, any]) => [
        k,
        { ...e, rows: (e.rows ?? []).map((r: any) => ({ ...r, targetedResult: r.targetedResult ?? "" })) },
      ])),
```

- [ ] **Step 5: Keep the Part I-B form compiling (data plumbing only)**

`src/components/issp-editor/part1/part1-b-form.tsx`:

`DEFAULT_HC` (~line 43) gains `plantillaUnfilled: { it: 0, nonIt: 0 },` and the deep-merge (~line 204) gains:

```ts
      plantillaUnfilled: {
        it:    saved.plantillaUnfilled?.it    ?? 0,
        nonIt: saved.plantillaUnfilled?.nonIt ?? 0,
      },
```

No UI yet (Task 3).

- [ ] **Step 6: Run the verify script — expect green**

Run: `npx tsc --noEmit && npx tsx scripts/verify-v13.ts && npm run lint`
Expected: tsc clean, `ALL CHECKS PASSED`, lint at its pre-existing warning count.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-v13.ts src/lib/store/types.ts src/lib/store/defaults.ts \
  src/lib/migration-review.ts src/lib/store/index.tsx \
  src/components/issp-editor/part1/part1-b-form.tsx
git commit -m "feat(schema): v13 — plantillaUnfilled (I-B) + KPI targetedResult (III-F)

Additive migration per the official 09152026 template and the Agency
Guidelines performance-framework rule. Old docs backfill {it:0,nonIt:0}
and \"\" respectively; no migration-review flag (both fields are optional
content, outcome-only stays valid like v12 programIds).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Part I-B — "Plantilla (Filled)/(Unfilled)" in form + PDF

**Files:**
- Modify: `src/components/issp-editor/part1/part1-b-form.tsx` (grid ~356-465)
- Modify: `src/lib/pdf/render-issp-html.ts` (Part1 type ~32-36, human-capital block ~596-700)
- Consumes: `hc.plantillaUnfilled` (Task 2)

**Interfaces:**
- Produces: form setter `setHCUnfilled(type: "it" | "nonIt", value: number)`; PDF renders rows "Plantilla (Filled)", "Plantilla (Unfilled)" (with `N/A` sex cells) and grand totals that include unfilled in IT/Non-IT columns only.

- [ ] **Step 1: Form — setter + unfilled row + totals**

In `part1-b-form.tsx`, add next to `setHC`:

```ts
  function setHCUnfilled(type: "it" | "nonIt", value: number) {
    update({
      humanCapital: {
        ...data.humanCapital,
        plantillaUnfilled: { ...data.humanCapital.plantillaUnfilled, [type]: value },
      },
    });
  }
```

After the `EMPLOYMENT_TYPES.map(...)` rows (before the Totals row), add the unfilled row. Unfilled positions have no sex breakdown — the M/F cells print "N/A" and the inputs live in the two "Total" cells:

```tsx
                {/* Official 09152026 template: unfilled plantilla posts — counts only, no sex breakdown (template prints N/A). */}
                <tr className="hover:bg-muted/20">
                  <td className="border px-3 py-2 font-medium text-sm">Plantilla (Unfilled)</td>
                  <td className="border px-3 py-2 text-center text-muted-foreground/60" colSpan={2}>N/A</td>
                  <td className="border px-1 py-1">
                    <NumberInput
                      unstyled
                      min={0}
                      className="w-full rounded px-2 py-1.5 text-center text-sm bg-card/70 hover:bg-card focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                      value={hc.plantillaUnfilled.it}
                      onValueChange={(n) => setHCUnfilled("it", n)}
                    />
                  </td>
                  <td className="border px-3 py-2 text-center text-muted-foreground/60" colSpan={2}>N/A</td>
                  <td className="border px-1 py-1">
                    <NumberInput
                      unstyled
                      min={0}
                      className="w-full rounded px-2 py-1.5 text-center text-sm bg-card/70 hover:bg-card focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                      value={hc.plantillaUnfilled.nonIt}
                      onValueChange={(n) => setHCUnfilled("nonIt", n)}
                    />
                  </td>
                  <td className="border px-3 py-2 text-center font-bold bg-muted/30">
                    {hc.plantillaUnfilled.it + hc.plantillaUnfilled.nonIt}
                  </td>
                </tr>
```

(Verify the colSpan layout against the live grid: the header is `Employment Status | ICT: Male, Female, Total | Non-ICT: Male, Female, Total | Subtotal` = 8 columns. Two `colSpan={2}` N/A cells + 2 input cells + label + subtotal = 8.)

Update the existing label in `EMPLOYMENT_TYPES`: `{ key: "plantilla", label: "Plantilla (Filled)" }`.

Totals row — unfilled counts toward the IT / Non-IT / grand columns, never toward Male/Female:

```tsx
                  <td className="border px-3 py-2 text-center">{calcTotal(hc, undefined, "it", "male")}</td>
                  <td className="border px-3 py-2 text-center">{calcTotal(hc, undefined, "it", "female")}</td>
                  <td className="border px-3 py-2 text-center bg-muted/40">{calcTotal(hc, undefined, "it") + hc.plantillaUnfilled.it}</td>
                  <td className="border px-3 py-2 text-center">{calcTotal(hc, undefined, "nonIt", "male")}</td>
                  <td className="border px-3 py-2 text-center">{calcTotal(hc, undefined, "nonIt", "female")}</td>
                  <td className="border px-3 py-2 text-center bg-muted/40">{calcTotal(hc, undefined, "nonIt") + hc.plantillaUnfilled.nonIt}</td>
                  <td className="border px-3 py-2 text-center bg-primary/10 text-primary">{calcTotal(hc) + hc.plantillaUnfilled.it + hc.plantillaUnfilled.nonIt}</td>
```

- [ ] **Step 2: PDF — relabel + unfilled row + grand totals**

`src/lib/pdf/render-issp-html.ts`:

(a) Part1 input type (~line 32) — add the optional field (docs posted directly to the API may not be migrated):

```ts
  humanCapital: {
    plantilla: { it: { male: number; female: number }; nonIt: { male: number; female: number } };
    contractual: { it: { male: number; female: number }; nonIt: { male: number; female: number } };
    outsourced: { it: { male: number; female: number }; nonIt: { male: number; female: number } };
    plantillaUnfilled?: { it: number; nonIt: number };
  };
```

(b) In the human-capital block, relabel and extend:

```ts
  const unfilled = hc.plantillaUnfilled ?? { it: 0, nonIt: 0 };
```

Change `${hcRow("Plantilla", "plantilla")}` → `${hcRow("Plantilla (Filled)", "plantilla")}` and add after it:

```ts
        <tr class="avoid-break">
          <td style="font-weight:bold;text-align:center;">Plantilla (Unfilled)</td>
          <td style="text-align:center;">${unfilled.it}</td>
          <td style="text-align:center;">${unfilled.nonIt}</td>
          <td style="text-align:center;">N/A</td>
          <td style="text-align:center;">N/A</td>
        </tr>
```

Grand totals (template: "Total Physical Count" includes unfilled posts; sex totals exclude them):

```ts
  const itGrand = ["plantilla","contractual","outsourced"].reduce((s, k) => {
    const r = hc[k as keyof typeof hc]; return s + (r.it.male||0) + (r.it.female||0);
  }, 0) + unfilled.it;
  const nonItGrand = ["plantilla","contractual","outsourced"].reduce((s, k) => {
    const r = hc[k as keyof typeof hc]; return s + (r.nonIt.male||0) + (r.nonIt.female||0);
  }, 0) + unfilled.nonIt;
```

(`maleGrand` / `femaleGrand` unchanged.) The export adapter passes `humanCapital` through unchanged (`api/export/route.ts:225`) — no adapter edit needed.

- [ ] **Step 3: Gates + commit**

```bash
npx tsc --noEmit && npm run lint && npx tsx scripts/verify-v13.ts
git add src/components/issp-editor/part1/part1-b-form.tsx src/lib/pdf/render-issp-html.ts
git commit -m "feat(part1b): Plantilla (Filled)/(Unfilled) rows per 09152026 template

Form gains the unfilled row (IT/Non-IT counts only — the template prints
N/A for sex) and unfilled posts join the IT/Non-IT/grand totals, never the
sex totals. PDF relabels the filled row and renders the unfilled row with
N/A cells.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Browser/PDF verification happens in Task 6 (one smoke pass covers Tasks 1–5).

---

### Task 4: Part III-F — `targetedResult` end-to-end (form, adapter, PDF)

**Files:**
- Modify: `src/components/issp-editor/part3/part3-f-form.tsx` (local KpiRow ~34-44, DEFAULT_ROW ~46-56, drawer ~139-152, read table ~321-325, mobile card ~360-368)
- Modify: `src/app/api/export/route.ts` (`mapKpiRow` ~114-122)
- Modify: `src/lib/pdf/render-issp-html.ts` (PDF KpiRow type ~134-141, both PMF row renderers ~1235 / ~1268)
- Consumes: store `KpiRow.targetedResult` (Task 2)

**Interfaces:**
- Produces: drawer field bound to `draft.targetedResult`; adapter emits `targetedResult: string`; PDF column 1 = bold level + normal-weight statement beneath.

- [ ] **Step 1: Form — type, default, drawer field, read views**

In `part3-f-form.tsx`:

(a) local `interface KpiRow` — add `targetedResult: string;` after `hierarchy`. (b) `DEFAULT_ROW` — add `targetedResult: "",`. (c) In the drawer, after the Hierarchy `Select` block (`</Select></div>`), add:

```tsx
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Targeted Result</Label>
            <Textarea
              rows={2}
              placeholder="e.g., Streamlined and efficient near-real-time monitoring of land acquisition activities"
              value={draft.targetedResult}
              onChange={(e) => set("targetedResult", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Write the specific result for the selected level: Intermediate Outcome — a change
              in the behavior of target stakeholders; Immediate Outcome — an enhancement of the
              agency&apos;s institutional capability; Output — a completed deliverable of the project.
            </p>
          </div>
```

(d) Desktop read table hierarchy cell becomes:

```tsx
                        <td className="border px-2 py-2 break-words">
                          {row.hierarchy ? <span className="font-medium">{row.hierarchy}</span> : <Empty />}
                          {row.targetedResult && (
                            <p className="mt-0.5 text-muted-foreground break-words">{row.targetedResult}</p>
                          )}
                        </td>
```

(e) Mobile read card — after the `KPI #{idx + 1}…` header row div, add:

```tsx
                    {row.targetedResult && (
                      <p className="text-xs break-words">{row.targetedResult}</p>
                    )}
```

- [ ] **Step 2: Export adapter + PDF renderer**

`src/app/api/export/route.ts` `mapKpiRow` — add as the second field:

```ts
    hierarchy: row.hierarchy,
    targetedResult: row.targetedResult ?? "",
```

`src/lib/pdf/render-issp-html.ts`:

(a) PDF `interface KpiRow` (~line 134) — add `targetedResult?: string;` after `hierarchy`.

(b) Both PMF row renderers (F.1 ~line 1235 and F.2 ~line 1268) — replace the hierarchy cell:

```ts
              <td style="font-weight:bold;">${esc(row.hierarchy)}${row.targetedResult ? `<br><span style="font-weight:normal;">${esc(row.targetedResult)}</span>` : ""}</td>
```

(Same indentation-continuation style as the II-A "Program n:" lines.)

- [ ] **Step 3: Gates + commit**

```bash
npx tsc --noEmit && npm run lint && npx tsx scripts/verify-v13.ts
git add src/components/issp-editor/part3/part3-f-form.tsx src/app/api/export/route.ts src/lib/pdf/render-issp-html.ts
git commit -m "feat(part3f): targeted-result statement per KPI row

Agency Guidelines (Performance Measurement Framework) require the specific
written result under each hierarchy level, not just the level name. Drawer
gains the field with the three level definitions as guidance; the read
table, mobile cards, and the PDF 'Hierarchy of Targeted Results' column
render the statement beneath the level.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Demo v13 + schema skills + docs

**Files:**
- Modify: `scripts/build-demo.js` (header comment, `humanCapital` ~195, all 11 KPI rows ~901-1029, `schemaVersion`)
- Output (regenerated, never hand-edited): `public/demo/ncwtr-issp-2026-2028.issp`
- Modify (local-only skill files, NOT in git): `.claude/skills/docx-to-issp/SKILL.md`, `.claude/skills/docx-to-issp/scripts/validate_issp.mjs`, `.claude/skills/schema-change/SKILL.md`
- Modify: `CONTEXT.md` (if it lists schema fields), `docs/project-status.md`

- [ ] **Step 1: Demo data — unfilled counts**

In `scripts/build-demo.js` `humanCapital` (after the `plantilla` object):

```json
      "plantillaUnfilled": {
        "it": 4,
        "nonIt": 12
      },
```

Update the header comment: add a `2026-09-17: realigned to schema 13 (plantillaUnfilled + KPI targetedResult).` line next to the existing 2026-09-15 line, and make sure the emitted `schemaVersion` is 13 (it should come from a constant — if the script hardcodes 12, change it).

- [ ] **Step 2: Demo data — targetedResult for all 11 KPI rows**

Add `"targetedResult": "…"` as the second key of every row in `performanceFramework`, following the guide's semantics (Intermediate = stakeholder behavior change, Immediate = agency capability, Output = completed deliverable):

- `proj-sikap` (4 rows):
  - Intermediate: `"Monitored agencies submit queue data through the UQMP API instead of email/Excel"`
  - Immediate: `"Near-real-time consolidated queue monitoring capability for the agency"`
  - Output (CFCP row): `"CFCP online citizen-complaint submission module deployed"`
  - Output (XP row): `"Legacy Windows XP NQMS workstations retired"`
- `proj-bilis` (3 rows):
  - Intermediate: `"Regional offices rely on dedicated fiber links for daily UQMP operations"`
  - Immediate: `"Agency-wide broadband capability at 100 Mbps for all offices"`
  - Output: `"Regional offices connected at 100 Mbps or better"`
- `proj-handa` (3 rows):
  - Intermediate: `"HR staff maintain records directly in iHRPS instead of Excel workbooks"`
  - Immediate: `"Consolidated, verifiable HR information capability via iHRPS"`
  - Output: `"iHRPS deployed with active usage across regional offices"`

- [ ] **Step 3: Regenerate + validate**

```bash
node scripts/build-demo.js
node .claude/skills/docx-to-issp/scripts/validate_issp.mjs public/demo/ncwtr-issp-2026-2028.issp
```

Expected: validator PASS (its known-baseline warnings only). Spot-check: `grep -c targetedResult public/demo/ncwtr-issp-2026-2028.issp` → 11; `grep plantillaUnfilled` → present; `grep '"schemaVersion": 13'` → present.

- [ ] **Step 4: Skill sync (local-only files)**

- `docx-to-issp/SKILL.md`: add to the field map — I-B Human Capital now has a `Plantilla (Unfilled)` row mapping to `humanCapital.plantillaUnfilled {it, nonIt}` (docx importer must read the unfilled row's IT/Non-IT cells and skip its N/A sex cells); III-F column 1 maps level → `hierarchy` AND the statement line under it → `targetedResult`.
- `validate_issp.mjs`: add a warning (not an error) when a KPI row has a hierarchy but empty `targetedResult`, and when `humanCapital.plantillaUnfilled` is absent.
- `schema-change/SKILL.md`: append the v13 row to the migration-history table.

- [ ] **Step 5: Docs + commit**

Update `docs/project-status.md` (new dated entry) and `CONTEXT.md` (if it enumerates Part I-B/III-F fields) with one line each about v13. Then:

```bash
git add scripts/build-demo.js public/demo/ncwtr-issp-2026-2028.issp docs/project-status.md CONTEXT.md
git commit -m "chore(demo): regenerate demo at schema v13 with unfilled posts + targeted results

Co-Authored-By: Claude <noreply@anthropic.com>"
```

(`.claude/skills/` files are local-only — they are not committed.)

---

### Task 6: End-to-end verification (no `npm run build`)

**Files:** none modified (verification only; fix-and-amend if anything fails).

- [ ] **Step 1: Static gates**

```bash
npx tsc --noEmit && npm run lint && npx tsx scripts/verify-v13.ts && npx tsx scripts/verify-ii-a-schema.ts
```

Expected: all clean; lint at its pre-existing warning count.

- [ ] **Step 2: Dev server**

`ss -tlnp | grep :3000` — if absent, start it detached from the repo root and wait for 200 on `localhost:3000` (first curl may return 000 during cold compile — retry, don't conclude it's down).

- [ ] **Step 3: Browser smoke (Puppeteer, localhost:3000, neutralized randomUUID, networkidle2, fresh page per phase)**

1. Load the demo doc (IDB injection pattern from the verifier-web skill). `/editor/part1/b`: the grid shows **Plantilla (Filled)**, **Plantilla (Unfilled)** (two inputs, two `N/A` cells), and totals include unfilled (demo: 4 IT + 12 Non-IT).
2. `/editor/part2/b` and `/editor/part3/a`: Other Measures badge reads **6/6 mandatory** items listed under MANDATORY; overall mandatory count is 28.
3. `/editor/part3/f`: read tables show the statement under each hierarchy level; open the drawer — "Targeted Result" textarea present; edit + save persists after reload.
4. Legacy v12 fixture: synthesize from the demo (`schemaVersion: 12`, strip `plantillaUnfilled` + all `targetedResult`) → load through the UI → no errors; read back IDB: `schemaVersion === 13`, backfills present (same asserts as verify-v13 but through the real loader).

- [ ] **Step 4: PDF smoke**

`POST localhost:3000/api/export` with the demo doc → valid PDF; extracted text contains `Plantilla (Filled)`, `Plantilla (Unfilled)`, `N/A`, `Monitored agencies submit queue data through the UQMP API`, and the Other Measures page shows the 6 mandatory controls in the left column (visual check via `pdftoppm` screenshot if text order is ambiguous).

- [ ] **Step 5: Report**

Report results to Carlos with the verification evidence. **Do NOT deploy** — `npm run build` + `pm2 restart issp` only after he approves.

---

## Self-Review (done at plan time)

- Spec coverage: template diff change #1 → Tasks 2+3; performance-framework guide → Tasks 2+4; cyber flags + `6d6b259` revert + guidelines md → Task 1; demo/skills/docs layers from the schema-change skill → Task 5; verification incl. legacy fixture + PDF → Task 6. Template changes #2 (II-C interop checkboxes — already correct) and #3 (I-C INCOMING/OUTGOING — already rendered) need no tasks by design.
- Placeholder scan: every step carries exact code/commands; demo texts are written out.
- Type consistency: `plantillaUnfilled: { it: number; nonIt: number }` and `targetedResult: string` are used identically in Tasks 2–5; PDF-side types make them optional with `??` fallbacks because the API can receive unmigrated docs.
