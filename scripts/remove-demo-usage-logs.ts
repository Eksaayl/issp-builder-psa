// Purges usage-log entries for agencies excluded by
// src/lib/usage-log-policy.ts (demo agency, smoke fixtures, deploy checks) —
// the policy is the single source of truth. Atomic rewrite: temp file +
// chmod 600 + rename; malformed lines are preserved so cleanup never
// discards unrelated data.
// Run: npx tsx scripts/remove-demo-usage-logs.ts
import { chmod, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isExcludedDemoAgency } from "../src/lib/usage-log-policy";

// Top-level await is not available under tsx's cjs output for this package, so
// the work runs in an IIFE.
void (async () => {
  const configuredPath = process.env.ISSP_USAGE_LOG_PATH?.trim();
  const logPath = configuredPath
    ? path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath)
    : path.join(process.cwd(), ".data", "issp-usage.jsonl");
  const lines = (await readFile(logPath, "utf8")).split("\n");
  let removed = 0;

  const retainedLines = lines.filter((line) => {
    if (!line) return false;
    try {
      const value = JSON.parse(line) as { agencyAcronym?: unknown };
      if (
        typeof value.agencyAcronym === "string"
        && isExcludedDemoAgency({ acronym: value.agencyAcronym })
      ) {
        removed += 1;
        return false;
      }
    } catch {
      // Preserve malformed lines so cleanup never discards unrelated data.
    }
    return true;
  });

  if (removed > 0) {
    const tempPath = `${logPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(tempPath, `${retainedLines.join("\n")}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await chmod(tempPath, 0o600);
      await rename(tempPath, logPath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  console.log(`Removed ${removed} excluded-agency usage log entries; retained ${retainedLines.length}.`);
})();
