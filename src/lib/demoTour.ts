export const DEMO_TOUR_VERSION = "v1.0";
export const DEMO_TOUR_STORAGE_KEY = "snaproom-demo-tour-v1";

export type DemoTourPlace = "top" | "bottom" | "left" | "right" | "center";

export type DemoTourStep = {
  id: string;
  route: "/" | "/results" | "/quick-estimate";
  target: string | null;
  place: DemoTourPlace;
  title: string;
  body: string;
  tip?: string;
  /** Stay on this step until the user lands on /results (Analyze step). */
  waitForResults?: boolean;
};

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: "welcome",
    route: "/",
    target: null,
    place: "center",
    title: "Room insights from a photo",
    body: "SnapRoom turns one customer photo into rough dimensions, collaboration suggestions, and one-click exports to Collab Experience and Webex Workspace Designer.",
    tip: "Play your voiceover, then click Next through each step. Step 6 waits until Results opens after Analyze.",
  },
  {
    id: "hero",
    route: "/",
    target: "#tour-hero",
    place: "bottom",
    title: "Start here",
    body: "Upload a single room photo. You get length, width, and height estimates plus guidance for camera, lighting, acoustics, display, seating, cabling, network, and power.",
  },
  {
    id: "upload",
    route: "/",
    target: "#tour-upload",
    place: "right",
    title: "Upload a room photo",
    body: "Choose an image showing at least two walls and the ceiling or floor line. The preview confirms you picked the right file before you run analysis.",
  },
  {
    id: "options",
    route: "/",
    target: "#tour-options",
    place: "top",
    title: "Optional scale hints",
    body: "Enter ceiling height if you know it. Pick feet or meters for the output. These hints help the model anchor room height when visible cues are weak.",
  },
  {
    id: "privacy",
    route: "/",
    target: "#tour-privacy",
    place: "top",
    title: "Privacy in v1",
    body: "SnapRoom does not store your photo server-side. It is sent only for the model request, then discarded — useful when customers ask about privacy on a live call.",
  },
  {
    id: "analyze",
    route: "/",
    target: "#tour-analyze",
    place: "top",
    title: "Analyze photo",
    body: "Click Analyze photo. Vision AI reads the room geometry — usually a few seconds. The tour continues automatically when the Results page opens.",
    waitForResults: true,
  },
  {
    id: "dimensions",
    route: "/results",
    target: "#tour-dimensions",
    place: "bottom",
    title: "Estimated dimensions",
    body: "Length, width, and height with confidence scores. Treat these as directional — good for discovery and ROM scoping, not a formal site survey.",
  },
  {
    id: "exports",
    route: "/results",
    target: "#tour-recommendations",
    place: "top",
    title: "Downloads and recommendations",
    body: "Scroll up to the Downloads section for Collab Experience .vrc.json or Webex Workspace Designer room JSON. The cards here cover camera, lighting, acoustics, display, seating, cabling, network, and power.",
    tip: "Scroll up briefly to show the two download buttons before Quick Estimate.",
  },
  {
    id: "quick",
    route: "/quick-estimate",
    target: "#tour-quick",
    place: "bottom",
    title: "Quick Estimate",
    body: "The fast path: upload a photo, get seating and display counts, then open Workspace Designer with a matching room preset and chair count.",
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
