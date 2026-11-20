"use client";

import { BOSS_NAME } from "@/lib/scenario";
import type { BossState } from "./types";

// 上司（ひらたさん）のひとこと。ヒントと質問の入口もここ
export default function BossCard({
  boss,
  open,
  setOpen,
  hintText,
  showHint,
  toggleHint,
  asking,
  toggleAsking,
  question,
  setQuestion,
  thinking,
  onAsk,
}: {
  boss: BossState;
  open: boolean;
  setOpen: (fn: (v: boolean) => boolean) => void;
  hintText: string | null; // nullならヒントなし（試合終了後）
  showHint: boolean;
  toggleHint: () => void;
  asking: boolean;
  toggleAsking: () => void;
  question: string;
  setQuestion: (v: string) => void;
  thinking: boolean;
  onAsk: () => void;
}) {
  return (
    <div
      className={`rounded-lg border bg-[var(--side)] p-3 shadow-xl ${
        boss.tone === "warn" ? "border-[var(--boss)]" : "border-[var(--line)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          title={open ? "たたむ" : "ひらく"}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--boss)] text-[13px] font-bold text-white">ひ</span>
          <span className="shrink-0 text-[12px] font-bold">{BOSS_NAME}</span>
          {!open && <span className="min-w-0 truncate text-[12px] text-[var(--muted)]">{boss.lines.at(-1)}</span>}
          <span className="shrink-0 text-[11px] text-[var(--muted)]">{open ? "▾" : "▸"}</span>
        </button>
        {boss.tone === "ai" && <span className="rounded bg-[var(--hover)] px-1 text-[10px] text-[var(--muted)]">AI</span>}
        <div className="flex shrink-0 gap-1">
          {hintText !== null && (
            <button onClick={toggleHint} className="rounded px-2 py-0.5 text-[11px] text-[var(--boss)] hover:bg-[var(--hover)]">
              💡 ヒント
            </button>
          )}
          <button onClick={toggleAsking} className="rounded px-2 py-0.5 text-[11px] text-[var(--muted)] hover:bg-[var(--hover)]">
            質問する
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-[13px] leading-relaxed">
          {boss.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
      {showHint && hintText !== null && (
        <p className="mt-2 rounded bg-[var(--hover)] px-2 py-1 text-[12px] text-[var(--boss)]">💡 {hintText}</p>
      )}
      {asking && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAsk();
          }}
          className="mt-2 flex gap-1"
        >
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例：pushって何？"
            className="min-w-0 flex-1 rounded border border-[var(--line)] bg-[var(--input)] px-2 py-1 text-[13px] outline-none focus:border-[var(--accent)]"
          />
          <button disabled={thinking} className="rounded bg-[var(--accent)] px-3 text-[12px] text-white disabled:opacity-40">
            送る
          </button>
        </form>
      )}
    </div>
  );
}
