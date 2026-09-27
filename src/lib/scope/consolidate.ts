import type { IsspDocument } from "@/lib/store/types";
import { resolveScope, SHARED_TABLE_PATHS, PROJECT_BEARING_FIELDS } from "@/lib/scope/paths";
import { SECTION_FIELDS } from "@/lib/section-fields";

/**
 * Resolution value meaning "this row is not in the result" — an office's
 * deletion in a row conflict, or "keep master" for a row the master never had.
 * A string, so it can never equal a row (rows are objects).
 */
export const ROW_REMOVED = "\u0000row-removed";

/**
 * Two or more offices changed the same field — or the same row (`rowId` set)
 * of a list — differently from the master: surfaced for a human pick (no
 * silent winner). `values` holds only the offices that changed it; a row
 * value of {@link ROW_REMOVED} means that office deleted the row. `master` is
 * the master's value (or {@link ROW_REMOVED} for a row the master lacks) —
 * the "keep master" choice.
 */
export interface ScalarConflict {
  sectionId: string;
  fieldKey: string;
  rowId?: string;
  values: { officeId: string; value: unknown }[];
  master: unknown;
}

/** Key a conflict's resolution is stored under (see {@link applyResolutions}). */
export function conflictKey(c: Pick<ScalarConflict, "sectionId" | "fieldKey" | "rowId">): string {
  return c.rowId === undefined ? `${c.sectionId}.${c.fieldKey}` : `${c.sectionId}.${c.fieldKey}#${c.rowId}`;
}

export interface ConsolidateResult {
  merged: IsspDocument;
  /** Section ids flagged for human review (list overlaps, multi-owner definitions). */
  reviewFlags: string[];
  /** Scalar fields written differently by ≥2 offices — secretariat must pick one. */
  scalarConflicts: ScalarConflict[];
}

const PART_KEYS = ["part1", "part2", "part3", "part4"] as const;
type PartKey = (typeof PART_KEYS)[number];

function partKeyFor(sectionId: string): PartKey | undefined {
  return PART_KEYS.find((p) => sectionId.startsWith(p));
}

/** Per-field merge strategy — computed across the whole batch in the pre-pass. */
type Strategy = "shared-table" | "list-by-id" | "list-union" | "scalar-agreed" | "scalar-conflict" | "overlay" | "project-keyed";

/**
 * Deep-equality via JSON serialization. IsspDocument field values are plain
 * JSON-serializable data (strings, numbers, booleans, arrays, plain objects —
 * no functions, Dates, or circular refs), so structural equality reduces to
 * byte-equal JSON. {@link JSON.stringify} on `undefined` returns `undefined`
 * (not a string), but it does so stably on both sides, so the comparison still
 * treats two missing values as equal — which is the right answer (both owners
 * left the field at its default).
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Read one office's value for `${sid}.${fk}` from its file (or undefined). An
 * office that sent several files in the batch speaks through its LAST one —
 * a resend replaces the earlier submission.
 */
function readFieldValue(
  files: IsspDocument[],
  officeId: string,
  partKey: PartKey,
  fk: string
): unknown {
  const f = files.findLast((x) => x.editScope!.office.id === officeId);
  if (!f) return undefined;
  const fp = f[partKey] as unknown as Record<string, unknown>;
  return fp[fk];
}

/**
 * The owners that changed a multi-owner scalar relative to the master (the
 * merge base), with their values. Owners that returned the master's value
 * did not write the field and are left out.
 */
function scalarChanges(
  key: string,
  owners: string[],
  files: IsspDocument[],
  master: IsspDocument
): { officeId: string; value: unknown }[] {
  const dot = key.indexOf(".");
  const partKey = partKeyFor(key.slice(0, dot))!;
  const fk = key.slice(dot + 1);
  const masterValue = (master[partKey] as unknown as Record<string, unknown>)[fk];
  return owners
    .map((officeId) => ({ officeId, value: readFieldValue(files, officeId, partKey, fk) }))
    .filter((c) => !jsonEqual(c.value, masterValue));
}

function strategyFor(
  key: string,
  sid: string,
  owners: string[],
  files: IsspDocument[],
  master: IsspDocument,
  anyProjectFilter: boolean
): Strategy {
  if (SHARED_TABLE_PATHS.has(key) || SHARED_TABLE_PATHS.has(sid)) {
    return "shared-table";
  }
  // Per-project distribution: when ANY file in the batch declares a project
  // filter, the project-bearing fields (PROJECT_BEARING_FIELDS) merge by
  // project id (replace / append / keep-on-delete) instead of overlay/union.
  // Pure-legacy batches keep the strategies below, byte-for-byte.
  if (anyProjectFilter && PROJECT_BEARING_FIELDS.has(key)) {
    return "project-keyed";
  }
  if (owners.length <= 1) return "overlay";
  // ≥2 owners on a non-shared path. Inspect the owners' actual values rather
  // than just owner-count — the spec says a scalar conflict arises only when a
  // field is "written differently" by ≥2 offices.
  // No partKey → front-matter (definitions) or annex. These aren't scalar
  // leaves of a Part I–IV section; the main pass special-cases them (annex1
  // shared-table replace; definitions last-write-wins + review flag when
  // multi-owner). Return "overlay" so the pre-pass emits NO spurious conflict
  // (which would surface a misleading "pick a value" UI for `definitions`
  // that the resolution overlay silently drops). The main-pass branch still
  // flags `definitions` for review when ≥2 offices owned it.
  const partKey = partKeyFor(sid);
  if (!partKey) return "overlay";
  const fk = key.slice(key.indexOf(".") + 1);
  const values = owners.map((oid) => readFieldValue(files, oid, partKey, fk));
  // All lists of id-bearing rows → merge row by row against the master
  // (mergeListById). Any other list shape → the older lossless union + flag.
  if (values.every((v) => Array.isArray(v))) {
    return values.every((v) => (v as unknown[]).every(hasRowId)) ? "list-by-id" : "list-union";
  }
  // Scalars are judged against the master (the merge base): at most one
  // distinct change across the owners → that value (or the master's, if none
  // changed it) is agreed; ≥2 distinct changes → surface for human pick.
  const distinct = new Set(scalarChanges(key, owners, files, master).map((c) => JSON.stringify(c.value)));
  return distinct.size <= 1 ? "scalar-agreed" : "scalar-conflict";
}

type Row = { id: string };

function hasRowId(r: unknown): r is Row {
  return typeof r === "object" && r !== null && typeof (r as { id?: unknown }).id === "string";
}

/**
 * Merge several offices' versions of one id-bearing list, using the master's
 * list as the merge base. Per row id:
 *  - no office changed it → the master row;
 *  - exactly one distinct change → that version (replace in place);
 *  - deleted by some office(s), changed by none → removed;
 *  - ≥2 distinct changes, or changed by one office and deleted by another →
 *    a row conflict; the result keeps the master row until resolved;
 *  - an id the master lacks → appended (batch order); the same new id with
 *    different content from ≥2 offices → a row conflict, left out until resolved.
 * `flag` is set on any conflict, or when ≥2 offices added rows (possible
 * duplicates by meaning, not id).
 */
function mergeListById(
  masterRows: Row[],
  versions: { officeId: string; rows: Row[] }[]
): { rows: Row[]; conflicts: { rowId: string; values: { officeId: string; value: unknown }[]; master: unknown }[]; flag: boolean } {
  const conflicts: { rowId: string; values: { officeId: string; value: unknown }[]; master: unknown }[] = [];
  const result: Row[] = [];

  for (const masterRow of masterRows) {
    const changed: { officeId: string; value: unknown }[] = [];
    const deletedBy: string[] = [];
    for (const v of versions) {
      const row = v.rows.find((r) => r.id === masterRow.id);
      if (!row) deletedBy.push(v.officeId);
      else if (!jsonEqual(row, masterRow)) changed.push({ officeId: v.officeId, value: row });
    }
    const distinct = new Set(changed.map((c) => JSON.stringify(c.value)));
    if (distinct.size === 0 && deletedBy.length === 0) result.push(masterRow);
    else if (distinct.size === 1 && deletedBy.length === 0) result.push(changed[0].value as Row);
    else if (distinct.size === 0) continue; // deleted, and no other office changed it
    else {
      conflicts.push({
        rowId: masterRow.id,
        values: [...changed, ...deletedBy.map((officeId) => ({ officeId, value: ROW_REMOVED }))],
        master: masterRow,
      });
      result.push(masterRow);
    }
  }

  const masterIds = new Set(masterRows.map((r) => r.id));
  const added = new Map<string, { officeId: string; value: Row }[]>(); // new id → contributions (batch order)
  for (const v of versions) {
    for (const row of v.rows) {
      if (masterIds.has(row.id)) continue;
      const list = added.get(row.id) ?? [];
      list.push({ officeId: v.officeId, value: row });
      added.set(row.id, list);
    }
  }
  const addingOffices = new Set<string>();
  for (const [rowId, contributions] of added) {
    for (const c of contributions) addingOffices.add(c.officeId);
    const distinct = new Set(contributions.map((c) => JSON.stringify(c.value)));
    if (distinct.size === 1) result.push(contributions[0].value);
    else conflicts.push({ rowId, values: contributions, master: ROW_REMOVED });
  }

  return { rows: result, conflicts, flag: conflicts.length > 0 || addingOffices.size >= 2 };
}

/** (projectId, value) pairs a file contributes for a project-bearing key. */
function projectEntries(file: IsspDocument, key: string): [string, unknown][] {
  const dot = key.indexOf(".");
  const sid = key.slice(0, dot);
  const fk = key.slice(dot + 1);
  if (sid === "part3/e1") return file.part3.internalProjects.map((r) => [r.id, r] as [string, unknown]);
  if (sid === "part3/e2") return file.part3.crossAgencyProjects.map((r) => [r.id, r] as [string, unknown]);
  // Systems merge by their OWN id (they are linked to projects, not keyed by
  // project id) — the differ pre-pass uses these entries like any other.
  if (sid === "part3/d") return file.part3.proposedSystems.map((r) => [r.id, r] as [string, unknown]);
  if (sid === "part3/f") return Object.entries(file.part3.performanceFramework);
  const yb = file.part4[fk as "year1" | "year2" | "year3"];
  if (!yb) return [];
  return [
    ...Object.entries(yb.internalProjects),
    ...Object.entries(yb.crossAgencyProjects),
  ];
}

/**
 * Merge returned scoped `.issp` files back into `master`. Pure: the function
 * `structuredClone`s the master at the top and never mutates its inputs.
 *
 * Per the merge contract (`docs/scoped-issp-distribution-design-2026-07-21.md`,
 * "Merge rules"):
 *  - **Shared table** (`annexes/annex1`, `part1/c.stakeholders`): replace that
 *    office's rows/payload by `officeId`. Idempotent — re-importing an office's
 *    file replaces, never duplicates. Multi-office shared tables merge cleanly
 *    (each office's rows replace only their own). Legacy rows without `officeId`
 *    are preserved (they belong to no office in the batch).
 *  - **Non-shared path, unique owner**: write each leaf field's value into the
 *    master (path-keyed overlay).
 *  - **The master is the merge base for every multi-owner field.** Each
 *    office's file starts from the same master data (Distribute copies it),
 *    so an owner that returns the master's value has not written it.
 *  - **Same non-shared path, ≥2 owners, list of id-bearing rows**: merge row
 *    by row against the master ({@link mergeListById}) — one change wins,
 *    unchanged-but-missing rows are removed, new ids are appended, and
 *    differing changes (or edit-vs-delete) become row conflicts. Other list
 *    shapes keep the older union + review flag.
 *  - **Same scalar field, ≥2 owners, ≥2 distinct changes**: record a
 *    {@link ScalarConflict} and flag the section for review; do NOT silently
 *    pick. The merged doc keeps the master's existing value for that field
 *    until the review screen resolves it (and the flag persists post-apply so
 *    downstream reviewers see the contested write).
 *  - **Same scalar field, ≥2 owners, at most one distinct change**: that
 *    change (or the master's value) is written once, whatever the file order —
 *    no conflict, nothing for human review.
 *  - **Definitions** (front-matter): last-write-wins, but if ≥2 offices owned it
 *    the section is flagged for review (treat `"definitions.definitions"` as a
 *    single leaf).
 *
 * Returns `merged.consolidationFlags = reviewFlags` so the existing per-section
 * "needs review" UI picks the flags up automatically.
 */
export function consolidate(master: IsspDocument, files: IsspDocument[]): ConsolidateResult {
  const merged: IsspDocument = structuredClone(master);
  const reviewFlags = new Set<string>();
  const scalarConflicts: ScalarConflict[] = [];

  // Pre-pass: per leaf field, who owns it (deduped, first-seen order)? Shared-
  // table, list-union, scalar-conflict, and overlay rules are all decided here
  // so each scalar conflict is recorded exactly once (not once per file).
  const fieldOwners = new Map<string, string[]>(); // `${sid}.${fk}` -> officeIds
  for (const file of files) {
    const officeId = file.editScope!.office.id;
    for (const key of resolveScope(file.editScope!.editable).editableFields) {
      const owners = fieldOwners.get(key) ?? [];
      if (!owners.includes(officeId)) owners.push(officeId);
      fieldOwners.set(key, owners);
    }
  }
  const anyProjectFilter = files.some((f) => f.editScope?.projectIds !== undefined);
  const strategy = new Map<string, Strategy>();
  for (const key of fieldOwners.keys()) {
    const dot = key.indexOf(".");
    const sid = key.slice(0, dot);
    strategy.set(key, strategyFor(key, sid, fieldOwners.get(key)!, files, master, anyProjectFilter));
  }

  // Multi-owner scalars with at most one distinct change: the single value
  // every owner's file writes (so file order cannot matter).
  const agreedValues = new Map<string, unknown>();
  for (const [key, strat] of strategy) {
    if (strat !== "scalar-agreed") continue;
    const dot = key.indexOf(".");
    const partKey = partKeyFor(key.slice(0, dot))!;
    const fk = key.slice(dot + 1);
    const changes = scalarChanges(key, fieldOwners.get(key)!, files, master);
    agreedValues.set(key, changes.length > 0 ? changes[0].value : (master[partKey] as unknown as Record<string, unknown>)[fk]);
  }

  // Row-id list merges are decided once, batch-wide, against the master.
  const resolvedLists = new Map<string, Row[]>();
  for (const [key, strat] of strategy) {
    if (strat !== "list-by-id") continue;
    const dot = key.indexOf(".");
    const sid = key.slice(0, dot);
    const fk = key.slice(dot + 1);
    const partKey = partKeyFor(sid)!;
    const masterRows = ((master[partKey] as unknown as Record<string, unknown>)[fk] as Row[]) ?? [];
    const versions = fieldOwners.get(key)!.map((officeId) => ({
      officeId,
      rows: readFieldValue(files, officeId, partKey, fk) as Row[],
    }));
    const m = mergeListById(masterRows, versions);
    resolvedLists.set(key, m.rows);
    for (const c of m.conflicts) scalarConflicts.push({ sectionId: sid, fieldKey: fk, ...c });
    if (m.flag) reviewFlags.add(sid);
  }

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

  // Part IV sub-object conflicts (officeProductivity / continuingCosts):
  // decided batch-wide, once per year field, exactly once like scalar
  // conflicts. FieldKey is NESTED ("year1.officeProductivity") so the store's
  // resolution applier can address the sub-object.
  const subConflicts = new Set<string>(); // `${sid}.${fk}.${sub}`
  // Sub-objects with at most one distinct change vs the master: the value
  // every unfiltered contributor writes (so file order cannot matter).
  const subAgreed = new Map<string, unknown>(); // `${sid}.${fk}.${sub}` → value
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
          // Project-filtered files contribute NOTHING to the two sub-objects:
          // their slice leaves both at the empty default (agency-wide budget
          // is not the office's to edit), so counting them here would either
          // fabricate a conflict or let an empty copy win the overlay.
          if (file.editScope?.projectIds !== undefined) continue;
          const yb = file.part4[fk as "year1" | "year2" | "year3"];
          if (!yb) continue; // like projectEntries: a file lacking this year contributes nothing
          values.push({ officeId: file.editScope!.office.id, value: yb[sub] });
        }
        // Judged against the master (the merge base), like scalars.
        const masterSub = master.part4[fk as "year1" | "year2" | "year3"][sub];
        const changes = values.filter((v) => !jsonEqual(v.value, masterSub));
        const distinct = new Set(changes.map((v) => JSON.stringify(v.value)));
        if (distinct.size > 1) {
          subConflicts.add(`${sid}.${fk}.${sub}`);
          reviewFlags.add(sid);
          scalarConflicts.push({ sectionId: sid, fieldKey: `${fk}.${sub}`, values: changes, master: masterSub });
        } else if (values.length > 0) {
          subAgreed.set(`${sid}.${fk}.${sub}`, changes.length > 0 ? changes[0].value : masterSub);
        }
      }
    }
  }

  // Multi-owner scalar conflicts are emitted once, up front, from the strategy
  // pass — independent of file iteration order. A section with at least one
  // scalar conflict is also flagged for review: the secretariat resolved the
  // field to a single value, but downstream reviewers (Task 11 banner) should
  // still see that a contested write landed there.
  for (const [key, strat] of strategy) {
    if (strat !== "scalar-conflict") continue;
    const dot = key.indexOf(".");
    const sid = key.slice(0, dot);
    const fk = key.slice(dot + 1);
    const partKey = partKeyFor(sid);
    if (!partKey) continue;
    reviewFlags.add(sid);
    scalarConflicts.push({
      sectionId: sid,
      fieldKey: fk,
      master: (master[partKey] as unknown as Record<string, unknown>)[fk],
      values: scalarChanges(key, fieldOwners.get(key)!, files, master),
    });
  }

  // Main pass: apply each file's owned fields to the merged doc.
  for (const file of files) {
    const scope = file.editScope!;
    const officeId = scope.office.id;
    const editableFields = resolveScope(scope.editable).editableFields;

    for (const key of editableFields) {
      const dot = key.indexOf(".");
      const sid = key.slice(0, dot);
      const fk = key.slice(dot + 1);

      // Project-keyed fields: only the office's latest file in the batch
      // contributes (see latestByKey).
      if (strategy.get(key) === "project-keyed" && latestByKey.get(key)?.get(officeId) !== file) {
        continue;
      }

      // Annex 1 bucket at doc root — replace this office's payloads by office.id.
      if (sid === "annexes/annex1") {
        merged.annexedOffices = [
          ...(merged.annexedOffices ?? []).filter((o) => o.officeId !== officeId),
          // Deep-clone so a later in-memory mutation of `merged` can't corrupt
          // the input file (Annex1FilePayload nests equipment/software arrays).
          ...(file.annexedOffices ?? []).map((o) => structuredClone({ ...o, officeId })),
        ];
        continue;
      }

      // Front-matter definitions — single leaf "definitions.definitions".
      if (sid === "definitions" && fk === "definitions") {
        if ((fieldOwners.get(key)?.length ?? 0) > 1) reviewFlags.add("definitions");
        // Deep-clone: definitions is an object; without this `merged.definitions`
        // would alias `file.definitions`.
        merged.definitions = structuredClone(file.definitions);
        continue;
      }

      const partKey = partKeyFor(sid);
      if (!partKey) continue; // unknown section id → contributes nothing
      const target = merged[partKey] as unknown as Record<string, unknown>;
      const src = file[partKey] as unknown as Record<string, unknown>;

      switch (strategy.get(key)) {
        case "shared-table": {
          // Replace this office's rows by officeId. Legacy rows without officeId
          // match no office in the batch → kept (they belong to no office here).
          // The `mine` filter is strict (`=== officeId`) per the merge contract:
          // a scoped file contains only that office's own stamped rows, so an
          // untagged row in a scoped file is malformed and must NOT be silently
          // attributed to the importing office. (Legacy untagged rows on the
          // master side survive via the `others` filter above.)
          const others = ((target[fk] as unknown[]) ?? []).filter(
            (r) => (r as { officeId?: string }).officeId !== officeId
          );
          const mine = ((src[fk] as unknown[]) ?? []).filter(
            (r) => (r as { officeId?: string }).officeId === officeId
          );
          // Deep-clone mine rows: Stakeholder.services (and similar nested
          // structures) would otherwise alias the file's objects into `merged`.
          target[fk] = [...others, ...mine.map((r) => structuredClone(r))];
          break;
        }
        case "scalar-agreed":
          target[fk] = structuredClone(agreedValues.get(key));
          break;
        case "list-by-id":
          // Decided in the pre-pass (mergeListById); every owner's file
          // writes the same resolved list.
          target[fk] = structuredClone(resolvedLists.get(key));
          break;
        case "list-union": {
          // Lossless union — both offices' items survive; flag for human dedup.
          // Deep-clone contributed items so mutating `merged` can't write back
          // into the input file.
          const existing = (target[fk] as unknown[]) ?? [];
          target[fk] = [
            ...existing,
            ...(src[fk] as unknown[]).map((r) => structuredClone(r)),
          ];
          reviewFlags.add(sid);
          break;
        }
        case "scalar-conflict":
          // Recorded once in the pre-pass; the merged doc keeps the master's
          // existing value (no silent pick). The review screen resolves it.
          break;
        case "project-keyed": {
          const pids = scope.projectIds;
          const masterPart = master[partKey] as unknown as Record<string, unknown>;
          let changed = false;

          if (sid === "part3/e1" || sid === "part3/e2" || sid === "part3/d") {
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
            if (pids && sid !== "part3/d") {
              const present = new Set(srcRows.map((r) => r.id));
              // deleted-by-office: owned id missing from the file but present
              // on the master → KEEP the master row, flag the section.
              // III-D is exempt: `projectIds` addresses projects, not systems —
              // absence from the file may just mean "not linked", so systems
              // are kept with no flag.
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
            // Assign back like the E1/E2 branch assigns `next`: dstRec is a
            // fresh `{}` when target[fk] was unset, and must land regardless.
            target[fk] = dstRec;
          } else {
            // part4/yearN — decompose the YearBudget: project sub-records
            // merge by id; the two non-project sub-objects overlay when every
            // contributor agrees and stay at master's value when conflicted
            // (the sub-conflict pre-pass already surfaced the pick). A
            // project-filtered file overlays NEITHER sub-object: it holds only
            // the empty default, and the categories are agency-wide budget,
            // not the office's to edit.
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
            // Explicit per-sub writes (not a `for sub of [...]` loop): a
            // union-keyed write `dstYB[sub] = …` must satisfy the INTERSECTION
            // of both sub-object types, which the cloned union never does.
            const agreedOP = subAgreed.get(`${sid}.${fk}.officeProductivity`) as typeof srcYB.officeProductivity | undefined;
            if (!pids && agreedOP) dstYB.officeProductivity = structuredClone(agreedOP);
            const agreedCC = subAgreed.get(`${sid}.${fk}.continuingCosts`) as typeof srcYB.continuingCosts | undefined;
            if (!pids && agreedCC) dstYB.continuingCosts = structuredClone(agreedCC);
          }

          if (changed) reviewFlags.add(sid);
          break;
        }
        default: {
          // overlay — unique owner (or every owner agreed on the same value)
          // replaces the field wholesale. Deep-clone non-primitive values so
          // `merged` shares no references with the input file.
          target[fk] = structuredClone(src[fk]);
          break;
        }
      }
    }
  }

  merged.consolidationFlags = [...reviewFlags];
  return { merged, reviewFlags: [...reviewFlags], scalarConflicts };
}

/**
 * Apply the secretariat's conflict resolutions onto a merged doc. Keys come
 * from {@link conflictKey}: `${sectionId}.${fieldKey}` for a field (Part IV
 * sub-field conflicts use a NESTED fieldKey: `"part4/year1" + "." +
 * "year1.officeProductivity"`), plus `#${rowId}` for a row. A row value
 * replaces the row with that id (or appends it if the merged list lacks it);
 * {@link ROW_REMOVED} removes it. Deep-clones values so the merged doc shares
 * no reference with the dialog's choice state. Unknown sections are ignored
 * (definitions/annex never produce conflicts).
 */
export function applyResolutions(
  merged: IsspDocument,
  resolutions: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(resolutions)) {
    const hash = key.indexOf("#");
    const fieldPath = hash >= 0 ? key.slice(0, hash) : key;
    const dot = fieldPath.indexOf(".");
    const sid = fieldPath.slice(0, dot);
    const fk = fieldPath.slice(dot + 1);
    const partKey = SECTION_FIELDS[sid]?.partKey;
    if (!partKey) continue;
    const target = merged[partKey] as unknown as Record<string, unknown>;

    if (hash >= 0) {
      const rowId = key.slice(hash + 1);
      const rows = ((target[fk] as Row[]) ?? []).filter((r) => value !== ROW_REMOVED || r.id !== rowId);
      if (value !== ROW_REMOVED) {
        const i = rows.findIndex((r) => r.id === rowId);
        if (i >= 0) rows[i] = structuredClone(value as Row);
        else rows.push(structuredClone(value as Row));
      }
      target[fk] = rows;
      continue;
    }

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
