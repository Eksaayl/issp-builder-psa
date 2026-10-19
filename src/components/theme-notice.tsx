"use client";

import { useState, useSyncExternalStore } from "react";
import { Palette, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { BETTERGOV_PREV_KEY, THEMES, isThemeId } from "@/lib/themes";

// One-time notice for the BetterGovPH theme reset (see BETTERGOV_PREV_KEY in
// lib/themes.ts). The pre-hydration script in layout.tsx does the reset before
// first paint; this only tells people about it and lets them keep it or revert.
function readPreviousTheme() {
  try {
    return localStorage.getItem(BETTERGOV_PREV_KEY);
  } catch {
    // Storage blocked — no reset happened, so there is nothing to announce.
    return null;
  }
}

// Storage only changes through this component, so there is nothing to
// subscribe to; the server snapshot (null) keeps first render empty on both
// sides, then the client snapshot reads storage.
const subscribeNever = () => () => {};

export function ThemeNotice() {
  const { setTheme } = useTheme();
  const stored = useSyncExternalStore(subscribeNever, readPreviousTheme, () => null);
  const [closed, setClosed] = useState(false);
  const previous = !closed && isThemeId(stored) ? stored : null;

  if (!previous) return null;

  function close() {
    try {
      localStorage.removeItem(BETTERGOV_PREV_KEY);
    } catch {
      // Nothing stored to clear.
    }
    setClosed(true);
  }

  function revert() {
    if (previous) setTheme(previous);
    close();
  }

  const previousName = THEMES.find((theme) => theme.id === previous)?.name ?? "your old theme";

  return (
    <div
      role="status"
      aria-label="Theme update"
      className="fixed inset-x-4 bottom-4 z-50 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 sm:left-auto sm:right-4 sm:w-80"
    >
      <button
        type="button"
        aria-label="Dismiss theme notice"
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={close}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-3 pr-5">
        <Palette className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold leading-tight">Dressed up for Civil Tech Week!</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            To cheer on the 2026 Philippine Civil Tech Week by{" "}
            <a
              href="https://bettergov.ph"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              BetterGovPH
            </a>
            , the ISSP Builder is wearing their colors. Come see what the community is cooking at bettergov.ph!
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={revert}>
          Back to {previousName}
        </Button>
        <Button size="sm" onClick={close}>
          Looks good!
        </Button>
      </div>
    </div>
  );
}
