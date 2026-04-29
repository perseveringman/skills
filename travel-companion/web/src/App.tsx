import { useEffect, useMemo } from "react";
import type { TripStore } from "./store";
import { useIsMobile } from "./lib/hooks";
import MapView from "./components/MapView";
import GraphOverlay from "./components/GraphOverlay";
import DetailDrawer from "./components/DetailDrawer";
import Timeline from "./components/Timeline";
import Legend from "./components/Legend";
import Topbar from "./components/Topbar";
import EmptyState from "./components/EmptyState";

interface Props { useStore: TripStore; }

export default function App({ useStore }: Props) {
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);
  const graphVisible = useStore((s) => s.graphVisible);
  const setGraphVisible = useStore((s) => s.setGraphVisible);

  const isMobile = useIsMobile();

  // URL sync: ?entity=xxx. Lets the user share/bookmark a specific entity.
  useEffect(() => {
    const p = new URLSearchParams(location.search).get("entity");
    if (p && data.entities.some((e) => e.id === p)) setSelected(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    if (selectedId) url.searchParams.set("entity", selectedId);
    else url.searchParams.delete("entity");
    history.replaceState(null, "", url.toString());
  }, [selectedId]);

  const isEmpty = useMemo(() => data.entities.length === 0, [data.entities]);

  if (isEmpty) return <EmptyState />;

  return (
    <div className={`app ${isMobile ? "mobile" : "desktop"}`}>
      <Topbar useStore={useStore} isMobile={isMobile} />

      {/* Mobile: timeline above stage so bottom drawer won't cover it */}
      {isMobile && <Timeline useStore={useStore} isMobile={isMobile} />}

      <div className="stage">
        {/* Map is always rendered on both mobile and desktop */}
        <div className="layer map-layer">
          <MapView useStore={useStore} isMobile={isMobile} />
        </div>

        {/* Graph:
            - Desktop: floating overlay panel (bottom-right)
            - Mobile:  semi-transparent full-canvas overlay, shown/hidden via graphVisible */}
        <div className={
          isMobile
            ? `layer graph-layer mobile-overlay${graphVisible ? "" : " hidden"}`
            : "layer graph-layer overlay"
        }>
          <GraphOverlay useStore={useStore} isMobile={isMobile} graphVisible={graphVisible} />
        </div>

        {/* Mobile: "show graph" toggle button — rendered OUTSIDE the overlay
            so it remains clickable even when the overlay is pointer-events:none */}
        {isMobile && !graphVisible && (
          <button
            className="graph-toggle-btn"
            onClick={() => setGraphVisible(true)}
            aria-label="显示图谱"
          >
            🕸️ 图谱
          </button>
        )}
      </div>

      {/* Desktop: timeline below stage */}
      {!isMobile && <Timeline useStore={useStore} isMobile={isMobile} />}
      <DetailDrawer useStore={useStore} isMobile={isMobile} />
      {!isMobile && <Legend useStore={useStore} />}
    </div>
  );
}
