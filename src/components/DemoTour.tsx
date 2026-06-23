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
  type DemoTourStep,
} from "@/lib/demoTour";

declare global {
  interface Window {
    startSnapRoomTour?: () => void;
  }
}

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

export function DemoTourShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [popoverVisible, setPopoverVisible] = useState(false);

  const pendingNavStep = useRef<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
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
    setActive(false);
    setStepIdx(0);
    setPopoverVisible(false);
    pendingNavStep.current = null;
    persist(false, 0);
  }, [persist]);

  const positionStep = useCallback((tourStep: DemoTourStep, el: Element | null) => {
    const backdrop = backdropRef.current;
    const spotlight = spotlightRef.current;
    const popover = popoverRef.current;
    if (!backdrop || !spotlight || !popover) return false;

    backdrop.classList.add("is-visible");
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 14;

    popover.classList.remove(
      "demo-tour-popover--center",
      "demo-tour-popover--arrow-top",
      "demo-tour-popover--arrow-bottom",
      "demo-tour-popover--arrow-left",
      "demo-tour-popover--arrow-right",
    );

    if (!el || tourStep.place === "center") {
      spotlight.classList.remove("is-visible");
      popover.classList.add("demo-tour-popover--center");
      popover.style.top = "";
      popover.style.left = "";
      popover.style.transform = "";
      setPopoverVisible(true);
      return true;
    }

    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > vh) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    spotlight.classList.add("is-visible");
    spotlight.style.top = `${Math.max(0, r.top - 8)}px`;
    spotlight.style.left = `${Math.max(0, r.left - 8)}px`;
    spotlight.style.width = `${r.width + 16}px`;
    spotlight.style.height = `${r.height + 16}px`;

    popover.style.transform = "";
    const pr = popover.getBoundingClientRect();
    let top = 0;
    let left = 0;

    if (tourStep.place === "bottom") {
      top = r.bottom + gap;
      left = Math.max(10, Math.min(vw - 340, r.left));
      popover.classList.add("demo-tour-popover--arrow-top");
    } else if (tourStep.place === "top") {
      top = r.top - pr.height - gap;
      left = Math.max(10, Math.min(vw - 340, r.left));
      popover.classList.add("demo-tour-popover--arrow-bottom");
    } else if (tourStep.place === "left") {
      left = r.left - 340 - gap;
      top = Math.max(10, Math.min(vh - 200, r.top));
      popover.classList.add("demo-tour-popover--arrow-right");
    } else {
      left = r.right + gap;
      top = Math.max(10, Math.min(vh - 200, r.top));
      popover.classList.add("demo-tour-popover--arrow-left");
    }

    if (top < 10) top = 10;
    if (left < 10) left = 10;
    if (top + 180 > vh - 10) top = Math.max(10, vh - 200);
    if (left + 340 > vw - 10) left = Math.max(10, vw - 350);

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    setPopoverVisible(true);
    return true;
  }, []);

  const startTour = useCallback(() => {
    pendingNavStep.current = null;
    setStepIdx(0);
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
    setStepIdx(next);
    persist(true, next);
  }, [endTour, pathname, persist, stepIdx]);

  const goBack = useCallback(() => {
    if (stepIdx <= 0) return;
    const prev = stepIdx - 1;
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

    const layout = async () => {
      const tourStep = DEMO_TOUR_STEPS[stepIdx];
      if (!tourStep) return;

      setPopoverVisible(false);

      if (tourStep.route && pathname !== tourStep.route) {
        pendingNavStep.current = stepIdx;
        router.push(tourStep.route);
        return;
      }

      pendingNavStep.current = null;
      await waitForPaint();
      if (cancelled) return;

      let positioned = false;
      for (let attempt = 0; attempt < 8 && !positioned; attempt += 1) {
        if (cancelled) return;
        let el: Element | null = null;
        if (tourStep.target) {
          el = await waitForSelector(tourStep.target, attempt === 0 ? 4000 : 600);
        }
        positioned = positionStep(tourStep, el);
        if (!positioned) await waitForPaint();
      }
    };

    void layout();

    return () => {
      cancelled = true;
    };
  }, [active, stepIdx, pathname, positionStep, router]);

  useEffect(() => {
    if (!active) return;
    if (pendingNavStep.current === null) return;
    const idx = pendingNavStep.current;
    const pending = DEMO_TOUR_STEPS[idx];
    if (pending?.route === pathname) {
      pendingNavStep.current = null;
    }
  }, [active, pathname]);

  useEffect(() => {
    if (!active) return;
    if (
      stepIdx === ANALYZE_STEP_INDEX &&
      pathname === "/results"
    ) {
      const next = ANALYZE_STEP_INDEX + 1;
      setStepIdx(next);
      persist(true, next);
    }
  }, [active, pathname, persist, stepIdx]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => {
      const tourStep = DEMO_TOUR_STEPS[stepIdx];
      if (!tourStep) return;
      void waitForSelector(tourStep.target ?? "", 500).then((el) => {
        positionStep(tourStep, el);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, positionStep, stepIdx]);

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
            ref={backdropRef}
            className="demo-tour-backdrop is-visible"
            aria-hidden="true"
            onClick={endTour}
          />

          <div
            ref={spotlightRef}
            className="demo-tour-spotlight"
            aria-hidden="true"
          />

          <div
            ref={popoverRef}
            className={`demo-tour-popover${popoverVisible ? " is-visible" : ""}`}
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
        </>
      ) : null}
    </>
  );
}
