import { create } from "zustand";
import type { Entity, TripData } from "./lib/types";

interface TripState {
  data: TripData;
  byId: Map<string, Entity>;

  selectedId: string | null;
  hoveredId: string | null;
  graphMode: "neighbors" | "all" | "geo";
  graphNeighborHops: 1 | 2;
  graphExpanded: boolean;     // desktop: overlay small vs large
  graphVisible: boolean;      // mobile: graph overlay shown or hidden
  timelineOpen: boolean;
  legendOpen: boolean;
  drawerFull: boolean;        // mobile: bottom-sheet half vs full

  setSelected: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setGraphMode: (m: TripState["graphMode"]) => void;
  setGraphNeighborHops: (h: 1 | 2) => void;
  setGraphExpanded: (b: boolean) => void;
  setGraphVisible: (b: boolean) => void;
  setTimelineOpen: (b: boolean) => void;
  setLegendOpen: (b: boolean) => void;
  setDrawerFull: (b: boolean) => void;
}

export function initStore(data: TripData) {
  const byId = new Map<string, Entity>();
  for (const e of data.entities) byId.set(e.id, e);

  return create<TripState>((set) => ({
    data,
    byId,
    selectedId: null,
    hoveredId: null,
    graphMode: "neighbors",
    graphNeighborHops: 1,
    graphExpanded: false,
    graphVisible: false,
    timelineOpen: false,
    legendOpen: false,
    drawerFull: false,

    setSelected: (id) => set({ selectedId: id, drawerFull: false }),
    setHovered: (id) => set({ hoveredId: id }),
    setGraphMode: (graphMode) => set({ graphMode }),
    setGraphNeighborHops: (graphNeighborHops) => set({ graphNeighborHops }),
    setGraphExpanded: (graphExpanded) => set({ graphExpanded }),
    setGraphVisible: (graphVisible) => set({ graphVisible }),
    setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
    setLegendOpen: (legendOpen) => set({ legendOpen }),
    setDrawerFull: (drawerFull) => set({ drawerFull }),
  }));
}

export type TripStore = ReturnType<typeof initStore>;
