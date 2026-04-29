import type { TripStore } from "../store";

export default function MobileTabs({ useStore }: { useStore: TripStore }) {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  return (
    <nav className="mobile-tabs">
      <button
        className={activeTab === "map" ? "active" : ""}
        onClick={() => setActiveTab("map")}
        aria-label="地图"
      >
        <span className="icon">🗺️</span>
        <span>地图</span>
      </button>
      <button
        className={activeTab === "graph" ? "active" : ""}
        onClick={() => setActiveTab("graph")}
        aria-label="图谱"
      >
        <span className="icon">🕸️</span>
        <span>图谱</span>
      </button>
    </nav>
  );
}
