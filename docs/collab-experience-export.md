# Collab Experience export — user guide

This document describes how **SnapRoom** connects to **[collabexperience.com](https://collabexperience.com)** (Video Room Calculator): which file to download, how to import it, and how it differs from the app’s plain analysis JSON.

---

## Quick decision: which file?


| Goal                                                                                    | Use this export                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Open the room in **collabexperience.com** Video Room Calculator                         | `**Download for Collab Experience (.vrc.json)`** |
| Archive the full SnapRoom payload (`ok` / `data`), share a link, or inspect raw analysis | `**Download full analysis (snaproom).json`**     |


**Do not** import `snaproom-analysis.json` (or the older `room-ai-analysis.json`) into Video Room Calculator — that format is app-specific. Collab expects the native calculator save format (`.vrc.json`).

---

## Standard workflow (after a new analysis)

1. Run an analysis from the SnapRoom home flow (upload / camera as the app supports).
2. Open the **Results** page when the run finishes.
3. Scroll to **Downloads**.
4. Click `**Download for Collab Experience (.vrc.json)`**.
5. On collabexperience.com, use that site’s **import / open file** flow for Video Room Calculator (same as opening a saved calculator file — often drag-and-drop or **Open** from the calculator UI).

The downloaded filename is derived from the room name in the export (sanitized for your filesystem).

---

## If you only have a saved `snaproom-analysis.json` or older `room-ai-analysis.json`

Earlier saves look like `{ "ok": true, "data": { ... } }`. Video Room Calculator cannot read that envelope.

1. Open **SnapRoom Results** (same browser if possible), **or** use the Results page when you have no in-tab results.
2. Use **Choose JSON file…** (convert) and pick your saved `snaproom-analysis.json` or `room-ai-analysis.json`.
3. The app downloads a `**.vrc.json`** — import **that** file on collabexperience.com, not the original JSON.

---

## What’s inside the `.vrc.json`

- **Native Video Room Calculator fields**: room dimensions, units, workspace/layers, surfaces, `items` (devices, tables, displays, etc.), aligned with the calculator version string used by the exporter (see `VIDEO_ROOM_CALC_FILE_VERSION` in code).
- `**roomAi`**: embedded copy of your SnapRoom analysis (versioned embed) so the file round-trips with context; the calculator UI may ignore extra keys depending on build.
- **Starter layout**: Defaults include calculator-friendly room math fields (e.g. FOV/crops/zoom placeholders) plus a minimal **Quick Setup–style scene** (e.g. table, single display, Room Bar Pro) so the canvas is not empty after import.

**Important:** Recommendation and narrative text from SnapRoom **does not render on the Collab canvas** — it lives in the JSON / your Results page. The canvas is for spatial layout in Video Room Calculator.

---

## Troubleshooting


| Symptom                             | What to try                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Downloads buttons stay disabled** | Complete an analysis first, or use **Choose JSON file…** to convert a saved envelope file to `.vrc.json`.                                   |
| **Collab rejects the file**         | Confirm you imported `**.vrc.json`**, not `snaproom-analysis.json` / `room-ai-analysis.json`. Re-export from Results or convert.             |
| **Canvas looks empty**              | Use a fresh export from this app (includes starter items). Older manual JSON may lack `items` / room fields the importer expects.           |
| **Results page shows nothing**      | Results are loaded from the URL `data=` parameter or browser session storage for that tab; run a new analysis or open the share link again. |


---

## Technical references (for maintainers)

- Export builder: `src/lib/collabExperienceExport.ts`
- Results UI: `src/app/results/results-client.tsx`
- Upstream calculator context: [video_room_calc FAQ](https://github.com/vtjoeh/video_room_calc/blob/main/FAQ.md) (external).

---

## Suggested slides for a PowerPoint deck (4 slides)

Copy each block into a slide title + bullets.

### Slide 1 — Title

- **SnapRoom → Collab Experience**
- From photo analysis to Video Room Calculator on collabexperience.com

### Slide 2 — Why & what

- Teams need **spatial layout** in Collab, not only a written report.
- SnapRoom estimates dimensions and recommendations from a room photo.
- **Two exports:** `**Download for Collab Experience (.vrc.json)`** opens in Collab; `**Download full analysis (snaproom).json`** is for archives / inspection — **do not** import that file into Video Room Calculator.

### Slide 3 — How to use it

1. Run an analysis → open **Results** → **Downloads** → `**Download for Collab Experience (.vrc.json)`**.
2. Import that `**.vrc.json`** on collabexperience.com (same as opening a calculator save).
3. **Older saves** (`{ ok, data }` only): on Results use **Choose JSON file…** → save the downloaded `**.vrc.json`** → import **that** into Collab.
4. The file includes calculator room/items + embedded `**roomAi`** and a starter layout; long recommendation text stays in JSON / Results — **not** on the canvas.

### Slide 4 — Takeaways

- **Rule:** Collab always gets `**.vrc.json`**, never `snaproom-analysis.json` / `room-ai-analysis.json`.
- Wrong file type → import errors; no Results in tab → run analysis again or convert a saved JSON.
- **Q&A**

---

*Last updated to match SnapRoom Results “Downloads” behavior and `collabExperienceExport` implementation.*