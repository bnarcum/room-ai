#!/usr/bin/env node
/**
 * Smoke test: seeded analysis → results order, Designer URL, derived VRC copy.
 * Run: node scripts/results-smoke.mjs [baseUrl]
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
    "/Users/bnarcum/Projects/Cursor Skunkworks/pw-export-test/node_modules/playwright",
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

const FIXTURE = {
  ok: true,
  meta: { provider: "demo", model: "snaproom-tour-fixture" },
  data: {
    dimensions: {
      unit: "feet",
      length: 24,
      width: 16,
      height: 9,
      lengthMin: 22,
      lengthMax: 26,
      widthMin: 14.5,
      widthMax: 17.5,
      heightMin: 8.5,
      heightMax: 9.5,
      confidence: 0.74,
      reasoning: "Scaled from the long conference table.",
    },
    detectedReference: { type: "table", notes: "Conference table." },
    roomSummary: {
      likelyUse: "conference",
      occupancy: 13,
      primaryScreenDiagonalInches: 75,
      screenCount: 1,
      keyConstraints: ["Garden window"],
    },
    observedItems: {
      electronicsAndDevices: ["Wall-mounted flat-panel display"],
      plantsAndDecor: ["Large potted plant by the window"],
      otherNotable: ["Long wood conference table"],
    },
    recommendations: {
      camera: ["Keep cameras at eye height.", "Check backlight."],
      lighting: ["Add fill light.", "Dim overheads."],
      acoustics: ["Add absorption.", "Watch HVAC."],
      display: ["Confirm 75-inch legibility.", "Treat size as directional."],
      seating: ["Thirteen seats.", "Leave egress."],
      cabling: ["Center tray.", "No aisle crossings."],
      network: ["Wired drop at table.", "Reserve uplink."],
      power: ["In-table power.", "Confirm display circuit."],
    },
    quickChecklist: ["Glare", "Coverage", "Network"],
  },
};

const EXPECTED_DESIGNER =
  "https://designer.webex.com/#/room/mediumroom/summary?1&rt=Medium%20Room&ch=13";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.addInitScript((payload) => {
    sessionStorage.setItem("room-ai-analysis-v1", JSON.stringify(payload));
  }, FIXTURE);

  await page.goto(`${baseUrl}/results`, { waitUntil: "domcontentloaded" });

  await page.waitForSelector("#tour-room-read", { timeout: 10_000 });
  await page.waitForSelector("#tour-dimensions", { timeout: 5_000 });
  await page.waitForSelector("#tour-recommendations", { timeout: 5_000 });
  await page.waitForSelector("#tour-exports", { timeout: 5_000 });
  await page.waitForSelector("#tour-designer-cta", { timeout: 5_000 });

  const order = await page.evaluate(() => {
    const ids = [
      "tour-room-read",
      "tour-dimensions",
      "tour-recommendations",
      "tour-exports",
    ];
    return ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Missing #${id}`);
      return { id, top: el.getBoundingClientRect().top };
    });
  });
  for (let i = 1; i < order.length; i++) {
    if (order[i].top < order[i - 1].top) {
      throw new Error(
        `Results order wrong: #${order[i].id} appeared above #${order[i - 1].id}`,
      );
    }
  }

  const recTitles = await page
    .locator("#tour-recommendations .text-\\[15px\\]")
    .allTextContents();
  const expectedRecs = ["Camera", "Display", "Audio", "Lighting", "Network"];
  for (const title of expectedRecs) {
    if (!recTitles.some((t) => t.includes(title))) {
      throw new Error(`Missing rec heading: ${title}`);
    }
  }

  const designerHref = await page.locator("#tour-designer-cta").getAttribute("href");
  if (designerHref !== EXPECTED_DESIGNER) {
    throw new Error(`Designer URL mismatch: ${designerHref}`);
  }

  const vrcCopy = await page.locator('[data-testid="vrc-derived-fields"]').textContent();
  if (!vrcCopy?.includes('75"') || !vrcCopy.includes("Room Bar Pro")) {
    throw new Error(`VRC summary did not match estimate: ${vrcCopy}`);
  }
  if (vrcCopy.includes("4 × 10") || vrcCopy.includes("65\"")) {
    throw new Error(`VRC summary still looks hardcoded: ${vrcCopy}`);
  }

  const roomRead = await page.locator("#tour-room-read").textContent();
  if (!roomRead?.includes("13 seats") || !roomRead.includes("Conference")) {
    throw new Error(`Room read missing type/seats: ${roomRead}`);
  }

  const size = await page.locator("#tour-dimensions").textContent();
  if (!size?.includes("22–26") || !size.toLowerCase().includes("confidence")) {
    throw new Error(`Directional size missing ranges: ${size}`);
  }

  console.log("OK: results order, Designer URL, and VRC fields match the estimate");
  console.log(`  Designer URL: ${designerHref}`);
  console.log(`  ${vrcCopy?.trim()}`);
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
