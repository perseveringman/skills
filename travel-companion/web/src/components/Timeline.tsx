import { useEffect, useMemo, useState } from "react";
import type { TripStore } from "../store";
import type { TripEvent } from "../lib/types";

export default function Timeline({ useStore, isMobile }:
  { useStore: TripStore; isMobile: boolean }) {
  const events = useStore((s) => s.data.events);
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);
  const open = useStore((s) => s.timelineOpen);
  const setOpen = useStore((s) => s.setTimelineOpen);
  const [tall, setTall] = useState(false);

  // Auto-open timeline on mobile so it's immediately visible
  useEffect(() => {
    if (isMobile && events.length > 0) setOpen(true);
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const withYear = useMemo(
    () => events.filter((e): e is TripEvent & { year: number } =>
      typeof e.year === "number"),
    [events],
  );

  if (!events.length) return null;

  const [minY, maxY] = useMemo(() => {
    if (!withYear.length) return [0, 0];
    let lo = Infinity, hi = -Infinity;
    for (const e of withYear) { lo = Math.min(lo, e.year); hi = Math.max(hi, e.year); }
    if (hi === lo) { hi += 1; lo -= 1; }
    return [lo, hi];
  }, [withYear]);

  const relatedYears = useMemo(() => {
    if (!selectedId) return null;
    const ys = new Set<number>();
    for (const e of withYear) {
      if (e.places.includes(selectedId) || e.actors.includes(selectedId)) ys.add(e.year);
    }
    return ys;
  }, [selectedId, withYear]);

  const formatYear = (y: number) => y < 0 ? `前${-y}` : `${y}`;

  return (
    <div className={`timeline ${open ? (tall ? "open tall" : "open") : "closed"}`}>
      <div className="bar" onClick={() => setOpen(!open)}
           onDoubleClick={(e) => { e.stopPropagation(); setTall(!tall); setOpen(true); }}>
        <span>📅 历史时间轴</span>
        <span className="count">{events.length}</span>
        <span style={{ flex: 1 }} />
        {open && !isMobile && (
          <button
            onClick={(e) => { e.stopPropagation(); setTall(!tall); }}
            style={{ background: "transparent", border: "none", color: "var(--muted)" }}
          >{tall ? "▾ 收起" : "▴ 展开"}</button>
        )}
        <span style={{ color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="track">
          <div className="axis" style={{ width: isMobile ? `${Math.max(600, withYear.length * 120)}px` : "100%" }}>
            {withYear.map((e) => {
              const pct = ((e.year - minY) / (maxY - minY)) * 100;
              const isHit = relatedYears?.has(e.year) ?? false;
              return (
                <div key={e.id} style={{ left: `${pct}%`, position: "absolute", top: 0, bottom: 0 }}>
                  <div className="year" style={{ left: 0 }}>{formatYear(e.year)}</div>
                  <div
                    className={`dot ${isHit ? "hit" : ""}`}
                    onClick={() => {
                      // Jump to the first place/actor with data.
                      const target = e.places[0] || e.actors[0];
                      if (target) setSelected(target);
                    }}
                  />
                  <div className="label" title={e.summary}>{e.summary}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
