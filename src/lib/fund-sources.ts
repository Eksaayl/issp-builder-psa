/**
 * Fund sources — the single list behind every fund-source control (Part III-E
 * project Funding Source, Part IV line-item Fund Source, Cycle View) and the
 * Summary B.2 tables (editor + PDF).
 *
 * These strings are STORED in `.issp` files, not just shown: changing one is a
 * data change. Commit a65fbe2 (2026-09-17) renamed three of them without
 * migrating data, so older files kept "General Appropriations Act (GAA)",
 * "Foreign-Assisted" and "Locally Funded" — values no dropdown offered, which
 * split B.2 into two rows once a file mixed old and new spellings. Any future
 * rename must add the old spelling to LEGACY_SPELLINGS so the load
 * normalization (migrateLegacyDoc) upgrades existing files.
 */

export const FUND_SOURCE_OPTIONS = [
  "General Appropriations Act",
  "Foreign-assisted projects",
  "Locally funded",
  "Other Income Generating Sources",
] as const;

export type FundSource = (typeof FUND_SOURCE_OPTIONS)[number];

/** Default for a new Part IV line item. */
export const DEFAULT_FUND_SOURCE: FundSource = "General Appropriations Act";

const [GAA, FAP, LF, OIGS] = FUND_SOURCE_OPTIONS;

/** Letters only, lower case — "Foreign-Assisted Projects (FAP)" → "foreignassistedprojectsfap". */
const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Every spelling seen in stored data or the template, keyed by `key()`. */
const LEGACY_SPELLINGS: Record<string, FundSource> = {
  [key("General Appropriations Act (GAA)")]: GAA,
  [key("GAA")]: GAA,
  [key("Foreign-Assisted")]: FAP,
  [key("Foreign-Assisted Projects")]: FAP,
  [key("Foreign-Assisted Projects (FAP)")]: FAP,
  [key("FAP")]: FAP,
  [key("Locally Funded")]: LF,
  [key("LF")]: LF,
  [key("OIGS")]: OIGS,
  ...Object.fromEntries(FUND_SOURCE_OPTIONS.map((o) => [key(o), o])),
};

/**
 * The option a stored fund source means, or the value unchanged when it is
 * not a known spelling (never guess — "" and free text stay as they are).
 */
export function canonicalFundSource(value: string): string {
  return LEGACY_SPELLINGS[key(value)] ?? value;
}

const ABBREVIATIONS: Record<FundSource, string> = { [GAA]: "GAA", [FAP]: "FAP", [LF]: "LF", [OIGS]: "OIGS" };

/** The PDF's short form ("GAA"), for any known spelling; unknown values print as stored. */
export function fundSourceAbbr(value: string): string {
  const canonical = canonicalFundSource(value);
  return ABBREVIATIONS[canonical as FundSource] ?? value;
}

/**
 * Sum `amount` per fund source (by canonical value, so old and new spellings
 * share one entry), ordered as the template lists them, then any other values
 * alphabetically.
 */
export function groupByFundSource<T extends { fundSource: string }>(
  lines: T[],
  amount: (line: T) => number
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const l of lines) {
    const fs = canonicalFundSource(l.fundSource || "Unspecified");
    sums.set(fs, (sums.get(fs) ?? 0) + amount(l));
  }
  const rank = (fs: string) => {
    const i = (FUND_SOURCE_OPTIONS as readonly string[]).indexOf(fs);
    return i === -1 ? FUND_SOURCE_OPTIONS.length : i;
  };
  return new Map([...sums.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)));
}
