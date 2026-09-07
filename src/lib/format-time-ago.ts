/**
 * Coarse "time since" label for save timestamps.
 *
 * `now` is passed in rather than read from the clock so callers can drive
 * re-renders from a single ticking value (see `useNow`) instead of each call
 * site reading `Date.now()` independently and drifting apart.
 */
export function formatTimeAgo(isoString: string, now: number): string {
  const diff = now - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
