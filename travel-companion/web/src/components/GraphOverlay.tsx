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

export default function GraphOverlay({ useStore, isMobile, graphVisible }:
  { useStore: TripStore; isMobile: boolean; graphVisible?: boolean }) {
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
  const setGraphVisible = useStore((s) => s.setGraphVisible);

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
      // On mobile the container background is handled by CSS (.mobile-overlay),
      // so we keep the canvas itself transparent.
      style: [
        { selector: "node", style: {
          "background-color": (ele: any) => colorForType(ele.data("type")),
          "background-opacity": 1,
          "label": "data(label)",
          "font-size": isMobile ? 13 : 10,
          "color": "#1f1f1b",
          "text-valign": "bottom",
          "text-margin-y": 3,
          "text-outline-color": isMobile ? "rgba(255,255,255,0.95)" : "#fafaf7",
          "text-outline-width": isMobile ? 4 : 2,
          "width": isMobile ? 22 : 16,
          "height": isMobile ? 22 : 16,
          "border-width": isMobile ? 2 : 1,
          "border-color": isMobile ? "rgba(0,0,0,.25)" : "rgba(0,0,0,.15)",
        } as any },
        { selector: "node[?hasCoords]", style: { "border-color": "#c6652a", "border-width": isMobile ? 3 : 2 } },
        { selector: "edge", style: {
          "width": isMobile ? 1.5 : 1,
          "line-color": isMobile ? "rgba(80,80,80,.35)" : "rgba(80,80,80,.22)",
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

    const runLayout = () => {
      const box = cy.container()?.getBoundingClientRect();
      if (!box || box.width < 80 || box.height < 80) {
        requestAnimationFrame(runLayout);
        return;
      }
      const nodeCount = cy.nodes().length;
      cy.layout(({
        name: "fcose",
        animate: false,
        randomize: true,
        quality: "default",
        nodeRepulsion: () => 8000 + nodeCount * 200,
        idealEdgeLength: () => 90,
        edgeElasticity: () => 0.45,
        gravity: 0.05,
        gravityRange: 3.0,
        numIter: 2500,
        tile: true,
        nodeSeparation: 75,
        packComponents: true,
      } as any)).run();
      cy.fit(undefined, 24);
    };
    runLayout();
  }, [elements]);

  // Visual selection state + center viewport.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (selectedId) {
      const n = cy.getElementById(selectedId);
      if (n.length) {
        n.addClass("selected");
        cy.center(n);
        if (isMobile) {
          // On mobile the bottom drawer covers ~55vh; shift up so node is
          // visible in the area above the drawer.
          const drawerH = window.innerHeight * 0.55;
          cy.panBy({ x: 0, y: -drawerH / 2 });
        }
      }
    }
  }, [selectedId, isMobile]);

  // Re-fit on container resize.
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(() => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.resize();
      const bb = cy.nodes().boundingBox({});
      const w = bb.w, h = bb.h;
      const degenerate = cy.nodes().length > 3 && (w < 40 || h < 40 || w / Math.max(h, 1) > 20 || h / Math.max(w, 1) > 20);
      if (degenerate) {
        cy.layout({
          name: "fcose", animate: false, randomize: true,
          nodeRepulsion: () => 9000, idealEdgeLength: () => 90,
          gravity: 0.05, numIter: 2500,
        } as any).run();
      }
      cy.fit(undefined, 24);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Desktop expanded state.
  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (el) el.classList.toggle("expanded", expanded);
  }, [expanded]);

  // Desktop: collapsed pill
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
      {/* Cytoscape canvas */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* ── Mobile: close button (shown when graph is visible) ── */}
      {isMobile && graphVisible && (
        <button
          className="graph-close-btn"
          onClick={() => setGraphVisible(false)}
          aria-label="关闭图谱"
        >×</button>
      )}

      {/* ── Graph toolbar (mode selector etc.) ── */}
      <div style={{
        position: "absolute", top: 6, left: 6,
        right: isMobile ? 44 : 6,   // leave room for close btn on mobile
        display: "flex", gap: 4, pointerEvents: "auto",
        flexWrap: "wrap",
        // Hide toolbar when mobile graph is not visible
        ...(isMobile && !graphVisible ? { display: "none" } : {}),
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
        {!isMobile && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
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
          </div>
        )}
      </div>

      {/* Empty state hint */}
      {selectedId == null && graphMode === "neighbors" && (!isMobile || graphVisible) && (
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
