"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Plus, RotateCcw, Download, FileUp } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { SectionShell } from "@/components/editor/section-shell";
import { useIsspStore } from "@/lib/store";
import type { DefinitionTerm } from "@/lib/store/types";
import { STANDARD_DEFINITIONS, makeStandardDefinitions } from "@/lib/store/defaults";
import { revealNewItem } from "@/lib/reveal";
import { definitionsTemplateCsv } from "@/lib/definitions-csv";
import { ImportDefinitionsDialog } from "./import-definitions-dialog";

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export function DefinitionsForm({ initialData }: { initialData: DefinitionTerm[] | undefined }) {
  const { update, updateSectionMeta } = useIsspStore();
  const [terms, setTerms] = useState<DefinitionTerm[]>(
    () => initialData ?? makeStandardDefinitions()
  );
  const [importOpen, setImportOpen] = useState(false);

  function commit(next: DefinitionTerm[]) {
    setTerms(next);
    update((prev) => ({ ...prev, definitions: next }));
    updateSectionMeta("definitions", { lastEditedAt: new Date().toISOString() });
  }

  function patchTerm(id: string, patch: Partial<DefinitionTerm>) {
    commit(terms.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addTerm() {
    const t = { id: generateId(), term: "", definition: "" };
    commit([...terms, t]);
    revealNewItem(t.id);
  }

  function removeTerm(id: string) {
    commit(terms.filter((t) => t.id !== id));
  }

  const missingStandard = STANDARD_DEFINITIONS.filter(
    (std) => !terms.some((t) => t.term.trim().toLowerCase() === std.term.toLowerCase())
  );

  function restoreStandard() {
    commit([
      ...terms,
      ...missingStandard.map((std) => ({ id: generateId(), ...std })),
    ]);
  }

  function importTerms(rows: { term: string; definition: string }[]) {
    const added = rows.map((r) => ({ id: generateId(), ...r }));
    commit([...terms, ...added]);
    // Land on the first import rather than pulsing every new card at once.
    if (added.length > 0) revealNewItem(added[0].id);
  }

  function downloadTemplate() {
    const blob = new Blob([definitionsTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "definition-of-terms-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <SectionShell
      sectionId="definitions"
      title="Definition of Terms"
      description="Terms and definitions printed in the front matter of your ISSP, before Part I."
      statBlock={{ label: "Terms", value: String(terms.length) }}
    >
      <Callout variant="info">
        Terms are printed <span className="font-medium">alphabetically</span> in the exported PDF, so you can add them in any order. The three standard terms from the DICT template are pre-filled — edit or remove them as needed.
      </Callout>

      <div className="space-y-3">
        {terms.map((t, i) => (
          <Card key={t.id} data-reveal-id={t.id}>
            <CardContent className="pt-4 pb-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Input
                  value={t.term}
                  onChange={(e) => patchTerm(t.id, { term: e.target.value })}
                  placeholder={`Term ${i + 1} — e.g. "Information System"`}
                  className="font-medium"
                />
                <ConfirmDeleteButton
                  ariaLabel={`Remove ${t.term || "term"}`}
                  confirmText="Delete term?"
                  onDelete={() => removeTerm(t.id)}
                  iconClassName="h-4 w-4"
                />
              </div>
              <Textarea
                value={t.definition}
                onChange={(e) => patchTerm(t.id, { definition: e.target.value })}
                placeholder="Definition…"
                rows={3}
                className="resize-y"
              />
            </CardContent>
          </Card>
        ))}

        {terms.length === 0 && (
          <p className="text-sm text-muted-foreground border rounded-lg px-4 py-6 text-center">
            No terms yet. Add your own, or restore the standard template terms.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={addTerm} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add term
        </Button>
        <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
          <FileUp className="h-4 w-4" /> Import CSV
        </Button>
        <Button variant="ghost" onClick={downloadTemplate} className="gap-1.5 text-muted-foreground">
          <Download className="h-4 w-4" /> Download template
        </Button>
        {missingStandard.length > 0 && (
          <Button variant="ghost" onClick={restoreStandard} className="gap-1.5 text-muted-foreground">
            <RotateCcw className="h-4 w-4" /> Restore standard terms ({missingStandard.length})
          </Button>
        )}
      </div>

      <ImportDefinitionsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        terms={terms}
        onImport={importTerms}
      />
    </SectionShell>
  );
}
