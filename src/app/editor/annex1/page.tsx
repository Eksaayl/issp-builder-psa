"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2, ExternalLink, FileCheck, ChevronLeft, Plus, Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useIsspStore } from "@/lib/store";
import { useEditorMobileSidebar } from "@/components/editor/editor-mobile-sidebar-context";
import type { Annex1FilePayload } from "@/lib/store/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function totals(a: Annex1FilePayload) {
  const eq = a.annex1.equipment.reduce(
    (sum, r) => sum + r.centralOffice.operational + r.centralOffice.endOfLife + r.centralOffice.backup
            + r.fieldOffice.operational + r.fieldOffice.endOfLife + r.fieldOffice.backup,
    0
  );
  const sw = a.annex1.software.reduce(
    (sum, r) => sum + r.centralOffice.perpetual + r.centralOffice.subscription
            + r.fieldOffice.perpetual + r.fieldOffice.subscription,
    0
  );
  return { eq, sw };
}

export default function EditorAnnex1Page() {
  const { doc, loading, update } = useIsspStore();
  const router = useRouter();
  const mobileSidebar = useEditorMobileSidebar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (loading) return null;
  if (!doc) { router.replace("/editor"); return null; }

  const attached: Annex1FilePayload[] = doc.annexedOffices ?? [];

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const toAdd: Annex1FilePayload[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Annex1FilePayload;
        if (parsed.fileType !== "annex1") { errors.push(`${file.name}: not an Annex 1 file (fileType="${parsed.fileType}")`); continue; }
        if (!parsed.office?.displayLabel) { errors.push(`${file.name}: missing office information`); continue; }
        const duplicate = attached.find((a) => a.office.displayLabel === parsed.office.displayLabel);
        if (duplicate) { errors.push(`${file.name}: "${parsed.office.displayLabel}" is already attached`); continue; }
        toAdd.push(parsed);
      } catch { errors.push(`${file.name}: could not read file`); }
    }
    if (toAdd.length > 0) {
      update((prev) => ({ ...prev, annexedOffices: [...(prev.annexedOffices ?? []), ...toAdd] }));
      toast.success(`${toAdd.length} office${toAdd.length > 1 ? "s" : ""} attached`);
    }
    for (const err of errors) toast.error(err);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeOffice(displayLabel: string) {
    update((prev) => ({
      ...prev,
      annexedOffices: (prev.annexedOffices ?? []).filter((a) => a.office.displayLabel !== displayLabel),
    }));
    toast.success("Office removed");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-0 text-xs text-muted-foreground">
          <button
            type="button"
            className="md:hidden inline-flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => mobileSidebar?.openMobileSidebar()}
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <Link href="/editor" className="hover:text-foreground transition-colors">Overview</Link>
          <span>/</span><span className="text-foreground font-medium">Annexes</span>
          <span>/</span><span className="text-foreground font-medium">Annex 1</span>
        </div>
        <div className="px-4 pb-3 pt-2">
          <h1 className={cn("text-lg font-bold text-foreground leading-tight", "font-[family-name:var(--font-display)]")}>
            Annex 1 — ICT Asset Inventory
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add an office and type its counts yourself, or attach .issp files from offices. The consolidated inventory is included in the PDF export.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <input ref={fileInputRef} type="file" multiple accept=".issp,application/json" className="hidden" onChange={(e) => handleFiles(e.target.files)} />

        {/* Link to standalone module */}
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-start gap-3">
          <FileCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground font-medium">Collecting from offices?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share the Annex 1 form link with each office. They fill it in and send you their .issp file.
            </p>
          </div>
          <a href="/annex1" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0 mt-0.5">
            Open form <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Attached offices list */}
        {attached.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Offices ({attached.length})</p>
            <div className="space-y-1.5">
              {attached.map((a) => {
                const t = totals(a);
                return (
                  <div
                    key={a.office.displayLabel}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <Link
                      href={`/editor/annex1/edit?key=${encodeURIComponent(a.office.displayLabel)}`}
                      className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                    >
                      <span className="h-2 w-2 rounded-full bg-success shrink-0" />
                      <span className="text-sm text-foreground truncate font-medium">{a.office.displayLabel}</span>
                      {(t.eq > 0 || t.sw > 0) && (
                        <span className="text-xs text-muted-foreground shrink-0">{t.eq} equipment · {t.sw} software</span>
                      )}
                      {a.exportedAt && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(a.exportedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      )}
                      <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
                    </Link>
                    <button
                      type="button"
                      aria-label={`Remove ${a.office.displayLabel}`}
                      onClick={() => removeOffice(a.office.displayLabel)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-border px-6 py-10 text-center">
            <Paperclip className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No offices added yet</p>
            <p className="text-xs text-muted-foreground">Add an office to type its inventory, or attach .issp files from offices.</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => router.push("/editor/annex1/new")} className="gap-2">
            <Plus className="h-4 w-4" /> Add office
          </Button>
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Paperclip className="h-4 w-4" /> {attached.length > 0 ? "Attach more files…" : "Attach Annex 1 files…"}
          </Button>
        </div>
      </div>
    </div>
  );
}
