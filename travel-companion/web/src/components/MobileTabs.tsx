import type { TripStore } from "../store";

export default function MobileTabs({ useStore }: { useStore: TripStore }) {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const target = activeTab === "map" ? "graph" : "map";
  const label = target === "graph" ? "图谱" : "地图";
  const icon = target === "graph" ? "🕸️" : "🗺️";
  return (
    <button
      className="mobile-tab-toggle"
      onClick={() => setActiveTab(target)}
      aria-label={label}
    >
      {icon} {label}
    </button>
  );
}
