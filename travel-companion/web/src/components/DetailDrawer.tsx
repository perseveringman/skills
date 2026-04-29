import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import type { TripStore } from "../store";
import { projectEntity } from "../lib/anchors";

type SourceTab = "entity" | "chat" | "recs";

export default function DetailDrawer({ useStore, isMobile }:
  { useStore: TripStore; isMobile: boolean }) {
  const byId = useStore((s) => s.byId);
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);
  const drawerFull = useStore((s) => s.drawerFull);
  const setDrawerFull = useStore((s) => s.setDrawerFull);

  const entity = selectedId ? byId.get(selectedId) : null;
  const [tab, setTab] = useState<SourceTab>("entity");

  // Swipe-to-dismiss / expand on mobile.
  const grabberRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; full: boolean } | null>(null);
  useEffect(() => {
    if (!isMobile || !grabberRef.current) return;
    const el = grabberRef.current;
    const onStart = (e: TouchEvent) => {
      dragStart.current = { y: e.touches[0].clientY, full: drawerFull };
    };
    const onMove = (e: TouchEvent) => {
      if (!dragStart.current) return;
      const dy = e.touches[0].clientY - dragStart.current.y;
      if (!dragStart.current.full && dy < -40) { setDrawerFull(true); dragStart.current = null; }
      if (dragStart.current && dragStart.current.full && dy > 60) { setDrawerFull(false); dragStart.current = null; }
      if (dragStart.current && !dragStart.current.full && dy > 120) { setSelected(null); dragStart.current = null; }
    };
    const onEnd = () => { dragStart.current = null; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [isMobile, drawerFull, setDrawerFull, setSelected]);

  const projections = useMemo(
    () => (entity ? projectEntity(entity, byId) : []),
    [entity, byId],
  );

  // Find related session turns: turns that mention this entity id in text.
  const relatedTurns = useMemo(() => {
    if (!entity) return [];
    const needles = [entity.id, ...entity.aliases];
    return data.sessionLog.filter((t) =>
      needles.some((n) => t.text.includes(n))
    );
  }, [entity, data.sessionLog]);

  const relatedRecs = useMemo(() => {
    if (!entity) return [];
    return data.recommendations.filter((r) => r.place === entity.id);
  }, [entity, data.recommendations]);

  useEffect(() => { setTab("entity"); }, [selectedId]);

  const entityHtml = useMemo(() => {
    if (!entity) return "";
    return marked.parse(entity.body || entity.summary || "", { async: false }) as string;
  }, [entity]);

  const klass = [
    "drawer",
    isMobile ? "mobile" : "desktop",
    entity ? "open" : "",
    isMobile && drawerFull ? "full" : "",
  ].filter(Boolean).join(" ");

  return (
    <aside className={klass} aria-hidden={!entity}>
      {isMobile && <div ref={grabberRef} className="grabber" />}
      {entity?.image && (
        <div className="entity-hero">
          <img src={entity.image} alt={entity.id} loading="lazy" />
          {entity.imageCredit && (
            <span className="hero-credit">{entity.imageCredit}</span>
          )}
        </div>
      )}
      <div className="head">
        <div style={{ flex: 1 }}>
          {entity && (
            <>
              <span className="pill type">{entity.type}</span>
              {entity.aliases.slice(0, 3).map((a) => (
                <span className="pill" key={a}>{a}</span>
              ))}
              <h2>{entity.id}</h2>
              {entity.coords && (
                <div className="coord">
                  📍 {entity.coords[0].toFixed(4)}, {entity.coords[1].toFixed(4)}
                </div>
              )}
              {!entity.coords && projections.length > 0 && (
                <div className="anchors-note">
                  ⤳ 关联到 {projections.length} 个地点：
                  {" "}{projections.slice(0, 3).map((p) => p.placeId).join("、")}
                  {projections.length > 3 ? `…` : ""}
                </div>
              )}
            </>
          )}
        </div>
        <button
          className="close"
          onClick={() => setSelected(null)}
          aria-label="关闭"
        >×</button>
      </div>

      {entity && (
        <div className="body">
          {/* Summary + related entities */}
          {entity.summary && (
            <div className="section">
              <h3>简介</h3>
              <div>{entity.summary}</div>
            </div>
          )}

          <div className="section">
            <h3>关联实体 · {entity.related.length}</h3>
            {entity.related.length === 0
              ? <div style={{ color: "var(--muted)", fontSize: 12 }}>暂无</div>
              : (
                <ul className="related-list">
                  {entity.related.map((r) => (
                    <li key={r}>
                      <button
                        onClick={() => byId.has(r) && setSelected(r)}
                        disabled={!byId.has(r)}
                        title={byId.has(r) ? "跳转" : "尚未在知识库中"}
                      >
                        {r}{byId.has(r) ? " →" : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>

          {/* Truth sources */}
          <div className="section">
            <h3>真相源</h3>
            <div className="source-tabs">
              <button
                className={tab === "entity" ? "active" : ""}
                onClick={() => setTab("entity")}
              >实体 md</button>
              <button
                className={tab === "chat" ? "active" : ""}
                onClick={() => setTab("chat")}
              >对话片段 · {relatedTurns.length}</button>
              <button
                className={tab === "recs" ? "active" : ""}
                onClick={() => setTab("recs")}
              >推荐 · {relatedRecs.length}</button>
            </div>
            {tab === "entity" && (
              <div className="md-body" dangerouslySetInnerHTML={{ __html: entityHtml }} />
            )}
            {tab === "chat" && (
              <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
                {relatedTurns.length === 0
                  ? <div style={{ color: "var(--muted)", fontSize: 12 }}>未找到提及此实体的对话片段。</div>
                  : relatedTurns.map((t, i) => (
                    <div key={i} className={`chat-turn ${t.role}`}>
                      <div className="who">{t.role === "user" ? "👤 用户" : "🤖 助手"} · {t.t.slice(0, 10)}</div>
                      <div>{t.text}</div>
                    </div>
                  ))}
              </div>
            )}
            {tab === "recs" && (
              <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
                {relatedRecs.length === 0
                  ? <div style={{ color: "var(--muted)", fontSize: 12 }}>还没为此地点生成推荐。</div>
                  : relatedRecs.map((r) => (
                    <details key={r.kind} style={{ marginBottom: 6 }}>
                      <summary style={{
                        cursor: "pointer", padding: "6px 10px",
                        background: "var(--panel-2)", borderRadius: 6, fontSize: 13,
                      }}>
                        {r.kind === "shots" ? "📹 拍摄" :
                          r.kind === "food" ? "🍜 美食" :
                          r.kind === "itinerary" ? "🗺️ 行程" : "📍 游玩地点"}
                        <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 8 }}>
                          {r.file}
                        </span>
                      </summary>
                      <div className="md-body" style={{ marginTop: 4 }}
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(r.body || "", { async: false }) as string,
                        }} />
                    </details>
                  ))}
              </div>
            )}
          </div>

          <div className="section">
            <h3>文件</h3>
            <div style={{ fontSize: 12, color: "var(--muted)",
              fontFamily: "ui-monospace, Menlo, monospace" }}>
              {entity.file}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
