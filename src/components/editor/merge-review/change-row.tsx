"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ChangeKind, ReviewChange } from "@/lib/scope/merge-review";
import { formatValue, lineItemCost } from "./format";
import { CellTable, ImagePair, LineItemCostLine, MasterIncoming, RowSummary, TextDiff } from "./values";

const KIND: Record<ChangeKind, { word: string; cls: string }> = {
  new: { word: "New", cls: "border-success/40 bg-success/10 text-success" },
  overwritten: { word: "Overwritten", cls: "border-warning-border bg-warning-bg text-warning" },
  cleared: { word: "Cleared", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  appended: { word: "Appended", cls: "border-info-border bg-info-bg text-info" },
  "added-row": { word: "Added row", cls: "border-success/40 bg-success/10 text-success" },
  "replaced-row": { word: "Replaced row", cls: "border-warning-border bg-warning-bg text-warning" },
  "removed-row": { word: "Removed row", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  "kept-office-deleted": { word: "Kept (office deleted)", cls: "border-info-border bg-info-bg text-info" },
  "office-rows-replaced": { word: "Office rows replaced", cls: "border-info-border bg-info-bg text-info" },
  unchanged: { word: "No change", cls: "border-border bg-muted/40 text-muted-foreground" },
};

export function KindBadge({ kind }: { kind: ChangeKind }) {
  const k = KIND[kind];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-semibold ${k.cls}`}>
      {k.word}
    </span>
  );
}

/** The decision checkbox's words: what is kept, and whose change is discarded. */
function decisionLabel(change: ReviewChange, offices: string): string {
  if (change.decision === "skip-row") return `Don't add this row (discard ${offices}'s addition)`;
  if (change.kind === "removed-row") return `Keep this row in the master (discard ${offices}'s removal)`;
  if (change.kind === "replaced-row") return `Keep the master's row (discard ${offices}'s change)`;
  return `Keep the master's value (discard ${offices}'s change)`;
}

/** Rows an office holds: a stakeholder row list, or an Annex 1 payload's equipment + software. */
function officeRowCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  const annex = (value as { annex1?: { equipment?: unknown[]; software?: unknown[] } } | undefined)?.annex1;
  return (annex?.equipment?.length ?? 0) + (annex?.software?.length ?? 0);
}

function ChangeBody({ change }: { change: ReviewChange }) {
  const [open, setOpen] = useState(false);
  const { kind, before, after, valueShape, fieldKey } = change;

  if (kind === "office-rows-replaced") {
    const count = officeRowCount;
    return (
      <p className="text-xs text-muted-foreground">
        This office&apos;s own rows are swapped for the rows in its returned file: {count(before)} row{count(before) === 1 ? "" : "s"} in the master → {count(after)} in the file. The rows are listed below.
      </p>
    );
  }
  if (kind === "kept-office-deleted") {
    return (
      <p className="text-xs text-muted-foreground">
        The office removed this project from its project file. Deletions never apply silently, so the master keeps it — check if it should go.
      </p>
    );
  }
  if (kind === "added-row" || kind === "appended" || kind === "removed-row") {
    const row = kind === "removed-row" ? before : after;
    return (
      <div className="space-y-1">
        <RowSummary row={row} />
        {lineItemCost(row) && <LineItemCostLine before={kind === "removed-row" ? before : undefined} after={kind === "removed-row" ? undefined : after} />}
      </div>
    );
  }
  if (kind === "replaced-row" && change.cells) {
    const isLineItem = lineItemCost(before) !== null;
    return (
      <div className="space-y-1.5">
        {isLineItem && <LineItemCostLine before={before} after={after} />}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {change.cells.length} field{change.cells.length === 1 ? "" : "s"} changed
        </button>
        {open && <CellTable fieldKey={fieldKey} cells={change.cells} />}
      </div>
    );
  }
  if (valueShape === "image") return <ImagePair before={before} after={after} />;
  if (valueShape === "text" || valueShape === "rich-text") return <TextDiff before={before} after={after} rich={valueShape === "rich-text"} />;
  if (change.cells && change.cells.length > 0) return <CellTable fieldKey={fieldKey} cells={change.cells} />;
  if (kind === "unchanged") return <p className="text-xs text-muted-foreground line-clamp-2">{formatValue(after, fieldKey)}</p>;
  return <MasterIncoming master={formatValue(before, fieldKey)} incoming={formatValue(after, fieldKey)} />;
}

export function ChangeRow({
  change,
  officeName,
  keepMaster,
  onToggle,
}: {
  change: ReviewChange;
  officeName: (officeId: string) => string;
  /** True when the secretariat keeps the master for this change (Keep master / Skip row). */
  keepMaster: boolean;
  onToggle: (keepMaster: boolean) => void;
}) {
  const offices = change.officeIds.map(officeName).join(" and ");
  return (
    <li id={`change-${change.id}`} className={`space-y-1.5 px-3 py-2.5 ${keepMaster ? "bg-muted/30" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <KindBadge kind={change.kind} />
        <span className={`min-w-0 text-xs font-medium break-words ${keepMaster ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {change.label}
        </span>
        {offices && (
          <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">{offices}</span>
        )}
      </div>
      <ChangeBody change={change} />
      {change.decision && (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={keepMaster}
            onChange={(e) => onToggle(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 coarse:h-5 coarse:w-5"
          />
          <span className={keepMaster ? "font-medium text-foreground" : ""}>{decisionLabel(change, offices || "the office")}</span>
        </label>
      )}
    </li>
  );
}
