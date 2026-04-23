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
    title: "Workspace Design: Best Practices Guide (PDF)",
    url: "https://www.cisco.com/c/dam/en/us/td/docs/telepresence/endpoint/technical-papers/workspace-best-practices.pdf",
    note: "Cisco technical paper — primary written standard for layout, AV, and collaboration room practice.",
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
    "Place the primary meeting camera near eye level for seated participants and aim it to include both the main display and the primary seating arc (Webex Workspace Designer hub: https://designer.webex.com/#/article/Intro).",
    "Avoid having bright windows directly behind active speakers relative to the camera; add diffusion or reposition seating so faces stay evenly lit (Cisco Workspace Design Best Practices PDF: https://www.cisco.com/c/dam/en/us/td/docs/telepresence/endpoint/technical-papers/workspace-best-practices.pdf).",
  ],
  lighting: [
    "Add soft, diffuse frontal light on participant faces for video quality; balance ambient light with task lighting at the table (Workspace Design Best Practices PDF: https://www.cisco.com/c/dam/en/us/td/docs/telepresence/endpoint/technical-papers/workspace-best-practices.pdf).",
    "Reduce glare on displays from overhead fixtures or daylight by tilting blinds or adjusting fixture aim (Photorealistic renders: https://designer.webex.com/#/article/PhotoRealisticRenders).",
  ],
  acoustics: [
    "Treat hard parallel walls or large glass with absorption (panels, drapes, rugs) where speech echo or HVAC noise competes with remote audio (Workspace Best Practices PDF above).",
    "Keep noisy HVAC vents away from microphones and seating when possible; note ceiling height impact on reverberation (Introduction to Designer scales: https://designer.webex.com/#/article/Intro).",
  ],
  display: [
    "Size and mount the main collaboration display so text is legible from the farthest planned seat; align eye line from seated height (Webex Workspaces inspiration: https://webex.com/workspaces).",
    "Route HDMI/USB-C paths so presenters can connect without crossing walkways; label inputs for hybrid guests (Custom rooms / integration context: https://designer.webex.com/#/article/CustomRooms).",
  ],
  seating: [
    "Arrange seating within comfortable viewing angles to the display and camera; leave clearance behind chairs for egress (Workspace Best Practices PDF).",
    "Match chair count and table length to typical meeting size for the room to avoid crowding or unused depth (Webex Workspaces: https://webex.com/workspaces).",
  ],
  cabling: [
    "Use floor cores or perimeter raceways so presentation cables reach the table without trip hazards (Workspace Best Practices PDF).",
    "Plan redundant paths for codec, camera, and touch-controller cables with service loops for furniture moves (Designer overview: https://designer.webex.com/#/article/Intro).",
  ],
  network: [
    "Provide wired Ethernet drops at the table for codec or Room Bar stability; reserve bandwidth for HD video uplink and screen share (Workspace Best Practices PDF).",
    "Document VLAN or QoS policy for collaboration traffic if Wi‑Fi backup is used for laptops (Webex Workspaces planning: https://webex.com/workspaces).",
  ],
  power: [
    "Confirm sufficient circuits for displays, compute, and furniture-mounted outlets without daisy-chaining consumer strips (Workspace Best Practices PDF).",
    "Place outlets along the table edge or base for laptops and USB-C docks; align with cable routing to avoid cords across walkways (Designer Introduction: https://designer.webex.com/#/article/Intro).",
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
    "- Map each recommendation you give to the most relevant resource(s) above when applicable (layout, displays, cabling, acoustics, scheduling, certification, photorealistic workflow, API automation, or Cisco best-practices PDF).",
    "- Where helpful, end a recommendation string with a parenthetical citation using the exact URL, e.g. (see https://webex.com/workspaces). Use at least **three distinct URLs** from the list across the full recommendations + checklist when any link applies.",
    "- Do not invent URLs; only use links from the list above.",
  ].join("\n");
}
