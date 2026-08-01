import { chmod, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const configuredPath = process.env.ISSP_USAGE_LOG_PATH?.trim();
const logPath = configuredPath
  ? path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath)
  : path.join(process.cwd(), ".data", "issp-usage.jsonl");
const lines = (await readFile(logPath, "utf8")).split("\n");
let removed = 0;

function isNcwtrAcronym(value: string): boolean {
  return value.trim().toUpperCase() === "NCWTR";
}

const retainedLines = lines.filter((line) => {
  if (!line) return false;
  try {
    const value = JSON.parse(line) as { agencyAcronym?: unknown };
    if (
      typeof value.agencyAcronym === "string"
      && isNcwtrAcronym(value.agencyAcronym)
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

console.log(`Removed ${removed} NCWTR usage log entries; retained ${retainedLines.length}.`);
