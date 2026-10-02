"use client";

import { useState } from "react";
import { LayoutList, Table2 } from "lucide-react";

/** How a Part IV page lays out its line items: compact rows + drawer, or a full inline table. */
export type LineMode = "list" | "table";

const LINE_MODES: readonly LineMode[] = ["list", "table"];

/**
 * The page's List/Table choice, remembered per browser under `storageKey`.
 * An unreadable or unrecognised stored value falls back to "list" (the
 * default), and storage failures (private mode, blocked site data) never
 * break the page.
 */
export function usePersistedLineMode(storageKey: string): [LineMode, (mode: LineMode) => void] {
  const [mode, setMode] = useState<LineMode>(() => {
    try {
      return localStorage.getItem(storageKey) === "table" ? "table" : "list";
    } catch {
      return "list";
    }
  });

  function switchMode(next: LineMode) {
    setMode(next);
    try { localStorage.setItem(storageKey, next); } catch {}
  }

  return [mode, switchMode];
}

export function LineModeToggle({
  mode,
  onChange,
  className = "",
}: {
  mode: LineMode;
  onChange: (mode: LineMode) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center rounded-md border p-0.5 bg-muted/30 ${className}`}>
      {LINE_MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className={`flex items-center gap-1 px-2.5 py-1 coarse:py-2.5 rounded text-xs transition-colors ${
            mode === m
              ? "bg-card shadow-sm font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {m === "list" ? <LayoutList className="h-3 w-3" /> : <Table2 className="h-3 w-3" />}
          {m === "list" ? "List" : "Table"}
        </button>
      ))}
    </div>
  );
}
