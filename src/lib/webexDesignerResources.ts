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
