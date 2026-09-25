// Duration parsing/formatting for Part III-E project durations.
// Shared by the internal (E1) and cross-agency (E2 re-export) project forms.

export type DurationMode = "single" | "range";

export function yearsBetween(startYear: number, endYear: number): string[] {
  const start = Math.min(startYear, endYear);
  const end = Math.max(startYear, endYear);
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
}

export function formatDuration(start: string, end?: string): string {
  return end && end !== start ? `${start}–${end}` : start;
}

export function parseDuration(value: string, planYears: string[]) {
  const match = value.trim().match(/^(\d{4})(?:\s*[-–]\s*(\d{4}))?$/);
  const firstYear = planYears[0] ?? "";
  const lastYear = planYears[planYears.length - 1] ?? firstYear;

  if (!match) {
    return {
      valid: value.trim() === "",
      mode: "range" as DurationMode,
      start: firstYear,
      end: lastYear,
    };
  }

  const parsedStart = match[1];
  const parsedEnd = match[2] ?? parsedStart;
  const start = planYears.includes(parsedStart) ? parsedStart : firstYear;
  const end = planYears.includes(parsedEnd) ? parsedEnd : start;
  const valid = planYears.includes(parsedStart) && planYears.includes(parsedEnd) && Number(end) >= Number(start);

  return {
    valid,
    mode: end !== start ? "range" as DurationMode : "single" as DurationMode,
    start,
    end,
  };
}

/** End year to use when the picker switches to "Year range".
 * Keeps the current end when the value already spans years; otherwise
 * (single-year value, or a legacy out-of-order range) defaults to the
 * plan's final year — otherwise formatDuration would collapse the
 * start === end case straight back to a single year. */
export function endYearForRangeMode(
  parsed: ReturnType<typeof parseDuration>,
  planYears: string[],
): string {
  const spansYears = parsed.mode === "range" && Number(parsed.end) >= Number(parsed.start);
  return spansYears ? parsed.end : planYears[planYears.length - 1];
}

/** Years of the plan a duration value covers. Invalid values cover the
 * whole plan (the picker's unset default spans all years). */
export function coveredYears(value: string, planYears: string[]): string[] {
  const parsed = parseDuration(value, planYears);
  if (!parsed.valid) return planYears.slice();
  const startIdx = planYears.indexOf(parsed.start);
  const endIdx = planYears.indexOf(parsed.end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return planYears.slice();
  return planYears.slice(startIdx, endIdx + 1);
}

/** True when the project's duration includes the given plan year. */
export function durationCoversYear(value: string, year: string, planYears: string[]): boolean {
  return coveredYears(value, planYears).includes(year);
}
