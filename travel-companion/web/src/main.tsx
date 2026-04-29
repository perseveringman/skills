import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Home from "./Home";
import { initStore } from "./store";
import type { TripData } from "./lib/types";
import "./index.css";

declare global {
  interface Window { __TRIP_DATA__: TripData | null; }
}

const EMPTY: TripData = {
  version: 1,
  destination: null,
  countryHint: null,
  entities: [],
  events: [],
  sessionLog: [],
  recommendations: [],
  generatedAt: new Date().toISOString(),
};

// Three render modes:
// 1. Single-file explorer.html written by scripts/inject.py — `__TRIP_DATA__`
//    has been inlined at build/inject time. Skip routing entirely.
// 2. Multi-trip site (Vercel build) — hash-based router:
//      #/                → Home (lists trips/manifest.json)
//      #/t/<slug>        → fetch trips/<slug>.json then mount App
// 3. Empty placeholder — show Home so at least manifest fetching can fail
//    visibly.
const inlined = window.__TRIP_DATA__;

function parseHash(): { kind: "home" } | { kind: "trip"; slug: string } {
  const h = location.hash || "#/";
  const m = h.match(/^#\/t\/([^/?]+)/);
  if (m) return { kind: "trip", slug: decodeURIComponent(m[1]) };
  return { kind: "home" };
}

function Router() {
  const [route, setRoute] = useState(parseHash);
  const [data, setData] = useState<TripData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      setData(null);
      setError(null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (route.kind !== "trip") return;
    const url = `${import.meta.env.BASE_URL}trips/${encodeURIComponent(route.slug)}.json`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return r.json();
      })
      .then((d: TripData) => setData(d))
      .catch((e) => setError(String(e)));
  }, [route]);

  if (route.kind === "home") return <Home />;

  if (error) {
    return (
      <div className="home-root">
        <div className="home-card">
          <h1>找不到这次旅行</h1>
          <p style={{ color: "var(--muted)" }}>{error}</p>
          <p>
            <a href="#/">← 返回旅行列表</a>
          </p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="home-root"><div className="home-card">加载中…</div></div>;
  }

  const useStore = initStore(data);
  (window as any).__USE_STORE__ = useStore;
  return <App useStore={useStore} />;
}

const root = createRoot(document.getElementById("root")!);

if (inlined) {
  // Mode 1: bypass router, single trip already inlined.
  const useStore = initStore(inlined);
  (window as any).__USE_STORE__ = useStore;
  root.render(
    <React.StrictMode>
      <App useStore={useStore} />
    </React.StrictMode>,
  );
} else {
  // Mode 2/3: routed multi-trip site.
  void EMPTY; // silence unused-warning; kept for reference shape.
  root.render(
    <React.StrictMode>
      <Router />
    </React.StrictMode>,
  );
}
