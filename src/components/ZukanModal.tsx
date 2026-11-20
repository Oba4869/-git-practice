"use client";

import { ACCIDENTS, type AccidentId } from "@/lib/scenario";
import { ALL_ACCIDENTS } from "@/lib/zukan";

// 事故図鑑：出会った事故が集まる
export default function ZukanModal({ zukan, onClose }: { zukan: AccidentId[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="mx-auto max-w-2xl rounded-lg border border-[var(--line)] bg-[var(--bg)] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center">
          <div>
            <h2 className="text-lg font-bold">📖 事故図鑑</h2>
            <p className="text-[12px] text-[var(--muted)]">
              練習で起こした事故が集まります（{zukan.length}/{ALL_ACCIDENTS.length}）。本番で同じ事故が起きても、もう大丈夫。
            </p>
          </div>
          <button onClick={onClose} className="ml-auto self-start rounded px-2 text-[var(--muted)] hover:bg-[var(--hover)]">
            ✕
          </button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-[var(--line)]">
          <div className="h-full bg-[var(--boss)]" style={{ width: `${(zukan.length / ALL_ACCIDENTS.length) * 100}%` }} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {ALL_ACCIDENTS.map((id, n) =>
            zukan.includes(id) ? (
              <div key={id} className="rounded-lg border border-[var(--boss)]/60 bg-[var(--side)] p-4">
                <p className="text-[11px] text-[var(--boss)]">No.{String(n + 1).padStart(2, "0")}</p>
                <p className="font-bold">{ACCIDENTS[id].title}</p>
                <p className="mt-2 text-[13px] leading-relaxed">{ACCIDENTS[id].lesson}</p>
                <p className="mt-2 rounded bg-[var(--hover)] px-2 py-1 text-[12px] text-[var(--muted)]">VS Codeなら：{ACCIDENTS[id].vscode}</p>
              </div>
            ) : (
              <div key={id} className="grid min-h-32 place-items-center rounded-lg border border-dashed border-[var(--line)] p-4 text-center">
                <div>
                  <p className="text-[11px] text-[var(--muted)]">No.{String(n + 1).padStart(2, "0")}</p>
                  <p className="text-2xl text-[var(--muted)]">？？？</p>
                  <p className="text-[11px] text-[var(--muted)]">試合で出会うと登録されます</p>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
