"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { InventoryEditor } from "@/components/annex1/inventory-editor";
import { defaultEquipmentRows, defaultSoftwareRows, buildDisplayLabel, type OfficeType, type PhilippineRegionCode } from "@/lib/annex1/types";

export function Annex1EditContent() {
  const router = useRouter();
  const params = useSearchParams();

  const officeType = (params.get("type") ?? "central") as OfficeType;
  const region = (params.get("region") ?? undefined) as PhilippineRegionCode | undefined;
  const fieldName = params.get("name") ?? "";

  if (!params.get("type")) {
    router.replace("/annex1");
    return null;
  }

  const office = {
    type: officeType,
    region,
    name: officeType === "central"  ? "Central Office"
        : officeType === "regional" ? `Regional Office — ${region}`
        : fieldName,
    displayLabel: buildDisplayLabel(officeType, region, fieldName),
  };

  return (
    <InventoryEditor
      mode="download"
      office={office}
      initialEquipment={defaultEquipmentRows()}
      initialSoftware={defaultSoftwareRows()}
      onBack={() => router.back()}
    />
  );
}
