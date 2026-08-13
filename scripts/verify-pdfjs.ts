// Regression check for the pdfjs-dist text-layer scan that generate-pdf.ts
// depends on (scanTocMarkers). Builds a one-page PDF with pdf-lib, then reads
// its text back through pdfjs-dist's getDocument + getTextContent — the exact
// path TOC page detection uses. Guards against a pdfjs-dist bump silently
// breaking TOC marker scanning.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MARKER = "@@toc:smoke@@";

async function main() {
  // 1. Build a 1-page PDF whose text layer carries the marker.
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 120]);
  page.drawText(MARKER, { x: 20, y: 60, size: 14, font, color: rgb(0, 0, 0) });
  const bytes = await doc.save();

  // 2. Mirror scanTocMarkers: getDocument -> getPage -> getTextContent -> join.
  const loadingTask = getDocument({ data: bytes });
  try {
    const pdf = await loadingTask.promise;
    const first = await pdf.getPage(1);
    const content = await first.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join("");
    if (!text.includes(MARKER)) {
      console.error(`FAIL: marker not found in pdfjs text layer.\n  got: ${JSON.stringify(text)}`);
      process.exit(1);
    }
    console.log(`PASS: pdfjs getDocument + getTextContent round-trip OK.\n  text: ${JSON.stringify(text)}`);
  } finally {
    await loadingTask.destroy();
  }
}

main().catch((err) => {
  console.error("FAIL: pdfjs smoke threw:", err);
  process.exit(1);
});
