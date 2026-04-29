import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initStore } from "./store";
import type { TripData } from "./lib/types";
import "./index.css";

declare global {
  interface Window { __TRIP_DATA__: TripData | null; }
}

const data: TripData = window.__TRIP_DATA__ || {
  version: 1,
  destination: null,
  countryHint: null,
  entities: [],
  events: [],
  sessionLog: [],
  recommendations: [],
  generatedAt: new Date().toISOString(),
};

const useStore = initStore(data);

// Expose for debugging / power users.
(window as any).__USE_STORE__ = useStore;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App useStore={useStore} />
  </React.StrictMode>,
);
