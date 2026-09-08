"use client";

import { useState, useSyncExternalStore } from "react";
import { AccountSettingsCards, SessionsCard, useAuthenticate } from "@neondatabase/auth-ui";
import { ArrowLeftIcon, CheckIcon, DownloadIcon, MonitorIcon, PaletteIcon, TrashIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClearDataFlow, type ClearDataStep } from "@/components/shared/clear-data-flow";
import { ThemePreview } from "@/components/shared/theme-preview";
import { useNow } from "@/hooks/use-now";
import { formatTimeAgo } from "@/lib/format-time-ago";
import { useIsspStore } from "@/lib/store";
import { THEMES, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "settings", label: "Account" },
  { path: "security", label: "Security" },
] as const;

/** Never changes after hydration, so there is nothing to subscribe to. */
const subscribeNoop = () => () => {};

/**
 * Theme picker.
 *
 * The editor's File menu has one of these, but it is a dropdown and it is only
 * reachable with a document open. The only other control in the app is buried
 * inside a collapsed section of the What's New dialog, so anyone who does not
 * use the editor has no practical way to change theme. A settings page is
 * where people look for this.
 */
function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  // `useTheme` seeds itself from localStorage, which the server cannot see, so
  // the active theme differs between the SSR pass and the first client render
  // and React discards the tree. Mark nothing active until hydration has
  // happened, so both passes agree, then let the re-render light up the real
  // one. The sidebar's theme menu dodges this only because a dropdown does not
  // render until it is opened, long after hydration.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-semibold">
          <PaletteIcon className="size-4 text-muted-foreground" />
          Appearance
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Saved in this browser, not to your account — another computer will use its own
          setting.
        </p>
      </div>

      {/* Ten themes: five to a row on a wide screen fills both rows evenly. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {THEMES.map((item) => {
          const active = hydrated && theme === item.id;
          return (
            <button
              key={item.id}
              type="button"
              // `aria-pressed` rather than colour alone, so the active theme is
              // announced instead of only being visible.
              aria-pressed={active}
              onClick={() => setTheme(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <ThemePreview theme={item.id} />
              <span className="truncate">{item.name}</span>
              {active && <CheckIcon className="ml-auto size-3.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What this browser is holding.
 *
 * The ISSP never leaves the device -- it lives in IndexedDB with no server
 * copy -- so "your data" is really "this browser's data". The editor sidebar
 * and the home page's continue card both show it too, but only while a
 * document is open; this is the one place that answers the question when
 * nothing is loaded, which is what matters on a shared workstation.
 */
function ThisDeviceCard() {
  const { doc, fileSavedAt, unsavedToFile, saveToFile, clearDoc } = useIsspStore();
  const [clearStep, setClearStep] = useState<ClearDataStep>("idle");
  const now = useNow();

  async function handleSaveToFile() {
    const result = await saveToFile();
    if (result.success) toast.success("Saved .issp file.");
    else toast.error(result.error);
  }

  async function handleClear() {
    const result = await clearDoc();
    if (result.success) {
      setClearStep("idle");
      toast.success("Browser draft cleared.");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="space-y-1.5">
        <h3 className="flex items-center gap-2 font-semibold">
          <MonitorIcon className="size-4 text-muted-foreground" />
          This device
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your ISSP is stored in this browser only — it is never uploaded. Clearing this
          browser&apos;s data, or using a different computer, means starting from your last
          saved <code className="rounded bg-muted px-1 py-0.5 text-xs">.issp</code> file.
        </p>
      </div>

      {doc ? (
        <>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Agency</dt>
            <dd className="font-medium">
              {doc.agency.acronym || doc.agency.name || "Unnamed agency"}
            </dd>
            <dt className="text-muted-foreground">Planning period</dt>
            <dd className="font-medium">
              {doc.startYear}–{doc.endYear}
              {doc.amendmentNumber > 0 && ` · Amendment ${doc.amendmentNumber}`}
            </dd>
            <dt className="text-muted-foreground">Last saved to file</dt>
            <dd
              className={cn(
                "flex items-center gap-1.5 font-medium",
                unsavedToFile ? "text-amber-600" : "text-success",
              )}
            >
              {unsavedToFile ? (
                <>
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                  </span>
                  Unsaved changes
                </>
              ) : (
                <>
                  <CheckIcon className="size-3.5 shrink-0" />
                  {fileSavedAt ? formatTimeAgo(fileSavedAt, now) : "Up to date"}
                </>
              )}
            </dd>
          </dl>

          {clearStep === "idle" ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleSaveToFile}>
                <DownloadIcon className="size-4" />
                Save .issp file
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={() => setClearStep("step1")}
              >
                <TrashIcon className="size-4" />
                Clear this device
              </Button>
            </div>
          ) : (
            <ClearDataFlow
              step={clearStep}
              unsavedToFile={unsavedToFile}
              onSave={handleSaveToFile}
              onStepChange={setClearStep}
              onConfirm={handleClear}
            />
          )}
        </>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No ISSP is stored in this browser.
        </p>
      )}
    </div>
  );
}

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
        {activeTab === "security" ? (
          // Composed by hand rather than using `SecuritySettingsCards`, which
          // would also pull in `ProvidersCard` -- link/unlink controls that mean
          // nothing for a Google-managed PSA identity. It gates that card on
          // `social.providers`, and we cannot drop that config because it is
          // what puts the Google button on the sign-in page.
          //
          // The trade-off is losing the bundle's automatic gating: if
          // `credentials` or `deleteUser` are ever enabled in `layout.tsx`, the
          // matching cards will not appear here on their own.
          <SessionsCard className="grow" />
        ) : (
          <div className="flex grow flex-col gap-4 md:gap-6">
            <AccountSettingsCards />
            <AppearanceCard />
            <ThisDeviceCard />
          </div>
        )}
      </div>
    </div>
  );
}
