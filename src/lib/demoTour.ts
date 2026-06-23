export const DEMO_TOUR_VERSION = "v1.2";
export const DEMO_TOUR_STORAGE_KEY = "snaproom-demo-tour-v1";

export type DemoTourPlace = "top" | "bottom" | "left" | "right" | "center";

export type DemoTourStep = {
  id: string;
  route: "/" | "/results" | "/quick-estimate";
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
    body: "You're on a deal and the customer sends a room photo. SnapRoom turns one image into length, width, and height estimates, AV suggestions, and one-click exports to Collab Experience and Workspace Designer.",
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
    body: "Click Analyze photo. Vision AI reads the room geometry and layout — this usually takes a few seconds. The tour continues when Results opens.",
    waitForResults: true,
  },
  {
    id: "dimensions",
    route: "/results",
    target: "#tour-dimensions",
    place: "bottom",
    title: "Estimated dimensions",
    body: "Rough length, width, and height estimates. Treat these as directional — good for a first conversation, a budgetary ROM, or scoping a refresh — not a formal site survey.",
  },
  {
    id: "recommendations",
    route: "/results",
    target: "#tour-recommendations",
    place: "top",
    title: "Recommendations",
    body: "Camera, lighting, acoustics, display, seating, cabling, network, and power — use these as a discovery checklist on your next call.",
  },
  {
    id: "exports",
    route: "/results",
    target: "#tour-exports",
    place: "bottom",
    title: "One-click export",
    body: "Download Collab Experience dot vrc dot json for Video Room Calculator. Or download Workspace Designer room JSON and drag it onto the canvas at designer dot webex dot com. Snap, size, suggest, then design.",
  },
  {
    id: "quick",
    route: "/quick-estimate",
    target: "#tour-quick",
    place: "bottom",
    title: "Quick Estimate",
    body: "Upload one photo. SnapRoom estimates seating capacity, screen count, and primary display size — then opens Workspace Designer with a matching room preset and chair count.",
  },
  {
    id: "close",
    route: "/quick-estimate",
    target: null,
    place: "center",
    title: "That's SnapRoom",
    body: "Room insights from a single photo — on the Collaboration Seller Tools hub.",
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
