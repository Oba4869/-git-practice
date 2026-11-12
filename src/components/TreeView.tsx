"use client";

import type { Repo } from "@/lib/git";

const LANE_Y: Record<string, number> = { main: 58, other: 108 };
const STEP_X = 44;

export default function TreeView({ repo }: { repo: Repo }) {
  const ids = repo.order;
  const pos = (id: string) => {
    const c = repo.commits[id];
    const x = 56 + ids.indexOf(id) * STEP_X;
    const y = c.branch === "main" ? LANE_Y.main : LANE_Y.other;
    return { x, y };
  };
  const width = Math.max(300, 112 + (ids.length - 1) * STEP_X);
  const headId = repo.branches[repo.current];

  // ブランチ名ラベル（ローカルとGitHub）
  const labels: Record<string, string[]> = {};
  const push = (id: string, s: string) => (labels[id] = [...(labels[id] ?? []), s]);
  for (const [b, id] of Object.entries(repo.branches)) push(id, b === repo.current ? `★${b}` : b);
  for (const [b, id] of Object.entries(repo.remote)) push(id, `GitHub/${b}`);

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={164}
        viewBox={`0 0 ${width} 164`}
        role="img"
        aria-label="コミットの履歴"
        className="block"
      >
        <line x1={0} x2={width} y1={LANE_Y.main} y2={LANE_Y.main} stroke="var(--line)" strokeDasharray="2 4" opacity={0.5} />
        <line x1={0} x2={width} y1={LANE_Y.other} y2={LANE_Y.other} stroke="var(--line)" strokeDasharray="2 4" opacity={0.5} />
        {ids.flatMap((id) =>
          repo.commits[id].parents.map((p) => {
            const a = pos(p),
              b = pos(id);
            const d =
              a.y === b.y
                ? `M${a.x} ${a.y}L${b.x} ${b.y}`
                : `M${a.x} ${a.y}C${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`;
            return <path key={`${p}-${id}`} d={d} stroke="var(--line)" strokeWidth={2} fill="none" />;
          }),
        )}
        {ids.map((id) => {
          const c = repo.commits[id];
          const { x, y } = pos(id);
          const color = c.author === "boss" ? "var(--boss)" : "var(--you)";
          return (
            <g key={id}>
              <circle
                cx={x}
                cy={y}
                r={id === headId ? 9 : 7}
                fill={id === headId ? color : "var(--card)"}
                stroke={color}
                strokeWidth={2.5}
              >
                <title>{`${c.message}（${c.author === "boss" ? "ひらたさん" : "あなた"}）`}</title>
              </circle>
              {(labels[id] ?? []).map((l, i) => (
                <text
                  key={l}
                  x={x}
                  y={c.branch === "main" ? y - 15 - i * 11 : y + 22 + i * 11}
                  fontSize={9.5}
                  textAnchor="middle"
                  fill={l.startsWith("GitHub") ? "var(--muted)" : "var(--ink)"}
                  fontWeight={l.startsWith("★") ? 700 : 400}
                >
                  {l}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-[var(--muted)]">
        上の段＝main（みんなの分）　下の段＝自分のブランチ<br /><span className="text-[var(--you)]">●</span> あなた　<span className="text-[var(--boss)]">●</span> ひらたさん　★ 今いるブランチ
      </p>
    </div>
  );
}
