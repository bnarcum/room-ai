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

export function DemoTourShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [popoverHtml, setPopoverHtml] = useState({ title: "", body: "", tip: "" });
  const [waitingResults, setWaitingResults] = useState(false);

  const pendingNavStep = useRef<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const persist = useCallback(
    (nextActive: boolean, nextStep: number) => {
      if (nextActive) {
        writeDemoTourState({
          active: true,
          step: nextStep,
          version: DEMO_TOUR_VERSION,
        });
      } else {
        writeDemoTourState(null);
      }
    },
    [],
  );

  const endTour = useCallback(() => {
    setActive(false);
    setStepIdx(0);
    setWaitingResults(false);
    pendingNavStep.current = null;
    persist(false, 0);
    backdropRef.current?.classList.remove("is-visible");
    spotlightRef.current?.classList.remove("is-visible");
    if (popoverRef.current) popoverRef.current.style.visibility = "hidden";
  }, [persist]);

  const positionStep = useCallback((step: DemoTourStep, el: Element | null) => {
    const backdrop = backdropRef.current;
    const spotlight = spotlightRef.current;
    const popover = popoverRef.current;
    if (!backdrop || !spotlight || !popover) return;

    backdrop.classList.add("is-visible");
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 14;

    popover.classList.remove(
      "demo-tour-popover--arrow-top",
      "demo-tour-popover--arrow-bottom",
      "demo-tour-popover--arrow-left",
      "demo-tour-popover--arrow-right",
    );

    if (!el || step.place === "center") {
      spotlight.classList.remove("is-visible");
      popover.style.top = `${Math.max(16, vh / 2 - 120)}px`;
      popover.style.left = `${Math.max(16, vw / 2 - 170)}px`;
      popover.style.visibility = "visible";
      return;
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

    const pr = popover.getBoundingClientRect();
    let top = 0;
    let left = 0;

    if (step.place === "bottom") {
      top = r.bottom + gap;
      left = Math.max(10, Math.min(vw - 340, r.left));
      popover.classList.add("demo-tour-popover--arrow-top");
    } else if (step.place === "top") {
      top = r.top - pr.height - gap;
      left = Math.max(10, Math.min(vw - 340, r.left));
      popover.classList.add("demo-tour-popover--arrow-bottom");
    } else if (step.place === "left") {
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
    popover.style.visibility = "visible";
  }, []);

  const renderStep = useCallback(
    async (idx: number) => {
      const step = DEMO_TOUR_STEPS[idx];
      if (!step) return;

      setPopoverHtml({
        title: step.title,
        body: step.body,
        tip: step.tip ?? "",
      });
      setWaitingResults(Boolean(step.waitForResults));

      if (step.route && pathname !== step.route) {
        pendingNavStep.current = idx;
        router.push(step.route);
        return;
      }

      pendingNavStep.current = null;

      let el: Element | null = null;
      if (step.target) {
        el = await waitForSelector(step.target);
      }
      positionStep(step, el);
    },
    [pathname, positionStep, router],
  );

  const startTour = useCallback(() => {
    setActive(true);
    setStepIdx(0);
    persist(true, 0);
    void renderStep(0);
  }, [persist, renderStep]);

  const goNext = useCallback(() => {
    const step = DEMO_TOUR_STEPS[stepIdx];
    if (step?.waitForResults && pathname !== "/results") return;

    if (stepIdx >= DEMO_TOUR_STEPS.length - 1) {
      endTour();
      return;
    }
    const next = stepIdx + 1;
    setStepIdx(next);
    persist(true, next);
    void renderStep(next);
  }, [endTour, pathname, persist, renderStep, stepIdx]);

  const goBack = useCallback(() => {
    if (stepIdx <= 0) return;
    const prev = stepIdx - 1;
    setStepIdx(prev);
    persist(true, prev);
    void renderStep(prev);
  }, [persist, renderStep, stepIdx]);

  useEffect(() => {
    window.startSnapRoomTour = startTour;
    return () => {
      delete window.startSnapRoomTour;
    };
  }, [startTour]);

  useEffect(() => {
    const saved = readDemoTourState();
    if (saved?.active && saved.version === DEMO_TOUR_VERSION) {
      setActive(true);
      setStepIdx(saved.step);
      void renderStep(saved.step);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- restore once on mount

  useEffect(() => {
    if (searchParams.get("tour") === "1" && !active) {
      startTour();
    }
  }, [searchParams, active, startTour]);

  useEffect(() => {
    if (!active) return;
    if (pendingNavStep.current !== null) {
      const idx = pendingNavStep.current;
      const step = DEMO_TOUR_STEPS[idx];
      if (step?.route === pathname) {
        pendingNavStep.current = null;
        void renderStep(idx);
      }
    }
  }, [active, pathname, renderStep]);

  useEffect(() => {
    if (!active) return;
    const step = DEMO_TOUR_STEPS[stepIdx];
    if (step?.waitForResults && pathname === "/results" && stepIdx === 5) {
      const next = 6;
      setStepIdx(next);
      setWaitingResults(false);
      persist(true, next);
      void renderStep(next);
    }
  }, [active, pathname, persist, renderStep, stepIdx]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => {
      void renderStep(stepIdx);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, renderStep, stepIdx]);

  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") endTour();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, endTour]);

  useEffect(() => {
    if (!active) {
      backdropRef.current?.classList.remove("is-visible");
      spotlightRef.current?.classList.remove("is-visible");
      if (popoverRef.current) popoverRef.current.style.visibility = "hidden";
    }
  }, [active]);

  const isLast = stepIdx >= DEMO_TOUR_STEPS.length - 1;
  const analyzeWaiting =
    waitingResults && pathname !== "/results" && stepIdx === 5;

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
        className="demo-tour-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-tour-title"
        style={{ visibility: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="demo-tour-step-label">
          Step {stepIdx + 1} of {DEMO_TOUR_STEPS.length}
        </p>
        <h2 id="demo-tour-title" className="demo-tour-title">
          {popoverHtml.title}
        </h2>
        <p className="demo-tour-body">{popoverHtml.body}</p>
        {popoverHtml.tip ? (
          <p className="demo-tour-tip">{popoverHtml.tip}</p>
        ) : null}
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
