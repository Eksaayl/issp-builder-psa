"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_THEME,
  THEMES,
  THEME_MIGRATED_KEY,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from "@/lib/themes";

// Re-exported so existing call sites can keep importing the catalogue from the
// same place as the hook.
export { DEFAULT_THEME, THEMES, THEME_MIGRATED_KEY, THEME_STORAGE_KEY, isThemeId };
export type { ThemeId };

// One-time migration: a stored "system-light" (the old default) is treated as
// unset and moved to the new default, exactly once. Mirrored in layout.tsx's
// pre-hydration script, which runs first — see THEME_MIGRATED_KEY's comment.
function resolveStoredTheme(stored: string | null): ThemeId {
  if (stored === "system-light" && !window.localStorage.getItem(THEME_MIGRATED_KEY)) {
    window.localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME);
    window.localStorage.setItem(THEME_MIGRATED_KEY, "1");
    return DEFAULT_THEME;
  }
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

function applyThemeClass(theme: ThemeId) {
  const root = document.documentElement;
  root.classList.remove(...THEMES.map((item) => `theme-${item.id}`));
  root.classList.add(`theme-${theme}`);
}

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    return resolveStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  });

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme(nextTheme) {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        setThemeState(nextTheme);
        applyThemeClass(nextTheme);
      },
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
