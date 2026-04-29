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

    // If the container hasn't been laid out yet (0×0), wait for the next
    // frame — otherwise fcose collapses the graph onto a diagonal line.
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
        // randomize=true is critical: without it every node starts at (0,0)
        // and the force simulation degenerates into a straight line.
        randomize: true,
        quality: "default",
        // Scale forces by node count so small and large graphs both look OK.
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

  // Visual selection state.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (selectedId) {
      const n = cy.getElementById(selectedId);
      if (n.length) {
        n.addClass("selected");
        cy.center(n);
        // On mobile, the bottom drawer (55vh) covers the lower portion of the
        // graph canvas.  Shift the viewport up so the selected node sits in the
        // centre of the *visible* area above the drawer rather than the
        // geometric centre of the full canvas.
        if (isMobile) {
          const drawerH = window.innerHeight * 0.55; // matches CSS: height 55vh
          cy.panBy({ x: 0, y: -drawerH / 2 });
        }
      }
    }
  }, [selectedId, isMobile]);

  // Resize + re-fit when the container resizes. If the graph was laid out
  // while the container was tiny, we also nudge fcose again once we have
  // real space — but only when nodes are bunched (heuristic: all within a
  // small bounding box).
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(() => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.resize();
      // Detect degenerate line layout: compute nodes' bounding box vs
      // container, and re-layout if dimensions are absurd.
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
