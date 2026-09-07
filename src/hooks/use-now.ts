"use client";

import { useEffect, useState } from "react";

/**
 * A clock that ticks on an interval, so relative timestamps ("Saved 3 min ago")
 * keep counting up while the page sits open instead of freezing at whatever
 * they read on mount.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
