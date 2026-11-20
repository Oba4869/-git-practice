"use client";

import { useEffect, useRef } from "react";
import type { TermLine } from "./types";

// 下のターミナル：ボタンを押したときに実際に打たれるコマンドを表示する
export default function Terminal({ term, branch }: { term: TermLine[]; branch: string }) {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [term]);

  return (
    <div className="h-full overflow-y-auto p-3 font-mono text-[12px] leading-5">
      <p className="text-[var(--muted)]">ここに、ボタンを押したときに実際に打たれるコマンドが出ます</p>
      {term.map((t) => (
        <div key={t.id} className="mt-1">
          <p>
            <span className="text-[var(--you)]">~/app ({branch})</span> $ {t.cmd}
          </p>
          {t.out && <p className={`whitespace-pre-wrap ${t.ok ? "text-[var(--muted)]" : "text-[var(--danger)]"}`}>{t.out}</p>}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
