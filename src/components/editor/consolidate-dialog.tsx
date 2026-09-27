"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileWarning, FolderOpen, Link2Off, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useIsspStore, parseScopedIsspFile } from "@/lib/store";
import { conflictKey, type ScalarConflict } from "@/lib/scope/consolidate";
import {
  applyReviewDecisions,
  buildMergeReview,
  findBrokenLinks,
  rowName,
  type ParsedScopedFile,
  type ReviewChange,
} from "@/lib/scope/merge-review";
import { SECTION_FIELDS } from "@/lib/section-fields";
import { ANNEX_SECTIONS, FRONT_MATTER_SECTIONS, PARTS } from "@/lib/sections";
import { php } from "@/lib/utils";
import { ChangeRow } from "./merge-review/change-row";
import { ConflictCard } from "./merge-review/conflict-card";
import { lineItemCost, signedPhp } from "./merge-review/format";

// ─── Sections in document order ───────────────────────────────────────────────

const SECTIONS = [...FRONT_MATTER_SECTIONS, ...PARTS.flatMap((p) => p.sections), ...ANNEX_SECTIONS];
const SECTION_ORDER = SECTIONS.map((s) => s.id);
const SECTION_LABEL: Record<string, string> = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));
const sectionLabel = (id: string) => SECTION_LABEL[id] ?? id;

/** Nested Part IV sub-field conflicts (project-keyed merge) — human labels. */
function conflictFieldLabel(c: ScalarConflict): string {
  const sub = c.fieldKey.match(/^year(\d)\.(officeProductivity|continuingCosts)$/);
  if (sub) return `${sub[2] === "officeProductivity" ? "Office Productivity" : "Continuing Costs"} (Year ${sub[1]})`;
  return SECTION_FIELDS[c.sectionId]?.fields.find((f) => f.key === c.fieldKey)?.label ?? c.fieldKey;
}

function conflictLabel(c: ScalarConflict): string {
  const base = `${sectionLabel(c.sectionId)} › ${conflictFieldLabel(c)}`;
  if (c.rowId === undefined) return base;
  const named = typeof c.master === "object" ? c.master : c.values.find((v) => typeof v.value === "object")?.value;
  return `${base} › ${rowName(named)}`;
}

interface LoadedFile {
  file: File;
  parsed: ParsedScopedFile;
}

/** Part IV bucket totals (master vs result) from the section's line-item rows. */
function budgetTotals(changes: ReviewChange[], rejected: Set<string>) {
  const buckets = new Map<string, { before: number; after: number }>();
  for (const c of changes) {
    if (!c.rowId) continue;
    const bucket = c.label.split(" › ").slice(1, -1).join(" › ");
    const t = buckets.get(bucket) ?? { before: 0, after: 0 };
    const beforeTotal = lineItemCost(c.before)?.total ?? 0;
    t.before += beforeTotal;
    t.after += rejected.has(c.id) ? beforeTotal : lineItemCost(c.after)?.total ?? 0;
    buckets.set(bucket, t);
  }
  return [...buckets.entries()].filter(([, t]) => t.before !== 0 || t.after !== 0);
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function ConsolidateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { doc, consolidateFiles } = useIsspStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState<LoadedFile[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [rejectedChanges, setRejectedChanges] = useState<Set<string>>(new Set());
  const [resolutions, setResolutions] = useState<Record<string, unknown>>({});
  const [officeFilter, setOfficeFilter] = useState<Set<string>>(new Set());
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [applying, setApplying] = useState(false);

  const files = useMemo(() => loaded.map((l) => l.parsed), [loaded]);
  const inReview = !!doc && loaded.length > 0 && rejectedFiles.length === 0 && !parsing;

  const review = useMemo(() => (doc && inReview ? buildMergeReview(doc, files) : null), [doc, files, inReview]);
  // The same pure function Apply uses — so what the review shows is what lands.
  const result = useMemo(
    () => (doc && review ? applyReviewDecisions(doc, files, { rejected: rejectedChanges, resolutions }) : null),
    [doc, review, files, rejectedChanges, resolutions]
  );
  const brokenLinks = useMemo(() => (doc && result ? findBrokenLinks(result.doc, doc) : []), [doc, result]);

  const officeName = useMemo(() => {
    const names = new Map(files.map((f) => [f.doc.editScope!.office.id, f.doc.editScope!.office.displayLabel || f.doc.editScope!.office.name]));
    return (id: string) => names.get(id) ?? id;
  }, [files]);

  function reset() {
    setLoaded([]);
    setSelectedCount(0);
    setParsing(false);
    setRejectedFiles([]);
    setRejectedChanges(new Set());
    setResolutions({});
    setOfficeFilter(new Set());
    setShowUnchanged(false);
    setApplying(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function resetAndClose() {
    reset();
    onClose();
  }

  async function handleSelect(selected: FileList | null) {
    if (!doc || !selected || selected.length === 0) return;
    const next = Array.from(selected);
    reset();
    setSelectedCount(next.length);
    setParsing(true);
    const ok: LoadedFile[] = [];
    const bad: string[] = [];
    for (const f of next) {
      const r = await parseScopedIsspFile(f, doc);
      if (r.success) ok.push({ file: f, parsed: { doc: r.doc, sourceSchemaVersion: r.sourceSchemaVersion } });
      else bad.push(r.error);
    }
    setLoaded(ok);
    setRejectedFiles(bad);
    setParsing(false);
  }

  function toggleRejected(id: string, reject: boolean) {
    setRejectedChanges((prev) => {
      const next = new Set(prev);
      if (reject) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleOffice(id: string) {
    setOfficeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const unresolved = review ? review.conflicts.filter((c) => !(conflictKey(c) in resolutions)) : [];
  const realChanges = review ? review.changes.filter((c) => c.kind !== "unchanged") : [];
  const canApply = !!review && unresolved.length === 0 && !applying;

  async function handleApply() {
    if (!canApply) return;
    setApplying(true);
    try {
      const r = await consolidateFiles(loaded.map((l) => l.file), { rejected: rejectedChanges, resolutions });
      if (r.success) {
        const parts = [`Merged ${loaded.length} file${loaded.length === 1 ? "" : "s"}.`];
        if (r.reviewFlags.length > 0) parts.push(`${r.reviewFlags.length} section${r.reviewFlags.length === 1 ? "" : "s"} flagged for review.`);
        toast.success(parts.join(" "));
        resetAndClose();
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      console.error("Consolidate failed:", err);
      toast.error("Could not apply the merge. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  if (!doc) return null;

  // ── What the main pane shows ──
  const matchesOffice = (ids: string[]) => officeFilter.size === 0 || ids.some((id) => officeFilter.has(id));
  const visibleChanges = (review?.changes ?? []).filter(
    (c) => (showUnchanged || c.kind !== "unchanged") && (officeFilter.size === 0 || matchesOffice(c.officeIds))
  );
  const visibleConflicts = (review?.conflicts ?? []).filter((c) => matchesOffice(c.values.map((v) => v.officeId)));
  const sectionIds = SECTION_ORDER.filter(
    (sid) => visibleChanges.some((c) => c.sectionId === sid) || visibleConflicts.some((c) => c.sectionId === sid)
  );
  const countBySection = (sid: string) =>
    realChanges.filter((c) => c.sectionId === sid).length + (review?.conflicts ?? []).filter((c) => c.sectionId === sid).length;

  const jump = (elementId: string | undefined) => {
    if (elementId) document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const firstOfKind = (kind: ReviewChange["kind"]) => realChanges.find((c) => c.kind === kind);
  const summary: { label: string; count: number; target?: string; tone: string }[] = review
    ? [
        { label: "unresolved conflict", count: unresolved.length, target: unresolved[0] && `conflict-${conflictKey(unresolved[0])}`, tone: "text-warning" },
        { label: "overwrite", count: realChanges.filter((c) => c.kind === "overwritten" || c.kind === "replaced-row").length, target: (firstOfKind("overwritten") ?? firstOfKind("replaced-row")) && `change-${(firstOfKind("overwritten") ?? firstOfKind("replaced-row"))!.id}`, tone: "text-warning" },
        { label: "clear", count: realChanges.filter((c) => c.kind === "cleared").length, target: firstOfKind("cleared") && `change-${firstOfKind("cleared")!.id}`, tone: "text-destructive" },
        { label: "removal", count: realChanges.filter((c) => c.kind === "removed-row").length, target: firstOfKind("removed-row") && `change-${firstOfKind("removed-row")!.id}`, tone: "text-destructive" },
        { label: "broken link", count: brokenLinks.length, target: "review-broken-links", tone: "text-destructive" },
        { label: "file warning", count: review.provenance.length, target: "review-provenance", tone: "text-warning" },
      ]
    : [];

  const upgradedFrom = new Map((review?.upgraded ?? []).map((u) => [u.officeId, u.fromVersion]));
  const provenanceBy = (officeId: string) => (review?.provenance ?? []).filter((w) => w.officeId === officeId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1400px)]"
      >
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <DialogTitle>{inReview ? "Review the merge" : "Consolidate returned files"}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {inReview
                ? "Compare the master with the returned files before anything changes. Nothing is applied until you click Apply merge."
                : "Select the scoped .issp files your offices returned. You review every change before the merge is applied."}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".issp,application/json"
              multiple
              className="hidden"
              onChange={(e) => handleSelect(e.target.files)}
            />
            {inReview && (
              <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={applying}>
                <ArrowLeft className="h-3.5 w-3.5" /> Change files
              </Button>
            )}
            {!inReview && (
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={parsing || applying}>
                <FolderOpen className="h-4 w-4" />
                {selectedCount > 0 ? `Select different files (${selectedCount})` : "Select returned files…"}
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={resetAndClose} disabled={applying}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Step 1: select ── */}
        {!inReview && (
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {parsing && (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading files…
              </p>
            )}
            {rejectedFiles.length > 0 && (
              <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-destructive">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <FileWarning className="h-4 w-4 shrink-0" />
                  {rejectedFiles.length} file{rejectedFiles.length === 1 ? "" : "s"} rejected
                </div>
                <ul className="space-y-0.5 text-xs leading-snug">
                  {rejectedFiles.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
                <p className="text-[11px] text-destructive/80">Fix or remove the rejected file{rejectedFiles.length === 1 ? "" : "s"}, then select the files again.</p>
              </div>
            )}
            {!parsing && selectedCount === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-10 text-center text-xs text-muted-foreground hover:bg-muted/30"
              >
                <Upload className="h-5 w-5" />
                Select one or more returned <code>.issp</code> files to compare them with the master.
              </button>
            )}
          </div>
        )}

        {/* ── Step 2: review ── */}
        {inReview && review && (
          <>
            {/* Summary bar: lead with what needs attention */}
            <div className="space-y-2 border-b bg-muted/20 px-4 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-semibold text-foreground">
                  {realChanges.length} change{realChanges.length === 1 ? "" : "s"} from {loaded.length} file{loaded.length === 1 ? "" : "s"}
                </span>
                {summary.filter((s) => s.count > 0).map((s) => (
                  <button key={s.label} type="button" onClick={() => jump(s.target)} className={`font-medium underline-offset-2 hover:underline ${s.tone}`}>
                    {s.count} {s.label}{s.count === 1 ? "" : "s"}
                  </button>
                ))}
                {summary.every((s) => s.count === 0) && (
                  <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> No conflicts, overwrites, or removals</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Show changes from:</span>
                {loaded.map((l) => {
                  const id = l.parsed.doc.editScope!.office.id;
                  const active = officeFilter.has(id);
                  const warn = provenanceBy(id).length > 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleOffice(id)}
                      title={`${l.file.name}${upgradedFrom.has(id) ? ` — upgraded from schema v${upgradedFrom.get(id)}` : ""}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 coarse:py-1.5 ${active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                    >
                      {warn && <AlertTriangle className="h-3 w-3 text-warning" />}
                      {officeName(id)}
                      {upgradedFrom.has(id) && <span className="text-info">· upgraded from v{upgradedFrom.get(id)}</span>}
                    </button>
                  );
                })}
                {officeFilter.size > 0 && (
                  <button type="button" onClick={() => setOfficeFilter(new Set())} className="text-primary hover:underline">All offices</button>
                )}
                <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground">
                  <input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} className="h-3.5 w-3.5" />
                  Show unchanged
                </label>
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              {/* Left rail: sections in document order */}
              <nav className="hidden w-56 shrink-0 overflow-y-auto border-r px-2 py-3 md:block" aria-label="Sections with changes">
                <ul className="space-y-0.5">
                  {SECTION_ORDER.filter((sid) => countBySection(sid) > 0).map((sid) => (
                    <li key={sid}>
                      <button
                        type="button"
                        onClick={() => jump(`section-${sid}`)}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <span className="min-w-0 line-clamp-2 break-words">{sectionLabel(sid)}</span>
                        <span className="shrink-0 tabular-nums">{countBySection(sid)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Main pane */}
              <div className="min-w-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {review.provenance.length > 0 && (
                  <div id="review-provenance" className="space-y-1 rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" /> A file may belong to another ISSP
                    </p>
                    <ul className="space-y-0.5 text-xs text-foreground">
                      {review.provenance.map((w, i) => (
                        <li key={i}>
                          {officeName(w.officeId)}&apos;s file has {w.field === "agency" ? "agency" : w.field === "title" ? "title" : w.field === "startYear" ? "start year" : "end year"} &quot;{w.file}&quot; — the master has &quot;{w.master}&quot;.
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">Check that you selected the right files. You can still apply the merge.</p>
                  </div>
                )}

                {brokenLinks.length > 0 && (
                  <div id="review-broken-links" className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                      <Link2Off className="h-3.5 w-3.5" /> {brokenLinks.length} link{brokenLinks.length === 1 ? "" : "s"} would break
                    </p>
                    <ul className="space-y-0.5 text-xs text-foreground">
                      {brokenLinks.map((l, i) => <li key={i}>{sectionLabel(l.sectionId)}: {l.message}</li>)}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">Keep the master&apos;s value for the change that removed the item, or fix the links after the merge.</p>
                  </div>
                )}

                {sectionIds.length === 0 && (
                  <p className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                    {officeFilter.size > 0 ? "No changes from the selected offices." : "The returned files change nothing in the master."}
                  </p>
                )}

                {sectionIds.map((sid) => {
                  const sectionChanges = visibleChanges.filter((c) => c.sectionId === sid);
                  const sectionConflicts = visibleConflicts.filter((c) => c.sectionId === sid);
                  const totals = sid.startsWith("part4/year") ? budgetTotals(review.changes.filter((c) => c.sectionId === sid), rejectedChanges) : [];
                  return (
                    <section key={sid} id={`section-${sid}`} className="overflow-hidden rounded-lg border border-border bg-card/40">
                      <header className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                        <h3 className="text-sm font-semibold text-foreground">{sectionLabel(sid)}</h3>
                        {review.reviewFlags.includes(sid) && (
                          <span className="text-[10px] font-semibold text-info">Flagged for review after the merge</span>
                        )}
                      </header>
                      <ul className="divide-y divide-border">
                        {sectionConflicts.map((c) => (
                          <ConflictCard
                            key={conflictKey(c)}
                            conflict={c}
                            label={conflictLabel(c)}
                            officeName={officeName}
                            chosen={resolutions[conflictKey(c)]}
                            hasChoice={conflictKey(c) in resolutions}
                            onChoose={(value) => setResolutions((prev) => ({ ...prev, [conflictKey(c)]: value }))}
                          />
                        ))}
                        {sectionChanges.map((c) => (
                          <ChangeRow
                            key={c.id}
                            change={c}
                            officeName={officeName}
                            rejected={rejectedChanges.has(c.id)}
                            onToggle={(r) => toggleRejected(c.id, r)}
                          />
                        ))}
                      </ul>
                      {totals.length > 0 && (
                        <div className="border-t bg-muted/20 px-3 py-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Budget totals</p>
                          <ul className="space-y-0.5 text-xs tabular-nums">
                            {totals.map(([bucket, t]) => (
                              <li key={bucket} className="flex flex-wrap justify-between gap-x-3">
                                <span className="text-muted-foreground">{bucket}</span>
                                <span>
                                  {php(t.before)} → <span className="font-semibold text-foreground">{php(t.after)}</span>
                                  {t.after !== t.before && (
                                    <span className={`ml-1.5 ${t.after > t.before ? "text-warning" : "text-success"}`}>({signedPhp(t.after - t.before)})</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Footer ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {review
              ? unresolved.length > 0
                ? `Pick a version for ${unresolved.length} conflict${unresolved.length === 1 ? "" : "s"} to apply.`
                : `${realChanges.length - rejectedChanges.size} change${realChanges.length - rejectedChanges.size === 1 ? "" : "s"} apply · ${rejectedChanges.size} kept from the master`
              : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={resetAndClose} disabled={applying}>Cancel</Button>
            <Button onClick={handleApply} disabled={!canApply}>
              {applying ? (<><Loader2 className="h-4 w-4 animate-spin" /> Applying…</>) : "Apply merge"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
