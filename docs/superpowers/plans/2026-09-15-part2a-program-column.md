# Part II-A Program Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the DICT 2026 template's Part II-A table — column 1 shows the OO/SO/MFO name plus an indented `Program n:` line — in both the editor and the PDF export.

**Architecture:** Programs become addressable objects (`{id, name}`) inside `OrgOutcome`; `StrategicConcern` gains `programIds`. The editor gets a Programs picker on each concern card; the export route resolves ids to names at render time (principle 8 — ids stored, names derived, no drift). Schema v11 → v12 with migration + idempotent normalization for legacy string arrays.

**Tech Stack:** Next.js 16 App Router, TypeScript, existing `Select multiple` component, Puppeteer for smokes.

**Reference:** `work/csc-issp-2028-2030/Screenshot 2026-09-15 at 5.59.15 PM.png` (untracked, present in the working tree — copy to `/tmp/part2a-reference.png` if tooling chokes on the filename). Verified current output: `/tmp/csc-page-06.png` comparison run 2026-09-15.

## Global Constraints

- **NEVER run `npm run build` during this work.** Dev gate = `npx tsc --noEmit` + `npm run lint`. Build is deploy-only (see `docs/production-safety.md`).
- Puppeteer smokes hit `http://localhost:3000` (localhost, never the public IP). Check `ss -tlnp | grep :3000` first — the dev server is long-lived. Chrome: `/root/.cache/puppeteer/chrome/linux-148.0.7778.167/chrome-linux64/chrome`.
- Browser code must use `@/lib/uuid`'s `uuid()`, never `crypto.randomUUID()` (dev is a non-secure context).
- One commit per task; stage only the files the task lists (the tree carries unrelated dirty files: `.gitignore`, `next-env.d.ts`, `work/`).
- Commit messages end with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Numbering rule for the PDF's `Program n:` — `n` is the program's 1-based position in its outcome's full program list (same order Part I-A.4 prints), not the position within the filtered selection. A concern referencing only the 3rd program prints `Program 3:`.

---

### Task 1: Schema — program objects + programIds + migration

**Files:**
- Modify: `src/lib/store/types.ts:31-35` (OrgOutcome), `src/lib/store/types.ts:89-95` (StrategicConcern)
- Modify: `src/lib/migration-review.ts:1` (CURRENT_SCHEMA_VERSION)
- Modify: `src/lib/store/index.tsx` (migrateLegacyDoc: new v11→v12 gate + extend idempotent block; export `migrateLegacyDoc`)
- Create: `scripts/verify-ii-a-schema.ts` (run with `npx tsx`)

**Interfaces:**
- Produces: `export interface Program { id: string; name: string }`; `OrgOutcome.programs: Program[]`; `StrategicConcern.programIds: string[]`; `CURRENT_SCHEMA_VERSION = 12`; exported `migrateLegacyDoc(doc: IsspDocument): IsspDocument`.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-ii-a-schema.ts`:

```ts
// Verify v11→v12 migration: programs string[] → {id,name}[], concern programIds backfill.
// Run: npx tsx scripts/verify-ii-a-schema.ts   (expect: ALL CHECKS PASSED)
import assert from "node:assert";
import { migrateLegacyDoc } from "../src/lib/store/index";
import { CURRENT_SCHEMA_VERSION } from "../src/lib/migration-review";
import type { IsspDocument } from "../src/lib/store/types";

assert.equal(CURRENT_SCHEMA_VERSION, 12, "schema version must be 12");

// Synthetic v11 doc: programs are plain strings; concerns lack programIds.
const legacy = {
  schemaVersion: 11,
  part1: {
    orgOutcomes: [
      { id: "oo-1", name: "Outcome One", programs: ["Alpha Program", "Beta Program"] },
      { id: "oo-2", name: "Outcome Two", programs: [] },
    ],
  },
  part2: {
    strategicConcerns: [
      { id: "sc-1", outcomeIds: ["oo-1"], criticalSystem: "x", concern: "y", desiredStrategy: "z" },
    ],
  },
} as unknown as IsspDocument;

const migrated = migrateLegacyDoc(legacy);

// programs became objects with deterministic, stable ids
assert.equal(migrated.part1.orgOutcomes[0].programs[0].id, "oo-1-pg-1");
assert.equal(migrated.part1.orgOutcomes[0].programs[0].name, "Alpha Program");
assert.equal(migrated.part1.orgOutcomes[0].programs[1].name, "Beta Program");
// concerns gained programIds
assert.deepEqual(migrated.part2.strategicConcerns[0].programIds, []);
assert.equal(migrated.schemaVersion, 12);

// Idempotent: migrating again changes nothing
const again = migrateLegacyDoc(migrated);
assert.deepEqual(again, migrated, "migration must be idempotent");

console.log("ALL CHECKS PASSED");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/verify-ii-a-schema.ts`
Expected: FAIL — `CURRENT_SCHEMA_VERSION` is 11 (or `migrateLegacyDoc` not exported → module error). Either failure is the red state.

- [ ] **Step 3: Update `src/lib/store/types.ts`**

Above `OrgOutcome` (line ~31), add:

```ts
/** A program under an Organizational Outcome (Part I-A.4). Id-addressed so
 *  Part II-A concerns can reference it and renames propagate (principle 8). */
export interface Program {
  id: string;
  name: string;
}
```

Change `OrgOutcome.programs: string[]` → `programs: Program[]`.

Change `StrategicConcern` to:

```ts
export interface StrategicConcern {
  id: string;
  outcomeIds: string[];
  /** Program ids (OrgOutcome.programs[].id) this concern pertains to. */
  programIds: string[];
  criticalSystem: string;
  concern: string;
  desiredStrategy: string;
}
```

- [ ] **Step 4: Bump version in `src/lib/migration-review.ts`**

```ts
export const CURRENT_SCHEMA_VERSION = 12;
```

- [ ] **Step 5: Gate + normalize in `src/lib/store/index.tsx` `migrateLegacyDoc`**

(a) After the existing `v10 → v11` gate block, add:

```ts
  // v11 → v12: programs become {id, name} objects; strategicConcerns gain programIds.
  if ((base.schemaVersion ?? 1) < 12) {
    base = { ...base, schemaVersion: 12 };
  }
```

(b) In the idempotent `normalized` block, inside `part1`, add after the stakeholders mapping (inside the `part1: { ...base.part1,` object):

```ts
      // Programs: legacy string form → {id, name} with deterministic ids
      // (mirrors part1-a-form's mount normalization — snapshot-sync rule).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orgOutcomes: base.part1.orgOutcomes.map((o: any) => ({
        ...o,
        programs: (o.programs ?? []).map((pg: any, i: number) =>
          typeof pg === "string" ? { id: `${o.id}-pg-${i + 1}`, name: pg } : pg
        ),
      })),
```

(c) In the same `normalized` block, inside `part2.strategicConcerns.map`, add to the spread result:

```ts
        programIds: Array.isArray(c.programIds) ? c.programIds : [],
```

(d) Export the function — change `function migrateLegacyDoc(` to `export function migrateLegacyDoc(`.

- [ ] **Step 6: Run the verification script**

Run: `npx tsx scripts/verify-ii-a-schema.ts`
Expected: `ALL CHECKS PASSED`

- [ ] **Step 7: Type gate**

Run: `npx tsc --noEmit`
Expected: errors in `part1-a-form.tsx`, `part2-a-form.tsx`, `route.ts`, `render-issp-html.ts`, `build-demo.js` consumers — **expected at this point**; Tasks 2–5 fix them. If the ONLY errors are in those files, proceed; commit is still safe because the app does not compile until Task 4 — if you prefer green-tree commits, fold Tasks 1–4 commits into one at Task 4. Do NOT run `npm run build`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/store/types.ts src/lib/migration-review.ts src/lib/store/index.tsx scripts/verify-ii-a-schema.ts
git commit -m "feat(schema): programs become {id,name}; concerns gain programIds (v12)"
```

---

### Task 2: Part I-A form — program rows keyed by id

**Files:**
- Modify: `src/components/issp-editor/part1/part1-a-form.tsx` (interface line ~24, addProgram/updateProgram/removeProgram ~143-166, form init normalization, program row JSX)

**Interfaces:**
- Consumes: `Program` from Task 1.
- Produces: form writes `orgOutcomes[].programs` as `Program[]`; new programs get `uuid()` ids.

- [ ] **Step 1: Update the local interface + import**

Add `import { uuid } from "@/lib/uuid";` and change the local `OrgOutcome` interface's `programs: string[]` → `programs: { id: string; name: string }[]` (or import `Program` from `@/lib/store/types` and use `programs: Program[]`).

- [ ] **Step 2: Normalize on mount (find the `useState` initializer for the form data)**

Wherever `initialData` initializes (mirror the existing pattern; if the form receives the whole part object directly, add normalization where `orgOutcomes` first enters state):

```ts
orgOutcomes: (initialData.orgOutcomes ?? []).map((o) => ({
  ...o,
  programs: (o.programs ?? []).map((pg, i) =>
    typeof pg === "string" ? { id: `${o.id}-pg-${i + 1}`, name: pg } : pg
  ),
})),
```

(Same deterministic ids as `migrateLegacyDoc` — the snapshot-sync rule.)

- [ ] **Step 3: Rewrite the three program handlers**

```ts
function addProgram(ooId: string) {
  const oo = data.orgOutcomes.find((o) => o.id === ooId);
  if (!oo) return;
  updateOutcome(ooId, "programs", [...oo.programs, { id: uuid(), name: "" }]);
}

function updateProgram(ooId: string, programId: string, value: string) {
  const oo = data.orgOutcomes.find((o) => o.id === ooId);
  if (!oo) return;
  updateOutcome(
    ooId,
    "programs",
    oo.programs.map((p) => (p.id === programId ? { ...p, name: value } : p))
  );
}

function removeProgram(ooId: string, programId: string) {
  const oo = data.orgOutcomes.find((o) => o.id === ooId);
  if (!oo) return;
  updateOutcome(
    ooId,
    "programs",
    oo.programs.filter((p) => p.id !== programId)
  );
}
```

- [ ] **Step 4: Update the program-row JSX**

Find where programs render (inputs bound to `updateProgram(oo.id, idx, value)`). Change bindings from index to id:

```tsx
<input
  type="text"
  value={p.name}
  placeholder="Program name…"
  onChange={(e) => updateProgram(oo.id, p.id, e.target.value)}
/>
```

and the remove button to `removeProgram(oo.id, p.id)`. Keep the exact existing wrapper/classes — only the value/binding changes. `addProgram`'s initial row `{ id: generateId(), name: "", programs: [""] }` (line ~122) becomes `programs: []`.

- [ ] **Step 5: Type gate + smoke**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean for this file (part2-a/route/renderer errors may remain until Tasks 3–4).
Smoke on :3000: load demo → `/editor/part1/a` → expand an outcome → add a program, type a name, reload the page → name persists.

- [ ] **Step 6: Commit**

```bash
git add src/components/issp-editor/part1/part1-a-form.tsx
git commit -m "feat(part1a): program rows are id-addressed objects"
```

---

### Task 3: Part II-A form — Programs picker on each concern card

**Files:**
- Modify: `src/components/issp-editor/part2/part2-a-form.tsx` (interface ~28-35, init ~54-61, card body ~176-198)

**Interfaces:**
- Consumes: `orgOutcomes` now carry `programs: Program[]` (Task 2 shape).
- Produces: `StrategicConcern.programIds: string[]` written via `debouncedSave`.

- [ ] **Step 1: Update the local interface + init**

In the local `StrategicConcern` interface add `programIds: string[];` and change `OrgOutcome.programs: string[]` → `programs: { id: string; name: string }[]`.

In the `useState` initializer add to the mapped object:

```ts
programIds: Array.isArray(c.programIds) ? c.programIds : [],
```

- [ ] **Step 2: Derive program options from the linked outcomes**

In the card body (inside the `concerns.map((concern, idx) =>` scope, above the JSX), compute for the current concern:

```tsx
const selectedOutcomeIds = concern.outcomeIds.filter((id) => id !== "general");
const programOptions = orgOutcomes
  .filter((oo) => selectedOutcomeIds.includes(oo.id))
  .flatMap((oo) =>
    oo.programs.map((p) => ({
      value: p.id,
      label: selectedOutcomeIds.length > 1 ? `${oo.name} — ${p.name}` : p.name,
    }))
  );
```

- [ ] **Step 3: Add the picker under the Linked Organizational Outcome select**

Insert directly after the outcome `Select` block (same `space-y-1.5 md:col-span-3` wrapper):

```tsx
<div className="space-y-1.5 md:col-span-3">
  <Label className="text-sm font-medium">Programs (optional)</Label>
  {programOptions.length === 0 ? (
    <p className="text-xs text-muted-foreground">
      Programs come from the linked OO/SO/MFO — define them in{" "}
      <Link href="/editor/part1/a" className="text-primary hover:underline">
        Part I-A.4
      </Link>
      . Appears in the PDF as “Program n: …” under the OO/SO/MFO.
    </p>
  ) : (
    <Select
      multiple
      items={programOptions}
      value={concern.programIds}
      onValueChange={(v: string[] | null) =>
        updateConcern(concern.id, "programIds", v || [])
      }
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select programs…" />
      </SelectTrigger>
      <SelectContent>
        {programOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )}
</div>
```

- [ ] **Step 4: Type gate + smoke**

Run: `npx tsc --noEmit && npm run lint`
Smoke: `/editor/part2/a` → open a concern linked to an outcome with programs → picker lists them → select two → reload → still selected. Link “General / Agency-Wide” → picker shows the hint instead.

- [ ] **Step 5: Commit**

```bash
git add src/components/issp-editor/part2/part2-a-form.tsx
git commit -m "feat(part2a): concern cards link programs (programIds)"
```

---

### Task 4: PDF export — Program line, caps, widths

**Files:**
- Modify: `src/app/api/export/route.ts` (mapStrategicConcerns ~23-46, toRenderData ~149-204)
- Modify: `src/lib/pdf/render-issp-html.ts` (local interfaces ~20, ~78; II-A table ~1001-1021; I-A.4 programs ~645-648)

**Interfaces:**
- Consumes: Task 1 shapes.
- Produces: column-1 cell text `<OO name>\n    Program n: <program name>`; ALL-CAPS headers 2–4; widths 25/27/23/23.

- [ ] **Step 1: Rewrite `mapStrategicConcerns` in route.ts**

```ts
const NBSP = "    ";

function mapStrategicConcerns(
  concerns: IsspDocument["part2"]["strategicConcerns"],
  outcomeMap: Record<string, string>,
  programsByOutcome: Record<string, { id: string; name: string }[]>
): IsspData["part2"]["strategicConcerns"] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return concerns.map((sc: any) => {
    const ids = Array.isArray(sc.outcomeIds) && sc.outcomeIds.length > 0
      ? sc.outcomeIds
      : (sc.outcomeId ? [sc.outcomeId] : []);

    const blocks = ids.map((id: string) => {
      const name = outcomeMap[id] ?? id;
      const progs = programsByOutcome[id] ?? [];
      // Numbering = position in the outcome's FULL program list (matches Part I-A.4)
      const lines = progs
        .map((p, i) => ({ p, n: i + 1 }))
        .filter(({ p }) => (sc.programIds ?? []).includes(p.id))
        .map(({ p, n }) => `${NBSP}Program ${n}: ${p.name}`);
      return [name, ...lines].join("\n");
    });

    const ooSoMfoText = blocks.length > 1
      ? blocks.map((b) => `• ${b}`).join("\n")
      : (blocks[0] || "");

    return {
      ooSoMfo: ooSoMfoText,
      criticalSystem: sc.criticalSystem || "",
      problem: sc.concern,
      intendedIctUse: sc.desiredStrategy,
    };
  });
}
```

- [ ] **Step 2: Feed it in `toRenderData`**

Next to `outcomeMap` (~line 152) add:

```ts
const programsByOutcome = Object.fromEntries(
  part1.orgOutcomes.map((o) => [o.id, o.programs])
);
```

Change the call (~line 204) to pass it, and the part1 mapping line to pass programs through unchanged (they are already objects):

```ts
orgOutcomes: part1.orgOutcomes.map((o) => ({ name: o.name, programs: o.programs })),
strategicConcerns: mapStrategicConcerns(part2.strategicConcerns, outcomeMap, programsByOutcome),
```

- [ ] **Step 3: Renderer local interfaces**

`render-issp-html.ts` line ~20:

```ts
orgOutcomes: { id: string; name: string; programs: { id: string; name: string }[] }[];
```

Line ~78 (`StrategicConcern` local) is unchanged — still `{ ooSoMfo, criticalSystem, problem, intendedIctUse }` strings.

- [ ] **Step 4: II-A table headers + widths (~line 1001-1008)**

```ts
<tr>
  <th style="width:25%">OO/SO/MFO</th>
  <th style="width:27%">CRITICAL MANAGEMENT, OPERATING, OR BUSINESS SYSTEM</th>
  <th style="width:23%">PROBLEM</th>
  <th style="width:23%">INTENDED USE OF ICT</th>
</tr>
```

(The `th` CSS already renders headers bold; if headers currently render mixed-case elsewhere via CSS `text-transform`, none exists — the literal strings above are the fix.)

- [ ] **Step 5: I-A.4 program list (~line 648)**

```ts
${oo.programs?.length ? `<ul class="template-list">${oo.programs.map(pg => `<li>${esc(pg.name)}</li>`).join("")}</ul>` : ""}
```

- [ ] **Step 6: Type gate + PDF smoke**

Run: `npx tsc --noEmit && npm run lint` — expect fully clean now.

Smoke (uses the dev server's export API; build a fixture with programs + a concern referencing the 2nd program):

```bash
node -e '
const fs = require("fs");
const doc = JSON.parse(fs.readFileSync("public/demo/ncwtr-issp-2026-2028.issp", "utf8"));
const oo = doc.part1.orgOutcomes[0];
oo.programs = oo.programs.map((p, i) => typeof p === "string" ? { id: `${oo.id}-pg-${i+1}`, name: p } : p);
doc.part2.strategicConcerns[0].programIds = [`${oo.id}-pg-2`];
doc.schemaVersion = 12;
fs.writeFileSync("/tmp/v12-fixture.issp", JSON.stringify(doc));'
curl -sS -N -X POST http://localhost:3000/api/export -H "Content-Type: application/json" \
  --data @/tmp/v12-fixture.issp --max-time 240 -o /tmp/v12-export.txt
node -e '
const lines = require("fs").readFileSync("/tmp/v12-export.txt","utf8").split("\n");
const dl = lines.find(l => l.startsWith("data:") && l.includes("JVBERi0"));
require("fs").writeFileSync("/tmp/v12.pdf", Buffer.from(dl.slice(5).trim(), "base64"));'
pdftotext /tmp/v12.pdf - | grep -n "Program 2:\|INTENDED USE OF ICT\|PROBLEM\|CRITICAL MANAGEMENT"
```

Expected: `Program 2: <second program name>` present; the three headers appear ALL-CAPS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/export/route.ts src/lib/pdf/render-issp-html.ts
git commit -m "feat(pdf): II-A column 1 shows Program lines; template caps + widths"
```

---

### Task 5: Demo generator + docx-to-issp skill

**Files:**
- Modify: `scripts/build-demo.js` (orgOutcomes ~147+, strategicConcerns ~361+)
- Regenerate: `public/demo/ncwtr-issp-2026-2028.issp`
- Modify: `.claude/skills/docx-to-issp/SKILL.md:181` (mapping row) and the II-A row of its DICT-section→JSON map
- Modify: `.claude/skills/docx-to-issp/scripts/validate_issp.mjs` (add programs shape check)

- [ ] **Step 1: Generator — programs as objects**

Every `"programs": ["A", "B"]` array becomes:

```js
"programs": [
  { "id": "oo-1-pg-1", "name": "Real-time Queue Monitoring Program" },
  { "id": "oo-1-pg-2", "name": "Citizen Satisfaction Measurement Initiative" },
  { "id": "oo-1-pg-3", "name": "Rapid Response Intervention for High-Wait Offices" }
],
```

(id convention `${outcomeId}-pg-${n}` — matches the migration's deterministic ids. Copy each program's existing string exactly as the `name`; only wrap it.)

- [ ] **Step 2: Generator — concerns get programIds**

Each demo concern gains `"programIds": ["oo-1-pg-2"]`-style keys referencing its outcome's programs (pick semantically sensible programs; at least one concern should reference a program so the demo shows the feature).

Also bump the generator's embedded `"schemaVersion": 11` → `12` (it writes `CURRENT_SCHEMA_VERSION` — if it imports it, no change needed).

- [ ] **Step 3: Regenerate + validate**

```bash
node scripts/build-demo.js
node -e "JSON.parse(require('fs').readFileSync('public/demo/ncwtr-issp-2026-2028.issp','utf8')); console.log('valid JSON')"
node .claude/skills/docx-to-issp/scripts/validate_issp.mjs public/demo/ncwtr-issp-2026-2028.issp
```

Expected: valid JSON; validator PASS. If the validator rejects the new shape, update it (Step 4) — do not weaken existing checks.

- [ ] **Step 4: Validator shape check**

In `validate_issp.mjs`, where `part1.orgOutcomes` is validated, add:

```js
for (const oo of doc.part1.orgOutcomes) {
  assert(Array.isArray(oo.programs), `programs must be an array (oo ${oo.id})`);
  for (const pg of oo.programs) {
    assert(pg && typeof pg.id === "string" && typeof pg.name === "string",
      `program must be {id, name} (oo ${oo.id})`);
  }
}
```

(match the file's actual assert style — adjust to its conventions).

- [ ] **Step 5: Skill doc**

`SKILL.md` line 181 mapping row: `programs:string[]` → `programs:{id,name}[]`, and add a row: `| II-A Program link | part2.strategicConcerns[].programIds | program ids from the linked orgOutcome |`.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-demo.js public/demo/ncwtr-issp-2026-2028.issp .claude/skills/docx-to-issp/SKILL.md .claude/skills/docx-to-issp/scripts/validate_issp.mjs
git commit -m "chore(demo+skill): programs as objects; concerns carry programIds (v12)"
```

---

### Task 6: End-to-end verification + docs

**Files:**
- Modify: `docs/project-status.md` (Implemented Features row)
- Memory: `~/.claude/projects/-root-apps-issp/memory/issp-schema.md` (schema map), `project_status.md` (running log)

- [ ] **Step 1: Legacy-file migration smoke (old string programs)**

```bash
node -e '
const fs = require("fs");
const doc = JSON.parse(fs.readFileSync("/tmp/v12-fixture.issp", "utf8"));
// force legacy shape: string programs, no programIds
doc.schemaVersion = 11;
doc.part1.orgOutcomes.forEach(o => { o.programs = o.programs.map(p => p.name); });
doc.part2.strategicConcerns.forEach(c => { delete c.programIds; });
fs.writeFileSync("/tmp/legacy-v11.issp", JSON.stringify(doc));'
```

Puppeteer on :3000: home → upload `/tmp/legacy-v11.issp` → navigates to `/editor` → `/editor/part2/a` shows concerns with the program picker populated (proving migration ran) → `/editor/part1/a` shows program names intact.

- [ ] **Step 2: Reference comparison**

Export the demo doc via the API (Task 4 pattern), `pdftoppm` the Part II-A page, and compare against `/tmp/part2a-reference.png` (the mcp ui_diff_check or visual read). Acceptance: column 1 shows `Program n:` indented under the OO name; headers ALL-CAPS; widths ≈25/27/23/23.

- [ ] **Step 3: Full gate**

```bash
npx tsc --noEmit && npm run lint
npx tsx scripts/verify-ii-a-schema.ts
npx tsx scripts/verify-scope-paths.ts
```

All green.

- [ ] **Step 4: Docs + memory**

- `docs/project-status.md`: add an Implemented Features row — "Part II-A program column | Done, 2026-09-15 | Concerns link programs (programIds); PDF column 1 renders OO/SO/MFO + Program n:; programs are {id,name} (schema v12)."
- Memory `issp-schema.md`: v12 entry (programs objects, programIds, deterministic migration ids `${oo.id}-pg-${n}`).
- Memory `project_status.md`: dated entry.

- [ ] **Step 5: Commit**

```bash
git add docs/project-status.md
git commit -m "docs: Part II-A program column shipped (schema v12)"
```

---

## Deferred / out of scope

- **CSC data branch** (`data/csc-issp-2028-2030`): its `.issp` and rebuild script use string programs — they auto-migrate on load after this ships; regenerate there separately.
- Scoped-distribution granularity is untouched (`part1/a.orgOutcomes` and `part2/a.strategicConcerns` remain the field paths; `section-fields.ts` needs no new keys).
- `deriveMetaFromContent` needs no change (programIds does not signal section completion).
- Merging concerns into one row per OO with rowspan — rejected for now (one row per concern, per review 2026-09-15).

## Self-review notes

- Spec coverage: Program in editor (Tasks 2–3), Program in PDF col 1 (Task 4), caps + widths (Task 4), ids-not-names (Task 1 schema), old files open (Task 1 migration + Task 6 smoke), demo/skill stay truthful (Task 5). ✓
- Known type ripple is sequenced: Task 1 intentionally leaves tsc red in forms/route until Tasks 2–4 — the plan says so explicitly at Task 1 Step 7.
- Naming consistent: `Program`, `programIds`, `programsByOutcome`, `${oo.id}-pg-${n}` everywhere.
