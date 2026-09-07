"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { previewDefinitionsCsv } from "@/lib/definitions-csv";
import type { DefinitionTerm } from "@/lib/store/types";

const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** Validate before reading, in the shape the diagram upload gate already uses. */
function getCsvUploadError(file: File): string | null {
  if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
    return "Choose a .csv file, or a spreadsheet saved as CSV.";
  }
  if (file.size > MAX_CSV_BYTES) {
    return "Use a file smaller than 2 MB.";
  }
  return null;
}

export function ImportDefinitionsDialog({
  open,
  onClose,
  terms,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  terms: DefinitionTerm[];
  onImport: (rows: { term: string; definition: string }[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  // Pure preview: recomputed from the file text and the current terms, and
  // nothing is written until Add is pressed.
  const preview = useMemo(
    () => (text === null ? null : previewDefinitionsCsv(text, terms)),
    [text, terms],
  );

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset first: without it, picking the same file twice never re-fires.
    e.target.value = "";
    if (!file) return;

    const error = getCsvUploadError(file);
    if (error) {
      setFileName(file.name);
      setText(null);
      setReadError(error);
      return;
    }

    setReading(true);
    try {
      const contents = await file.text();
      setFileName(file.name);
      setText(contents);
      setReadError(null);
    } catch {
      setFileName(file.name);
      setText(null);
      setReadError("Could not read the file. Make sure it is a valid CSV.");
    } finally {
      setReading(false);
    }
  }

  function resetAndClose() {
    setFileName(null);
    setText(null);
    setReadError(null);
    setReading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }

  function handleApply() {
    if (!preview || preview.toAdd.length === 0) return;
    onImport(preview.toAdd);
    resetAndClose();
  }

  const canApply = !reading && !!preview && preview.toAdd.length > 0;

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && resetAndClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import terms from CSV</DialogTitle>
          <DialogDescription>
            Two columns: the term, then its definition. Terms already in your list are
            skipped, so nothing you have written is overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={handleSelect}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="gap-2"
              disabled={reading}
              onClick={() => fileInputRef.current?.click()}
            >
              {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {fileName ? "Choose a different file" : "Choose CSV file"}
            </Button>
            {fileName && (
              <span className="min-w-0 truncate text-sm text-muted-foreground">{fileName}</span>
            )}
          </div>

          {readError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {readError}
            </p>
          )}

          {preview && (
            <div className="space-y-3 rounded-lg border px-4 py-3">
              <p className="text-sm font-medium">
                {preview.toAdd.length === 0
                  ? "Nothing to add from this file."
                  : `${preview.toAdd.length} ${preview.toAdd.length === 1 ? "term" : "terms"} will be added.`}
              </p>

              {preview.toAdd.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                  {preview.toAdd.map((t) => (
                    <li key={t.term} className="truncate">
                      <span className="font-medium text-foreground">{t.term}</span> — {t.definition}
                    </li>
                  ))}
                </ul>
              )}

              {preview.skippedDuplicates.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {preview.skippedDuplicates.length} already in your list, skipped:{" "}
                  {preview.skippedDuplicates.map((d) => d.term).join(", ")}
                </p>
              )}

              {preview.invalid.length > 0 && (
                <div className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
                  <p className="mb-1 flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {preview.invalid.length} {preview.invalid.length === 1 ? "row" : "rows"} skipped
                  </p>
                  <ul className="space-y-0.5 leading-snug">
                    {preview.invalid.map((r) => (
                      <li key={r.row}>
                        Row {r.row}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button disabled={!canApply} onClick={handleApply}>
            {preview && preview.toAdd.length > 0
              ? `Add ${preview.toAdd.length} ${preview.toAdd.length === 1 ? "term" : "terms"}`
              : "Add terms"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
