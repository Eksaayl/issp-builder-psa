"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, LayoutDashboard, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorMobileSidebar } from "./editor-mobile-sidebar-context";

/**
 * "This section isn't part of your assigned scope" panel.
 *
 * Rendered by {@link SectionShell} (via `isSectionVisible`) and by the Annex 1
 * editor routes when a scoped doc navigates to a section the office doesn't own.
 * Null-scope docs never reach this component — callers gate it on
 * `!isSectionVisible(scope, …)`, and `isSectionVisible(null, …)` is always true.
 *
 * Markup is byte-identical to the inline block previously embedded in
 * `section-shell.tsx`; extracted here so Annex 1's standalone page shells can
 * share it without dragging in SectionShell's form-chrome assumptions.
 */
export function ScopeGuardPanel() {
  const router = useRouter();
  const mobileSidebar = useEditorMobileSidebar();

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 px-4 md:-mx-8 md:px-8 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b -mt-4 md:-mt-8">
        <div className="py-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <button
            type="button"
            aria-label="Open editor navigation"
            onClick={mobileSidebar?.openMobileSidebar}
            className="md:hidden -ml-1 mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.push("/editor")}
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <LayoutDashboard className="h-3 w-3" />
            Overview
          </button>
        </div>
      </div>
      <div className="flex gap-3 rounded-lg border border-border bg-card px-4 py-6 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">This section isn&apos;t part of your assigned scope.</p>
          <p className="text-muted-foreground leading-relaxed">
            Your office&apos;s copy of this ISSP only includes the sections you&apos;re responsible for. Return to the overview to continue editing the sections assigned to you.
          </p>
          <div className="pt-2">
            <Button onClick={() => router.push("/editor")} className="gap-1.5">
              <LayoutDashboard className="h-4 w-4" />
              Return to Overview
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
