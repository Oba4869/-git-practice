"use client";

import { useEffect, useRef, useState } from "react";
import * as G from "@/lib/git";
import {
  ACCIDENTS,
  BOSS_NAME,
  BRANCH_NAME,
  STEPS,
  type AccidentId,
  type ActionKey,
} from "@/lib/scenario";
import AreasView from "./AreasView";
import TreeView from "./TreeView";

// VS Code風の練習画面。
// 左：ソース管理 / 中央：エディタ / 下：ターミナル / 右下：上司のひとこと

type TermLine = { id: number; cmd: string; out: string; ok: boolean };
type MobileTab = "scm" | "term" | "graph";

const TITLES = ["チーム開発アプリ", "はじめてのハッカソン", "🚀 チーム開発アプリ", "🚀 はじめてのハッカソン"];
const ZUKAN_KEY = "jiko-zukan-v1";
const ALL_ACCIDENTS = Object.keys(ACCIDENTS) as AccidentId[];
const REPO_URL = "github.com/team/hackathon-app";

function loadZukan(): AccidentId[] {
  try {
    return JSON.parse(localStorage.getItem(ZUKAN_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveZukan(ids: AccidentId[]) {
  try {
    localStorage.setItem(ZUKAN_KEY, JSON.stringify(ids));
  } catch {
    /* 保存できない環境では何もしない */
  }
}

let nextId = 1;

// 本物のgitっぽい出力
function gitOutput(key: ActionKey | "resolve", before: G.Repo, res: G.Result): string {
  if (!res.ok) return res.error;
  const r = res.repo;
  switch (key) {
    case "branch":
      return `Switched to a new branch '${r.current}'`;
    case "commit": {
      const h = G.head(r);
      return `[${r.current} ${h.id}] ${h.message}\n 1 file changed`;
    }
    case "push":
      return before.remote[before.current]
        ? `To ${REPO_URL}.git\n   ${before.remote[before.current]}..${r.remote[r.current]}  ${r.current} -> ${r.current}`
        : `To ${REPO_URL}.git\n * [new branch]      ${r.current} -> ${r.current}`;
    case "pull":
      return res.note === "CONFLICT"
        ? `CONFLICT (content): Merge conflict in ${r.fileName}\nAutomatic merge failed; fix conflicts and then commit the result.`
        : "Merge made by the 'ort' strategy.";
    case "revert":
      return `[${r.current} ${G.head(r).id}] ${G.head(r).message}`;
    case "pr":
      return `Pull request #1 を作成しました（${r.pr.branch} → main）`;
    case "merge":
      return "Pull request #1 をmainにマージしました";
    default:
      return "";
  }
}

export default function Game() {
  const [repo, setRepo] = useState<G.Repo>(() => G.initRepo());
  const [step, setStep] = useState(0);
  const [boss, setBoss] = useState<{ lines: string[]; tone: "normal" | "warn" | "ai" }>({ lines: [], tone: "normal" });
  const [term, setTerm] = useState<TermLine[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [accidents, setAccidents] = useState<AccidentId[]>([]);
  const [finished, setFinished] = useState(false);
  const [finalWord, setFinalWord] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("scm");
  const [bossOpen, setBossOpen] = useState(true);
  const [zukanOpen, setZukanOpen] = useState(false);
  const [zukan, setZukan] = useState<AccidentId[]>([]);
  const timers = useRef<number[]>([]);
  const queueEnd = useRef(0);
  const started = useRef(false);
  const termEnd = useRef<HTMLDivElement>(null);

  // 上司のセリフ：新しいできごとごとに吹き出しを入れ替え、1行ずつ出す
  const speak = (lines: string[], tone: "normal" | "warn" | "ai" = "normal", delay = 250) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setBoss({ lines: [], tone });
    setBossOpen(true);
    let at = delay;
    for (const line of lines) {
      const t = window.setTimeout(() => setBoss((b) => ({ ...b, lines: [...b.lines, line] })), at);
      timers.current.push(t);
      at += 700;
    }
    queueEnd.current = Date.now() + at;
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    speak(STEPS[0].intro);
    setZukan(loadZukan());
  }, []);

  useEffect(() => {
    termEnd.current?.scrollIntoView({ block: "end" });
  }, [term]);

  const addAccident = (id: AccidentId) => {
    setAccidents((a) => (a.includes(id) ? a : [...a, id]));
    const z = loadZukan();
    if (!z.includes(id)) {
      saveZukan([...z, id]);
      setZukan([...z, id]);
    }
  };

  const log = (cmd: string, out: string, ok: boolean) =>
    setTerm((t) => [...t, { id: nextId++, cmd, out, ok }]);

  // 操作結果を反映して、シナリオを進める
  const apply = (key: ActionKey | "resolve", res: G.Result, extra?: string[]) => {
    log(res.command, gitOutput(key, repo, res), res.ok);
    setShowHint(false);
    if (!res.ok) {
      speak([res.error], "warn", 0);
      return;
    }
    let r = res.repo;
    let i = step;
    while (i < STEPS.length && STEPS[i].done(r)) {
      i++;
      if (i < STEPS.length) {
        const s = STEPS[i];
        if (s.onEnter) r = s.onEnter(r);
        if (s.accident) addAccident(s.accident);
      }
    }
    setRepo(r);

    const lines: string[] = [];
    if (res.note === "CONFLICT") {
      lines.push(
        "出た、コンフリクト！ 同じ行を2人で書き換えたから、Gitがどっちを残すか決められなかったんだ。",
        "エディタを見て。<<<<<<< と >>>>>>> の間がぶつかった場所。上に出ている「現在の変更を取り込む」などのボタンで選べるよ。VS Codeでも同じボタンが出るんだ。",
      );
      setMobileTab("scm");
    } else if (res.note) lines.push(res.note);
    if (extra) lines.push(...extra);

    if (i !== step) {
      setStep(i);
      if (i >= STEPS.length) {
        lines.push(
          "マージ完了！ おつかれさま！！",
          "Issue、ブランチ、commit、push、PR、レビュー対応、コンフリクト、取り消し、マージ。チーム開発を1周できたよ。",
        );
        window.setTimeout(() => setFinished(true), 700 * lines.length + 600);
        fetchFinalWord(r);
      } else {
        lines.push(...STEPS[i].intro);
      }
    }
    if (lines.length) speak(lines);
  };

  const editTo = (title: string | "debug") => {
    setEditOpen(false);
    const res = title === "debug" ? G.addDebugLine(repo) : G.edit(repo, title);
    if (res.ok && repo.current === "main" && step === 0 && title !== "debug") {
      addAccident("main-direct");
      apply("edit", res, [
        "あ、ちょっと待って！ 今いるのはmain（みんなの共有スペース）だよ。左下のステータスバーを見てみて。",
        "でも大丈夫。このまま「ブランチを作成」を押せば、今の変更ごと新しいブランチに持っていけるから。",
      ]);
      return;
    }
    apply(title === "debug" ? "debug" : "edit", res);
  };

  const doCommit = () => {
    const s = STEPS[step]?.id;
    const fallback =
      s === "review"
        ? "タイトルに🚀を追加"
        : s === "conflict"
          ? "mainの変更を取り込んでコンフリクトを解決"
          : s === "oops"
            ? "デバッグ用の行を追加"
            : "ヘッダーのタイトルを変更";
    const msg = commitMsg.trim() || fallback;
    const res = G.commit(repo, msg);
    if (res.ok) setCommitMsg("");
    apply("commit", res);
  };

  const context = () =>
    `ステップ: ${STEPS[step]?.label ?? "終了"}\n次の一手: ${STEPS[step]?.hintText(repo) ?? "なし"}\n${G.summarize(repo)}`;

  const ask = async () => {
    const q = question.trim();
    if (!q || thinking) return;
    setQuestion("");
    setThinking(true);
    setBoss({ lines: [`「${q}」だね、ちょっと待って…`], tone: "ai" });
    try {
      const res = await fetch("/api/boss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: q }], context: context() }),
      });
      const data = await res.json();
      speak([data.reply], "ai", 0);
    } catch {
      speak(["ごめん、うまく聞き取れなかった。もう一回送ってくれる？"], "warn", 0);
    } finally {
      setThinking(false);
      setAsking(false);
    }
  };

  const fetchFinalWord = async (r: G.Repo) => {
    try {
      const res = await fetch("/api/boss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: "練習試合が終わりました。次の本番ハッカソンに向けた一言をください（2文以内）。" },
          ],
          context: `練習試合終了。\n${G.summarize(r)}`,
        }),
      });
      const data = await res.json();
      if (!data.offline && !data.error) setFinalWord(data.reply);
    } catch {
      /* 一言がなくても終了画面は出す */
    }
  };

  const restart = () => {
    setRepo(G.initRepo());
    setStep(0);
    setTerm([]);
    setAccidents([]);
    setFinished(false);
    setFinalWord(null);
    setShowHint(false);
    setEditOpen(false);
    setCommitMsg("");
    speak(STEPS[0].intro);
  };

  // ---- 表示用の値 ----
  const current = STEPS[step];
  const hintKey: ActionKey | null = current ? (repo.conflict ? "resolve" : current.hint(repo)) : null;
  const glow = (k: ActionKey) => showHint && hintKey === k;
  const h = G.head(repo);
  const same = (a: string[] | null, b: string[] | null) => JSON.stringify(a) === JSON.stringify(b);
  const unstaged = !!repo.conflict || !same(repo.working, repo.staged ?? h.lines) || (!!repo.mergeHead && repo.staged === null);
  const staged = repo.staged !== null;
  const ahead = repo.remote[repo.current] !== repo.branches[repo.current];
  const behindMain = repo.current !== "main" && !G.isAncestor(repo, repo.remote.main, repo.branches[repo.current]);
  const myCommits = repo.order
    .map((id) => repo.commits[id])
    .filter((c) => c.author === "you" && !c.revertOf && c.parents.length === 1 && G.isAncestor(repo, c.id, repo.branches[repo.current]))
    .reverse();
  const conflictStart = repo.working.findIndex((l) => l.startsWith("<<<<<<<"));
  const isMarker = (l: string) => l.startsWith("<<<<<<<") || l.startsWith("=======") || l.startsWith(">>>>>>>");
  const editLine = 1;

  // ---- 部品 ----
  const glowCls = "ring-2 ring-[var(--boss)] shadow-[0_0_0_4px_rgba(240,136,62,0.25)]";

  const SourceControl = (
    <div className="space-y-4 p-3 text-[13px]">
      <div>
        <p className="mb-2 text-[11px] font-bold tracking-wide text-[var(--muted)]">ソース管理</p>
        <input
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doCommit()}
          placeholder="メッセージ（例：ヘッダーのタイトルを変更）"
          className="w-full rounded border border-[var(--line)] bg-[var(--input)] px-2 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={doCommit}
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
              <p>
                #1 {repo.commits[repo.order.find((id) => repo.commits[id].author === "you") ?? "c0"].message}
              </p>
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

  const Editor = (
    <div className="relative font-mono text-[13px] leading-6">
      {repo.working.map((line, i) => {
        const marker = isMarker(line);
        const canEdit = !repo.conflict && i === editLine;
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
                  <button key={k} onClick={() => apply("resolve", G.resolve(repo, k), ["印が消えたね！ 左の「変更」に出ている ＋ で add して、解決済みだとGitに伝えよう。"])} className="hover:text-[var(--accent)] hover:underline">
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
                  <button key={t} onClick={() => editTo(t)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-[var(--accent)] hover:text-white">
                    {t}
                  </button>
                ))}
                {step === 8 && (
                  <button onClick={() => editTo("debug")} className="block w-full rounded px-2 py-1.5 text-left hover:bg-[var(--accent)] hover:text-white">
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

  const Terminal = (
    <div className="h-full overflow-y-auto p-3 font-mono text-[12px] leading-5">
      <p className="text-[var(--muted)]">ここに、ボタンを押したときに実際に打たれるコマンドが出ます</p>
      {term.map((t) => (
        <div key={t.id} className="mt-1">
          <p>
            <span className="text-[var(--you)]">{repo.current === "main" ? "~/app (main)" : `~/app (${repo.current})`}</span> $ {t.cmd}
          </p>
          {t.out && <p className={`whitespace-pre-wrap ${t.ok ? "text-[var(--muted)]" : "text-[var(--danger)]"}`}>{t.out}</p>}
        </div>
      ))}
      <div ref={termEnd} />
    </div>
  );

  const BossCard = (
    <div
      className={`rounded-lg border bg-[var(--side)] p-3 shadow-xl ${
        boss.tone === "warn" ? "border-[var(--boss)]" : "border-[var(--line)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => setBossOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={bossOpen}
          title={bossOpen ? "たたむ" : "ひらく"}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--boss)] text-[13px] font-bold text-white">ひ</span>
          <span className="shrink-0 text-[12px] font-bold">{BOSS_NAME}</span>
          {!bossOpen && <span className="min-w-0 truncate text-[12px] text-[var(--muted)]">{boss.lines.at(-1)}</span>}
          <span className="shrink-0 text-[11px] text-[var(--muted)]">{bossOpen ? "▾" : "▸"}</span>
        </button>
        {boss.tone === "ai" && <span className="rounded bg-[var(--hover)] px-1 text-[10px] text-[var(--muted)]">AI</span>}
        <div className="flex shrink-0 gap-1">
          {current && (
            <button onClick={() => { setShowHint((v) => !v); setBossOpen(true); }} className="rounded px-2 py-0.5 text-[11px] text-[var(--boss)] hover:bg-[var(--hover)]">
              💡 ヒント
            </button>
          )}
          <button onClick={() => { setAsking((v) => !v); setBossOpen(true); }} className="rounded px-2 py-0.5 text-[11px] text-[var(--muted)] hover:bg-[var(--hover)]">
            質問する
          </button>
        </div>
      </div>
      {bossOpen && (
        <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-[13px] leading-relaxed">
          {boss.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
      {showHint && current && (
        <p className="mt-2 rounded bg-[var(--hover)] px-2 py-1 text-[12px] text-[var(--boss)]">💡 {repo.conflict ? STEPS[step].hintText(repo) : current.hintText(repo)}</p>
      )}
      {asking && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
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

  const StatusBar = (
    <footer className="flex items-center gap-3 bg-[var(--accent)] px-3 py-0.5 text-[12px] text-white">
      <button
        onClick={() => repo.current === "main" && apply("branch", G.switchCreate(repo, BRANCH_NAME))}
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

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--ink)]">
      {/* タイトルバー */}
      <header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--bar)] px-3 py-1.5">
        <div className="hidden gap-1.5 sm:flex">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <p className="min-w-0 truncate text-[12px]">
          <span className="hidden text-[var(--muted)] sm:inline">練習試合（仮）— </span>{current ? `${step + 1}/${STEPS.length} ${current.label}` : "試合終了"}
        </p>
        <div className="ml-auto hidden h-1.5 w-40 overflow-hidden rounded bg-[var(--line)] sm:block">
          <div className="h-full bg-[var(--you)] transition-all duration-500" style={{ width: `${(Math.min(step, STEPS.length) / STEPS.length) * 100}%` }} />
        </div>
        <button onClick={() => setZukanOpen(true)} aria-label="事故図鑑" className="ml-auto shrink-0 rounded border border-[var(--line)] px-2 py-0.5 text-[11px] sm:ml-0">
          📖 <span className="hidden sm:inline">事故図鑑 </span>{zukan.length}/{ALL_ACCIDENTS.length}
        </button>
        <button onClick={restart} className="shrink-0 rounded border border-[var(--line)] px-2 py-0.5 text-[11px]">
          やり直す
        </button>
      </header>

      {/* PC */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <nav className="flex w-12 flex-col items-center gap-4 border-r border-[var(--line)] bg-[var(--bar)] pt-3 text-lg text-[var(--muted)]">
          <span title="エクスプローラー">📄</span>
          <span title="ソース管理" className="relative border-l-2 border-white pl-2 text-white">
            ⑂
            {(unstaged || staged) && (
              <span className="absolute -right-2 -top-1 rounded-full bg-[var(--accent)] px-1 text-[9px]">{(unstaged ? 1 : 0) + (staged ? 1 : 0)}</span>
            )}
          </span>
        </nav>
        <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-[var(--line)] bg-[var(--side)]">
          {SourceControl}
          <div className="border-t border-[var(--line)] p-3">
            <p className="mb-1 text-[11px] font-bold text-[var(--muted)]">グラフ</p>
            <TreeView repo={repo} />
          </div>
        </aside>
        <section className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex border-b border-[var(--line)] bg-[var(--bar)] text-[12px]">
            <span className="border-t-2 border-[var(--accent)] bg-[var(--bg)] px-3 py-1.5">
              📄 {repo.fileName} {unstaged && <span className="text-[var(--boss)]">●</span>}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">{Editor}</div>
          <div className="absolute bottom-[276px] right-4 w-[380px]">{BossCard}</div>
          <div className="grid h-[260px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-t border-[var(--line)] bg-[var(--term)]">
            <div className="flex min-h-0 flex-col border-r border-[var(--line)]">
              <p className="border-b border-[var(--line)] px-3 py-1 text-[11px] font-bold text-[var(--muted)]">ターミナル</p>
              <div className="min-h-0 flex-1">{Terminal}</div>
            </div>
            <div className="min-h-0 overflow-y-auto p-3">
              <p className="mb-2 text-[11px] font-bold text-[var(--muted)]">ファイルの居場所</p>
              <AreasView repo={repo} />
            </div>
          </div>
        </section>
      </div>

      {/* スマホ */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className="flex border-b border-[var(--line)] bg-[var(--bar)] text-[12px]">
          <span className="border-t-2 border-[var(--accent)] bg-[var(--bg)] px-3 py-1.5">
            📄 {repo.fileName} {unstaged && <span className="text-[var(--boss)]">●</span>}
          </span>
        </div>
        <div className="max-h-[34%] shrink-0 overflow-y-auto py-1">{Editor}</div>
        <div className="shrink-0 px-2 pb-2">{BossCard}</div>
        <div className="flex border-y border-[var(--line)] bg-[var(--bar)] text-[12px]">
          {(
            [
              ["scm", `ソース管理${unstaged || staged ? "●" : ""}`],
              ["term", "ターミナル"],
              ["graph", "居場所とグラフ"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMobileTab(k)}
              className={`flex-1 py-2 ${mobileTab === k ? "border-b-2 border-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--side)]">
          {mobileTab === "scm" && SourceControl}
          {mobileTab === "term" && <div className="h-full bg-[var(--term)]">{Terminal}</div>}
          {mobileTab === "graph" && (
            <div className="space-y-4 p-3">
              <AreasView repo={repo} />
              <TreeView repo={repo} />
            </div>
          )}
        </div>
      </div>

      {StatusBar}

      {/* 事故図鑑 */}
      {zukanOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/60 p-4" onClick={() => setZukanOpen(false)}>
          <div className="mx-auto max-w-2xl rounded-lg border border-[var(--line)] bg-[var(--bg)] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center">
              <div>
                <h2 className="text-lg font-bold">📖 事故図鑑</h2>
                <p className="text-[12px] text-[var(--muted)]">
                  練習で起こした事故が集まります（{zukan.length}/{ALL_ACCIDENTS.length}）。本番で同じ事故が起きても、もう大丈夫。
                </p>
              </div>
              <button onClick={() => setZukanOpen(false)} className="ml-auto self-start rounded px-2 text-[var(--muted)] hover:bg-[var(--hover)]">
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
      )}

      {/* 試合終了 */}
      {finished && (
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
            <button onClick={restart} className="mt-6 w-full rounded bg-[var(--accent)] py-3 font-bold text-white">
              もう一回練習する
            </button>
            <button onClick={() => setZukanOpen(true)} className="mt-2 w-full rounded border border-[var(--line)] py-3 text-sm">
              📖 事故図鑑を見る（{zukan.length}/{ALL_ACCIDENTS.length}）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
