"use client";

import Link from "next/link";
import { PlayCircle, ArrowRight } from "lucide-react";
import type { SectionMeta } from "@/lib/store";
import { RelativeTime } from "@/components/ui/relative-time";
import { findContinueTarget } from "@/lib/sections";

export function ContinueEditingCard({
  sectionMeta,
  visibleSectionIds,
}: {
  sectionMeta: Record<string, SectionMeta>;
  /**
   * Optional set of section ids the current office can see. When supplied
   * (scoped doc), the continue target is picked only from this set so the card
   * never surfaces a link to a hidden section. Omit (or pass null/empty) for an
   * unscoped doc — every part section is eligible, matching the original behavior.
   */
  visibleSectionIds?: Set<string> | null;
}) {
  // When a scope is supplied, only count edits the office owns — otherwise an
  // unscoped-looking fallback ("Continue where you left off") shows even if no
  // owned section has been touched. Null scope ⇒ original "any edit" check.
  const hasAnyEdit =
    !visibleSectionIds || visibleSectionIds.size === 0
      ? Object.values(sectionMeta).some((m) => m.lastEditedAt)
      : Object.entries(sectionMeta).some(
          ([id, m]) => m.lastEditedAt && visibleSectionIds.has(id)
        );
  const { section, part, lastEditedAt } = findContinueTarget(sectionMeta, visibleSectionIds);

  return (
    <Link
      href={section.href}
      className="flex items-center gap-4 rounded-xl border border-info bg-card px-5 py-4 transition-colors hover:bg-accent group"
    >
      <PlayCircle className="h-5 w-5 shrink-0 text-info" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-info">
          {hasAnyEdit ? "Continue where you left off" : "Start with Part I"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          Part {part.part} · {section.label}
          {lastEditedAt && (
            <> · <RelativeTime iso={lastEditedAt} /></>
          )}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-info opacity-60 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}
