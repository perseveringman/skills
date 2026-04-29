import { useEffect, useState } from "react";

interface TripEntry {
  slug: string;
  title: string;
  subtitle: string | null;
  destination: string | null;
  countryHint: string | null;
  cover: string | null;
  createdAt: string | null;
  entityCount?: number;
  eventCount?: number;
  recommendationCount?: number;
  turnCount?: number;
  generatedAt?: string | null;
}

export default function Home() {
  const [trips, setTrips] = useState<TripEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // BASE_URL respects vite's `base` if it's ever set; defaults to "/".
    const url = `${import.meta.env.BASE_URL}trips/manifest.json`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return r.json();
      })
      .then((m: TripEntry[]) => setTrips(m))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="home-root">
        <div className="home-card">
          <h1>无法加载 trips/manifest.json</h1>
          <p style={{ color: "var(--muted)" }}>{error}</p>
          <p style={{ fontSize: 12, marginTop: 16 }}>
            构建时由 <code>scripts/build_trips_manifest.py</code> 生成。
          </p>
        </div>
      </div>
    );
  }

  if (!trips) {
    return (
      <div className="home-root">
        <div className="home-card">加载中…</div>
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="home-root">
        <div className="home-card">
          <h1>还没有沉淀任何旅行</h1>
          <p>
            在 Agent 对话里聊一段你想去的地方，对话内容会被自动整理成实体、
            关系、地图和时间轴；下次部署后就会出现在这里。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-root">
      <header className="home-header">
        <h1>旅行档案 · Trip Atlas</h1>
        <p>每段对话沉淀成一份永久的、可探索的知识库。</p>
      </header>

      <ul className="trip-grid">
        {trips.map((t) => (
          <li key={t.slug}>
            <a className="trip-card" href={`#/t/${encodeURIComponent(t.slug)}`}>
              <div className="trip-card-title">{t.title}</div>
              {t.subtitle && (
                <div className="trip-card-subtitle">{t.subtitle}</div>
              )}
              <div className="trip-card-stats">
                <span>{t.entityCount ?? 0} 实体</span>
                <span>·</span>
                <span>{t.eventCount ?? 0} 事件</span>
                <span>·</span>
                <span>{t.recommendationCount ?? 0} 推荐</span>
                <span>·</span>
                <span>{t.turnCount ?? 0} 对话</span>
              </div>
              {t.generatedAt && (
                <div className="trip-card-meta">
                  最近更新 {new Date(t.generatedAt).toLocaleString()}
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
