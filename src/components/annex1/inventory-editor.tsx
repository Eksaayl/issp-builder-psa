"use client";

import { useState } from "react";
import { Download, Save, ArrowLeft, LayoutGrid, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EquipmentTable, EquipmentCards, SoftwareTable, SoftwareCards } from "@/components/annex1/inventory-table";
import type { EquipmentRow, SoftwareRow, Annex1FilePayload, OfficeIdentity } from "@/lib/annex1/types";
import { cn } from "@/lib/utils";

type ViewMode = "table" | "card";

export function InventoryEditor({
  mode,
  office,
  initialEquipment,
  initialSoftware,
  onSave,
  onSaved,
  onBack,
  saveLabel = "Save to doc",
}: {
  mode: "download" | "save";
  office: OfficeIdentity;
  initialEquipment: EquipmentRow[];
  initialSoftware: SoftwareRow[];
  onSave?: (payload: Annex1FilePayload) => boolean;
  onSaved?: () => void;
  onBack?: () => void;
  saveLabel?: string;
}) {
  const [equipmentRows, setEquipmentRows] = useState<EquipmentRow[]>(initialEquipment);
  const [softwareRows, setSoftwareRows] = useState<SoftwareRow[]>(initialSoftware);
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  function buildPayload(): Annex1FilePayload {
    return {
      version: "1.0",
      fileType: "annex1",
      exportedAt: new Date().toISOString(),
      tool: "issp-platform",
      office,
      annex1: { equipment: equipmentRows, software: softwareRows },
    };
  }

  function buildFilename(): string {
    const part =
      office.type === "central"  ? "CO"
      : office.type === "regional" ? `RO-${office.region ?? "XX"}`
      : `FO-${office.region ?? "XX"}-${office.name.replace(/\s+/g, "-").toUpperCase()}`;
    return `ANNEX1-${part}-${new Date().getFullYear()}.issp`;
  }

  function handleDownload() {
    setBusy(true);
    const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildFilename();
    a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  function handleSave() {
    if (!onSave) return;
    setBusy(true);
    const ok = onSave(buildPayload());
    setBusy(false);
    if (ok && onSaved) onSaved();
  }

  const isDownload = mode === "download";

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              <ArrowLeft className="h-3 w-3" />
              {isDownload ? "Change office" : "Back to list"}
            </button>
          )}
          <h1 className="text-xl font-bold text-foreground font-[family-name:var(--font-display)]">ICT Asset Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filling for: <span className="font-medium text-foreground">{office.displayLabel}</span>
          </p>
        </div>
        <Button
          type="button"
          onClick={isDownload ? handleDownload : handleSave}
          disabled={busy}
          className="gap-2 shrink-0"
        >
          {isDownload ? <Download className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {isDownload ? "Download .issp" : saveLabel}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">Fill in counts for each resource. Leave unused rows at zero.</p>
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "table" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutList className="h-3.5 w-3.5" /> Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode("card")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "card" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Cards
          </button>
        </div>
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">1. ICT Equipment Inventory</h2>
          <p className="text-xs text-muted-foreground mt-1">Count units by status. Fill only the rows relevant to your office — leave others at zero.</p>
        </div>
        {viewMode === "table"
          ? <EquipmentTable rows={equipmentRows} onChange={setEquipmentRows} />
          : <EquipmentCards rows={equipmentRows} onChange={setEquipmentRows} />}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">2. ICT Software Inventory</h2>
          <p className="text-xs text-muted-foreground mt-1">Count licenses by type. Perpetual = one-time purchase. Subscription = recurring.</p>
        </div>
        {viewMode === "table"
          ? <SoftwareTable rows={softwareRows} onChange={setSoftwareRows} />
          : <SoftwareCards rows={softwareRows} onChange={setSoftwareRows} />}
      </section>

      <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {isDownload
            ? "Send this .issp file to your CIO. They will attach it to the main ISSP document before exporting the final PDF."
            : "Saved offices appear in the Annex 1 list and are included in the PDF export."}
        </p>
        <Button
          type="button"
          onClick={isDownload ? handleDownload : handleSave}
          disabled={busy}
          className="gap-2 shrink-0"
        >
          {isDownload ? <Download className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {isDownload ? "Download .issp file" : saveLabel}
        </Button>
      </div>
    </div>
  );
}
