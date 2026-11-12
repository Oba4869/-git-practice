"use client";

import { type Repo, head, titleOf, hasDebug } from "@/lib/git";

function Box({
  name,
  sub,
  value,
  active,
}: {
  name: string;
  sub: string;
  value: string | null;
  active: boolean;
}) {
  return (
    <div
      className={`flex-1 min-w-0 rounded-xl border px-2 py-2 transition-colors ${
        active ? "border-[var(--you)] bg-[var(--you-soft)]" : "border-[var(--line)] bg-[var(--card)]"
      }`}
    >
      <p className="text-[11px] font-bold leading-tight">{name}</p>
      <p className="text-[10px] text-[var(--muted)] leading-tight">{sub}</p>
      <p className="mt-1 line-clamp-2 break-all font-mono text-[11px] leading-snug" title={value ?? ""}>
        {value ?? "—"}
      </p>
    </div>
  );
}

const Arrow = () => <span className="self-center text-[var(--muted)] text-xs">→</span>;

export default function AreasView({ repo }: { repo: Repo }) {
  const h = head(repo);
  const remoteId = repo.remote[repo.current];
  const show = (lines: string[]) => titleOf(lines) + (hasDebug(lines) ? " +debug" : "");
  const workingChanged = JSON.stringify(repo.working) !== JSON.stringify(h.lines);
  return (
    <div>
      <div className="flex gap-1">
        <Box
          name="作業場"
          sub="編集中のファイル"
          value={repo.conflict ? "⚠ コンフリクト中" : show(repo.working)}
          active={workingChanged && repo.staged === null}
        />
        <Arrow />
        <Box
          name="ステージ"
          sub="git add"
          value={repo.staged ? show(repo.staged) : null}
          active={repo.staged !== null}
        />
        <Arrow />
        <Box
          name="PCの履歴"
          sub="git commit（Git）"
          value={show(h.lines)}
          active={!workingChanged && repo.staged === null && remoteId !== h.id}
        />
        <Arrow />
        <Box
          name="GitHub"
          sub="git push"
          value={remoteId ? show(repo.commits[remoteId].lines) : "未送信"}
          active={remoteId === h.id && repo.current !== "main"}
        />
      </div>
      <p className="mt-1 text-[11px] text-[var(--muted)]">
        今いるブランチ：<span className="font-mono font-bold text-[var(--ink)]">{repo.current}</span>
        　表示中のファイル：{repo.fileName} のタイトル
      </p>
    </div>
  );
}
