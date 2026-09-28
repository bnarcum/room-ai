export const DEMO_TOUR_VERSION = "v1.8";
export const DEMO_TOUR_STORAGE_KEY = "snaproom-demo-tour-v1";

export type DemoTourPlace = "top" | "bottom" | "left" | "right" | "center";

export type DemoTourStep = {
  id: string;
  route: "/" | "/results";
  target: string | null;
  place: DemoTourPlace;
  title: string;
  body: string;
  /** Stay on this step until the user lands on /results (Analyze step). */
  waitForResults?: boolean;
};

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: "welcome",
    route: "/",
    target: null,
    place: "center",
    title: "SnapRoom",
    body: "You're on a deal and the customer sends a room photo. SnapRoom turns one image into a room read, directional size ranges, five recs, and exports to Collab Experience and Workspace Designer.",
  },
  {
    id: "upload",
    route: "/",
    target: "#tour-upload",
    place: "right",
    title: "Upload a room photo",
    body: "Choose a photo showing at least two walls and where the ceiling meets the floor. The preview confirms you picked the right image before you run analysis.",
  },
  {
    id: "options",
    route: "/",
    target: "#tour-options",
    place: "top",
    title: "Optional scale hints",
    body: "Enter ceiling height if you know it. Pick feet or meters for the output. These hints help when the model can anchor on a known dimension.",
  },
  {
    id: "privacy",
    route: "/",
    target: "#tour-privacy",
    place: "top",
    title: "Privacy in v1",
    body: "SnapRoom does not store your photo server-side in v1 — it's sent only for the model request, then discarded.",
  },
  {
    id: "analyze",
    route: "/",
    target: "#tour-analyze",
    place: "top",
    title: "Analyze photo",
    body: "Click Next to run analysis on the demo conference photo — Vision AI reads room geometry and layout, then opens Results.",
    waitForResults: true,
  },
  {
    id: "dimensions",
    route: "/results",
    target: "#tour-dimensions",
    place: "bottom",
    title: "Directional size",
    body: "Length, width, and height as ranges plus confidence — directional for a first conversation, not a formal site survey.",
  },
  {
    id: "recommendations",
    route: "/results",
    target: "#tour-recommendations",
    place: "top",
    title: "Recommendations",
    body: "Five photo-grounded recs: camera, display, audio, lighting, and network.",
  },
  {
    id: "exports",
    route: "/results",
    target: "#tour-exports",
    place: "bottom",
    title: "One-click export",
    body: "Open Workspace Designer from the seat count, or download Collab Experience .vrc.json with table, TV, and device taken from this estimate.",
  },
  {
    id: "designer",
    route: "/results",
    target: "#tour-designer-cta",
    place: "bottom",
    title: "Workspace Designer",
    body: "The Designer link uses the same seat-count preset as before. The room JSON matches huddle, small, medium, large, or boardroom — not a default boardroom.",
  },
  {
    id: "close",
    route: "/results",
    target: null,
    place: "center",
    title: "That's SnapRoom",
    body: "One photo in. Room read, directional size, five recs, then Designer or Collab Experience.",
  },
];

export type DemoTourPersisted = {
  active: boolean;
  step: number;
  version: string;
};

export function readDemoTourState(): DemoTourPersisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DEMO_TOUR_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoTourPersisted;
  } catch {
    return null;
  }
}

export function writeDemoTourState(state: DemoTourPersisted | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!state) sessionStorage.removeItem(DEMO_TOUR_STORAGE_KEY);
    else sessionStorage.setItem(DEMO_TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

export const ANALYZE_STEP_INDEX = DEMO_TOUR_STEPS.findIndex(
  (s) => s.id === "analyze",
);
