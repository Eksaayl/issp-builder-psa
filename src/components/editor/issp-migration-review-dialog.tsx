"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsspStore } from "@/lib/store";
import { getMigrationReviewSection } from "@/lib/migration-review";
import { useResolvedScope } from "@/hooks/use-resolved-scope";
import { isSectionVisible } from "@/lib/scope/paths";

export function IsspMigrationReviewDialog() {
  const router = useRouter();
  const { migrationNotice, acknowledgeMigrationNotice } = useIsspStore();
  const scope = useResolvedScope();
  if (!migrationNotice) return null;

  // A scoped office file can carry review flags for sections outside that
  // office's scope (the master had other sections flagged too). Never pop
  // this modal over something the office doesn't own and can't even open —
  // Null scope ⇒ isSectionVisible is always true ⇒ unscoped behavior is
  // unchanged.
  const visiblePendingIds = migrationNotice.pendingSectionIds.filter((id) => isSectionVisible(scope, id));
  if (visiblePendingIds.length === 0) return null;

  const sections = visiblePendingIds
    .map(getMigrationReviewSection)
    .filter((section): section is NonNullable<typeof section> => !!section);
  const firstSection = sections[0];

  function finish(destination: string) {
    acknowledgeMigrationNotice();
    router.push(destination);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) finish("/editor"); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-warning-bg text-warning ring-1 ring-warning-border">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-xl">Your ISSP file was updated</DialogTitle>
          <DialogDescription>
            File format v{migrationNotice.sourceSchemaVersion} → v{migrationNotice.migratedToSchemaVersion}. Your data was carried forward automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55dvh] overflow-y-auto px-6 py-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            The ISSP template has changed since this file was created — see below for what and why. The builder can translate the file structure, but it cannot confirm what your agency intended in the affected answers.
          </p>
          <div className="space-y-2">
            {sections.map((section) => (
              <div key={section.id} className="rounded-lg border border-warning-border bg-warning-bg px-3.5 py-3">
                <p className="font-semibold text-foreground">{section.label}</p>
                <p className="mt-0.5 text-xs text-warning">{section.reason}</p>
              </div>
            ))}
          </div>
          <p>
            These sections were unmarked as done. Cross-check their entries against the current form, then mark each section as done again to clear its review flag.
          </p>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none px-6">
          <Button variant="outline" onClick={() => finish("/editor")}>Go to overview</Button>
          <Button onClick={() => finish(firstSection?.href ?? "/editor")}>
            Review first section
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
