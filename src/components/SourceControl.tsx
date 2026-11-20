"use client";

import * as G from "@/lib/git";
import { BRANCH_NAME } from "@/lib/scenario";
import type { View } from "@/lib/view";
import type { Apply, Glow } from "./types";
import { glowCls } from "./ui";

// 左のソース管理：commit / push / add / ブランチ / PR / revert
export default function SourceControl({
  repo,
  step,
  view,
  glow,
  apply,
  commitMsg,
  setCommitMsg,
  onCommit,
}: {
  repo: G.Repo;
  step: number;
  view: View;
  glow: Glow;
  apply: Apply;
  commitMsg: string;
  setCommitMsg: (v: string) => void;
  onCommit: () => void;
}) {
  const { unstaged, staged, ahead, behindMain, myCommits } = view;

  return (
    <div className="space-y-4 p-3 text-[13px]">
      <div>
        <p className="mb-2 text-[11px] font-bold tracking-wide text-[var(--muted)]">ソース管理</p>
        <input
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCommit()}
          placeholder="メッセージ（例：ヘッダーのタイトルを変更）"
          className="w-full rounded border border-[var(--line)] bg-[var(--input)] px-2 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={onCommit}
          className={`mt-2 w-full rounded bg-[var(--accent)] py-1.5 font-bold text-white ${glow("commit") ? glowCls : ""}`}
        >
          ✓ コミット <span className="font-mono text-[11px] font-normal opacity-80">git commit</span>
        </button>
        <button
          onClick={() => apply("push", repo.current === "main" ? G.pushMainDirect() : G.push(repo))}
          className={`mt-2 w-full rounded border border-[var(--line)] py-1.5 ${glow("push") ? glowCls : ""}`}
        >
          ↑ GitHubに送る <span className="font-mono text-[11px] text-[var(--muted)]">git push</span>
          {ahead && repo.current !== "main" && <span className="ml-1 rounded bg-[var(--accent)] px-1 text-[10px] text-white">未送信</span>}
        </button>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-bold text-[var(--muted)]">ステージ済みの変更（{staged ? 1 : 0}）</p>
        {staged && (
          <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[var(--hover)]">
            <span>📄 {repo.fileName}</span>
            <span className="ml-auto font-mono text-[11px] text-[var(--you)]">M</span>
          </div>
        )}
        <p className="mb-1 mt-2 text-[11px] font-bold text-[var(--muted)]">変更（{unstaged ? 1 : 0}）</p>
        {unstaged && (
          <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[var(--hover)]">
            <span>📄 {repo.fileName}</span>
            <span className={`ml-auto font-mono text-[11px] ${repo.conflict ? "text-[var(--danger)]" : "text-[var(--boss)]"}`}>
              {repo.conflict || repo.mergeHead ? "C" : "M"}
            </span>
            <button
              title="ステージに乗せる（git add）"
              onClick={() => apply("add", G.add(repo))}
              className={`rounded border border-[var(--line)] px-2 font-bold ${glow("add") ? glowCls : ""}`}
            >
              ＋
            </button>
          </div>
        )}
        {!unstaged && !staged && <p className="px-2 text-[12px] text-[var(--muted)]">変更はありません</p>}
        <p className="mt-1 px-2 text-[11px] text-[var(--muted)]">＋ を押すと git add（ステージに乗せる）</p>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-bold text-[var(--muted)]">ブランチ</p>
        <p className="px-2 font-mono">⎇ {repo.current}</p>
        <button
          onClick={() => apply("branch", G.switchCreate(repo, BRANCH_NAME))}
          className={`mt-2 w-full rounded border border-[var(--line)] py-1.5 ${glow("branch") ? glowCls : ""}`}
        >
          ＋ ブランチを作成 <span className="font-mono text-[11px] text-[var(--muted)]">git switch -c</span>
        </button>
        {step >= 7 && (
          <button
            onClick={() => apply("pull", G.pullMain(repo))}
            className={`mt-2 w-full rounded border border-[var(--line)] py-1.5 ${glow("pull") ? glowCls : ""}`}
          >
            ↓ mainの最新を取り込む <span className="font-mono text-[11px] text-[var(--muted)]">git pull</span>
            {behindMain && <span className="ml-1 rounded bg-[var(--boss)] px-1 text-[10px] text-white">遅れ</span>}
          </button>
        )}
      </div>

      {step >= 5 && (
        <div>
          <p className="mb-1 text-[11px] font-bold text-[var(--muted)]">GitHub プルリクエスト</p>
          {!repo.pr.open && !repo.pr.merged ? (
            <button
              onClick={() => apply("pr", G.openPR(repo))}
              className={`w-full rounded border border-[var(--line)] py-1.5 ${glow("pr") ? glowCls : ""}`}
            >
              PRを作成 <span className="text-[11px] text-[var(--muted)]">{repo.current} → main</span>
            </button>
          ) : (
            <div className="rounded border border-[var(--line)] p-2">
              <p>#1 {repo.commits[repo.order.find((id) => repo.commits[id].author === "you") ?? "c0"].message}</p>
              <p className="text-[11px] text-[var(--muted)]">
                {repo.pr.merged ? "✅ マージ済み" : behindMain ? "⚠ mainとぶつかっています" : "🟢 オープン"}
              </p>
              {step >= 10 && repo.pr.open && (
                <button
                  onClick={() => apply("merge", G.mergePR(repo))}
                  className={`mt-2 w-full rounded bg-[var(--merge)] py-1.5 font-bold text-white ${glow("merge") ? glowCls : ""}`}
                >
                  マージする
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {step >= 9 && (
        <div>
          <p className="mb-1 text-[11px] font-bold text-[var(--muted)]">コミット履歴（取り消し）</p>
          {myCommits.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[var(--hover)]">
              <span className="font-mono text-[11px] text-[var(--muted)]">{c.id}</span>
              <span className="truncate">{c.message}</span>
              <button
                onClick={() => apply("revert", G.revert(repo, c.id))}
                className={`ml-auto shrink-0 rounded border border-[var(--line)] px-2 text-[11px] ${
                  glow("revert") && G.hasDebug(c.lines) ? glowCls : ""
                }`}
              >
                Revert
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
