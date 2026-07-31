"use client";

import { useRouter } from "next/navigation";
import { OfficeSelector, type OfficeSelection } from "@/components/annex1/office-selector";

export default function Annex1SetupPage() {
  const router = useRouter();

  function handleContinue(s: OfficeSelection) {
    const params = new URLSearchParams({ type: s.type });
    if (s.region) params.set("region", s.region);
    if (s.type === "field" && s.name) params.set("name", s.name);
    router.push(`/annex1/edit?${params.toString()}`);
  }

  return <OfficeSelector onContinue={handleContinue} />;
}
