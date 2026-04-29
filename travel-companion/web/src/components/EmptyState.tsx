export default function EmptyState() {
  return (
    <div className="empty-root">
      <div className="card">
        <h1>尚未有知识沉淀</h1>
        <p>
          在任意一个启用了 <code>travel-companion</code> skill 的 Agent 对话里
          聊聊你想去的地方，实体、关系、地图和时间轴就会在这里逐步呈现。
        </p>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 20 }}>
          当前工作目录的 <code>wiki/</code>、<code>recommendations/</code>、
          <code>data/</code> 也都是给你永久保留的。
        </p>
      </div>
    </div>
  );
}
