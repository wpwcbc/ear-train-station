export function PlaceholderPage({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="page">
      <h1 className="h1">{title}</h1>
      {desc ? <p className="sub">{desc}</p> : null}
      <div className="callout">
        This tab is planned. Next we’ll build it Duolingo-style (quests/leaderboard/profile).
      </div>
    </div>
  );
}
