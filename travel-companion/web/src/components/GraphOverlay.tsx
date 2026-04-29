import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core, ElementDefinition } from "cytoscape";
import fcose from "cytoscape-fcose";
import type { TripStore } from "../store";
import type { Entity } from "../lib/types";
import { colorForType } from "../lib/constants";

// Register layout once.
let fcoseRegistered = false;
function ensureFcose() {
  if (!fcoseRegistered) { cytoscape.use(fcose); fcoseRegistered = true; }
}

function subgraph(entities: Entity[], rootId: string | null, hops: 1 | 2): Entity[] {
  if (!rootId) return entities;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const visited = new Set<string>([rootId]);
  let frontier = [rootId];
  for (let i = 0; i < hops; i++) {
    const next: string[] = [];
    for (const id of frontier) {
      const e = byId.get(id);
      if (!e) continue;
      for (const r of e.related) if (!visited.has(r) && byId.has(r)) {
        visited.add(r); next.push(r);
      }
    }
    frontier = next;
  }
  return entities.filter((e) => visited.has(e.id));
}

export default function GraphOverlay({ useStore, isMobile }:
  { useStore: TripStore; isMobile: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);
  const graphMode = useStore((s) => s.graphMode);
  const graphNeighborHops = useStore((s) => s.graphNeighborHops);
  const setGraphMode = useStore((s) => s.setGraphMode);
  const setGraphNeighborHops = useStore((s) => s.setGraphNeighborHops);
  const expanded = useStore((s) => s.graphExpanded);
  const setExpanded = useStore((s) => s.setGraphExpanded);

  const [collapsed, setCollapsed] = useState(false); // desktop minimize-to-pill

  const visibleEntities = useMemo(() => {
    if (graphMode === "all") return data.entities;
    if (graphMode === "geo") return data.entities.filter((e) => e.coords);
    return subgraph(data.entities, selectedId, graphNeighborHops);
  }, [data.entities, graphMode, selectedId, graphNeighborHops]);

  const elements: ElementDefinition[] = useMemo(() => {
    const nodes: ElementDefinition[] = visibleEntities.map((e) => ({
      data: {
        id: e.id, label: e.id, type: e.type,
        hasCoords: !!e.coords,
      },
    }));
    const visible = new Set(visibleEntities.map((e) => e.id));
    const edges: ElementDefinition[] = [];
    const seen = new Set<string>();
    for (const e of visibleEntities) {
      for (const r of e.related) {
        if (!visible.has(r)) continue;
        const [a, b] = e.id < r ? [e.id, r] : [r, e.id];
        const key = `${a}__${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ data: { id: `e_${key}`, source: a, target: b } });
      }
    }
    return [...nodes, ...edges];
  }, [visibleEntities]);

  // Init cytoscape once.
  useEffect(() => {
    if (!containerRef.current || cyRef.current || collapsed) return;
    ensureFcose();
    const cy = cytoscape({
      container: containerRef.current,
      wheelSensitivity: 0.25,
      style: [
        { selector: "node", style: {
          "background-color": (ele: any) => colorForType(ele.data("type")),
          "label": "data(label)",
          "font-size": isMobile ? 12 : 10,
          "color": "#1f1f1b",
          "text-valign": "bottom",
          "text-margin-y": 3,
          "text-outline-color": "#fafaf7",
          "text-outline-width": 2,
          "width": isMobile ? 20 : 16,
          "height": isMobile ? 20 : 16,
          "border-width": 1,
          "border-color": "rgba(0,0,0,.15)",
        } as any },
        { selector: "node[?hasCoords]", style: { "border-color": "#c6652a", "border-width": 2 } },
        { selector: "edge", style: {
          "width": 1, "line-color": "rgba(80,80,80,.22)",
          "curve-style": "straight",
        } },
        { selector: "node.selected", style: {
          "border-color": "#c6652a", "border-width": 3,
          "background-blacken": -0.08,
        } },
      ],
      elements: [],
      layout: { name: "preset" },
    });
    cy.on("tap", "node", (ev) => setSelected(ev.target.id()));
    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [isMobile, setSelected, collapsed]);

  // Sync elements and re-layout when data / visibility changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    cy.add(elements);
    cy.layout({
      // @ts-expect-error fcose types not fully published
      name: "fcose", animate: false,
      nodeRepulsion: 4500, idealEdgeLength: 70, gravity: 0.2,
      randomize: false,
    }).run();
    cy.fit(undefined, 20);
  }, [elements]);

  // Visual selection state.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (selectedId) {
      const n = cy.getElementById(selectedId);
      if (n.length) { n.addClass("selected"); cy.center(n); }
    }
  }, [selectedId]);

  // Resize when container resizes.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cyRef.current;
    const obs = new ResizeObserver(() => cy?.resize());
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Desktop: the wrapping layer gets 'expanded' class styled in CSS.
  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (el) el.classList.toggle("expanded", expanded);
  }, [expanded]);

  if (!isMobile && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: "absolute", right: 12, bottom: 12,
          background: "var(--panel)", border: "1px solid var(--border)",
          borderRadius: 20, padding: "8px 14px", fontSize: 13,
          boxShadow: "var(--shadow-md)", zIndex: "var(--z-graph)" as any,
        }}
      >🕸️ 图谱</button>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <div style={{
        position: "absolute", top: 6, left: 6, right: 6,
        display: "flex", gap: 4, pointerEvents: "auto",
        flexWrap: "wrap",
      }}>
        <select
          value={graphMode}
          onChange={(e) => setGraphMode(e.target.value as any)}
          style={{
            fontSize: 11, padding: "3px 6px", border: "1px solid var(--border)",
            borderRadius: 6, background: "var(--panel)",
          }}
        >
          <option value="neighbors">邻居 · {graphNeighborHops}跳</option>
          <option value="all">全图</option>
          <option value="geo">仅地点</option>
        </select>
        {graphMode === "neighbors" && (
          <button
            onClick={() => setGraphNeighborHops(graphNeighborHops === 1 ? 2 : 1)}
            style={{ fontSize: 11, padding: "3px 8px", border: "1px solid var(--border)",
              borderRadius: 6, background: "var(--panel)" }}
          >{graphNeighborHops}跳</button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {!isMobile && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                title={expanded ? "缩小" : "放大"}
                style={{ fontSize: 13, padding: "3px 8px", border: "1px solid var(--border)",
                  borderRadius: 6, background: "var(--panel)" }}
              >{expanded ? "⇲" : "⇱"}</button>
              <button
                onClick={() => setCollapsed(true)}
                title="收起"
                style={{ fontSize: 13, padding: "3px 8px", border: "1px solid var(--border)",
                  borderRadius: 6, background: "var(--panel)" }}
              >×</button>
            </>
          )}
        </div>
      </div>
      {selectedId == null && graphMode === "neighbors" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "var(--muted)", fontSize: 12, pointerEvents: "none",
          textAlign: "center", padding: 24,
        }}>
          选中一个实体，或切换到 "全图" 查看全部关系
        </div>
      )}
    </div>
  );
}
