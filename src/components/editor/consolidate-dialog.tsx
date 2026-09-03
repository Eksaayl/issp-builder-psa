"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  FolderOpen,
  Loader2,
  MinusCircle,
  PlusCircle,
  Upload,
  X,
} from "lucide-react";
import { useIsspStore, parseScopedIsspFile } from "@/lib/store";
import { consolidate, type ScalarConflict } from "@/lib/scope/consolidate";
import { resolveScope, SHARED_TABLE_PATHS } from "@/lib/scope/paths";
import { SECTION_FIELDS } from "@/lib/section-fields";
import {
  ANNEX_SECTIONS,
  FRONT_MATTER_SECTIONS,
  PARTS,
  type SectionDef,
} from "@/lib/sections";
import type { IsspDocument } from "@/lib/store/types";
import type { OfficeIdentity } from "@/lib/scope/types";
import { toast } from "sonner";

// ─── Section label lookup (id → label) ───────────────────────────────────────

const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  [...FRONT_MATTER_SECTIONS, ...PARTS.flatMap((p) => p.sections), ...ANNEX_SECTIONS].map(
    (s: SectionDef) => [s.id, s.label]
  )
);

function sectionLabel(sectionId: string): string {
  return SECTION_LABEL[sectionId] ?? sectionId;
}

function fieldLabel(sectionId: string, fieldKey: string): string {
  return SECTION_FIELDS[sectionId]?.fields.find((f) => f.key === fieldKey)?.label ?? fieldKey;
}

// ─── Preview model ────────────────────────────────────────────────────────────

/**
 * One owned leaf field inside a file, classified by what consolidate() will do
 * to it. Mirrors the merge contract in src/lib/scope/consolidate.ts.
 */
type FieldAction =
  | { kind: "shared-table"; sectionId: string; fieldKey: string; rowCount: number }
  | { kind: "list-contribute"; sectionId: string; fieldKey: string; itemCount: number; flagged: boolean }
  | { kind: "scalar-set"; sectionId: string; fieldKey: string; value: unknown; inConflict: boolean };

interface FileSummary {
  fileName: string;
  office: OfficeIdentity;
  /** Owned editable paths at any level (area / section / field). */
  editable: string[];
  actions: FieldAction[];
}

interface Preview {
  summaries: FileSummary[];
  rejected: string[];
  reviewFlags: string[];
  scalarConflicts: ScalarConflict[];
}

// ─── Pure preview computation ─────────────────────────────────────────────────

/**
 * Build a per-file preview by classifying each owned leaf field. Pure: reads
 * `currentDoc` and `parsedDocs` without mutating either, and never touches the
 * store. The dialog uses this to show what Apply will do; only Apply mutates.
 *
 * Classification cross-references `consolidate()`'s own output so the dialog
 * and the merge engine can't drift:
 *  - a section appears in `reviewFlags` ⇒ list contributions on it are "flagged"
 *  - a `${sid}.${fk}` appears in `scalarConflicts` ⇒ that scalar is "in conflict"
 */
function computePreview(currentDoc: IsspDocument, parsedDocs: IsspDocument[]): Preview {
  const merge = consolidate(currentDoc, parsedDocs);
  const flaggedSections = new Set(merge.reviewFlags);
  const conflictKeys = new Set(
    merge.scalarConflicts.map((c) => `${c.sectionId}.${c.fieldKey}`)
  );

  const summaries: FileSummary[] = parsedDocs.map((d) => {
    const office = d.editScope!.office;
    const editableFields = resolveScope(d.editScope!.editable).editableFields;
    const actions: FieldAction[] = [];

    for (const key of editableFields) {
      const dot = key.indexOf(".");
      const sid = key.slice(0, dot);
      const fk = key.slice(dot + 1);

      // Shared-table replace-by-office (stakeholders, Annex 1). Count rows in
      // the file stamped with this office's id — that's exactly what
      // consolidate will replace.
      const isSharedTable =
        SHARED_TABLE_PATHS.has(key) || SHARED_TABLE_PATHS.has(sid);
      if (isSharedTable) {
        if (sid === "annexes/annex1") {
          const rowCount = (d.annexedOffices ?? []).filter(
            (o) => o.officeId === office.id
          ).length;
          actions.push({ kind: "shared-table", sectionId: sid, fieldKey: fk, rowCount });
          continue;
        }
        // Stakeholders row count for this office.
        const rows = ((d.part1 as unknown as Record<string, unknown>)[fk] as
          | { officeId?: string }[]
          | undefined) ?? [];
        const rowCount = rows.filter((r) => r.officeId === office.id).length;
        actions.push({ kind: "shared-table", sectionId: sid, fieldKey: fk, rowCount });
        continue;
      }

      // Annex 1 doesn't reach here; remaining fields live on a Part.
      const partKey = SECTION_FIELDS[sid]?.partKey;
      if (!partKey) continue; // unknown section → contributes nothing (skipped)
      const src = d[partKey] as unknown as Record<string, unknown>;
      const value = src[fk];

      if (Array.isArray(value)) {
        // List-valued field — items unioned if multi-owner (flagged), else
        // overlaid wholesale. Either way the user sees "contribute N items".
        actions.push({
          kind: "list-contribute",
          sectionId: sid,
          fieldKey: fk,
          itemCount: value.length,
          flagged: flaggedSections.has(sid),
        });
        continue;
      }

      // Scalar field — either a clean overlay or a surfaced conflict.
      actions.push({
        kind: "scalar-set",
        sectionId: sid,
        fieldKey: fk,
        value,
        inConflict: conflictKeys.has(key),
      });
    }

    return { fileName: d.editScope!.office.displayLabel, office, editable: d.editScope!.editable, actions };
  });

  return {
    summaries,
    rejected: [],
    reviewFlags: merge.reviewFlags,
    scalarConflicts: merge.scalarConflicts,
  };
}

// ─── Helpers for rendering values ─────────────────────────────────────────────

function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  // Objects/arrays surface as a compact JSON snippet — these rarely appear as
  // scalars, but definitions is a single leaf object that can reach here when
  // an office owns it.
  try {
    return JSON.stringify(value);
  } catch {
    return "(complex value)";
  }
}

function officeLabel(office: OfficeIdentity): string {
  return office.displayLabel || office.name || office.id;
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function ConsolidateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { doc, consolidateFiles } = useIsspStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parsedDocs, setParsedDocs] = useState<IsspDocument[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  // User overrides for surfaced scalar conflicts. Defaults are memoized from
  // the preview (first office's value) and merged in below; only the user's
  // explicit picks live here, so re-renders don't clobber their choices.
  const [resolutions, setResolutions] = useState<Record<string, unknown>>({});
  const [applying, setApplying] = useState(false);

  // Pure preview: recompute every time the parsed docs change. The dialog never
  // mutates `doc` here — `consolidate()` clones the master internally.
  const preview = useMemo<Preview | null>(() => {
    if (!doc || parsedDocs.length === 0) return null;
    return computePreview(doc, parsedDocs);
  }, [doc, parsedDocs]);

  // Default each conflict to the first office's value (an explicit choice the
  // user can override). Merging defaults + user overrides here — rather than
  // seeding them into state via an effect — avoids cascading renders and keeps
  // the user's pick stable across preview recomputations.
  const effectiveResolutions = useMemo<Record<string, unknown>>(() => {
    if (!preview || preview.scalarConflicts.length === 0) return resolutions;
    const defaults: Record<string, unknown> = {};
    for (const c of preview.scalarConflicts) {
      if (c.values.length > 0) defaults[`${c.sectionId}.${c.fieldKey}`] = c.values[0].value;
    }
    return { ...defaults, ...resolutions };
  }, [preview, resolutions]);

  // Reset transient state when the dialog closes — invoked from every close
  // path (Cancel, Apply success, overlay/Escape), so the next open starts fresh
  // without a setState-in-effect.
  function resetAndClose() {
    setFiles([]);
    setParsing(false);
    setParsedDocs([]);
    setRejected([]);
    setResolutions({});
    setApplying(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }

  async function handleSelect(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    const next = Array.from(selected);
    setFiles(next);
    setParsing(true);
    setParsedDocs([]);
    setRejected([]);
    setResolutions({});

    const ok: IsspDocument[] = [];
    const bad: string[] = [];
    for (const f of next) {
      const r = await parseScopedIsspFile(f);
      if (r.success) ok.push(r.doc);
      else bad.push(r.error);
    }
    setParsedDocs(ok);
    setRejected(bad);
    setParsing(false);
  }

  function clearFiles() {
    setFiles([]);
    setParsedDocs([]);
    setRejected([]);
    setResolutions({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pickResolution(sectionId: string, fieldKey: string, value: unknown) {
    setResolutions((prev) => ({ ...prev, [`${sectionId}.${fieldKey}`]: value }));
  }

  async function handleApply() {
    if (!doc || !preview || applying) return;
    if (preview.rejected.length > 0) return;
    if (files.length === 0) return;
    const chosen = effectiveResolutions;
    // Require an explicit pick (default counts) for every surfaced conflict —
    // Apply is the one place a choice is unavoidable.
    const allResolved = preview.scalarConflicts.every(
      (c) => `${c.sectionId}.${c.fieldKey}` in chosen
    );
    if (!allResolved) {
      toast.error("Resolve every conflict before applying.");
      return;
    }

    setApplying(true);
    try {
      const result = await consolidateFiles(files, chosen);
      if (result.success) {
        const flagCount = result.reviewFlags.length;
        const parts: string[] = [
          `Merged ${preview.summaries.length} file${preview.summaries.length === 1 ? "" : "s"}.`,
        ];
        if (flagCount > 0)
          parts.push(`${flagCount} section${flagCount === 1 ? "" : "s"} flagged for review.`);
        toast.success(parts.join(" "));
        resetAndClose();
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      console.error("Consolidate failed:", err);
      toast.error("Could not apply the merge. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  if (!doc) return null;

  const hasFiles = files.length > 0;
  const hasParsed = parsedDocs.length > 0;
  const hasRejections = rejected.length > 0;
  const canApply =
    !!preview &&
    !parsing &&
    !applying &&
    !hasRejections &&
    hasParsed &&
    preview.summaries.length > 0 &&
    preview.scalarConflicts.every((c) => `${c.sectionId}.${c.fieldKey}` in effectiveResolutions);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Consolidate returned files</DialogTitle>
          <DialogDescription>
            Select one or more returned scoped <code>.issp</code> files. The review screen shows
            what each file will overlay, replace, flag, or conflict on before you apply the merge.
            Non-scoped files are rejected.
          </DialogDescription>
        </DialogHeader>

        {/* File picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".issp,application/json"
          multiple
          className="hidden"
          onChange={(e) => handleSelect(e.target.files)}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing || applying}
          >
            <FolderOpen className="h-4 w-4" />
            {hasFiles ? `Select different files (${files.length})` : "Select returned files…"}
          </Button>
          {hasFiles && !parsing && !applying && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFiles}
              className="text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          {parsing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reading files…
            </span>
          )}
        </div>

        {/* Body — preview, rejections, conflicts */}
        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
          {hasFiles && (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <Upload className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[14rem]">{f.name}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Rejections — named, never silently dropped */}
          {hasRejections && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-1 text-destructive">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <FileWarning className="h-4 w-4 shrink-0" />
                {rejected.length} file{rejected.length === 1 ? "" : "s"} rejected
              </div>
              <ul className="space-y-0.5 text-xs leading-snug">
                {rejected.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
              <p className="text-[11px] text-destructive/80">
                Fix or remove the rejected file{rejected.length === 1 ? "" : "s"}, then re-select.
              </p>
            </div>
          )}

          {preview && (
            <>
              {/* Per-file summary */}
              <ul className="space-y-2">
                {preview.summaries.map((s, idx) => (
                  <li
                    key={`${s.office.id}-${idx}`}
                    className="rounded-lg border border-border bg-card/40 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {officeLabel(s.office)}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 truncate">
                          Edits: {s.editable.join(", ") || "(no editable paths)"}
                        </p>
                      </div>
                      {s.actions.length === 0 && (
                        <span className="text-[11px] italic text-muted-foreground/70">
                          No fields contributed
                        </span>
                      )}
                    </div>
                    {s.actions.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs">
                        {s.actions.map((a, ai) => (
                          <li key={ai} className="flex items-start gap-1.5">
                            <ActionIcon action={a} />
                            <span className="text-muted-foreground leading-snug">
                              <ActionLine action={a} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>

              {/* Scalar conflicts — explicit pick, never silently discard */}
              {preview.scalarConflicts.length > 0 && (
                <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Resolve {preview.scalarConflicts.length} conflict{preview.scalarConflicts.length === 1 ? "" : "s"}
                  </div>
                  <p className="text-[11px] leading-snug text-warning/80">
                    Each field below was written differently by two or more offices. Pick which value
                    to keep — the section is flagged for review either way.
                  </p>
                  <ul className="space-y-2">
                    {preview.scalarConflicts.map((c) => {
                      const key = `${c.sectionId}.${c.fieldKey}`;
                      const chosen = effectiveResolutions[key];
                      return (
                        <li key={key} className="rounded-md border border-warning-border/60 bg-card/70 px-2.5 py-2">
                          <p className="text-xs font-medium text-foreground">
                            {sectionLabel(c.sectionId)} · {fieldLabel(c.sectionId, c.fieldKey)}
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {c.values.map((v) => {
                              const id = `${key}::${v.officeId}`;
                              return (
                                <li key={v.officeId} className="flex items-center gap-2 text-xs">
                                  <input
                                    type="radio"
                                    id={id}
                                    name={key}
                                    checked={chosen === v.value}
                                    onChange={() => pickResolution(c.sectionId, c.fieldKey, v.value)}
                                    className="h-3.5 w-3.5 align-middle"
                                  />
                                  <label htmlFor={id} className="flex-1 min-w-0 cursor-pointer">
                                    <span className="font-medium text-muted-foreground">
                                      {officeLabel(
                                        preview.summaries.find((s) => s.office.id === v.officeId)?.office ?? {
                                          id: v.officeId,
                                          name: v.officeId,
                                          displayLabel: v.officeId,
                                        }
                                      )}
                                      :
                                    </span>{" "}
                                    <span className="text-foreground">{displayValue(v.value)}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Review flags — informational; Task 11 surfaces them in the editor */}
              {preview.reviewFlags.length > 0 && (
                <div className="rounded-lg border border-info-border bg-info-bg px-3 py-2.5 space-y-1 text-info">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {preview.reviewFlags.length} section{preview.reviewFlags.length === 1 ? "" : "s"} will be flagged for review
                  </div>
                  <p className="text-[11px] leading-snug text-info/80">
                    {preview.reviewFlags.map(sectionLabel).join(", ")}
                  </p>
                </div>
              )}

              {/* Clean-merge success badge */}
              {preview.scalarConflicts.length === 0 &&
                preview.reviewFlags.length === 0 &&
                preview.summaries.length > 0 && (
                  <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 flex items-center gap-1.5 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    No conflicts or flags — clean merge.
                  </div>
                )}
            </>
          )}

          {!hasFiles && !parsing && (
            <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground/70">
              Select one or more returned <code>.issp</code> files to preview the merge.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!canApply}>
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Applying…
              </>
            ) : (
              <>Apply merge</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Action-line renderers ────────────────────────────────────────────────────

function ActionIcon({ action }: { action: FieldAction }) {
  if (action.kind === "shared-table")
    return <PlusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />;
  if (action.kind === "list-contribute" && action.flagged)
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />;
  if (action.kind === "scalar-set" && action.inConflict)
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />;
  if (action.kind === "list-contribute" && action.itemCount === 0)
    return <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />;
  return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />;
}

function ActionLine({ action }: { action: FieldAction }) {
  if (action.kind === "shared-table") {
    if (action.sectionId === "annexes/annex1") {
      return (
        <span>
          Replace <strong className="text-foreground">{action.rowCount}</strong> Annex 1
          entr{action.rowCount === 1 ? "y" : "ies"} for this office
        </span>
      );
    }
    return (
      <span>
        Replace <strong className="text-foreground">{action.rowCount}</strong> stakeholder
        row{action.rowCount === 1 ? "" : "s"} for this office
      </span>
    );
  }
  if (action.kind === "list-contribute") {
    if (action.itemCount === 0) {
      return (
        <span>
          {sectionLabel(action.sectionId)} · {fieldLabel(action.sectionId, action.fieldKey)}: no items
        </span>
      );
    }
    return (
      <span>
        {sectionLabel(action.sectionId)} · {fieldLabel(action.sectionId, action.fieldKey)}: contribute{" "}
        <strong className="text-foreground">{action.itemCount}</strong> item
        {action.itemCount === 1 ? "" : "s"}
        {action.flagged && (
          <em className="not-italic font-medium text-warning"> — unioned with another office, FLAGGED</em>
        )}
      </span>
    );
  }
  // scalar-set
  return (
    <span>
      {sectionLabel(action.sectionId)} · {fieldLabel(action.sectionId, action.fieldKey)}:{" "}
      <strong className="text-foreground">{displayValue(action.value)}</strong>
      {action.inConflict && (
        <em className="not-italic font-medium text-warning"> — in conflict, see below</em>
      )}
    </span>
  );
}
