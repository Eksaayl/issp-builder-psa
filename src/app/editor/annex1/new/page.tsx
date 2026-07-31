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
