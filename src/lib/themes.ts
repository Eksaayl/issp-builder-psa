/**
 * The theme catalogue, kept out of `theme.tsx` because that file is a client
 * module: importing a value from it into a server component yields a client
 * reference proxy rather than the array, which breaks the root layout's
 * pre-hydration script. Everything here is plain data, safe on both sides.
 *
 * Each entry carries the three colours the swatch previews need — the page
 * background, the secondary surface and the border — so a picker can render a
 * theme without that theme being applied.
 */

export const THEME_STORAGE_KEY = "issp-theme";

export const THEMES = [
  {
    id: "system-light",
    name: "System Light",
    background: "#FFFFFF",
    secondary: "#F5F5F7",
    border: "#D2D2D7",
  },
  {
    id: "system-dark",
    name: "System Dark",
    background: "#000000",
    secondary: "#161618",
    border: "#38383A",
  },
  {
    id: "warm-light",
    name: "Warm Light",
    background: "#FAFAF7",
    secondary: "#F2F1EC",
    border: "#E5E3DC",
  },
  {
    id: "warm-dark",
    name: "Warm Dark",
    background: "#1C1A17",
    secondary: "#201E1B",
    border: "#383430",
  },
  {
    id: "ocean-light",
    name: "Ocean Light",
    background: "#F5F9FD",
    secondary: "#E7F0F9",
    border: "#CFE0EF",
  },
  {
    id: "ocean-dark",
    name: "Ocean Dark",
    background: "#0B1622",
    secondary: "#101C29",
    border: "#26394B",
  },
  {
    id: "forest-light",
    name: "Forest Light",
    background: "#F6FAF6",
    secondary: "#E9F2EA",
    border: "#CFE1D2",
  },
  {
    id: "forest-dark",
    name: "Forest Dark",
    background: "#0D1611",
    secondary: "#111C16",
    border: "#27392E",
  },
  {
    id: "rose-light",
    name: "Rose Light",
    background: "#FDF7F9",
    secondary: "#F7E9EF",
    border: "#EBD3DC",
  },
  {
    id: "rose-dark",
    name: "Rose Dark",
    background: "#1A1015",
    secondary: "#1F141A",
    border: "#3D2B35",
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "system-light";

export function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
