"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { InventoryEditor } from "@/components/annex1/inventory-editor";
import { useIsspStore } from "@/lib/store";
import { useEditorMobileSidebar } from "@/components/editor/editor-mobile-sidebar-context";
import {
  buildDisplayLabel,
  defaultEquipmentRows,
  defaultSoftwareRows,
  type Annex1FilePayload,
  type OfficeIdentity,
  type OfficeType,
  type PhilippineRegionCode,
  type EquipmentRow,
  type SoftwareRow,
} from "@/lib/annex1/types";

export function EditorAnnex1EditContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { doc, loading, update } = useIsspStore();
  const mobileSidebar = useEditorMobileSidebar();

  if (loading) return null;
  if (!doc) { router.replace("/editor"); return null; }

  const key = params.get("key");
  const typeParam = params.get("type");

  // EDIT mode: key present
  if (key) {
    // Cast: doc.annexedOffices uses the store's inline Annex1FilePayload (office.type
    // widened to string to avoid a circular import); the canonical shape is structurally
    // identical and is what InventoryEditor expects.
    const existing = (doc.annexedOffices ?? []).find((a) => a.office.displayLabel === key) as Annex1FilePayload | undefined;
    if (!existing) { router.replace("/editor/annex1"); return null; }

    function handleUpdate(payload: Annex1FilePayload) {
      update((prev) => ({
        ...prev,
        annexedOffices: (prev.annexedOffices ?? []).map((a) =>
          a.office.displayLabel === key ? payload : a
        ),
      }));
      toast.success("Office updated");
      return true;
    }

    return (
      <Shell breadcrumbLabel="Edit office" mobileSidebar={mobileSidebar}>
        <InventoryEditor
          mode="save"
          office={existing.office}
          initialEquipment={existing.annex1.equipment}
          initialSoftware={existing.annex1.software}
          onSave={handleUpdate}
          onSaved={() => router.push("/editor/annex1")}
          onBack={() => router.push("/editor/annex1")}
          saveLabel="Save changes"
        />
      </Shell>
    );
  }

  // NEW mode: type present
  if (typeParam) {
    const officeType = typeParam as OfficeType;
    const region = (params.get("region") ?? undefined) as PhilippineRegionCode | undefined;
    const fieldName = params.get("name") ?? "";
    const displayLabel = buildDisplayLabel(officeType, region, fieldName);
    const office: OfficeIdentity = {
      type: officeType,
      region,
      name: officeType === "central"  ? "Central Office"
          : officeType === "regional" ? `Regional Office — ${region}`
          : fieldName,
      displayLabel,
    };

    // Snapshot the attached list at render time; closures below can't see the narrowed
    // `doc` (TS conservatively widens it back to nullable inside a nested function).
    const attachedOffices = doc.annexedOffices ?? [];

    function handleAdd(payload: Annex1FilePayload) {
      const dup = attachedOffices.some((a) => a.office.displayLabel === payload.office.displayLabel);
      if (dup) {
        toast.error(`"${payload.office.displayLabel}" is already in the list`);
        return false;
      }
      update((prev) => ({ ...prev, annexedOffices: [...(prev.annexedOffices ?? []), payload] }));
      toast.success("Office added");
      return true;
    }

    return (
      <Shell breadcrumbLabel="Add office" mobileSidebar={mobileSidebar}>
        <InventoryEditor
          mode="save"
          office={office}
          initialEquipment={defaultEquipmentRows()}
          initialSoftware={defaultSoftwareRows()}
          onSave={handleAdd}
          onSaved={() => router.push("/editor/annex1")}
          onBack={() => router.push("/editor/annex1")}
          saveLabel="Add office"
        />
      </Shell>
    );
  }

  // Neither key nor type → go pick an office
  router.replace("/editor/annex1/new");
  return null;
}

function Shell({
  breadcrumbLabel,
  mobileSidebar,
  children,
}: {
  breadcrumbLabel: string;
  mobileSidebar: ReturnType<typeof useEditorMobileSidebar>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-3 text-xs text-muted-foreground">
          <button
            type="button"
            className="md:hidden inline-flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => mobileSidebar?.openMobileSidebar()}
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <Link href="/editor/annex1" className="hover:text-foreground transition-colors">Annex 1</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{breadcrumbLabel}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-8">{children}</div>
    </div>
  );
}
