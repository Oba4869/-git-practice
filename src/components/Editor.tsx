"use client";

import * as G from "@/lib/git";
import type { Apply, Glow } from "./types";
import { glowCls } from "./ui";

const TITLES = ["チーム開発アプリ", "はじめてのハッカソン", "🚀 チーム開発アプリ", "🚀 はじめてのハッカソン"];
const EDIT_LINE = 1; // タイトルの行（0始まり）

const isMarker = (l: string) => l.startsWith("<<<<<<<") || l.startsWith("=======") || l.startsWith(">>>>>>>");

// 中央のエディタ：タイトル行の編集と、コンフリクトの解決ボタン
export default function Editor({
  repo,
  step,
  glow,
  apply,
  editOpen,
  setEditOpen,
  onEdit,
}: {
  repo: G.Repo;
  step: number;
  glow: Glow;
  apply: Apply;
  editOpen: boolean;
  setEditOpen: (fn: (v: boolean) => boolean) => void;
  onEdit: (title: string | "debug") => void;
}) {
  const conflictStart = repo.working.findIndex((l) => l.startsWith("<<<<<<<"));

  return (
    <div className="relative font-mono text-[13px] leading-6">
      {repo.working.map((line, i) => {
        const marker = isMarker(line);
        const canEdit = !repo.conflict && i === EDIT_LINE;
        return (
          <div key={i}>
            {repo.conflict && i === conflictStart && (
              <div className={`flex flex-wrap gap-x-3 pl-12 text-[11px] text-[var(--muted)] ${glow("resolve") ? "rounded " + glowCls : ""}`}>
                {(
                  [
                    ["ours", "現在の変更を取り込む"],
                    ["theirs", "入力側の変更を取り込む"],
                    ["both", "両方の変更を取り込む"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => apply("resolve", G.resolve(repo, k), ["印が消えたね！ 左の「変更」に出ている ＋ で add して、解決済みだとGitに伝えよう。"])}
                    className="hover:text-[var(--accent)] hover:underline"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div
              onClick={() => canEdit && setEditOpen((v) => !v)}
              className={`flex ${canEdit ? "cursor-pointer hover:bg-[var(--hover)]" : ""} ${
                line.startsWith("<<<<<<<") || (repo.conflict && i > conflictStart && i < repo.working.findIndex((l) => l.startsWith("=======")))
                  ? "bg-[var(--ours)]"
                  : ""
              } ${
                repo.conflict && i > repo.working.findIndex((l) => l.startsWith("=======")) && i <= repo.working.findIndex((l) => l.startsWith(">>>>>>>"))
                  ? "bg-[var(--theirs)]"
                  : ""
              } ${canEdit && (glow("edit") || glow("debug")) ? glowCls : ""}`}
            >
              <span className="w-10 shrink-0 select-none pr-3 text-right text-[var(--muted)]">{i + 1}</span>
              <span className={`whitespace-pre ${marker ? "text-[var(--boss)]" : ""}`}>{line}</span>
              {canEdit && <span className="ml-auto pr-2 text-[10px] text-[var(--muted)]">✎ クリックで編集</span>}
            </div>
            {canEdit && editOpen && (
              <div className="z-10 ml-10 mt-1 mb-2 w-72 rounded border border-[var(--line)] bg-[var(--side)] p-1 font-sans shadow-lg">
                <p className="px-2 py-1 text-[11px] text-[var(--muted)]">タイトルを書き換える</p>
                {TITLES.map((t) => (
                  <button key={t} onClick={() => onEdit(t)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-[var(--accent)] hover:text-white">
                    {t}
                  </button>
                ))}
                {step === 8 && (
                  <button onClick={() => onEdit("debug")} className="block w-full rounded px-2 py-1.5 text-left hover:bg-[var(--accent)] hover:text-white">
                    ＋ デバッグ用の行を追加する
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
