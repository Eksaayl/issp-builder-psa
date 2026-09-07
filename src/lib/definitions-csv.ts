import { parseCsv, toCsv } from "@/lib/csv";
import { STANDARD_DEFINITIONS } from "@/lib/store/defaults";
import type { DefinitionTerm } from "@/lib/store/types";

export interface DefinitionsImportPreview {
  toAdd: { term: string; definition: string }[];
  skippedDuplicates: { row: number; term: string }[];
  invalid: { row: number; reason: string }[];
}

/** Same key "Restore standard terms" already matches on, so the two agree. */
function dedupeKey(term: string): string {
  return term.trim().toLowerCase();
}

function isHeaderRow(row: string[]): boolean {
  return (
    dedupeKey(row[0] ?? "") === "term" &&
    dedupeKey(row[1] ?? "") === "definition"
  );
}

/**
 * Work out what importing this CSV would do, without doing it.
 *
 * Nothing here throws and nothing mutates: the dialog renders the result, and
 * only the Add button commits. Bad rows are reported and skipped rather than
 * failing the whole file -- a glossary with one malformed line should still
 * import the other forty.
 *
 * Row numbers are 1-based over the parsed records, header included, which is
 * what the spreadsheet shows in its row gutter.
 */
export function previewDefinitionsCsv(
  text: string,
  existing: DefinitionTerm[],
): DefinitionsImportPreview {
  const rows = parseCsv(text);
  const preview: DefinitionsImportPreview = {
    toAdd: [],
    skippedDuplicates: [],
    invalid: [],
  };

  // Seed with what is already in the document, then keep adding, so a file
  // that repeats a term inside itself is caught too and not added twice.
  const seen = new Set(existing.map((t) => dedupeKey(t.term)));

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (index === 0 && isHeaderRow(row)) return;

    const term = (row[0] ?? "").trim();
    const definition = (row[1] ?? "").trim();

    if (!term) {
      preview.invalid.push({ row: rowNumber, reason: "No term in the first column." });
      return;
    }
    if (!definition) {
      preview.invalid.push({
        row: rowNumber,
        reason: `"${term}" has no definition in the second column.`,
      });
      return;
    }

    const key = dedupeKey(term);
    if (seen.has(key)) {
      preview.skippedDuplicates.push({ row: rowNumber, term });
      return;
    }

    seen.add(key);
    preview.toAdd.push({ term, definition });
  });

  return preview;
}

/**
 * The downloadable template.
 *
 * Built here rather than served from `public/` for two reasons: a static href
 * would need the basePath prefix applied by hand, and the proxy matcher
 * excludes `.csv` from the auth gate, so a file there would be readable
 * without signing in.
 *
 * The standard terms double as worked examples. At least one contains a comma,
 * which makes the quoting rule self-evident to anyone opening the file in a
 * text editor.
 */
export function definitionsTemplateCsv(): string {
  return toCsv([
    ["term", "definition"],
    ...STANDARD_DEFINITIONS.map((d) => [d.term, d.definition]),
  ]);
}
