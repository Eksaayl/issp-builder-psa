/**
 * A small RFC 4180 CSV reader and writer.
 *
 * Hand-rolled rather than pulled from npm: the project pins a large `overrides`
 * block and an `allowScripts` allowlist, so it is deliberately cautious about
 * new dependencies, and the format we need is small enough to own.
 *
 * The awkward cases here are not hypothetical -- every one of them is something
 * Excel actually produces.
 */

const DELIMITERS = [",", ";", "\t"] as const;

/**
 * Guess the delimiter from the first line.
 *
 * Excel writes semicolons under locales where the comma is the decimal
 * separator, and copying a range out of a spreadsheet yields tabs. Without
 * this, either case parses as a single column and the import fails in a way
 * that looks like the user's fault.
 *
 * Counting happens outside quotes, so a comma inside a quoted definition does
 * not make the file look comma-delimited when it is really semicolon-delimited.
 */
function sniffDelimiter(text: string): string {
  let best = ",";
  let bestCount = 0;
  for (const candidate of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        quoted = !quoted;
      } else if (!quoted && (ch === "\n" || ch === "\r")) {
        break; // first line only
      } else if (!quoted && ch === candidate) {
        count++;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse CSV text into rows of cells.
 *
 * Handles a leading UTF-8 BOM, CRLF or LF endings, quoted fields containing the
 * delimiter or a newline, and `""` as an escaped quote. Never throws: badly
 * quoted input degrades into cells rather than an exception, and the caller
 * decides what is usable.
 */
export function parseCsv(text: string): string[][] {
  // Excel prefixes a BOM. Left in place it becomes part of the first header
  // cell, so "term" stops matching and the header is treated as data.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const delimiter = sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'; // escaped quote
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // Swallow CR; the LF that follows ends the row. A lone CR also ends it.
      if (text[i + 1] !== "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  // Trailing cell, unless the file ended on a newline with nothing after it.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop rows that are entirely blank -- a trailing newline is normal, and a
  // stray blank line in the middle should not read as an empty term.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Quote a cell only when it would otherwise change the shape of the row. */
function quoteCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Serialise rows to CSV text.
 *
 * CRLF endings, because the primary consumer is Excel.
 */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(quoteCell).join(",")).join("\r\n");
}
