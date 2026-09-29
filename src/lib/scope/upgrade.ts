import type { IsspDocument, LineItem } from "@/lib/store/types";

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
  {
    // v14: UACS object codes → expense categories. The upgrade maps a line's
    // old uacsCode deterministically, but UACS was never required — a line
    // with no code upgrades to categoryId "" while the master's copy has a
    // category, which would manufacture a spurious "Expense category"
    // conflict for every such row. Matched by line id, the returned line
    // takes the master's category and contributes no opinion. Lines the
    // office added keep their own (possibly empty) value; a category mapped
    // from the office's own uacsCode is kept — that is the office's data.
    introducedIn: 14,
    apply: (file, master) => {
      const masterCategory = new Map<string, string>();
      for (const year of [master.part4.year1, master.part4.year2, master.part4.year3]) {
        for (const l of yearLines(year)) if (l.categoryId) masterCategory.set(l.id, l.categoryId);
      }
      for (const year of [file.part4.year1, file.part4.year2, file.part4.year3]) {
        for (const l of yearLines(year)) {
          if (!l.categoryId) l.categoryId = masterCategory.get(l.id) ?? "";
        }
      }
    },
  },
];

function yearLines(year: IsspDocument["part4"]["year1"]): LineItem[] {
  return [
    ...year.officeProductivity.capitalOutlay,
    ...year.officeProductivity.mooe,
    ...year.continuingCosts.mooe,
    ...Object.values(year.internalProjects).flatMap((p) => [...p.capitalOutlay, ...p.mooe]),
    ...Object.values(year.crossAgencyProjects).flatMap((p) => [...p.capitalOutlay, ...p.mooe]),
  ];
}

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
