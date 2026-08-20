"use client";

import { AccountSettingsCards, ChangePasswordCard, useAuthenticate } from "@neondatabase/auth-ui";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "settings", label: "Account" },
  { path: "security", label: "Security" },
] as const;

export function AccountSettingsView({ path }: { path: string }) {
  useAuthenticate();
  const activeTab = TABS.some((tab) => tab.path === path) ? path : "settings";

  return (
    <div className="flex w-full grow flex-col gap-4 md:gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit gap-1 px-2"
        nativeButton={false}
        render={<Link href="/" />}
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </Button>
      <div className="flex w-full grow flex-col gap-4 md:flex-row md:gap-12">
        <div className="flex w-48 flex-col lg:w-60">
          {TABS.map((tab, index) => (
            <Link
              key={tab.path}
              href={`/account/${tab.path}`}
              className={cn(
                "px-1 py-2.5 text-sm transition-colors",
                index > 0 && "border-t",
                activeTab === tab.path
                  ? "font-semibold text-foreground"
                  : "text-foreground/70 hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {activeTab === "security" ? <ChangePasswordCard /> : <AccountSettingsCards />}
      </div>
    </div>
  );
}
