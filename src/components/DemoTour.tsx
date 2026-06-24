"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { seedDemoAnalysisForTour } from "@/lib/demoAnalysisFixture";
import {
  ANALYZE_STEP_INDEX,
  DEMO_TOUR_STEPS,
  DEMO_TOUR_VERSION,
  readDemoTourState,
  writeDemoTourState,
  type DemoTourPlace,
  type DemoTourStep,
} from "@/lib/demoTour";
import {
  DEMO_TOUR_ANALYZE_MS,
  TourDemoProvider,
} from "@/components/TourDemoContext";

declare global {
  interface Window {
    startSnapRoomTour?: () => void;
  }
}

type AnchorPosition = {
  top: number;
  left: number;
  arrow: Exclude<DemoTourPlace, "center">;
};

function waitForSelector(
  selector: string,
  timeoutMs = 5000,
  intervalMs = 80,
): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function computeAnchorPosition(
  tourStep: DemoTourStep,
  el: Element,
  popoverHeight: number,
): AnchorPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 14;
  const popoverWidth = Math.min(340, vw - 24);
  const r = el.getBoundingClientRect();

  let top = 0;
  let left = 0;
  let arrow: Exclude<DemoTourPlace, "center"> = "bottom";

  if (tourStep.place === "bottom") {
    top = r.bottom + gap;
    left = Math.max(12, Math.min(vw - popoverWidth - 12, r.left));
    arrow = "top";
  } else if (tourStep.place === "top") {
    top = r.top - popoverHeight - gap;
    left = Math.max(12, Math.min(vw - popoverWidth - 12, r.left));
    arrow = "bottom";
  } else if (tourStep.place === "left") {
    left = r.left - popoverWidth - gap;
    top = Math.max(12, Math.min(vh - popoverHeight - 12, r.top));
    arrow = "right";
  } else {
    left = r.right + gap;
    top = Math.max(12, Math.min(vh - popoverHeight - 12, r.top));
    arrow = "left";
  }

  if (top < 12) top = 12;
  if (left < 12) left = 12;
  if (top + popoverHeight > vh - 12) top = Math.max(12, vh - popoverHeight - 12);
  if (left + popoverWidth > vw - 12) left = Math.max(12, vw - popoverWidth - 12);

  return { top, left, arrow };
}

function stepUsesCenter(tourStep: DemoTourStep): boolean {
  return tourStep.place === "center" || !tourStep.target;
}

export function DemoTourShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const titleId = useId();

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [centered, setCentered] = useState(true);
  const [anchor, setAnchor] = useState<AnchorPosition | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const autoStarted = useRef(false);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const step = DEMO_TOUR_STEPS[stepIdx];

  const persist = useCallback((nextActive: boolean, nextStep: number) => {
    if (nextActive) {
      writeDemoTourState({
        active: true,
        step: nextStep,
        version: DEMO_TOUR_VERSION,
      });
    } else {
      writeDemoTourState(null);
    }
  }, []);

  const endTour = useCallback(() => {
    setAnalyzing(false);
    setActive(false);
    setStepIdx(0);
    setCentered(true);
    setAnchor(null);
    persist(false, 0);
  }, [persist]);

  const positionSpotlight = useCallback((el: Element | null) => {
    const spotlight = spotlightRef.current;
    if (!spotlight) return;

    if (!el) {
      spotlight.classList.remove("is-visible");
      return;
    }

    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top < 0 || r.bottom > vh) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    spotlight.classList.add("is-visible");
    spotlight.style.top = `${Math.max(0, r.top - 8)}px`;
    spotlight.style.left = `${Math.max(0, r.left - 8)}px`;
    spotlight.style.width = `${r.width + 16}px`;
    spotlight.style.height = `${r.height + 16}px`;
  }, []);

  const layoutCurrentStep = useCallback(async () => {
    const tourStep = DEMO_TOUR_STEPS[stepIdx];
    if (!tourStep) return;

    if (tourStep.route && pathname !== tourStep.route) {
      router.push(tourStep.route);
      return;
    }

    if (stepUsesCenter(tourStep)) {
      setCentered(true);
      setAnchor(null);
      positionSpotlight(null);
      return;
    }

    const el = await waitForSelector(tourStep.target!);
    if (!el) {
      setCentered(true);
      setAnchor(null);
      positionSpotlight(null);
      return;
    }

    const popoverHeight = popoverRef.current?.offsetHeight ?? 240;
    const nextAnchor = computeAnchorPosition(tourStep, el, popoverHeight);
    setAnchor(nextAnchor);
    setCentered(false);
    requestAnimationFrame(() => positionSpotlight(el));
  }, [pathname, positionSpotlight, router, stepIdx]);

  const startTour = useCallback(() => {
    setStepIdx(0);
    setCentered(true);
    setAnchor(null);
    setActive(true);
    persist(true, 0);
  }, [persist]);

  const runDemoAnalyze = useCallback(async () => {
    if (analyzing) return;
    setAnalyzing(true);
    await new Promise((resolve) => {
      window.setTimeout(resolve, DEMO_TOUR_ANALYZE_MS);
    });
    seedDemoAnalysisForTour();
    const nextStep = ANALYZE_STEP_INDEX + 1;
    setStepIdx(nextStep);
    persist(true, nextStep);
    setAnalyzing(false);
    router.push("/results");
  }, [analyzing, persist, router]);

  const goNext = useCallback(() => {
    const current = DEMO_TOUR_STEPS[stepIdx];

    if (
      current?.waitForResults &&
      pathname !== "/results" &&
      stepIdx === ANALYZE_STEP_INDEX
    ) {
      if (analyzing) return;
      void runDemoAnalyze();
      return;
    }

    if (stepIdx >= DEMO_TOUR_STEPS.length - 1) {
      endTour();
      return;
    }
    setStepIdx(stepIdx + 1);
    persist(true, stepIdx + 1);
  }, [analyzing, endTour, pathname, persist, runDemoAnalyze, stepIdx]);

  const goBack = useCallback(() => {
    if (stepIdx <= 0) return;
    setStepIdx(stepIdx - 1);
    persist(true, stepIdx - 1);
  }, [persist, stepIdx]);

  useEffect(() => {
    window.startSnapRoomTour = startTour;
    return () => {
      delete window.startSnapRoomTour;
    };
  }, [startTour]);

  useEffect(() => {
    const saved = readDemoTourState();
    if (saved?.active && saved.version === DEMO_TOUR_VERSION) {
      setStepIdx(saved.step);
      setActive(true);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("tour") !== "1" || autoStarted.current) return;
    autoStarted.current = true;
    startTour();
  }, [searchParams, startTour]);

  useEffect(() => {
    if (!active) return;
    void layoutCurrentStep();
  }, [active, stepIdx, pathname, layoutCurrentStep]);

  useEffect(() => {
    if (!active) return;
    if (stepIdx === ANALYZE_STEP_INDEX && pathname === "/results") {
      setStepIdx(ANALYZE_STEP_INDEX + 1);
      persist(true, ANALYZE_STEP_INDEX + 1);
    }
  }, [active, pathname, persist, stepIdx]);

  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") endTour();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, endTour]);

  const isLast = stepIdx >= DEMO_TOUR_STEPS.length - 1;
  const onAnalyzeStep = stepIdx === ANALYZE_STEP_INDEX && pathname === "/";
  const canDemoAnalyze = active && onAnalyzeStep && !analyzing;

  const arrowClass =
    !centered && anchor ? ` demo-tour-popover--arrow-${anchor.arrow}` : "";

  const popover = (
    <div
      ref={popoverRef}
      className={`demo-tour-popover--panel${arrowClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <p className="demo-tour-step-label">
        Step {stepIdx + 1} of {DEMO_TOUR_STEPS.length}
      </p>
      <h2 id={titleId} className="demo-tour-title">
        {step?.title ?? ""}
      </h2>
      <p className="demo-tour-body">{step?.body ?? ""}</p>
      {analyzing && onAnalyzeStep ? (
        <p className="demo-tour-wait">Analyzing photo…</p>
      ) : null}
      <div className="demo-tour-actions">
        <button type="button" className="demo-tour-btn" onClick={endTour}>
          Skip
        </button>
        {stepIdx > 0 ? (
          <button type="button" className="demo-tour-btn" onClick={goBack}>
            Back
          </button>
        ) : null}
        <button
          type="button"
          className="demo-tour-btn demo-tour-btn--primary"
          onClick={goNext}
          disabled={analyzing}
        >
          {isLast ? "Done" : analyzing && onAnalyzeStep ? "Analyzing…" : "Next"}
        </button>
      </div>
    </div>
  );

  return (
    <TourDemoProvider
      value={{
        active,
        analyzing,
        canDemoAnalyze,
        startDemoAnalyze: () => {
          void runDemoAnalyze();
        },
      }}
    >
      {children}

      <button
        type="button"
        className="demo-tour-fab"
        title="Take the demo tour"
        aria-label="Take the demo tour"
        onClick={() => {
          if (!active) startTour();
        }}
      >
        ?
      </button>

      {active ? (
        <>
          <div className="demo-tour-backdrop is-visible" aria-hidden="true" />

          {!centered ? (
            <div
              ref={spotlightRef}
              className="demo-tour-spotlight is-visible"
              aria-hidden="true"
            />
          ) : null}

          {centered ? (
            <div className="demo-tour-center-shell">{popover}</div>
          ) : (
            <div
              className="demo-tour-popover-anchor"
              style={
                anchor
                  ? { top: anchor.top, left: anchor.left }
                  : undefined
              }
            >
              {popover}
            </div>
          )}
        </>
      ) : null}
    </TourDemoProvider>
  );
}
