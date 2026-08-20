import type { Metadata } from "next";
import HomePageClient from "@/components/home/home-page-client";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "ISSP Builder — Free DICT ISSP Editor for Philippine Government Agencies",
  description:
    "Free, browser-based ISSP editor for Philippine government agencies. Aligned to the DICT 2026 template. No account, no server, no ads — your data stays in your browser.",
});

export default function HomePage() {
  return <HomePageClient />;
}
