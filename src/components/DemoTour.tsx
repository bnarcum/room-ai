"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ANALYZE_STEP_INDEX,
  DEMO_TOUR_STEPS,
  DEMO_TOUR_VERSION,
  readDemoTourState,
  writeDemoTourState,
  type DemoTourPlace,
  type DemoTourStep,
} from "@/lib/demoTour";

declare global {
  interface Window {
    startSnapRoomTour?: () => void;
  }
}

type AnchorLayout = {
  mode: "center" | "anchored";
  top?: number;
  left?: number;
  arrow?: Exclude<DemoTourPlace, "center">;
};

const HIDDEN_LAYOUT: AnchorLayout = { mode: "center" };

function waitForSelector(
  selector: string,
  timeoutMs = 4000,
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

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function computeAnchorLayout(
  tourStep: DemoTourStep,
  el: Element | null,
  popoverHeight: number,
): AnchorLayout {
  if (!el || tourStep.place === "center") {
    return { mode: "center" };
  }

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

  return { mode: "anchored", top, left, arrow };
}

export function DemoTourShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [layout, setLayout] = useState<AnchorLayout>(HIDDEN_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);

  const pendingNavStep = useRef<number | null>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const step = DEMO_TOUR_STEPS[stepIdx];
  const isCenter = layout.mode === "center";

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
    setActive(false);
    setStepIdx(0);
    setLayout(HIDDEN_LAYOUT);
    setLayoutReady(false);
    pendingNavStep.current = null;
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

  const layoutStep = useCallback(
    async (tourStep: DemoTourStep, el: Element | null) => {
      await waitForPaint();

      const popoverHeight = measureRef.current?.offsetHeight ?? 220;
      const nextLayout = computeAnchorLayout(tourStep, el, popoverHeight);

      if (nextLayout.mode === "center") {
        positionSpotlight(null);
      } else if (el) {
        positionSpotlight(el);
      }

      setLayout(nextLayout);
      setLayoutReady(true);
    },
    [positionSpotlight],
  );

  const startTour = useCallback(() => {
    pendingNavStep.current = null;
    setStepIdx(0);
    setLayout(HIDDEN_LAYOUT);
    setLayoutReady(false);
    setActive(true);
    persist(true, 0);
  }, [persist]);

  const goNext = useCallback(() => {
    const current = DEMO_TOUR_STEPS[stepIdx];
    if (current?.waitForResults && pathname !== "/results") return;

    if (stepIdx >= DEMO_TOUR_STEPS.length - 1) {
      endTour();
      return;
    }
    const next = stepIdx + 1;
    setLayoutReady(false);
    setStepIdx(next);
    persist(true, next);
  }, [endTour, pathname, persist, stepIdx]);

  const goBack = useCallback(() => {
    if (stepIdx <= 0) return;
    const prev = stepIdx - 1;
    setLayoutReady(false);
    setStepIdx(prev);
    persist(true, prev);
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
    if (searchParams.get("tour") === "1" && !active) {
      startTour();
    }
  }, [searchParams, active, startTour]);

  useEffect(() => {
    if (!active || stepIdx < 0 || stepIdx >= DEMO_TOUR_STEPS.length) return;

    let cancelled = false;

    const run = async () => {
      const tourStep = DEMO_TOUR_STEPS[stepIdx];
      if (!tourStep) return;

      setLayoutReady(false);

      if (tourStep.route && pathname !== tourStep.route) {
        pendingNavStep.current = stepIdx;
        router.push(tourStep.route);
        return;
      }

      pendingNavStep.current = null;

      let el: Element | null = null;
      if (tourStep.target) {
        el = await waitForSelector(tourStep.target);
      }
      if (cancelled) return;

      await layoutStep(tourStep, el);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [active, stepIdx, pathname, layoutStep, router]);

  useEffect(() => {
    if (!active) return;
    if (
      stepIdx === ANALYZE_STEP_INDEX &&
      pathname === "/results"
    ) {
      const next = ANALYZE_STEP_INDEX + 1;
      setLayoutReady(false);
      setStepIdx(next);
      persist(true, next);
    }
  }, [active, pathname, persist, stepIdx]);

  useEffect(() => {
    if (!active || !layoutReady || layout.mode !== "anchored") return;
    const tourStep = DEMO_TOUR_STEPS[stepIdx];
    if (!tourStep?.target) return;

    const onResize = () => {
      void waitForSelector(tourStep.target ?? "", 500).then((el) => {
        if (el) void layoutStep(tourStep, el);
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, layout.mode, layoutReady, layoutStep, stepIdx]);

  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") endTour();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, endTour]);

  const isLast = stepIdx >= DEMO_TOUR_STEPS.length - 1;
  const analyzeWaiting =
    step?.waitForResults === true &&
    pathname !== "/results" &&
    stepIdx === ANALYZE_STEP_INDEX;

  const popoverPanel = (
    <div
      ref={measureRef}
      className="demo-tour-popover--panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-tour-title"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="demo-tour-step-label">
        Step {stepIdx + 1} of {DEMO_TOUR_STEPS.length}
      </p>
      <h2 id="demo-tour-title" className="demo-tour-title">
        {step?.title ?? ""}
      </h2>
      <p className="demo-tour-body">{step?.body ?? ""}</p>
      {step?.tip ? <p className="demo-tour-tip">{step.tip}</p> : null}
      {analyzeWaiting ? (
        <p className="demo-tour-wait">Waiting for Results…</p>
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
          disabled={analyzeWaiting}
        >
          {isLast ? "Done" : analyzeWaiting ? "Analyze first…" : "Next"}
        </button>
      </div>
    </div>
  );

  const anchoredArrowClass =
    layout.mode === "anchored" && layout.arrow
      ? ` demo-tour-popover--arrow-${layout.arrow}`
      : "";

  return (
    <>
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
          <div
            className="demo-tour-backdrop is-visible"
            aria-hidden="true"
            onClick={endTour}
          />

          {!isCenter ? (
            <div
              ref={spotlightRef}
              className="demo-tour-spotlight"
              aria-hidden="true"
            />
          ) : null}

          {layoutReady && isCenter ? (
            <div
              className="demo-tour-center-shell"
              onClick={endTour}
            >
              {popoverPanel}
            </div>
          ) : null}

          {layoutReady && !isCenter ? (
            <div
              className={`demo-tour-popover-anchor is-visible${anchoredArrowClass}`}
              style={{
                top: layout.top,
                left: layout.left,
              }}
              role="presentation"
              onClick={(e) => e.stopPropagation()}
            >
              {popoverPanel}
            </div>
          ) : null}

          {!layoutReady ? (
            <div className="demo-tour-measure" aria-hidden="true">
              {popoverPanel}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
