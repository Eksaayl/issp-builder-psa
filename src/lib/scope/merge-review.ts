import type { IsspDocument } from "@/lib/store/types";
import { applyResolutions, consolidate, type ScalarConflict } from "@/lib/scope/consolidate";
import { resolveScope, SHARED_TABLE_PATHS } from "@/lib/scope/paths";
import { SECTION_FIELDS } from "@/lib/section-fields";
import { CURRENT_SCHEMA_VERSION } from "@/lib/migration-review";

/**
 * The merge review: everything a batch of returned scoped files would change
 * in the master, computed before anything is applied (spec
 * docs/superpowers/specs/2026-09-27-consolidate-merge-review-design.md).
 *
 * The review is derived from the merge engine's own output — `consolidate()`
 * decides what changes; this module describes it, attributes it to offices,
 * and turns the secretariat's decisions back into edits of the returned files
 * so the engine can re-merge. The preview and the apply step call the same
 * functions, so they cannot drift.
 */

/** A returned scoped file after parsing and upgrade (see parseScopedIsspFile). */
export interface ParsedScopedFile {
  doc: IsspDocument;
  /** Schema version the file was made with, before the upgrade. */
  sourceSchemaVersion: number;
}

export type ChangeKind =
  | "new"
  | "overwritten"
  | "cleared"
  | "appended"
  | "added-row"
  | "replaced-row"
  | "removed-row"
  | "kept-office-deleted"
  | "office-rows-replaced"
  | "unchanged";

export type ValueShape = "text" | "rich-text" | "image" | "number" | "boolean" | "object" | "row";

/** One changed sub-item of a row or object: where it is, and before → after. */
export interface CellDiff {
  path: string[];
  label: string;
  before: unknown;
  after: unknown;
}

/** One step of a location path: an object key, or the array element whose `by` field equals `eq`. */
export type PathSeg = string | { by: string; eq: string };

export interface ReviewChange {
  /** Stable id — also the key for decisions. */
  id: string;
  sectionId: string;
  fieldKey: string;
  /** Where the value lives in the document (same path in master, merged doc and files). */
  path: PathSeg[];
  rowId?: string;
  /** Field label, or "<field> › <row name>" for a row. */
  label: string;
  kind: ChangeKind;
  officeIds: string[];
  /** Master value at this location (undefined for a row the master lacks). */
  before: unknown;
  /** Merged value at this location (undefined for a removed row). */
  after: unknown;
  cells?: CellDiff[];
  valueShape: ValueShape;
  /** Which rejection this change allows, if any. */
  decision: "keep-master" | "skip-row" | null;
}

/** A returned file whose header differs from the master's — it may belong to another ISSP. */
export interface ProvenanceWarning {
  officeId: string;
  field: "agency" | "title" | "startYear" | "endYear";
  file: string;
  master: string;
}

export interface MergeReview {
  changes: ReviewChange[];
  conflicts: ScalarConflict[];
  reviewFlags: string[];
  provenance: ProvenanceWarning[];
  /** Files made with an older schema, upgraded before the review. */
  upgraded: { officeId: string; fromVersion: number }[];
}

/** Compare each file's header (agency, title, plan years) with the master's. Warns; never blocks. */
function provenanceWarnings(master: IsspDocument, files: ParsedScopedFile[]): ProvenanceWarning[] {
  const header = (d: IsspDocument) => ({
    agency: d.agency.name.trim(),
    title: d.title.trim(),
    startYear: String(d.startYear),
    endYear: String(d.endYear),
  });
  const m = header(master);
  return files.flatMap((f) => {
    const h = header(f.doc);
    return (["agency", "title", "startYear", "endYear"] as const)
      .filter((field) => h[field] !== m[field])
      .map((field) => ({ officeId: f.doc.editScope!.office.id, field, file: h[field], master: m[field] }));
  });
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function step(container: unknown, seg: PathSeg): unknown {
  if (container === null || container === undefined) return undefined;
  if (typeof seg === "string") return (container as Record<string, unknown>)[seg];
  if (!Array.isArray(container)) return undefined;
  return container.find((el) => (el as Record<string, unknown>)?.[seg.by] === seg.eq);
}

export function getAt(doc: unknown, path: PathSeg[]): unknown {
  return path.reduce<unknown>((acc, seg) => step(acc, seg), doc);
}

/** Write `value` at `path` (the last step must be an object key). */
function setAt(doc: unknown, path: PathSeg[], value: unknown): void {
  const parent = getAt(doc, path.slice(0, -1)) as Record<string, unknown> | undefined;
  const last = path[path.length - 1];
  if (parent && typeof last === "string") parent[last] = value;
}

// ─── Value helpers ────────────────────────────────────────────────────────────

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Fields edited with the rich-text editor (their values are HTML). */
const RICH_TEXT_FIELDS: ReadonlySet<string> = new Set(["part1/a.mandateFunction", "part1/a.visionStatement"]);

function shapeOf(v: unknown): ValueShape {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string" && v.startsWith("data:image/")) return "image";
  if (typeof v === "object" && v !== null) return "object";
  return "text";
}

type Row = { id: string } & Record<string, unknown>;

function isRow(v: unknown): v is Row {
  return typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string";
}

/** True when every candidate value is an array of id-bearing rows (and at least one has rows). */
function isRowList(candidates: unknown[]): boolean {
  const arrays = candidates.filter((c) => c !== undefined);
  return (
    arrays.length > 0 &&
    arrays.every((a) => Array.isArray(a) && a.every(isRow)) &&
    arrays.some((a) => (a as unknown[]).length > 0)
  );
}

/** "implementingUnit" → "Implementing unit". */
function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A row's human name — the first of its usual name-like fields, else its id. */
export function rowName(row: unknown): string {
  if (!isRow(row)) return "row";
  for (const k of ["title", "name", "term", "position", "item", "indicator", "concern", "criticalSystem", "type"]) {
    if (typeof row[k] === "string" && row[k]) return row[k] as string;
  }
  return row.id;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The changed leaves of two plain objects, depth-first in key order, as cells. */
function leafCells(before: unknown, after: unknown, path: string[] = []): CellDiff[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((k) => leafCells(before[k], after[k], [...path, k]));
  }
  if (jsonEqual(before, after)) return [];
  return [{ path, label: path.map(humanize).join(" › "), before, after }];
}

/** Top-level keys whose values differ between two rows, as cells. */
function rowCells(before: Row, after: Row): CellDiff[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((k) => !jsonEqual(before[k], after[k]))
    .map((k) => ({ path: [k], label: humanize(k), before: before[k], after: after[k] }));
}

function fieldLabel(sectionId: string, fieldKey: string): string {
  return SECTION_FIELDS[sectionId]?.fields.find((f) => f.key === fieldKey)?.label ?? fieldKey;
}

/** The office whose LAST file in the batch owns `key` (a resend replaces earlier ones). */
function latestFiles(files: ParsedScopedFile[]): Map<string, ParsedScopedFile> {
  const latest = new Map<string, ParsedScopedFile>();
  for (const f of files) latest.set(f.doc.editScope!.office.id, f);
  return latest;
}

function ownersOf(key: string, latest: Map<string, ParsedScopedFile>): string[] {
  return [...latest.entries()]
    .filter(([, f]) => resolveScope(f.doc.editScope!.editable).editableFields.has(key))
    .map(([officeId]) => officeId);
}

// ─── Change extraction ────────────────────────────────────────────────────────

function fieldChange(
  key: string,
  sectionId: string,
  fieldKey: string,
  path: PathSeg[],
  master: IsspDocument,
  merged: IsspDocument,
  owners: string[],
  latest: Map<string, ParsedScopedFile>
): ReviewChange {
  const before = getAt(master, path);
  const after = getAt(merged, path);
  const kind: ChangeKind = jsonEqual(before, after)
    ? "unchanged"
    : isEmptyValue(before)
    ? "new"
    : isEmptyValue(after)
    ? "cleared"
    : "overwritten";
  const officeIds = owners.filter((o) => !jsonEqual(getAt(latest.get(o)!.doc, path), before));
  return {
    id: key,
    sectionId,
    fieldKey,
    path,
    label: fieldLabel(sectionId, fieldKey),
    kind,
    officeIds,
    before,
    after,
    cells: kind !== "unchanged" && isPlainObject(before) && isPlainObject(after) ? leafCells(before, after) : undefined,
    valueShape: RICH_TEXT_FIELDS.has(key) ? "rich-text" : shapeOf(after ?? before),
    decision: kind === "overwritten" || kind === "cleared" ? "keep-master" : null,
  };
}

/**
 * One change per row of an id-bearing list at `listPath`: master rows in master
 * order (unchanged / replaced / removed), then added rows in merged order. An
 * added row is "appended" when two or more offices added rows to the list.
 */
function rowChanges(
  idBase: string,
  sectionId: string,
  fieldKey: string,
  listPath: PathSeg[],
  master: IsspDocument,
  merged: IsspDocument,
  owners: string[],
  latest: Map<string, ParsedScopedFile>,
  flagged: boolean,
  label: string
): ReviewChange[] {
  return diffRows({
    idBase, sectionId, fieldKey, listPath, owners, flagged, label,
    masterRows: (getAt(master, listPath) as Row[] | undefined) ?? [],
    mergedRows: (getAt(merged, listPath) as Row[] | undefined) ?? [],
    fileRows: (o) => (getAt(latest.get(o)!.doc, listPath) as Row[] | undefined) ?? [],
    projectIdsOf: (o) => latest.get(o)!.doc.editScope!.projectIds,
  });
}

/** The row comparison behind {@link rowChanges}, on row arrays already picked out. */
function diffRows(args: {
  idBase: string;
  sectionId: string;
  fieldKey: string;
  listPath: PathSeg[];
  owners: string[];
  flagged: boolean;
  label: string;
  masterRows: Row[];
  mergedRows: Row[];
  fileRows: (officeId: string) => Row[];
  /** The office's project filter, when rows of this list are projects the filter can name. */
  projectIdsOf?: (officeId: string) => string[] | undefined;
}): ReviewChange[] {
  const { idBase, sectionId, fieldKey, listPath, owners, flagged, label, masterRows, mergedRows, fileRows, projectIdsOf } = args;
  const masterIds = new Set(masterRows.map((r) => r.id));

  const make = (rowId: string, kind: ChangeKind, before: Row | undefined, after: Row | undefined, officeIds: string[]): ReviewChange => ({
    id: `${idBase}#${rowId}`,
    sectionId,
    fieldKey,
    path: [...listPath, { by: "id", eq: rowId }],
    rowId,
    label: `${label} › ${rowName(after ?? before)}`,
    kind,
    officeIds,
    before,
    after,
    cells: kind === "replaced-row" ? rowCells(before!, after!) : undefined,
    valueShape: "row",
    decision:
      kind === "replaced-row" || kind === "removed-row"
        ? "keep-master"
        : (kind === "added-row" || kind === "appended") && flagged
        ? "skip-row"
        : null,
  });

  const changes: ReviewChange[] = [];
  for (const m of masterRows) {
    const after = mergedRows.find((r) => r.id === m.id);
    if (!after) {
      changes.push(make(m.id, "removed-row", m, undefined, owners.filter((o) => !fileRows(o).some((r) => r.id === m.id))));
    } else if (!jsonEqual(m, after)) {
      const changedBy = owners.filter((o) => {
        const r = fileRows(o).find((x) => x.id === m.id);
        return r !== undefined && !jsonEqual(r, m);
      });
      changes.push(make(m.id, "replaced-row", m, after, changedBy));
    } else {
      // A project the office's file was meant to carry (named in its project
      // filter) but no longer does: the engine keeps it and flags the section.
      const deletedBy = owners.filter(
        (o) => projectIdsOf?.(o)?.includes(m.id) && !fileRows(o).some((r) => r.id === m.id)
      );
      changes.push(make(m.id, deletedBy.length > 0 ? "kept-office-deleted" : "unchanged", m, after, deletedBy));
    }
  }
  const added = mergedRows.filter((r) => !masterIds.has(r.id));
  const addedBy = (rowId: string) => owners.filter((o) => fileRows(o).some((r) => r.id === rowId));
  const addingOffices = new Set(added.flatMap((r) => addedBy(r.id)));
  for (const r of added) {
    changes.push(make(r.id, addingOffices.size >= 2 ? "appended" : "added-row", undefined, r, addedBy(r.id)));
  }
  return changes;
}

/**
 * A Part IV year field as line-item rows: one row list per budget bucket —
 * Office Productivity, each internal / cross-agency project, Continuing Costs.
 */
function yearBudgetChanges(
  key: string,
  sectionId: string,
  fieldKey: string,
  master: IsspDocument,
  merged: IsspDocument,
  owners: string[],
  latest: Map<string, ParsedScopedFile>,
  flagged: boolean
): ReviewChange[] {
  const docs = [master, merged, ...owners.map((o) => latest.get(o)!.doc)];
  const buckets: { sub: string[]; label: string }[] = [
    { sub: ["officeProductivity", "capitalOutlay"], label: "Office Productivity › Capital Outlay" },
    { sub: ["officeProductivity", "mooe"], label: "Office Productivity › MOOE" },
  ];
  for (const group of ["internalProjects", "crossAgencyProjects"] as const) {
    const ids = [...new Set(docs.flatMap((d) => Object.keys(d.part4[fieldKey as "year1"]?.[group] ?? {})))];
    for (const pid of ids) {
      const title =
        merged.part4[fieldKey as "year1"][group][pid]?.projectTitle ??
        master.part4[fieldKey as "year1"][group][pid]?.projectTitle ??
        pid;
      buckets.push({ sub: [group, pid, "capitalOutlay"], label: `${title} › Capital Outlay` });
      buckets.push({ sub: [group, pid, "mooe"], label: `${title} › MOOE` });
    }
  }
  buckets.push({ sub: ["continuingCosts", "mooe"], label: "Continuing Costs › MOOE" });

  return buckets.flatMap(({ sub, label }) => {
    const listPath: PathSeg[] = ["part4", fieldKey, ...sub];
    if (!docs.some((d) => ((getAt(d, listPath) as unknown[] | undefined) ?? []).length > 0)) return [];
    return rowChanges(
      `${key}/${sub.join("/")}`, sectionId, fieldKey, listPath, master, merged, owners, latest, flagged,
      `${fieldLabel(sectionId, fieldKey)} › ${label}`
    );
  });
}

/**
 * A shared table (Part I-C stakeholders): each row belongs to the office in
 * its `officeId`, and each office's returned rows replace only its own. Per
 * office in the batch: one "Office rows replaced" summary (when anything
 * changed), then that office's rows compared as a list.
 */
function sharedTableChanges(
  key: string,
  sectionId: string,
  fieldKey: string,
  listPath: PathSeg[],
  master: IsspDocument,
  merged: IsspDocument,
  owners: string[],
  latest: Map<string, ParsedScopedFile>,
  flagged: boolean
): ReviewChange[] {
  const rowsOf = (d: IsspDocument, officeId: string) =>
    ((getAt(d, listPath) as Row[] | undefined) ?? []).filter((r) => r.officeId === officeId);
  const label = fieldLabel(sectionId, fieldKey);
  return owners.flatMap((officeId) => {
    const rows = diffRows({
      idBase: key, sectionId, fieldKey, listPath, flagged, label,
      owners: [officeId],
      masterRows: rowsOf(master, officeId),
      mergedRows: rowsOf(merged, officeId),
      fileRows: (o) => rowsOf(latest.get(o)!.doc, officeId),
    });
    if (rows.every((c) => c.kind === "unchanged")) return rows;
    const summary: ReviewChange = {
      id: `${key}@${officeId}`,
      sectionId,
      fieldKey,
      path: listPath,
      label: `${label} › ${latest.get(officeId)!.doc.editScope!.office.displayLabel}`,
      kind: "office-rows-replaced",
      officeIds: [officeId],
      before: rowsOf(master, officeId),
      after: rowsOf(merged, officeId),
      valueShape: "row",
      decision: null,
    };
    return [summary, ...rows];
  });
}

/**
 * Annex 1: one inventory payload per office (matched by officeId), each with
 * equipment and software rows. Per office in the batch: an "Office rows
 * replaced" summary (when anything changed), then its rows.
 */
function annexChanges(
  key: string,
  master: IsspDocument,
  merged: IsspDocument,
  owners: string[],
  latest: Map<string, ParsedScopedFile>,
  flagged: boolean
): ReviewChange[] {
  const sectionId = "annexes/annex1";
  return owners.flatMap((officeId) => {
    const payloadPath: PathSeg[] = ["annexedOffices", { by: "officeId", eq: officeId }];
    const office = latest.get(officeId)!.doc.editScope!.office.displayLabel;
    const rows = (["equipment", "software"] as const).flatMap((kind) => {
      const listPath: PathSeg[] = [...payloadPath, "annex1", kind];
      const rowsAt = (d: IsspDocument) => (getAt(d, listPath) as Row[] | undefined) ?? [];
      return diffRows({
        idBase: `${key}@${officeId}/${kind}`, sectionId, fieldKey: sectionId, listPath, flagged,
        label: `Annex 1 › ${office} › ${humanize(kind)}`,
        owners: [officeId],
        masterRows: rowsAt(master),
        mergedRows: rowsAt(merged),
        fileRows: (o) => rowsAt(latest.get(o)!.doc),
      });
    });
    if (rows.every((c) => c.kind === "unchanged")) return rows;
    const summary: ReviewChange = {
      id: `${key}@${officeId}`,
      sectionId,
      fieldKey: sectionId,
      path: payloadPath,
      label: `Annex 1 › ${office}`,
      kind: "office-rows-replaced",
      officeIds: [officeId],
      before: getAt(master, payloadPath),
      after: getAt(merged, payloadPath),
      valueShape: "row",
      decision: null,
    };
    return [summary, ...rows];
  });
}

/** Part III-F as KPI rows: one row list per project. */
function performanceFrameworkChanges(
  key: string,
  sectionId: string,
  fieldKey: string,
  master: IsspDocument,
  merged: IsspDocument,
  owners: string[],
  latest: Map<string, ParsedScopedFile>,
  flagged: boolean
): ReviewChange[] {
  const docs = [master, merged, ...owners.map((o) => latest.get(o)!.doc)];
  const ids = [...new Set(docs.flatMap((d) => Object.keys(d.part3.performanceFramework ?? {})))];
  return ids.flatMap((pid) => {
    const title =
      merged.part3.performanceFramework[pid]?.projectTitle ?? master.part3.performanceFramework[pid]?.projectTitle ?? pid;
    return rowChanges(
      `${key}/${pid}`, sectionId, fieldKey, ["part3", "performanceFramework", pid, "rows"],
      master, merged, owners, latest, flagged, `${fieldLabel(sectionId, fieldKey)} › ${title}`
    );
  });
}

/**
 * Everything the batch would change in the master: one entry per owned field
 * (or row), in document order, attributed to the offices that changed it.
 */
export function buildMergeReview(master: IsspDocument, files: ParsedScopedFile[]): MergeReview {
  const result = consolidate(master, files.map((f) => f.doc));
  const latest = latestFiles(files);

  const ownedKeys = new Set<string>();
  for (const f of latest.values()) {
    for (const key of resolveScope(f.doc.editScope!.editable).editableFields) ownedKeys.add(key);
  }

  const changes: ReviewChange[] = [];

  // Front matter first (document order): Definition of Terms at the doc root.
  const DEFS = "definitions.definitions";
  if (ownedKeys.has(DEFS)) {
    const owners = ownersOf(DEFS, latest);
    const path: PathSeg[] = ["definitions"];
    const candidates = [master.definitions, result.merged.definitions, ...owners.map((o) => latest.get(o)!.doc.definitions)];
    const flagged = result.reviewFlags.includes("definitions");
    changes.push(
      ...(isRowList(candidates)
        ? rowChanges(DEFS, "definitions", "definitions", path, master, result.merged, owners, latest, flagged, "Definition of Terms")
        : [fieldChange(DEFS, "definitions", "definitions", path, master, result.merged, owners, latest)])
    );
  }

  for (const [sectionId, def] of Object.entries(SECTION_FIELDS)) {
    for (const f of def.fields) {
      const key = `${sectionId}.${f.key}`;
      if (!ownedKeys.has(key)) continue;
      const path: PathSeg[] = [def.partKey, f.key];
      const owners = ownersOf(key, latest);
      const candidates = [getAt(master, path), getAt(result.merged, path), ...owners.map((o) => getAt(latest.get(o)!.doc, path))];
      if (SHARED_TABLE_PATHS.has(key)) {
        const flagged = result.reviewFlags.includes(sectionId);
        changes.push(...sharedTableChanges(key, sectionId, f.key, path, master, result.merged, owners, latest, flagged));
      } else if (key === "part3/f.performanceFramework") {
        const flagged = result.reviewFlags.includes(sectionId);
        changes.push(...performanceFrameworkChanges(key, sectionId, f.key, master, result.merged, owners, latest, flagged));
      } else if (sectionId.startsWith("part4/year")) {
        const flagged = result.reviewFlags.includes(sectionId);
        changes.push(...yearBudgetChanges(key, sectionId, f.key, master, result.merged, owners, latest, flagged));
      } else if (isRowList(candidates)) {
        const flagged = result.reviewFlags.includes(sectionId);
        changes.push(...rowChanges(key, sectionId, f.key, path, master, result.merged, owners, latest, flagged, fieldLabel(sectionId, f.key)));
      } else {
        changes.push(fieldChange(key, sectionId, f.key, path, master, result.merged, owners, latest));
      }
    }
  }

  // Annexes last (document order).
  const ANNEX = "annexes/annex1.annexes/annex1";
  if (ownedKeys.has(ANNEX)) {
    const flagged = result.reviewFlags.includes("annexes/annex1");
    changes.push(...annexChanges(ANNEX, master, result.merged, ownersOf(ANNEX, latest), latest, flagged));
  }

  return {
    changes,
    conflicts: result.scalarConflicts,
    reviewFlags: result.reviewFlags,
    provenance: provenanceWarnings(master, files),
    upgraded: files
      .filter((f) => f.sourceSchemaVersion < CURRENT_SCHEMA_VERSION)
      .map((f) => ({ officeId: f.doc.editScope!.office.id, fromVersion: f.sourceSchemaVersion })),
  };
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export interface ReviewDecisions {
  /** Ids of changes the secretariat rejected (Keep master / Skip row). */
  rejected: Set<string>;
  /** Conflict resolutions, keyed by conflictKey() — as for applyResolutions. */
  resolutions: Record<string, unknown>;
}

/**
 * Turn one rejected change into an edit of the file(s) that made it, so the
 * engine sees no change there on re-merge.
 */
function undoInFile(file: IsspDocument, change: ReviewChange, master: IsspDocument): void {
  const last = change.path[change.path.length - 1];
  if (typeof last === "string") {
    setAt(file, change.path, structuredClone(change.before));
    return;
  }
  // A row: skip an added row, restore a replaced one, or put a removed one
  // back at its master position.
  const listPath = change.path.slice(0, -1);
  const rows = (getAt(file, listPath) as Row[] | undefined) ?? [];
  let next: Row[];
  if (change.before === undefined) {
    next = rows.filter((r) => r.id !== change.rowId);
  } else if (rows.some((r) => r.id === change.rowId)) {
    next = rows.map((r) => (r.id === change.rowId ? structuredClone(change.before as Row) : r));
  } else {
    const masterIndex = ((getAt(master, listPath) as Row[] | undefined) ?? []).findIndex((r) => r.id === change.rowId);
    next = [...rows];
    next.splice(Math.min(Math.max(masterIndex, 0), next.length), 0, structuredClone(change.before as Row));
  }
  setAt(file, listPath, next);
}

/**
 * The merged document with the secretariat's decisions applied: each rejected
 * change is undone in the returned file(s) that made it, the batch is merged
 * again, and conflict resolutions are applied. Re-merging (rather than
 * patching the merged doc) lets the engine recompute review flags and
 * conflicts itself. Pure: inputs are not mutated.
 */
export function applyReviewDecisions(
  master: IsspDocument,
  files: ParsedScopedFile[],
  decisions: ReviewDecisions
): { doc: IsspDocument; reviewFlags: string[] } {
  const docs = files.map((f) => f.doc);
  if (decisions.rejected.size > 0) {
    const review = buildMergeReview(master, files);
    const latest = latestFiles(files);
    const edited = new Map<IsspDocument, IsspDocument>(); // original → edited copy
    const copyOf = (d: IsspDocument) => {
      if (!edited.has(d)) edited.set(d, structuredClone(d));
      return edited.get(d)!;
    };
    for (const change of review.changes) {
      if (!decisions.rejected.has(change.id)) continue;
      for (const officeId of change.officeIds) undoInFile(copyOf(latest.get(officeId)!.doc), change, master);
    }
    for (let i = 0; i < docs.length; i++) docs[i] = edited.get(docs[i]) ?? docs[i];
  }
  const result = consolidate(master, docs);
  applyResolutions(result.merged, decisions.resolutions);
  return { doc: result.merged, reviewFlags: result.reviewFlags };
}

// ─── Broken links ─────────────────────────────────────────────────────────────

/** A cross-part reference that points at nothing — named at both ends. */
export interface BrokenLink {
  /** Section holding the dangling reference. */
  sectionId: string;
  /** The item that holds the reference. */
  from: string;
  /** The missing item it points to (named from the master when possible). */
  to: string;
  message: string;
}

type RawLink = BrokenLink & { key: string };

/** Every broken reference in `doc`; `names` supplies human names for missing ids. */
function brokenLinksIn(doc: IsspDocument, names: IsspDocument): RawLink[] {
  const out: RawLink[] = [];
  const outcomes = doc.part1.orgOutcomes;
  const outcomeIds = new Set(outcomes.map((o) => o.id));
  const programIds = new Set(outcomes.flatMap((o) => o.programs.map((p) => p.id)));
  const nameOf = (id: string, list: { id: string; name?: string; title?: string }[]) => {
    const hit = list.find((x) => x.id === id);
    return hit?.name || hit?.title || id;
  };
  const allOutcomes = [...names.part1.orgOutcomes, ...outcomes];
  const allPrograms = allOutcomes.flatMap((o) => o.programs);

  // 1. II-A concerns → I-A outcomes and programs ("general" is always valid).
  for (const c of doc.part2.strategicConcerns) {
    const from = c.concern || c.criticalSystem || c.id;
    for (const id of c.outcomeIds) {
      if (id === "general" || outcomeIds.has(id)) continue;
      const to = nameOf(id, allOutcomes);
      out.push({ key: `oo:${c.id}:${id}`, sectionId: "part2/a", from, to, message: `Concern "${from}" links to outcome "${to}", which is no longer in Part I-A.` });
    }
    for (const id of c.programIds) {
      if (programIds.has(id)) continue;
      const to = nameOf(id, allPrograms);
      out.push({ key: `pg:${c.id}:${id}`, sectionId: "part2/a", from, to, message: `Concern "${from}" links to program "${to}", which is no longer in Part I-A.` });
    }
  }

  // 2. III-E projects → III-D proposed systems.
  const systemIds = new Set(doc.part3.proposedSystems.map((s) => s.id));
  const allSystems = [...names.part3.proposedSystems, ...doc.part3.proposedSystems];
  for (const [sectionId, projects] of [["part3/e1", doc.part3.internalProjects], ["part3/e2", doc.part3.crossAgencyProjects]] as const) {
    for (const p of projects) {
      for (const id of p.linkedSystemIds) {
        if (systemIds.has(id)) continue;
        const from = p.title || p.id;
        const to = nameOf(id, allSystems);
        out.push({ key: `sys:${p.id}:${id}`, sectionId, from, to, message: `Project "${from}" links to proposed system "${to}", which is no longer in Part III-D.` });
      }
    }
  }

  // 3. III-F KPI sets and Part IV project budgets → III-E projects.
  const internalIds = new Set(doc.part3.internalProjects.map((p) => p.id));
  const crossIds = new Set(doc.part3.crossAgencyProjects.map((p) => p.id));
  const allProjects = [
    ...names.part3.internalProjects, ...names.part3.crossAgencyProjects,
    ...doc.part3.internalProjects, ...doc.part3.crossAgencyProjects,
  ];
  for (const [pid, set] of Object.entries(doc.part3.performanceFramework)) {
    if (internalIds.has(pid) || crossIds.has(pid)) continue;
    const to = nameOf(pid, allProjects) === pid ? set.projectTitle || pid : nameOf(pid, allProjects);
    out.push({ key: `kpi:${pid}`, sectionId: "part3/f", from: "Performance Framework", to, message: `The Performance Framework has KPIs for project "${to}", which is no longer in Part III-E.` });
  }
  (["year1", "year2", "year3"] as const).forEach((y, i) => {
    for (const [group, ids] of [["internalProjects", internalIds], ["crossAgencyProjects", crossIds]] as const) {
      for (const [pid, budget] of Object.entries(doc.part4[y][group])) {
        if (ids.has(pid)) continue;
        const to = nameOf(pid, allProjects) === pid ? budget.projectTitle || pid : nameOf(pid, allProjects);
        const from = `Year ${i + 1} budget`;
        out.push({ key: `budget:${y}:${group}:${pid}`, sectionId: `part4/${y}`, from, to, message: `The ${from} has line items for project "${to}", which is no longer in Part III-E.` });
      }
    }
  });
  return out;
}

/**
 * Cross-part references broken in `doc` that were not already broken in
 * `master` — the links a merge (with the secretariat's decisions) would break.
 */
export function findBrokenLinks(doc: IsspDocument, master: IsspDocument): BrokenLink[] {
  const already = new Set(brokenLinksIn(master, master).map((l) => l.key));
  return brokenLinksIn(doc, master)
    .filter((l) => !already.has(l.key))
    .map(({ sectionId, from, to, message }) => ({ sectionId, from, to, message }));
}
