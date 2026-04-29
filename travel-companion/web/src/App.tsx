import { useEffect, useMemo } from "react";
import type { TripStore } from "./store";
import { useIsMobile } from "./lib/hooks";
import MapView from "./components/MapView";
import GraphOverlay from "./components/GraphOverlay";
import DetailDrawer from "./components/DetailDrawer";
import Timeline from "./components/Timeline";
import Legend from "./components/Legend";
import Topbar from "./components/Topbar";
import MobileTabs from "./components/MobileTabs";
import EmptyState from "./components/EmptyState";

interface Props { useStore: TripStore; }

export default function App({ useStore }: Props) {
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);
  const activeTab = useStore((s) => s.activeTab);

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

      <div className="stage">
        {/* On desktop both layers coexist. On mobile we switch with a tab bar. */}
        {(!isMobile || activeTab === "map") && (
          <div className="layer map-layer">
            <MapView useStore={useStore} isMobile={isMobile} />
          </div>
        )}
        {(!isMobile || activeTab === "graph") && (
          <div className={`layer graph-layer ${isMobile ? "full" : "overlay"}`}>
            <GraphOverlay useStore={useStore} isMobile={isMobile} />
          </div>
        )}
        {isMobile && <MobileTabs useStore={useStore} />}
      </div>

      <Timeline useStore={useStore} isMobile={isMobile} />
      <DetailDrawer useStore={useStore} isMobile={isMobile} />
      {!isMobile && <Legend useStore={useStore} />}
    </div>
  );
}
