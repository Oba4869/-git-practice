"use client";

import { coachComment, type WeakSpot } from "@/lib/coach";
import { ACCIDENTS, type AccidentId } from "@/lib/scenario";
import { ALL_ACCIDENTS } from "@/lib/zukan";

// 試合終了画面
export default function FinishScreen({
  accidents,
  finalWord,
  weak,
  zukanCount,
  onRestart,
  onOpenZukan,
}: {
  accidents: AccidentId[];
  finalWord: string | null;
  weak: WeakSpot[]; // 苦手なところ（苦手な順）。空なら表示しない
  zukanCount: number;
  onRestart: () => void;
  onOpenZukan: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-[var(--bg)] p-6">
      <div className="mx-auto max-w-lg">
        <p className="text-sm text-[var(--muted)]">試合終了</p>
        <h2 className="mt-1 text-2xl font-bold">チーム開発を1周できた！</h2>
        {finalWord && (
          <div className="mt-4 flex items-start gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--boss)] text-sm font-bold text-white">ひ</div>
            <p className="rounded-lg border border-[var(--line)] bg-[var(--side)] px-3 py-2 text-sm">{finalWord}</p>
          </div>
        )}
        <h3 className="mt-6 text-sm font-bold">今回の事故（事故図鑑に追加）</h3>
        <div className="mt-2 grid gap-3">
          {accidents.map((id) => (
            <div key={id} className="rounded-lg border border-[var(--line)] bg-[var(--side)] p-4">
              <p className="font-bold">✅ {ACCIDENTS[id].title}</p>
              <p className="mt-1 text-sm">{ACCIDENTS[id].lesson}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">本番のVS Codeなら：{ACCIDENTS[id].vscode}</p>
            </div>
          ))}
        </div>
        {weak.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-bold">次の練習で見直したいところ</h3>
            <div className="mt-2 grid gap-3">
              {weak.slice(0, 2).map((w) => (
                <div key={w.stepId} className="rounded-lg border border-[var(--boss)]/60 bg-[var(--side)] p-4">
                  <p className="font-bold">🎯 {w.label}</p>
                  <p className="mt-1 text-sm">{coachComment(w)}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {/* ボタンは画面の下に固定。カードが増えても、親指で届く */}
        <div className="sticky bottom-0 -mx-6 mt-6 border-t border-[var(--line)] bg-[var(--bg)] px-6 pb-4 pt-3">
          <button onClick={onRestart} className="w-full rounded bg-[var(--accent)] py-3 font-bold text-white">
            もう一回練習する
          </button>
          <button onClick={onOpenZukan} className="mt-2 w-full rounded border border-[var(--line)] py-3 text-sm">
            📖 事故図鑑を見る（{zukanCount}/{ALL_ACCIDENTS.length}）
          </button>
        </div>
      </div>
    </div>
  );
}
