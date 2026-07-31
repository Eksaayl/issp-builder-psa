# Annex 1 — Inline Entry & Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the CIO type and edit Annex 1 (ICT Asset Inventory) data directly inside the editor — no download→attach round-trip — while keeping the existing attach-files and standalone-share paths.

**Architecture:** Reuse the standalone form's two pieces (office picker, equipment/software tables) as shared components, then add editor sub-routes `/editor/annex1/new` (picker) and `/editor/annex1/edit` (tables → save to doc). Turn `/editor/annex1` into a management list with click-to-edit. No schema change — `doc.annexedOffices: Annex1FilePayload[]` already holds structured rows; `update()` auto-persists.

**Tech Stack:** Next.js (App Router, client components), React, TypeScript, Tailwind, `lucide-react` icons, `sonner` toasts, Zustand store (`useIsspStore`).

## Global Constraints

- **No unit-test framework in this project.** Per-task verification = `npx tsc --noEmit` (typecheck) **plus** a browser smoke test on the dev server (`http://localhost:3000`) driven by Puppeteer + Chrome `/root/.cache/puppeteer/chrome/linux-148.0.7778.167/chrome-linux64/chrome`. Follow the `verify-feature` / `verifier-web` skills. (See `references/csc-issp/` Puppeteer pattern; the Annex 1 routes need a doc loaded in IDB first.)
- **Standalone routes must stay behaviorally identical:** `/annex1` (picker) and `/annex1/edit` (tables → download `.issp`) keep working exactly as today. Refactors are extractive only.
- **No schema or migration changes.** Use the existing `Annex1FilePayload` shape and `doc.annexedOffices`.
- **Palette / components:** reuse `@/components/ui/button`, `@/components/ui/card`, `lucide-react` icons, the app's Tailwind tokens (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-muted`, `text-primary`, `bg-success`). Match the existing editor page chrome (breadcrumb + header pattern in `src/app/editor/annex1/page.tsx`).
- **Keying:** offices are uniquely identified by `office.displayLabel` (today's dedupe key). Identity is fixed at creation; counts are editable.
- **Commit only the files each task touches.** Leave unrelated working-tree changes alone. End commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>`.

### Exact types/signatures this plan depends on (from `src/lib/annex1/types.ts`)

```ts
type OfficeType = "central" | "regional" | "field";
type PhilippineRegionCode = "NCR" | "CAR" | "Region I" | ... | "BARMM";
interface OfficeIdentity { type: OfficeType; region?: PhilippineRegionCode; name: string; displayLabel: string; }
interface EquipmentCounts { operational: number; endOfLife: number; backup: number; }
interface EquipmentRow { id: string; type: string; isCustom: boolean; centralOffice: EquipmentCounts; fieldOffice: EquipmentCounts; }
interface SoftwareCounts { perpetual: number; subscription: number; }
interface SoftwareRow { id: string; type: string; isCustom: boolean; centralOffice: SoftwareCounts; fieldOffice: SoftwareCounts; }
interface Annex1Data { equipment: EquipmentRow[]; software: SoftwareRow[]; }
interface Annex1FilePayload { version: "1.0"; fileType: "annex1"; exportedAt: string; tool: "issp-platform"; office: OfficeIdentity; annex1: Annex1Data; }
function buildDisplayLabel(type, region?, name?): string
function defaultEquipmentRows(): EquipmentRow[]
function defaultSoftwareRows(): SoftwareRow[]
```

Table components (`src/components/annex1/inventory-table.tsx`) — all take `{ rows: EquipmentRow[]|SoftwareRow[]; onChange: (rows) => void }`:
`EquipmentTable`, `EquipmentCards`, `SoftwareTable`, `SoftwareCards`.

Store (`src/lib/store/index.tsx`): `useIsspStore()` → `{ doc, loading, update }` where
`update: (patcher: (prev: IsspDocument) => IsspDocument) => void` (auto-persists to IDB via `scheduleSave`).
Doc field: `doc.annexedOffices?: Annex1FilePayload[]`.

---

## File Structure

- **New** `src/components/annex1/office-selector.tsx` — shared office picker (extracted from standalone `/annex1`).
- **New** `src/components/annex1/inventory-editor.tsx` — shared tables + save action (extracted from standalone `/annex1/edit`).
- **New** `src/app/editor/annex1/new/page.tsx` — picker page inside the editor → pushes to `/editor/annex1/edit?type=…`.
- **New** `src/app/editor/annex1/edit/page.tsx` — `<Suspense>` wrapper.
- **New** `src/app/editor/annex1/edit/content.tsx` — reads `key` (edit) or `type/region/name` (new); renders `<InventoryEditor mode="save">`; add/update `annexedOffices`.
- **Modified** `src/app/annex1/page.tsx` — render `<OfficeSelector>` (standalone; behavior unchanged).
- **Modified** `src/app/annex1/edit/content.tsx` — render `<InventoryEditor mode="download">` (behavior unchanged).
- **Modified** `src/app/editor/annex1/page.tsx` — management list: Add office + click-to-edit + totals; keep attach/remove/open-form.

Task dependency order: **1 → 2 → 3 → 4** (3 uses components from 1 & 2; 4 links to routes from 3).

---

### Task 1: Extract `<OfficeSelector>` and refactor standalone picker

**Files:**
- Create: `src/components/annex1/office-selector.tsx`
- Modify: `src/app/annex1/page.tsx`

**Interfaces:**
- Produces: `OfficeSelector({ onContinue: (s: OfficeSelection) => void, submitLabel?: string })` where `OfficeSelection = { type: OfficeType; region?: PhilippineRegionCode; name: string }`.

- [ ] **Step 1: Create `src/components/annex1/office-selector.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Building2, MapPin, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PHILIPPINE_REGIONS, type OfficeType, type PhilippineRegionCode } from "@/lib/annex1/types";

export interface OfficeSelection {
  type: OfficeType;
  region?: PhilippineRegionCode;
  name: string;
}

export function OfficeSelector({
  onContinue,
  submitLabel = "Continue →",
}: {
  onContinue: (selection: OfficeSelection) => void;
  submitLabel?: string;
}) {
  const [officeType, setOfficeType] = useState<OfficeType | null>(null);
  const [region, setRegion] = useState<PhilippineRegionCode | "">("");
  const [fieldName, setFieldName] = useState("");

  const canContinue =
    officeType === "central" ||
    (officeType === "regional" && region !== "") ||
    (officeType === "field" && region !== "" && fieldName.trim() !== "");

  function handleContinue() {
    if (!officeType || !canContinue) return;
    onContinue({
      type: officeType,
      region: region === "" ? undefined : (region as PhilippineRegionCode),
      name: fieldName.trim(),
    });
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)] mb-2">
          Who is filling out this form?
        </h1>
        <p className="text-sm text-muted-foreground">
          Each office fills in their own inventory and sends the file to the CIO, who consolidates before the final PDF export.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {([
          { type: "central" as const, label: "Central Office", icon: Building2, desc: "The main/head office of the agency" },
          { type: "regional" as const, label: "Regional Office", icon: MapPin, desc: "A regional office under the agency" },
          { type: "field" as const, label: "Field Office", icon: Building, desc: "A field or satellite office under a regional office" },
        ] as const).map(({ type, label, icon: Icon, desc }) => (
          <button
            key={type}
            type="button"
            onClick={() => { setOfficeType(type); setRegion(""); setFieldName(""); }}
            className={cn(
              "w-full flex items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-colors",
              officeType === type ? "border-primary bg-primary/5" : "border-border hover:border-border/80 hover:bg-accent/40"
            )}
          >
            <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", officeType === type ? "text-primary" : "text-muted-foreground")} />
            <div>
              <p className={cn("text-sm font-semibold", officeType === type ? "text-primary" : "text-foreground")}>{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {(officeType === "regional" || officeType === "field") && (
        <div className="mb-4 space-y-1.5">
          <label className="text-sm font-medium text-foreground">{officeType === "regional" ? "Region" : "Parent Region"}</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as PhilippineRegionCode)}
            className={cn(
              "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/30",
              !region && "text-muted-foreground"
            )}
          >
            <option value="" disabled>Select region…</option>
            {PHILIPPINE_REGIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.code} — {r.name}</option>
            ))}
          </select>
        </div>
      )}

      {officeType === "field" && (
        <div className="mb-4 space-y-1.5">
          <label className="text-sm font-medium text-foreground">Office Name</label>
          <input
            type="text"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
            placeholder="e.g. UP Diliman Field Office"
            className={cn(
              "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            )}
          />
        </div>
      )}

      <Button type="button" onClick={handleContinue} disabled={!canContinue} className="w-full">
        {submitLabel}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Refactor `src/app/annex1/page.tsx` to use it**

Replace the entire file body with a thin wrapper. (The standalone behavior — pick office → push to `/annex1/edit?…` — is unchanged.)

```tsx
"use client";

import { useRouter } from "next/navigation";
import { OfficeSelector, type OfficeSelection } from "@/components/annex1/office-selector";

export default function Annex1SetupPage() {
  const router = useRouter();

  function handleContinue(s: OfficeSelection) {
    const params = new URLSearchParams({ type: s.type });
    if (s.region) params.set("region", s.region);
    if (s.type === "field" && s.name) params.set("name", s.name);
    router.push(`/annex1/edit?${params.toString()}`);
  }

  return <OfficeSelector onContinue={handleContinue} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser smoke (standalone picker unchanged)**

Start dev server (`npm run dev`, :3000). With a doc loaded, open `http://localhost:3000/annex1`. Verify: the three office buttons appear; choosing Regional shows the region dropdown; Continue is disabled until a region is picked; clicking Continue navigates to `/annex1/edit?type=regional&region=...`. (Use Puppeteer + the Chrome path above; assert the URL after click.)

- [ ] **Step 5: Commit**

```bash
git add src/components/annex1/office-selector.tsx src/app/annex1/page.tsx
git commit -m "refactor(annex1): extract OfficeSelector component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Extract `<InventoryEditor>` and refactor standalone tables

**Files:**
- Create: `src/components/annex1/inventory-editor.tsx`
- Modify: `src/app/annex1/edit/content.tsx`

**Interfaces:**
- Consumes: `EquipmentTable/Cards`, `SoftwareTable/Cards` from `inventory-table.tsx`; types from `@/lib/annex1/types`.
- Produces: `InventoryEditor({ mode, office, initialEquipment, initialSoftware, onSave?, onSaved?, onBack?, saveLabel? })`.
  - `onSave?: (payload: Annex1FilePayload) => boolean` (return `true` if accepted, `false` if rejected; only `onSaved` runs when `true`).
  - `onSaved?: () => void`, `onBack?: () => void`.

- [ ] **Step 1: Create `src/components/annex1/inventory-editor.tsx`**

```tsx
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
```

- [ ] **Step 2: Refactor `src/app/annex1/edit/content.tsx` to use it (download mode, behavior unchanged)**

Replace the file with:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { InventoryEditor } from "@/components/annex1/inventory-editor";
import { defaultEquipmentRows, defaultSoftwareRows, buildDisplayLabel, type OfficeType, type PhilippineRegionCode } from "@/lib/annex1/types";

export function Annex1EditContent() {
  const router = useRouter();
  const params = useSearchParams();

  const officeType = (params.get("type") ?? "central") as OfficeType;
  const region = (params.get("region") ?? undefined) as PhilippineRegionCode | undefined;
  const fieldName = params.get("name") ?? "";

  if (!params.get("type")) {
    router.replace("/annex1");
    return null;
  }

  const office = {
    type: officeType,
    region,
    name: officeType === "central"  ? "Central Office"
        : officeType === "regional" ? `Regional Office — ${region}`
        : fieldName,
    displayLabel: buildDisplayLabel(officeType, region, fieldName),
  };

  return (
    <InventoryEditor
      mode="download"
      office={office}
      initialEquipment={defaultEquipmentRows()}
      initialSoftware={defaultSoftwareRows()}
      onBack={() => router.back()}
    />
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Browser smoke (standalone download unchanged)**

`/annex1/edit?type=central` → equipment + software tables render; Table/Cards toggle works; "Download .issp" downloads a file named `ANNEX1-CO-<year>.issp` containing JSON with `fileType: "annex1"` and the entered counts. `/annex1/edit?type=regional&region=Region%20VII` shows displayLabel "Regional Office — Region VII".

- [ ] **Step 5: Commit**

```bash
git add src/components/annex1/inventory-editor.tsx src/app/annex1/edit/content.tsx
git commit -m "refactor(annex1): extract InventoryEditor component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Editor routes — `/editor/annex1/new` and `/editor/annex1/edit` (save to doc)

**Files:**
- Create: `src/app/editor/annex1/new/page.tsx`
- Create: `src/app/editor/annex1/edit/page.tsx`
- Create: `src/app/editor/annex1/edit/content.tsx`

**Interfaces:**
- Consumes: `OfficeSelector` (Task 1), `InventoryEditor` (Task 2), `useIsspStore` (`{ doc, loading, update }`), `buildDisplayLabel`, `defaultEquipmentRows`, `defaultSoftwareRows`.
- Produces: routes `/editor/annex1/new` (picker → `/editor/annex1/edit?type=…&region=…&name=…`) and `/editor/annex1/edit` (`?key=` edit, `?type=` new).

- [ ] **Step 1: Create `src/app/editor/annex1/new/page.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { OfficeSelector, type OfficeSelection } from "@/components/annex1/office-selector";
import { useEditorMobileSidebar } from "@/components/editor/editor-mobile-sidebar-context";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function EditorAnnex1NewPage() {
  const router = useRouter();
  const mobileSidebar = useEditorMobileSidebar();

  function handleContinue(s: OfficeSelection) {
    const params = new URLSearchParams({ type: s.type });
    if (s.region) params.set("region", s.region);
    if (s.type === "field" && s.name) params.set("name", s.name);
    router.push(`/editor/annex1/edit?${params.toString()}`);
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
          <Link href="/editor/annex1" className="hover:text-foreground transition-colors">Annex 1</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Add office</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <OfficeSelector onContinue={handleContinue} submitLabel="Continue →" />
      </div>
    </div>
  );
}
```

> Note: if `useEditorMobileSidebar` is not in that exact path, import it from the same place `src/app/editor/annex1/page.tsx` does (it already imports it). Match the existing import.

- [ ] **Step 2: Create `src/app/editor/annex1/edit/page.tsx`**

```tsx
import { Suspense } from "react";
import { EditorAnnex1EditContent } from "./content";

export default function EditorAnnex1EditPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Loading…</div>}>
      <EditorAnnex1EditContent />
    </Suspense>
  );
}
```

- [ ] **Step 3: Create `src/app/editor/annex1/edit/content.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { InventoryEditor } from "@/components/annex1/inventory-editor";
import { useIsspStore } from "@/lib/store";
import { useEditorMobileSidebar } from "@/components/editor/editor-mobile-sidebar-context";
import {
  buildDisplayLabel,
  defaultEquipmentRows,
  defaultSoftwareRows,
  type Annex1FilePayload,
  type OfficeType,
  type PhilippineRegionCode,
  type EquipmentRow,
  type SoftwareRow,
} from "@/lib/annex1/types";

export function EditorAnnex1EditContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { doc, loading, update } = useIsspStore();
  const mobileSidebar = useEditorMobileSidebar();

  if (loading) return null;
  if (!doc) { router.replace("/editor"); return null; }

  const key = params.get("key");
  const typeParam = params.get("type");

  // EDIT mode: key present
  if (key) {
    const existing = (doc.annexedOffices ?? []).find((a) => a.office.displayLabel === key);
    if (!existing) { router.replace("/editor/annex1"); return null; }

    function handleUpdate(payload: Annex1FilePayload) {
      update((prev) => ({
        ...prev,
        annexedOffices: (prev.annexedOffices ?? []).map((a) =>
          a.office.displayLabel === key ? payload : a
        ),
      }));
      toast.success("Office updated");
      return true;
    }

    return (
      <Shell breadcrumbLabel="Edit office" mobileSidebar={mobileSidebar}>
        <InventoryEditor
          mode="save"
          office={existing.office}
          initialEquipment={existing.annex1.equipment}
          initialSoftware={existing.annex1.software}
          onSave={handleUpdate}
          onSaved={() => router.push("/editor/annex1")}
          onBack={() => router.push("/editor/annex1")}
          saveLabel="Save changes"
        />
      </Shell>
    );
  }

  // NEW mode: type present
  if (typeParam) {
    const officeType = typeParam as OfficeType;
    const region = (params.get("region") ?? undefined) as PhilippineRegionCode | undefined;
    const fieldName = params.get("name") ?? "";
    const displayLabel = buildDisplayLabel(officeType, region, fieldName);
    const office = {
      type: officeType,
      region,
      name: officeType === "central"  ? "Central Office"
          : officeType === "regional" ? `Regional Office — ${region}`
          : fieldName,
      displayLabel,
    };

    function handleAdd(payload: Annex1FilePayload) {
      const dup = (doc.annexedOffices ?? []).some((a) => a.office.displayLabel === payload.office.displayLabel);
      if (dup) {
        toast.error(`"${payload.office.displayLabel}" is already in the list`);
        return false;
      }
      update((prev) => ({ ...prev, annexedOffices: [...(prev.annexedOffices ?? []), payload] }));
      toast.success("Office added");
      return true;
    }

    return (
      <Shell breadcrumbLabel="Add office" mobileSidebar={mobileSidebar}>
        <InventoryEditor
          mode="save"
          office={office}
          initialEquipment={defaultEquipmentRows()}
          initialSoftware={defaultSoftwareRows()}
          onSave={handleAdd}
          onSaved={() => router.push("/editor/annex1")}
          onBack={() => router.push("/editor/annex1")}
          saveLabel="Add office"
        />
      </Shell>
    );
  }

  // Neither key nor type → go pick an office
  router.replace("/editor/annex1/new");
  return null;
}

function Shell({
  breadcrumbLabel,
  mobileSidebar,
  children,
}: {
  breadcrumbLabel: string;
  mobileSidebar: ReturnType<typeof useEditorMobileSidebar>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-3 text-xs text-muted-foreground">
          <button
            type="button"
            className="md:hidden inline-flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => mobileSidebar?.openMobileSidebar()}
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <Link href="/editor/annex1" className="hover:text-foreground transition-colors">Annex 1</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{breadcrumbLabel}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-8">{children}</div>
    </div>
  );
}
```

> Note: `EquipmentRow`/`SoftwareRow` are imported only to satisfy the `InventoryEditor` prop types if needed; if `tsc` flags them unused, remove those two from the import. The `handleUpdate`/`handleAdd` closures reference `key`/`doc`/`update` from the enclosing scope — fine.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Browser smoke (add + edit via direct URL)**

- Navigate to `/editor/annex1/new`, pick **Central Office**, Continue → lands on `/editor/annex1/edit?type=central`. Change a count, click **Add office** → returns to `/editor/annex1`; "Central Office" now present in `doc.annexedOffices` (verify via IDB or the list page). Reload → still present (persisted).
- Navigate to `/editor/annex1/edit?key=Central%20Office` → tables pre-filled with the count you entered; change it, **Save changes** → back to list; the value updated (no duplicate entry).
- Navigate to `/editor/annex1/edit?key=Does%20Not%20Exist` → redirects to `/editor/annex1`. Navigate to `/editor/annex1/edit` (no params) → redirects to `/editor/annex1/new`.
- Add a second office, then try `/editor/annex1/edit?type=central` again and **Add office** → duplicate toast `"...already in the list"`, stays on page (no second entry).

- [ ] **Step 6: Commit**

```bash
git add src/app/editor/annex1/new/page.tsx src/app/editor/annex1/edit/page.tsx src/app/editor/annex1/edit/content.tsx
git commit -m "feat(annex1): editor routes to add/edit offices inline

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Turn `/editor/annex1` into a management list

**Files:**
- Modify: `src/app/editor/annex1/page.tsx`

**Interfaces:**
- Consumes: routes from Task 3 (`/editor/annex1/new`, `/editor/annex1/edit?key=`). Existing attach/remove logic stays.

- [ ] **Step 1: Rewrite `src/app/editor/annex1/page.tsx`**

Keep the existing header/breadcrumb, the hidden file input + `handleFiles`, `removeOffice`, the "Open form" standalone link, and the attach button. Changes: (a) office cards become a clickable `Link` to `/editor/annex1/edit?key=…` (the remove button stays separate so it doesn't navigate); (b) add an **"Add office"** button next to **"Attach Annex 1 files…"**; (c) show a small equipment/software total on each card.

Replace the `{attached.length > 0 ? (...) : (...)}` block and the attach-button block. Full new file:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Browser smoke (full flow from the list UI)**

- `/editor/annex1` empty state shows "No offices added yet" + **Add office** + **Attach Annex 1 files…** buttons.
- Click **Add office** → picker → Central Office → tables → **Add office** → list now shows the card with a pencil icon and totals once counts > 0.
- Click the card → edit page, pre-filled; change a count → **Save changes** → list reflects new total.
- Click **Attach Annex 1 files…** → pick a previously-downloaded `.issp` → office attaches (or duplicate toast if already present).
- Remove button deletes the office. The "Open form" link still opens `/annex1` in a new tab.
- Sidebar "Annex 1 — ICT Asset Inventory" stays highlighted on `/editor/annex1`, `/editor/annex1/new`, and `/editor/annex1/edit`.

- [ ] **Step 4: Full build**

Run: `npm run build`
Expected: completes with no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/editor/annex1/page.tsx
git commit -m "feat(annex1): management list with add + click-to-edit

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review (run before handoff)

- **Spec coverage:** Add inline (Task 3 new + Task 4 button) ✓; edit existing (Task 3 edit + Task 4 cards) ✓; attach files unchanged (Task 4 keeps it) ✓; standalone unchanged (Tasks 1 & 2) ✓; persists (update auto-saves) ✓; sidebar highlight (already works via `startsWith`, verified in Task 4 smoke) ✓; remove (Task 4) ✓; build passes (Task 4 Step 4) ✓.
- **Type consistency:** `OfficeSelection` (Task 1) consumed by Task 3 new page ✓. `InventoryEditor` props (Task 2) consumed identically by standalone (Task 2) and editor (Task 3) ✓. `onSave` returns `boolean` in both the component (Task 2) and the editor handlers (Task 3) ✓.
- **Placeholders:** none — every step has full code or exact commands.
