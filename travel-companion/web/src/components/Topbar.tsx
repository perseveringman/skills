import { useMemo, useState } from "react";
import type { TripStore } from "../store";

export default function Topbar({ useStore, isMobile }:
  { useStore: TripStore; isMobile: boolean }) {
  const data = useStore((s) => s.data);
  const setSelected = useStore((s) => s.setSelected);
  const [q, setQ] = useState("");

  const hits = useMemo(() => {
    if (!q.trim()) return [];
    const ql = q.trim().toLowerCase();
    return data.entities
      .map((e) => {
        // Match against id (Chinese), aliases (English/Chinese), tags, type, summary
        const matchedAlias = e.aliases.find((a) => a.toLowerCase().includes(ql));
        const matched =
          e.id.toLowerCase().includes(ql) ||
          !!matchedAlias ||
          e.tags.some((t) => t.toLowerCase().includes(ql)) ||
          e.type.toLowerCase().includes(ql) ||
          e.summary.toLowerCase().includes(ql);
        return matched ? { entity: e, matchedAlias } : null;
      })
      .filter(Boolean)
      .slice(0, 8) as { entity: typeof data.entities[number]; matchedAlias?: string }[];
  }, [q, data.entities]);

  return (
    <div className="topbar">
      <div>
        <div className="title">{data.destination || "Trip Explorer"}</div>
        <div className="sub">
          {data.entities.length} 实体 · {data.events.length} 事件 ·
          {" "}
          {data.entities.filter((e) => e.coords).length} 地点
        </div>
      </div>
      <div style={{ position: "relative", flex: 1, display: "flex", justifyContent: "flex-end" }}>
        <input
          className="search"
          placeholder={isMobile ? "搜索实体" : "搜索实体 / 别名 / 标签..."}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {hits.length > 0 && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0,
            width: "min(320px, 90vw)", background: "var(--panel)",
            border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "var(--shadow-md)", zIndex: 100, overflow: "hidden",
          }}>
            {hits.map(({ entity: e, matchedAlias }) => (
              <button
                key={e.id}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 12px", background: "transparent", border: "none",
                  borderBottom: "1px solid var(--border)", fontSize: 14,
                }}
                onClick={() => { setSelected(e.id); setQ(""); }}
              >
                <div style={{ fontWeight: 600 }}>
                  {e.id}
                  {matchedAlias && (
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>
                      ({matchedAlias})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{e.type}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
