/**
 * A scope path. Three levels; "owns everything under it":
 *   "part1"            → whole area
 *   "part1/b"          → whole section (section id from sections.ts)
 *   "part1/b.cioName"  → one field (section id + "." + field key from section-fields.ts)
 * Annex uses the section id "annexes/annex1" at both area and section level.
 */
export type EditPath = string;

export interface OfficeIdentity {
  /** Stable merge key (not the display label). */
  id: string;
  name: string;
  displayLabel: string;
}

export interface EditScope {
  office: OfficeIdentity;
  /** Editable paths at any level (area / section / field). */
  editable: EditPath[];
  /** ISO timestamp when sliced from the master. */
  generatedAt: string;
  /** Master provenance, for idempotent re-merge. */
  sourceDocId?: string;
}
