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
  const [activeEvt, setActiveEvt] = useState<string | null>(null);

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

  const sorted = useMemo(
    () => [...withYear].sort((a, b) => a.year - b.year),
    [withYear],
  );

  const formatYear = (y: number) => y < 0 ? `前${-y}` : `${y}`;

  const MOBILE_SLOT = 140;

  const activeEvent = activeEvt ? sorted.find((e) => e.id === activeEvt) : null;

  // Render a dot node (no popover — detail is rendered separately below track)
  const renderDot = (e: TripEvent & { year: number }, isHit: boolean) => {
    const active = activeEvt === e.id;
    return (
      <>
        <div className="year">{formatYear(e.year)}</div>
        <div
          className={`dot ${isHit ? "hit" : ""} ${active ? "active" : ""}`}
          onClick={(ev) => { ev.stopPropagation(); setActiveEvt(active ? null : e.id); }}
        />
        <div className="label" title={e.summary}>{e.summary}</div>
      </>
    );
  };

  return (
    <div className={`timeline ${open ? (tall ? "open tall" : "open") : "closed"} ${activeEvent ? "has-detail" : ""}`}>
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
        <>
          <div className="track">
            {isMobile ? (
              <div className="axis axis-even" style={{ width: `${sorted.length * MOBILE_SLOT}px` }}>
                {sorted.map((e, i) => {
                  const isHit = relatedYears?.has(e.year) ?? false;
                  return (
                    <div key={e.id} className="evt-slot" style={{ left: `${i * MOBILE_SLOT}px` }}>
                      {renderDot(e, isHit)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="axis" style={{ width: "100%" }}>
                {sorted.map((e) => {
                  const pct = ((e.year - minY) / (maxY - minY)) * 100;
                  const isHit = relatedYears?.has(e.year) ?? false;
                  return (
                    <div key={e.id} style={{ left: `${pct}%`, position: "absolute", top: 0, bottom: 0 }}>
                      {renderDot(e, isHit)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inline detail panel — outside .track so no overflow clipping */}
          {activeEvent && (
            <div className="evt-detail">
              <div className="evt-detail-head">
                <span className="evt-detail-year">{formatYear(activeEvent.year)}</span>
                <span className="evt-detail-summary">{activeEvent.summary}</span>
                <button className="evt-detail-close" onClick={() => setActiveEvt(null)}>×</button>
              </div>
              <div className="evt-detail-links">
                {activeEvent.places.map((p) => (
                  <button key={p} className="evt-chip place" onClick={() => setSelected(p)}>📍 {p}</button>
                ))}
                {activeEvent.actors.map((a) => (
                  <button key={a} className="evt-chip actor" onClick={() => setSelected(a)}>👤 {a}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
