// End-to-end smoke for the Consolidate merge review (spec 2026-09-27, Slice 4):
// load a master → open Consolidate → select two returned files → the review
// shows each headline change kind, a conflict with no default (Apply off), a
// provenance warning → pick the conflict, Keep master on a removed row →
// Apply → assert the saved master matches the decisions.
//
// Prereq: fixtures + a dev server (never npm run build / npm start):
//   npx tsx scripts/make-merge-review-fixture.ts <dir>
//   SMOKE_BASE=http://localhost:3000 node scripts/smoke-merge-review.mjs <dir>
// Non-secure-context repro (crypto.randomUUID neutralized) as in smoke-roundtrip.mjs.
import puppeteer from "puppeteer";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const DIR = process.argv[2];
if (!DIR) throw new Error("usage: node scripts/smoke-merge-review.mjs <fixture-dir>");

const fails = [];
const fail = (m) => { console.error("  ASSERT FAIL:", m); fails.push(m); };
const ok = (m) => console.log("  ok:", m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/root/.cache/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const readDoc = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const rq = indexedDB.open("issp-builder");
  rq.onsuccess = () => {
    const g = rq.result.transaction("documents").objectStore("documents").get("current");
    g.onsuccess = () => resolve(g.result);
    g.onerror = () => reject(g.error);
  };
  rq.onerror = () => reject(rq.error);
}));

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  });

  console.log("\n=== Load master, open Consolidate ===");
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 });
  await (await page.$('input[type="file"]')).uploadFile(`${DIR}/review-master.issp`);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector("aside nav", { timeout: 15000 });
  await sleep(800);
  const master = await readDoc(page);
  const kebab = await page.evaluateHandle(() => {
    const bs = [...document.querySelectorAll('button[aria-label="More file actions"]')];
    return bs.find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || bs[0];
  });
  await kebab.asElement().click();
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((e) => /Consolidate returned files/.test(e.textContent || "")).click());
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  ok("Consolidate dialog opened");

  console.log("\n=== Select two returned files → review ===");
  await (await page.$('[role="dialog"] input[type="file"]')).uploadFile(`${DIR}/review-office-a.issp`, `${DIR}/review-office-b.issp`);
  await page.waitForFunction(() => /Review the merge/.test(document.querySelector('[role="dialog"]')?.textContent || ""), { timeout: 20000 });
  await sleep(500);
  const text = await page.$eval('[role="dialog"]', (e) => e.innerText);
  for (const word of ["Overwritten", "Cleared", "Replaced row", "Removed row", "Appended", "Conflict"]) {
    if (!text.includes(word)) fail(`review is missing a "${word}" change`);
    else ok(`review shows "${word}"`);
  }
  if (!/may belong to another ISSP/.test(text)) fail("provenance warning missing");
  else ok("provenance warning shown");
  if (!/\+₱225,000\.00/.test(text)) fail("Part IV line-item delta missing");
  else ok("Part IV line-item cost delta shown");
  if (!(await page.$('[role="dialog"] del')) || !(await page.$('[role="dialog"] ins'))) fail("word-level highlights missing");
  else ok("word-level highlights rendered");
  if (/[{}]"/.test(text) || /":/.test(text)) fail("raw JSON visible in the review");
  else ok("no raw JSON in the review");

  const applyDisabled = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => /Apply merge/.test(b.textContent || "")).disabled);
  if (!(await applyDisabled())) fail("Apply should stay off until the conflict is answered");
  else ok("Apply off while a conflict has no choice");

  console.log("\n=== Decide: conflict → Planning Office; Keep master on the removed row ===");
  await page.evaluate(() => {
    const l = [...document.querySelectorAll('[role="dialog"] label')].find((x) => x.textContent.trim().startsWith("Planning Office:"));
    document.getElementById(l.htmlFor).click();
  });
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('[role="dialog"] li')].find((li) => li.querySelector("span")?.textContent === "Removed row");
    row.querySelector('input[type="checkbox"]').click();
  });
  await sleep(300);
  if (await applyDisabled()) fail("Apply still off after the conflict was answered");
  else ok("Apply on after the conflict was answered");

  const apply = await page.evaluateHandle(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => /Apply merge/.test(b.textContent || "")));
  await apply.asElement().click();
  await sleep(1800);
  if (await page.$('[role="dialog"]')) fail("dialog did not close after Apply");
  else ok("dialog closed after Apply");

  console.log("\n=== Saved master matches the decisions ===");
  const after = await readDoc(page);
  const ids = after.part2.informationSystems.map((s) => s.id);
  if (after.part1.cioName !== "Dr. Jose Reyes") fail(`conflict choice not applied: cioName=${after.part1.cioName}`);
  else ok("conflict resolved to Planning Office's value");
  if (after.part1.cioEmail !== "") fail("accepted Cleared change not applied");
  else ok("accepted Cleared change applied");
  if (!ids.includes(master.part2.informationSystems[1].id)) fail("Keep master did not restore the removed system");
  else ok("Keep master restored the removed system");
  if (!ids.includes("sys-new-helpdesk") || !ids.includes("sys-new-dms")) fail("appended systems missing");
  else ok("both appended systems added");
  if (errors.length > 0) fail(`page errors: ${errors.join(" | ")}`);
  else ok("no page errors");
} catch (e) {
  fail(`unexpected exception: ${e.message}`);
} finally {
  await browser.close();
}

console.log(`\n${fails.length === 0 ? "ALL CHECKS PASSED" : `${fails.length} CHECK(S) FAILED`}`);
process.exit(fails.length === 0 ? 0 : 1);
