import { THEMES, type ThemeId } from "@/lib/theme";

/**
 * A small two-tone dot standing in for a theme: the outer ring is the theme's
 * page background, the inner dot its secondary surface.
 *
 * Shared by the editor's File → Theme menu and the account page's Appearance
 * card, so the same theme reads the same way in both places.
 */
export function ThemePreview({ theme }: { theme: ThemeId }) {
  const item = THEMES.find((candidate) => candidate.id === theme)!;

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border"
      style={{ backgroundColor: item.background, borderColor: item.border }}
    >
      <span
        className="h-2 w-2 rounded-full border border-black/10"
        style={{ backgroundColor: item.secondary }}
      />
    </span>
  );
}
