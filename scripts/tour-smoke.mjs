#!/usr/bin/env node
/**
 * Smoke test: SnapRoom demo tour advances through home steps and loads demo results.
 * Run: node scripts/tour-smoke.mjs [baseUrl]
 */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

function loadPlaywright() {
  const candidates = [
    "playwright",
    resolve(here, "../node_modules/playwright"),
    resolve(here, "../../pw-export-test/node_modules/playwright"),
    "/Users/bnarcum/Desktop/Cursor Skunkworks/pw-export-test/node_modules/playwright",
  ];
  for (const id of candidates) {
    try {
      return require(id);
    } catch {
      /* try next */
    }
  }
  throw new Error("playwright not found — run: npm i -D playwright in room-ai");
}

const { chromium } = loadPlaywright();

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const HOME_STEPS = 5; // welcome through analyze (step indices 0-4)

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto(`${baseUrl}/?tour=1`, { waitUntil: "networkidle" });

  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });

  for (let i = 0; i < HOME_STEPS; i++) {
    const dialog = page.locator('[role="dialog"]');
    const label = await dialog.locator(".demo-tour-step-label").textContent();
    const expected = `Step ${i + 1} of 10`;
    if (!label?.includes(`Step ${i + 1}`)) {
      throw new Error(`Expected "${expected}", got "${label}"`);
    }

    const next = dialog.getByRole("button", { name: "Next", exact: true });
    await next.waitFor({ state: "visible", timeout: 5000 });

    const box = await next.boundingBox();
    if (!box) throw new Error(`Next button not hittable on step ${i + 1}`);

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(i === HOME_STEPS - 1 ? 800 : 400);
  }

  await page.waitForURL(/\/results/, { timeout: 10_000 });

  const finalLabel = await page.locator('[role="dialog"] .demo-tour-step-label').textContent();
  if (!finalLabel?.includes("Step 6")) {
    throw new Error(`After demo results, expected step 6, got "${finalLabel}"`);
  }

  await page.waitForSelector("#tour-dimensions", { timeout: 10_000 });

  const backdrop = await page.locator(".demo-tour-backdrop.is-visible").count();
  if (backdrop === 0) {
    throw new Error("Tour backdrop disappeared on results step 6");
  }

  console.log("OK: tour steps 1→5, demo results loaded, step 6 on /results");
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
