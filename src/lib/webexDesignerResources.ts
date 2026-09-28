/**
 * Resources links from the Workspace Designer UI (same entries as the sidebar under
 * **Resources** next to the Introduction article — source: `zi` nav in the Designer SPA bundle).
 * Full URLs so the vision model can cite them in recommendation strings.
 *
 * @see https://designer.webex.com/#/article/Intro
 */

export type WebexDesignerResourceLink = {
  title: string;
  url: string;
  /** One line for LLM context */
  note: string;
};

/** Matches designer.webex.com Resources menu + resolved absolute URLs (Feedback, Workspaces, Best practices). */
export const WEBEX_DESIGNER_INTRO_RESOURCES: readonly WebexDesignerResourceLink[] = [
  {
    title: "Introduction",
    url: "https://designer.webex.com/#/article/Intro",
    note: "Workspace Designer overview; same hub where Resources live.",
  },
  {
    title: "What's new",
    url: "https://designer.webex.com/#/article/WhatsNew",
    note: "Latest Designer features and changes.",
  },
  {
    title: "Keyboard shortcuts",
    url: "https://designer.webex.com/#/article/KeyboardShortcuts",
    note: "Productivity shortcuts inside the 3D designer.",
  },
  {
    title: "Photorealistic renders",
    url: "https://designer.webex.com/#/article/PhotoRealisticRenders",
    note: "AI / photorealistic export workflow in Workspace Designer.",
  },
  {
    title: "Custom rooms API",
    url: "https://designer.webex.com/#/article/CustomRooms",
    note: "Programmatic custom-room integration with Designer.",
  },
  {
    title: "Webex Workspaces",
    url: "https://webex.com/workspaces",
    note: "Standardized room samples and workspace inspiration (Cisco).",
  },
  {
    title: "Feedback",
    url: "https://ciscocx.qualtrics.com/jfe/form/SV_6u2wQGl9vbyiDmm",
    note: "Official feedback channel for Workspace Designer (vendor roadmap).",
  },
  {
    title: "Cisco collaboration endpoints",
    url: "https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html",
    note: "Cisco collaboration endpoints — camera, display, and room-device guidance.",
  },
] as const;

/**
 * Extra rubric text injected into Claude system prompts for room analysis.
 */
/**
 * When the vision model omits or empties a recommendations category, coercion fills with
 * these grounded bullets (never the generic single-line pad). Keys match `coerceRoomAnalysis`.
 */
export const RECOMMENDATION_CATEGORY_FALLBACKS = {
  camera: [
    "Mount the camera at seated eye level, aimed at the primary seat. [Cisco guidance](https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html)",
    "Keep bright windows out of the camera-facing background.",
  ],
  lighting: [
    "Add soft frontal light so faces stay even on camera. [Cisco guidance](https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html)",
    "Cut glare on the display from overheads or daylight.",
  ],
  acoustics: [
    "Add absorption on the hard wall behind the chair to tame echo. [Cisco guidance](https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html)",
    "Keep HVAC noise away from the microphone path.",
  ],
  display: [
    "Keep one display at seated eye line, 6–8 ft from the chair. [Cisco guidance](https://webex.com/workspaces)",
    "Use the wall display for content; keep the desk monitor for local work.",
  ],
  seating: [
    "One chair facing the camera and display; leave aisle behind it.",
    "Skip extra seats that the camera cannot frame.",
  ],
  cabling: [
    "Route HDMI and USB along the desk edge, not across the aisle.",
    "Label the display input the laptop uses.",
  ],
  network: [
    "Check Wi-Fi at the desk; prefer a wired drop for the room device. [Cisco guidance](https://webex.com/workspaces)",
    "Keep 5 GHz in line of sight of the access point.",
  ],
  power: [
    "Put laptop power at the desk edge so cords stay off the floor.",
    "Avoid daisy-chained strips for the display and compute.",
  ],
} as const;

export type RecommendationCategoryKey = keyof typeof RECOMMENDATION_CATEGORY_FALLBACKS;

export function buildWebexDesignerResourcesRubricSection(): string {
  const lines = WEBEX_DESIGNER_INTRO_RESOURCES.map(
    (r) => `- **${r.title}** — ${r.note} ${r.url}`,
  );
  return [
    "Official Workspace Designer — **Resources** (Introduction article sidebar, designer.webex.com). You must ground recommendations and quickChecklist items in this guidance set:",
    "",
    ...lines,
    "",
    "Instructions:",
    "- Each recommendation is ONE short sentence (max ~90 characters). No raw URLs in the sentence.",
    "- If you cite a Cisco or Webex doc, append a markdown link only: [Cisco guidance](https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html).",
    "- Use only https://www.cisco.com/c/en/..., https://webex.com/..., https://help.webex.com/..., or https://designer.webex.com/... — never /c/dam/ paths.",
    "- Do not invent URLs; only use links from the list above.",
  ].join("\n");
}
