"use client";

import Link from "next/link";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { useLocalSave } from "@/hooks/use-local-save";
import { Plus, Pencil, Trash2, BarChart3, FolderKanban } from "lucide-react";
import { SectionShell } from "@/components/editor/section-shell";
import { revealNewItem } from "@/lib/reveal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiRow {
  id: string;
  hierarchy: "Intermediate Outcome" | "Immediate Outcome" | "Output" | "";
  indicator: string;
  baseline: string;
  year1Target: string;
  year2Target: string;
  year3Target: string;
  dataCollectionMethod: string;
  responsibleUnit: string;
}

interface ProjectKpiSet {
  projectTitle: string;
  projectCategory: "internal" | "crossAgency";
  rows: KpiRow[];
}

type PerformanceFramework = Record<string, ProjectKpiSet>;

interface ProjectSummary {
  id: string;
  title: string;
  projectCategory: "internal" | "crossAgency";
}

function generateId() {
  return `kpi-${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_ROW: Omit<KpiRow, "id"> = {
  hierarchy: "",
  indicator: "",
  baseline: "",
  year1Target: "",
  year2Target: "",
  year3Target: "",
  dataCollectionMethod: "",
  responsibleUnit: "",
};

const HIERARCHY_OPTIONS = [
  { value: "Intermediate Outcome", label: "Intermediate Outcome" },
  { value: "Immediate Outcome", label: "Immediate Outcome" },
  { value: "Output", label: "Output" },
] as const;

function Empty({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-muted-foreground/50">{children}</span>;
}

// ─── KPI edit drawer (principle 2: edit lives in a focused surface) ───────────

function KpiDrawer({
  open,
  row,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  row: KpiRow | null;
  isNew: boolean;
  onSave: (row: KpiRow) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<KpiRow>(() => row ?? { id: generateId(), ...DEFAULT_ROW });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setDraft(row ?? { id: generateId(), ...DEFAULT_ROW });
  }, [open, row]);

  function set<K extends keyof KpiRow>(k: K, v: KpiRow[K]) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        style={{ maxWidth: 560 }}
        className="flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <SheetTitle>{isNew ? "Add KPI" : "Edit KPI"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Hierarchy of Results</Label>
            <Select
              items={HIERARCHY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={draft.hierarchy || null}
              onValueChange={(v: string | null) => set("hierarchy", (v ?? "") as KpiRow["hierarchy"])}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {HIERARCHY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Key Performance Indicator</Label>
            <Textarea
              rows={3}
              placeholder="e.g., % of monitored agencies submitting queue data via API"
              value={draft.indicator}
              onChange={(e) => set("indicator", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Baseline</Label>
            <Input
              placeholder="e.g., 0%"
              value={draft.baseline}
              onChange={(e) => set("baseline", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["year1Target", "Year 1 Target"],
                ["year2Target", "Year 2 Target"],
                ["year3Target", "Year 3 Target"],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
                <Input
                  placeholder="—"
                  value={draft[field]}
                  onChange={(e) => set(field, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Data Collection Method</Label>
            <Textarea
              rows={2}
              placeholder="e.g., UQMP system-generated API submission logs"
              value={draft.dataCollectionMethod}
              onChange={(e) => set("dataCollectionMethod", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Responsibility to Collect Data</Label>
            <Input
              placeholder="e.g., ICT Division"
              value={draft.responsibleUnit}
              onChange={(e) => set("responsibleUnit", e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t shrink-0">
          {!isNew && (
            <ConfirmDeleteButton
              ariaLabel="Delete KPI"
              confirmText="Delete this KPI row?"
              onDelete={onDelete}
            />
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(draft)}>{isNew ? "Add KPI" : "Save KPI"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── KPI table per project (read view; editing happens in the drawer) ─────────

function ProjectKpiTable({
  project,
  ordinal,
  kpiSet,
  onChange,
}: {
  project: ProjectSummary;
  ordinal: number;
  kpiSet: ProjectKpiSet;
  onChange: (updated: ProjectKpiSet) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<{ row: KpiRow; isNew: boolean } | null>(null);

  function openAdd() {
    setEditing({ row: { id: generateId(), ...DEFAULT_ROW }, isNew: true });
    setDrawerOpen(true);
  }

  function openEdit(row: KpiRow) {
    setEditing({ row, isNew: false });
    setDrawerOpen(true);
  }

  function saveRow(row: KpiRow) {
    const exists = kpiSet.rows.some((r) => r.id === row.id);
    const rows = exists
      ? kpiSet.rows.map((r) => (r.id === row.id ? row : r))
      : [...kpiSet.rows, row];
    onChange({ ...kpiSet, rows });
    setDrawerOpen(false);
    if (!exists) revealNewItem(row.id);
  }

  function removeRow(id: string) {
    onChange({ ...kpiSet, rows: kpiSet.rows.filter((r) => r.id !== id) });
    setDrawerOpen(false);
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-muted-foreground">
              {project.projectCategory === "crossAgency" ? "Cross-Agency ICT Project" : "Internal ICT Project"} #{ordinal}
            </span>
            <CardTitle className="text-sm font-semibold line-clamp-2 break-words">{project.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {kpiSet.rows.length} KPI{kpiSet.rows.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openAdd}
            className="gap-1 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add KPI
          </Button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="p-0">
          {kpiSet.rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No KPIs yet.{" "}
              <button onClick={openAdd} className="font-medium text-primary hover:underline">
                Add one.
              </button>
            </p>
          ) : (
            <>
              {/* Desktop: read table — text wraps, nothing clips */}
              <div className="hidden md:block overflow-x-auto p-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="border px-2 py-2 text-left font-semibold w-32">Hierarchy of Results</th>
                      <th className="border px-2 py-2 text-left font-semibold">Key Performance Indicator</th>
                      <th className="border px-2 py-2 text-center font-semibold w-24">Baseline</th>
                      <th className="border px-2 py-2 text-center font-semibold w-20">Year 1</th>
                      <th className="border px-2 py-2 text-center font-semibold w-20">Year 2</th>
                      <th className="border px-2 py-2 text-center font-semibold w-20">Year 3</th>
                      <th className="border px-2 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {kpiSet.rows.map((row) => (
                      <tr key={row.id} data-reveal-id={row.id} className="hover:bg-muted/10 align-top">
                        <td className="border px-2 py-2 break-words">
                          {row.hierarchy ? <span className="font-medium">{row.hierarchy}</span> : <Empty />}
                        </td>
                        <td className="border px-2 py-2">
                          <p className="break-words whitespace-pre-wrap">
                            {row.indicator || <Empty />}
                          </p>
                          {(row.dataCollectionMethod || row.responsibleUnit) && (
                            <p className="mt-1 text-muted-foreground break-words">
                              {row.dataCollectionMethod && <>Method: {row.dataCollectionMethod}</>}
                              {row.dataCollectionMethod && row.responsibleUnit && <> · </>}
                              {row.responsibleUnit && <>Resp.: {row.responsibleUnit}</>}
                            </p>
                          )}
                        </td>
                        {(["baseline", "year1Target", "year2Target", "year3Target"] as const).map((field) => (
                          <td key={field} className="border px-2 py-2 text-center break-words">
                            {row[field] || <Empty />}
                          </td>
                        ))}
                        <td className="border px-1 py-1 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit KPI"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: read cards; edit opens the same drawer */}
              <div className="md:hidden divide-y">
                {kpiSet.rows.map((row, idx) => (
                  <div key={row.id} data-reveal-id={row.id} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        KPI #{idx + 1}{row.hierarchy ? ` · ${row.hierarchy}` : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit KPI"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs break-words">{row.indicator || <Empty />}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      Base {row.baseline || "—"} → {row.year1Target || "—"} → {row.year2Target || "—"} → {row.year3Target || "—"}
                    </p>
                    {(row.dataCollectionMethod || row.responsibleUnit) && (
                      <p className="text-xs text-muted-foreground break-words">
                        {row.dataCollectionMethod && <>Method: {row.dataCollectionMethod}</>}
                        {row.dataCollectionMethod && row.responsibleUnit && <> · </>}
                        {row.responsibleUnit && <>Resp.: {row.responsibleUnit}</>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      )}

      <KpiDrawer
        open={drawerOpen}
        row={editing?.row ?? null}
        isNew={editing?.isNew ?? false}
        onSave={saveRow}
        onDelete={() => editing && removeRow(editing.row.id)}
        onClose={() => setDrawerOpen(false)}
      />
    </Card>
  );
}

// ─── Main form ─────────────────────────────────────────────────────────────────

export function Part3FForm({
  allProjects,
  initialFramework,
}: {
  allProjects: ProjectSummary[];
  initialFramework: PerformanceFramework;
}) {
  // Initialize framework, ensuring an entry per project
  const [framework, setFramework] = useState<PerformanceFramework>(() => {
    const init: PerformanceFramework = { ...initialFramework };
    for (const p of allProjects) {
      if (!init[p.id]) {
        init[p.id] = {
          projectTitle: p.title,
          projectCategory: p.projectCategory,
          rows: [],
        };
      }
    }
    return init;
  });

  const { debouncedSave } = useLocalSave("part3", "part3/f");

  const update = useCallback(
    (next: PerformanceFramework) => {
      setFramework(next);
      debouncedSave({ performanceFramework: next });
    },
    [debouncedSave]
  );

  function updateProjectKpis(projectId: string, kpiSet: ProjectKpiSet) {
    update({ ...framework, [projectId]: kpiSet });
  }

  const totalKpis = Object.values(framework).reduce((s, k) => s + k.rows.length, 0);

  // Per-category ordinal for each project (#n restarts for Internal vs Cross-Agency).
  const ordinals = new Map<string, number>();
  const counters: Record<"internal" | "crossAgency", number> = { internal: 0, crossAgency: 0 };
  for (const p of allProjects) {
    counters[p.projectCategory] += 1;
    ordinals.set(p.id, counters[p.projectCategory]);
  }

  return (
    <SectionShell
      sectionId="part3/f"
      title="Performance Framework"
      description="Define key performance indicators (KPIs) for each ICT project to track outcomes over the plan period."
    >

      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xl font-bold leading-none">{allProjects.length}</p>
            <p className="text-xs text-muted-foreground">Projects</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <div>
            <p className="text-xl font-bold leading-none">{totalKpis}</p>
            <p className="text-xs text-muted-foreground">Total KPIs</p>
          </div>
        </div>
      </div>

      {allProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 py-12 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No ICT projects defined yet.</p>
          <p className="text-xs">
            <Link href="/editor/part3/e1" className="text-primary hover:underline">
              Add projects in Part III-E →
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {allProjects.map((project) => (
            <ProjectKpiTable
              key={project.id}
              project={project}
              ordinal={ordinals.get(project.id) ?? 0}
              kpiSet={
                framework[project.id] ?? {
                  projectTitle: project.title,
                  projectCategory: project.projectCategory,
                  rows: [],
                }
              }
              onChange={(kpiSet) => updateProjectKpis(project.id, kpiSet)}
            />
          ))}
        </div>
      )}

    </SectionShell>
  );
}
