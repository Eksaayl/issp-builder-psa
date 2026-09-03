import type { IsspDocument } from "@/lib/store/types";
import type { EditPath, EditScope, OfficeIdentity } from "@/lib/scope/types";
import { resolveScope, SHARED_TABLE_PATHS } from "@/lib/scope/paths";
import { SECTION_FIELDS } from "@/lib/section-fields";
import { createEmptyDocument, type NewDocOptions } from "@/lib/store/defaults";

export interface DistributeSpec {
  office: OfficeIdentity;
  /** Editable paths at any level (area / section / field). */
  editable: EditPath[];
  /** Master provenance, for idempotent re-merge in consolidate(). */
  sourceDocId?: string;
}

/**
 * Produce a scoped .issp from a master. The slice carries the agency header
 * and the office's OWNED data only. Shared tables (`part1/c.stakeholders`,
 * `annexes/annex1`) are emptied — the office re-adds its own rows. Every
 * non-owned field is left at the {@link createEmptyDocument} defaults, so no
 * other office's data leaks through.
 *
 * Per-field (not per-section) ownership is enforced: a path like
 * `part1/b.cioName` copies ONLY `cioName`, never its sibling `cioEmail`.
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

  // Part fields — iterate SECTION_FIELDS so each (sectionId, fieldKey) lands on
  // its correct partKey. Copy a field ONLY when its full path is owned; shared
  // tables are emptied even when owned (the office re-adds rows on edit).
  for (const [sectionId, def] of Object.entries(SECTION_FIELDS)) {
    const srcPart = master[def.partKey] as unknown as Record<string, unknown>;
    const dstPart = sliced[def.partKey] as unknown as Record<string, unknown>;
    for (const f of def.fields) {
      const path = `${sectionId}.${f.key}`;
      if (!resolved.editableFields.has(path)) continue; // not owned → leave at default
      dstPart[f.key] = SHARED_TABLE_PATHS.has(path) ? [] : srcPart[f.key];
    }
  }

  // Front-matter definitions: copy only if owned.
  if (resolved.editableFields.has("definitions.definitions")) {
    sliced.definitions = master.definitions;
  }

  // Annex 1 (shared table at doc root) — always emptied in the slice.
  sliced.annexedOffices = [];

  const now = new Date().toISOString();
  const editScope: EditScope = {
    office: spec.office,
    editable: spec.editable,
    generatedAt: now,
    sourceDocId: spec.sourceDocId,
  };
  // Deep-clone so the returned doc shares NO references with the live master.
  // IsspDocument is plain JSON-serializable data (ISO strings, numbers, arrays,
  // plain objects — no functions or Date instances), and the runtime already
  // requires a modern baseline (crypto.randomUUID is used elsewhere), so
  // structuredClone is safe here and the cheapest correct option.
  return structuredClone({ ...sliced, editScope, exportedAt: now });
}
