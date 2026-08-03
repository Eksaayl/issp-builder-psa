import type { IsspDocument } from "@/lib/store/types";
import { resolveScope, SHARED_TABLE_PATHS } from "@/lib/scope/paths";

/** A scalar field written by ≥2 offices — surfaced for human pick (no silent winner). */
export interface ScalarConflict {
  sectionId: string;
  fieldKey: string;
  values: { officeId: string; value: unknown }[];
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
type Strategy = "shared-table" | "list-union" | "scalar-conflict" | "overlay";

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

/** Read one office's value for `${sid}.${fk}` from its file (or undefined). */
function readFieldValue(
  files: IsspDocument[],
  officeId: string,
  partKey: PartKey,
  fk: string
): unknown {
  const f = files.find((x) => x.editScope!.office.id === officeId);
  if (!f) return undefined;
  const fp = f[partKey] as unknown as Record<string, unknown>;
  return fp[fk];
}

function strategyFor(
  key: string,
  sid: string,
  owners: string[],
  files: IsspDocument[]
): Strategy {
  if (SHARED_TABLE_PATHS.has(key) || SHARED_TABLE_PATHS.has(sid)) {
    return "shared-table";
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
  // All list-valued → union + flag (lossless). List owners are unioned even
  // when equal so each row's office-of-origin is preserved.
  if (values.every((v) => Array.isArray(v))) return "list-union";
  // Same scalar value across every owner → implicit agreement. Overlay the
  // agreed value once; emit NO conflict (nothing to surface for human pick).
  if (values.every((v) => jsonEqual(v, values[0]))) return "overlay";
  // Values differ → surface for human pick (no silent winner).
  return "scalar-conflict";
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
 *  - **Same non-shared path, ≥2 owners, list-valued**: union the contributed
 *    items and set a review flag on the section — never silently discard.
 *  - **Same scalar field, ≥2 owners, values differ**: record a
 *    {@link ScalarConflict} and flag the section for review; do NOT silently
 *    pick. The merged doc keeps the master's existing value for that field;
 *    Task 10's review screen resolves it (and the flag persists post-apply so
 *    downstream reviewers see the contested write).
 *  - **Same scalar field, ≥2 owners, all values equal**: implicit agreement —
 *    overlay the agreed value once (no conflict, nothing for human review).
 *    Per spec a conflict arises only when a field is "written differently."
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
  const strategy = new Map<string, Strategy>();
  for (const key of fieldOwners.keys()) {
    const dot = key.indexOf(".");
    const sid = key.slice(0, dot);
    strategy.set(key, strategyFor(key, sid, fieldOwners.get(key)!, files));
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
      values: fieldOwners.get(key)!.map((oid) => {
        const f = files.find((x) => x.editScope!.office.id === oid)!;
        const fp = f[partKey] as unknown as Record<string, unknown>;
        return { officeId: oid, value: fp[fk] };
      }),
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
