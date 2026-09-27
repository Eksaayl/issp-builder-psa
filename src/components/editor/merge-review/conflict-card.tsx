"use client";

import { AlertTriangle } from "lucide-react";
import { conflictKey, ROW_REMOVED, type ScalarConflict } from "@/lib/scope/consolidate";
import { rowCells, rowName } from "@/lib/scope/merge-review";
import { formatValue, htmlToPlainText } from "./format";
import { CellTable } from "./values";

function OptionBody({ conflict, value, isMaster }: { conflict: ScalarConflict; value: unknown; isMaster: boolean }) {
  if (conflict.rowId === undefined) {
    const text = typeof value === "string" && value.includes("<") ? htmlToPlainText(value) : formatValue(value, conflict.fieldKey);
    return <span className="break-words text-foreground">{text}</span>;
  }
  if (value === ROW_REMOVED) {
    return <span className="text-foreground">{conflict.master === ROW_REMOVED ? "Do not add this row" : "Remove this row"}</span>;
  }
  if (isMaster || conflict.master === ROW_REMOVED) {
    return <span className="text-foreground">{rowName(value)} {isMaster ? "(as in the master)" : "(new row)"}</span>;
  }
  const cells = rowCells(conflict.master, value);
  return (
    <div className="space-y-1">
      <span className="text-foreground">{rowName(value)}</span>
      {cells.length > 0 && <CellTable fieldKey={conflict.fieldKey} cells={cells} />}
    </div>
  );
}

/**
 * One conflict: two or more offices changed the same field or row differently.
 * No default — the secretariat must pick an office's version or keep the master.
 */
export function ConflictCard({
  conflict,
  label,
  officeName,
  chosen,
  hasChoice,
  onChoose,
}: {
  conflict: ScalarConflict;
  label: string;
  officeName: (officeId: string) => string;
  chosen: unknown;
  hasChoice: boolean;
  onChoose: (value: unknown) => void;
}) {
  const key = conflictKey(conflict);
  const options = [
    ...conflict.values.map((v) => ({ id: v.officeId, who: officeName(v.officeId), value: v.value, isMaster: false })),
    { id: "__master", who: "Keep master value", value: conflict.master, isMaster: true },
  ];
  return (
    <li
      id={`conflict-${key}`}
      className={`space-y-1.5 px-3 py-2.5 ${hasChoice ? "" : "bg-warning-bg/60"}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-bg px-1.5 py-px text-[10px] font-semibold text-warning">
          <AlertTriangle className="h-3 w-3" /> Conflict
        </span>
        <span className="text-xs font-medium text-foreground break-words">{label}</span>
        {!hasChoice && <span className="text-[10px] font-semibold text-warning">Pick one to apply</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {conflict.values.map((v) => officeName(v.officeId)).join(" and ")} changed this differently. Pick the version to keep.
      </p>
      <ul className="space-y-1">
        {options.map((o) => {
          const id = `${key}::${o.id}`;
          return (
            <li key={o.id} className="flex items-start gap-2 text-xs">
              <input
                type="radio"
                id={id}
                name={key}
                checked={hasChoice && chosen === o.value}
                onChange={() => onChoose(o.value)}
                className="mt-0.5 h-3.5 w-3.5 coarse:h-5 coarse:w-5"
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                <span className="font-medium text-muted-foreground">{o.who}: </span>
                <OptionBody conflict={conflict} value={o.value} isMaster={o.isMaster} />
              </label>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
