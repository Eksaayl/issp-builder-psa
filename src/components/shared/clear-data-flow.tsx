"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ClearDataStep = "idle" | "step1" | "step2";

/**
 * Two-step confirmation for wiping the ISSP out of this browser.
 *
 * The document only ever lives in IndexedDB — there is no server copy to
 * restore from — so clearing it is genuinely unrecoverable. Hence two
 * confirmations, and a prominent offer to save a `.issp` file first whenever
 * the in-browser copy is ahead of the last file save.
 *
 * Rendered from the editor sidebar (desktop and mobile footers) and from the
 * account page's "This device" card, which is the only one of the three that
 * is reachable when no document is open.
 */
export function ClearDataFlow({
  step,
  unsavedToFile,
  onSave,
  onStepChange,
  onConfirm,
  /** Outline-button overrides; the sidebar needs them to sit on its tinted background. */
  controlClassName,
}: {
  step: ClearDataStep;
  unsavedToFile: boolean;
  onSave: () => void;
  onStepChange: (step: ClearDataStep) => void;
  onConfirm: () => void;
  controlClassName?: string;
}) {
  if (step === "step1") {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-2.5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Clear editor data?</p>
          <p className="text-xs leading-snug text-muted-foreground">
            This will permanently remove your ISSP from this browser.
          </p>
        </div>
        {unsavedToFile && (
          <div className="rounded-md border border-warning-border bg-warning-bg px-2.5 py-2 text-xs text-warning space-y-2">
            <p className="font-medium">You have unsaved changes.</p>
            <p className="leading-snug">Save your file before clearing.</p>
            <Button size="sm" variant="outline" className={cn("h-7 text-xs px-2", controlClassName)} onClick={onSave}>
              <Download className="h-3.5 w-3.5" />
              Save .issp file
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="h-7 flex-1 text-xs px-3" onClick={() => onStepChange("step2")}>
            Continue
          </Button>
          <Button size="sm" variant="outline" className={cn("h-7 flex-1 text-xs px-3", controlClassName)} onClick={() => onStepChange("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (step === "step2") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-2.5 text-destructive">
        <div className="space-y-1">
          <p className="text-sm font-semibold">This action is irreversible.</p>
          <p className="text-xs leading-snug">
            Your ISSP will be permanently deleted from this browser. There is no undo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" className="h-7 flex-1 text-xs px-3" onClick={onConfirm}>
            Delete permanently
          </Button>
          <Button size="sm" variant="outline" className={cn("h-7 flex-1 text-xs px-3", controlClassName)} onClick={() => onStepChange("step1")}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
