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

/**
 * Section ids covered by a path, independent of whether those sections have
 * writable fields. Read-only computed sections (e.g. part4/summary) have no
 * leaf fields, so {@link resolvePath} yields nothing for them — without this,
 * an office owning the whole area wouldn't see its own summary. Visibility is
 * derived from path coverage, not field coverage.
 */
function sectionsCoveredByPath(path: EditPath): string[] {
  const dot = path.indexOf(".");
  if (dot >= 0) return [path.slice(0, dot)];
  if (AREA_TO_SECTIONS[path]) return AREA_TO_SECTIONS[path];
  if (ALL_SECTION_IDS.includes(path)) return [path];
  return [];
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
    }
    // Visibility tracks section coverage (incl. read-only leaf-less sections),
    // not just sections with owned fields.
    for (const sid of sectionsCoveredByPath(p)) {
      visibleSections.add(sid);
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
