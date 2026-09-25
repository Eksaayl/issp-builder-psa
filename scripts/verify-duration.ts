// Verify Part III-E duration logic: parsing, formatting, and the
// single-year → year-range mode switch (the switch used to collapse back
// to a single year because parsed.end === parsed.start passes the >= guard).
// Run: npx tsx scripts/verify-duration.ts   (expect: ALL CHECKS PASSED)
import assert from "node:assert";
import {
  yearsBetween,
  formatDuration,
  parseDuration,
  endYearForRangeMode,
  coveredYears,
  durationCoversYear,
} from "../src/lib/duration";

const planYears = yearsBetween(2026, 2028);

// Parsing
assert.deepEqual(parseDuration("2026–2027", planYears), {
  valid: true, mode: "range", start: "2026", end: "2027",
}, "en-dash range parses");
assert.deepEqual(parseDuration("2026-2027", planYears), {
  valid: true, mode: "range", start: "2026", end: "2027",
}, "hyphen range parses");
assert.deepEqual(parseDuration("2026", planYears), {
  valid: true, mode: "single", start: "2026", end: "2026",
}, "single year parses with end === start");
assert.equal(parseDuration("", planYears).valid, true, "empty is valid (unset)");
assert.equal(parseDuration("2019–2021", planYears).valid, false, "out-of-period range is invalid");

// Formatting
assert.equal(formatDuration("2026", "2026"), "2026", "equal years collapse to single");
assert.equal(formatDuration("2026", "2028"), "2026–2028", "range formats with en dash");

// Mode switch: the regression case — switching "Single year" → "Year range"
// on a single-year value must yield a real range (end = plan's final year),
// not collapse back to the same single year.
const single = parseDuration("2026", planYears);
assert.equal(endYearForRangeMode(single, planYears), "2028",
  "switching a single-year value to range must extend the end to the plan's final year");

// Re-selecting range on an existing range keeps its end
const range = parseDuration("2026–2027", planYears);
assert.equal(endYearForRangeMode(range, planYears), "2027",
  "switching an existing range to range keeps the current end");

// A mid-period single year extends to the plan end, start preserved
const mid = parseDuration("2027", planYears);
assert.equal(endYearForRangeMode(mid, planYears), "2028",
  "mid-period single year extends to plan end");
assert.equal(formatDuration(mid.start, endYearForRangeMode(mid, planYears)), "2027–2028",
  "composed switch result for mid-period single year");

// Coverage (Part IV year filtering)
assert.deepEqual(coveredYears("2026", planYears), ["2026"], "single year covers itself only");
assert.deepEqual(coveredYears("2026–2027", planYears), ["2026", "2027"], "range covers its span");
assert.deepEqual(coveredYears("", planYears), planYears, "unset covers the whole plan");
assert.equal(durationCoversYear("2026", "2026", planYears), true, "2026 covered by 2026");
assert.equal(durationCoversYear("2026", "2027", planYears), false, "2027 not covered by single 2026");
assert.equal(durationCoversYear("2026–2027", "2028", planYears), false, "2028 not covered by 2026–2027");
assert.equal(durationCoversYear("2026–2028", "2028", planYears), true, "2028 covered by full range");

console.log("ALL CHECKS PASSED");
