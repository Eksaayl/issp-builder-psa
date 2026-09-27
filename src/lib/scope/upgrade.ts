import type { IsspDocument } from "@/lib/store/types";

/**
 * Data a schema bump added to the document. When a returned scoped file was
 * made with a schema older than `introducedIn`, the upgrade fills this data
 * with defaults the office never chose — so before merging, the file takes
 * the master's value instead and contributes "no opinion" on it.
 */
interface MigrationBackfill {
  introducedIn: number;
  /** Copy the master's value for this data into the (already upgraded) file. */
  apply: (file: IsspDocument, master: IsspDocument) => void;
}

const MIGRATION_BACKFILLS: readonly MigrationBackfill[] = [
  {
    // v12: Part II-A concerns link to I-A programs (programIds), matched by
    // concern id. Concerns the office added keep the empty default. (v12's
    // other change — programs as {id, name} — needs no backfill: the upgrade
    // derives the same deterministic ids the master's own upgrade did.)
    introducedIn: 12,
    apply: (file, master) => {
      for (const concern of file.part2.strategicConcerns) {
        const masterConcern = master.part2.strategicConcerns.find((c) => c.id === concern.id);
        if (masterConcern) concern.programIds = [...masterConcern.programIds];
      }
    },
  },
  {
    // v13: Plantilla (Unfilled) counts in Part I-B Human Capital.
    introducedIn: 13,
    apply: (file, master) => {
      file.part1.humanCapital.plantillaUnfilled = structuredClone(master.part1.humanCapital.plantillaUnfilled);
    },
  },
  {
    // v13: per-KPI-row targeted-result statements in Part III-F, matched by
    // project id + row id. Rows the office added keep the empty default.
    introducedIn: 13,
    apply: (file, master) => {
      for (const [projectId, set] of Object.entries(file.part3.performanceFramework)) {
        const masterRows = master.part3.performanceFramework[projectId]?.rows ?? [];
        for (const row of set.rows) {
          const masterRow = masterRows.find((r) => r.id === row.id);
          if (masterRow) row.targetedResult = masterRow.targetedResult;
        }
      }
    },
  },
];

/**
 * Give an upgraded returned file the master's value for every piece of data
 * its original schema (`sourceSchemaVersion`) could not hold. Mutates and
 * returns `file`.
 */
export function backfillFromMaster(
  file: IsspDocument,
  master: IsspDocument,
  sourceSchemaVersion: number
): IsspDocument {
  for (const backfill of MIGRATION_BACKFILLS) {
    if (sourceSchemaVersion < backfill.introducedIn) backfill.apply(file, master);
  }
  return file;
}
