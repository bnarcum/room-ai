#!/usr/bin/env node
/**
 * Smoke test: home analyze affordance + seeded results UI.
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
      camera: [
        "Keep cameras at eye height. [Cisco guidance](https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html) https://www.cisco.com/c/dam/en/us/td/docs/telepresence/endpoint/technical-papers/workspace-best-practices.pdf",
        "Check backlight.",
      ],
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

const TINY_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// 24×16 ft area heuristic is 14 seats (max of occupancy 13).
const EXPECTED_DESIGNER =
  "https://designer.webex.com/#/room/mediumroom/summary?1&rt=Medium%20Room&ch=14";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tour-analyze", { timeout: 10_000 });
  await page.waitForSelector("#tour-upload input[type='file']", { timeout: 5_000 });
  await page.waitForSelector("#ceiling-height", { timeout: 5_000 });
  const homeText = await page.locator("main").textContent();
  if (!homeText?.includes("Analyze")) {
    throw new Error("Home page is missing Analyze");
  }
  if (homeText.toLowerCase().includes("quick estimate") && homeText.toLowerCase().includes("classic")) {
    throw new Error("Home should not fork to quick vs classic");
  }

  await page.evaluate((payload) => {
    sessionStorage.setItem("room-ai-analysis-v1", JSON.stringify(payload));
    sessionStorage.removeItem("room-ai-photo-v1");
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
    if (order[i].top < order[i - 1].top - 1) {
      throw new Error(
        `Results order wrong: #${order[i].id} appeared above #${order[i - 1].id}`,
      );
    }
  }

  const expectedRecs = ["Camera", "Display", "Audio", "Lighting", "Network"];
  for (const title of expectedRecs) {
    const rec = await page.locator(`[data-testid="rec-${title}"]`).textContent();
    if (!rec?.includes(title)) {
      throw new Error(`Missing rec heading: ${title}`);
    }
    if (title === "Camera" && rec.includes("Check backlight")) {
      throw new Error("Recs should be first sentence only");
    }
    if (rec.includes("cisco.com/c/dam") || rec.includes("https://www.cisco.com/c/dam")) {
      throw new Error(`${title} rec still shows a raw /c/dam URL: ${rec}`);
    }
  }

  const cameraLink = page.locator('[data-testid="rec-link-Camera"]');
  if ((await cameraLink.count()) !== 1) {
    throw new Error("Camera rec should render a Cisco guidance <a href>");
  }
  const cameraHref = await cameraLink.getAttribute("href");
  if (cameraHref !== "https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html") {
    throw new Error(`Camera guidance href was ${cameraHref}`);
  }
  if ((await cameraLink.textContent())?.trim() !== "Cisco guidance") {
    throw new Error("Guidance link label should be Cisco guidance");
  }

  const collabLabel = await page.locator("#tour-collab-cta").textContent();
  if (!collabLabel?.includes("Open Collab Experience")) {
    throw new Error(`Missing Open Collab Experience action: ${collabLabel}`);
  }

  const designerHref = await page.locator("#tour-designer-cta").getAttribute("href");
  if (designerHref !== EXPECTED_DESIGNER) {
    throw new Error(`Designer URL mismatch: ${designerHref}`);
  }

  const headline = await page.locator("[data-testid='results-headline']").textContent();
  if (
    !headline?.includes("Conference") ||
    !headline.includes("14 seats") ||
    !headline.includes("about 24 × 16")
  ) {
    throw new Error(`Headline missing type/seats/midpoints: ${headline}`);
  }
  if (headline.includes("22–26") || headline.includes("12–16")) {
    throw new Error(`Headline still shows raw ranges: ${headline}`);
  }

  const body = await page.locator("main").textContent();
  for (const banned of [
    "Photorealistic",
    "Already there",
    "Midpoints for exports",
    "snaproom-tour-fixture",
    "Guided wizard",
  ]) {
    if (body?.includes(banned)) {
      throw new Error(`Results still shows hidden copy: ${banned}`);
    }
  }

  const emptyPhoto = await page.locator('[data-testid="results-photo"]').count();
  if (emptyPhoto !== 0) {
    throw new Error("No stored photo should not render a thumbnail");
  }

  for (const title of expectedRecs) {
    const overflow = await page
      .locator(`[data-testid="rec-${title}"] .results-rec-text`)
      .evaluate((el) => getComputedStyle(el).textOverflow);
    if (overflow === "ellipsis") {
      throw new Error(`${title} rec is CSS-truncated with ellipsis`);
    }
  }

  const fallbackPayload = structuredClone(FIXTURE);
  await page.evaluate(
    ({ analysis, photo }) => {
      sessionStorage.setItem("room-ai-analysis-v1", JSON.stringify(analysis));
      sessionStorage.setItem("room-ai-photo-v1", photo);
    },
    { analysis: fallbackPayload, photo: TINY_PHOTO },
  );
  await page.goto(`${baseUrl}/results`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="results-photo"]', { timeout: 10_000 });
  if ((await page.locator('[data-testid="photo-spotlight"]').count()) !== 0) {
    throw new Error("Spotlight should be hidden until hover/click");
  }
  await page.locator('[data-testid="rec-Camera"]').hover();
  await page.waitForSelector('[data-testid="photo-spotlight"]', { timeout: 5_000 });
  const fallbackRegion = await page
    .locator('[data-testid="photo-spotlight"]')
    .getAttribute("data-region");
  if (fallbackRegion !== "camera") {
    throw new Error(`Fallback spotlight region was ${fallbackRegion}`);
  }
  const fallbackCaption = await page
    .locator('[data-testid="photo-spotlight-caption"]')
    .textContent();
  if (fallbackCaption?.trim() !== "Camera") {
    throw new Error(`Fallback caption was ${fallbackCaption}`);
  }

  const boxed = structuredClone(FIXTURE);
  boxed.data.focusRegions = {
    display: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    camera: { x: 0.55, y: 0.12, w: 0.4, h: 0.45 },
  };
  await page.evaluate(
    ({ analysis, photo }) => {
      sessionStorage.setItem("room-ai-analysis-v1", JSON.stringify(analysis));
      sessionStorage.setItem("room-ai-photo-v1", photo);
    },
    { analysis: boxed, photo: TINY_PHOTO },
  );
  await page.goto(`${baseUrl}/results`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="results-photo"]', { timeout: 10_000 });
  await page.locator('[data-testid="rec-Display"]').click();
  const spot = page.locator('[data-testid="photo-spotlight"]');
  await spot.waitFor({ timeout: 5_000 });
  if ((await spot.getAttribute("data-region")) !== "display") {
    throw new Error("Pinned display rec should spotlight display");
  }
  const style = await spot.getAttribute("style");
  if (!style?.includes("left: 10%") || !style.includes("top: 20%") || !style.includes("width: 30%")) {
    throw new Error(`Spotlight style did not match focusRegions: ${style}`);
  }
  await page.locator('[data-testid="rec-Display"]').click();
  if ((await page.locator('[data-testid="photo-spotlight"]').count()) !== 0) {
    throw new Error("Clicking the same rec should clear the pin");
  }
  await page.locator('[data-testid="rec-Camera"]').click();
  await page.waitForSelector('[data-testid="photo-spotlight"]', { timeout: 5_000 });
  await page.locator('[data-testid="results-photo-frame"]').click();
  if ((await page.locator('[data-testid="photo-spotlight"]').count()) !== 0) {
    throw new Error("Clicking the photo should clear the spotlight");
  }

  console.log("OK: home analyze + cinematic results, Designer URL matches seat count");
  console.log(`  Designer URL: ${designerHref}`);
  console.log(`  Headline: ${headline?.trim()}`);
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
