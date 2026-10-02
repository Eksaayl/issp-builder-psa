// Hidden, per-browser PDF style switch. Not surfaced in the UI: open the editor
// once with ?pdfstyle=aptos14 to turn it on (remembered in localStorage), and
// ?pdfstyle=default to turn it off. The export request carries it as ?style=.

export type PdfStyle = "default" | "aptos14";

const STORAGE_KEY = "issp-pdf-style";

export function isPdfStyle(value: unknown): value is PdfStyle {
  return value === "default" || value === "aptos14";
}

/** Apply a ?pdfstyle= URL flag (if any) to storage, then return the active style. */
export function syncPdfStyleFromUrl(): PdfStyle {
  if (typeof window === "undefined") return "default";
  try {
    const flag = new URLSearchParams(window.location.search).get("pdfstyle");
    if (flag === "default") localStorage.removeItem(STORAGE_KEY);
    else if (isPdfStyle(flag)) localStorage.setItem(STORAGE_KEY, flag);
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPdfStyle(stored) ? stored : "default";
  } catch {
    return "default";
  }
}
