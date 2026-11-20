"use client";

import type { Repo } from "@/lib/git";

// 一番下のステータスバー：今いるブランチ、未送信、コンフリクト
export default function StatusBar({
  repo,
  step,
  ahead,
  onCreateBranch,
}: {
  repo: Repo;
  step: number;
  ahead: boolean;
  onCreateBranch: () => void;
}) {
  return (
    <footer className="flex items-center gap-3 bg-[var(--accent)] px-3 py-0.5 text-[12px] text-white">
      <button
        onClick={() => repo.current === "main" && onCreateBranch()}
        className={`flex items-center gap-1 rounded px-1 hover:bg-white/15 ${repo.current === "main" && step === 0 ? "font-bold" : ""}`}
        title={repo.current === "main" ? "クリックでブランチを作成" : ""}
      >
        ⎇ {repo.current}
      </button>
      {repo.current !== "main" && <span>{ahead ? "↑ 未送信あり" : "↑0"}</span>}
      {repo.conflict && <span className="rounded bg-[var(--danger)] px-1">⚠ コンフリクト</span>}
      <span className="ml-auto hidden sm:inline">{repo.fileName}</span>
    </footer>
  );
}
