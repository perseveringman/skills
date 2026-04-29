import { useMemo } from "react";
import type { TripStore } from "../store";
import { colorForType } from "../lib/constants";

export default function Legend({ useStore }: { useStore: TripStore }) {
  const entities = useStore((s) => s.data.entities);
  const open = useStore((s) => s.legendOpen);
  const setOpen = useStore((s) => s.setLegendOpen);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entities) m.set(e.type, (m.get(e.type) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entities]);

  if (!open) {
    return (
      <button className="legend-toggle" onClick={() => setOpen(true)}>
        图例 · {counts.length}
      </button>
    );
  }
  return (
    <div className="legend" onClick={() => setOpen(false)}>
      <h3>类型 · {counts.length}</h3>
      {counts.map(([t, n]) => (
        <div key={t} className="row">
          <span className="dot" style={{ background: colorForType(t) }} />
          <span style={{ flex: 1 }}>{t}</span>
          <span style={{ color: "var(--muted)" }}>{n}</span>
        </div>
      ))}
    </div>
  );
}
