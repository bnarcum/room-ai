"use client";

import { createContext, useContext } from "react";

/** Bundled conference-room photo for the guided tour (Option B demo). */
export const DEMO_TOUR_ROOM_PHOTO = "/demo/conference-room.png";

/** Pause on analyze step so the UI reads like a live Vision pass. */
export const DEMO_TOUR_ANALYZE_MS = 2200;

export type TourDemoContextValue = {
  active: boolean;
  analyzing: boolean;
  canDemoAnalyze: boolean;
  startDemoAnalyze: () => void;
};

const TourDemoContext = createContext<TourDemoContextValue>({
  active: false,
  analyzing: false,
  canDemoAnalyze: false,
  startDemoAnalyze: () => {},
});

export function TourDemoProvider({
  value,
  children,
}: {
  value: TourDemoContextValue;
  children: React.ReactNode;
}) {
  return (
    <TourDemoContext.Provider value={value}>{children}</TourDemoContext.Provider>
  );
}

export function useTourDemo(): TourDemoContextValue {
  return useContext(TourDemoContext);
}
