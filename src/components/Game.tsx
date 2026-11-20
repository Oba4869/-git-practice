"use client";

import { useEffect, useRef, useState } from "react";
import * as G from "@/lib/git";
import { gitOutput } from "@/lib/gitOutput";
import { BRANCH_NAME, STEPS, type AccidentId } from "@/lib/scenario";
import { deriveView } from "@/lib/view";
import { ALL_ACCIDENTS, loadZukan, saveZukan } from "@/lib/zukan";
import AreasView from "./AreasView";
import BossCard from "./BossCard";
import Editor from "./Editor";
import FinishScreen from "./FinishScreen";
import SourceControl from "./SourceControl";
import StatusBar from "./StatusBar";
import Terminal from "./Terminal";
import TreeView from "./TreeView";
import type { Apply, BossState, Glow, MobileTab, TermLine, Tone } from "./types";
import ZukanModal from "./ZukanModal";

// VS Code風の練習画面。
// 左：ソース管理 / 中央：エディタ / 下：ターミナル / 右下：上司のひとこと
// このファイルは「状態」と「画面の配置」だけを持つ。各部品は同じフォルダの別ファイル。

let nextId = 1;

export default function Game() {
  const [repo, setRepo] = useState<G.Repo>(() => G.initRepo());
  const [step, setStep] = useState(0);
  const [boss, setBoss] = useState<BossState>({ lines: [], tone: "normal" });
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

  // 上司のセリフ：新しいできごとごとに吹き出しを入れ替え、1行ずつ出す
  const speak = (lines: string[], tone: Tone = "normal", delay = 250) => {
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
  const apply: Apply = (key, res, extra) => {
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
  const hintKey = current ? (repo.conflict ? "resolve" : current.hint(repo)) : null;
  const glow: Glow = (k) => showHint && hintKey === k;
  const view = deriveView(repo);
  const { unstaged, staged, ahead } = view;
  const createBranch = () => apply("branch", G.switchCreate(repo, BRANCH_NAME));

  // ---- 部品 ----
  const sourceControl = (
    <SourceControl
      repo={repo}
      step={step}
      view={view}
      glow={glow}
      apply={apply}
      commitMsg={commitMsg}
      setCommitMsg={setCommitMsg}
      onCommit={doCommit}
    />
  );
  const editor = (
    <Editor repo={repo} step={step} glow={glow} apply={apply} editOpen={editOpen} setEditOpen={setEditOpen} onEdit={editTo} />
  );
  const terminal = <Terminal term={term} branch={repo.current} />;
  const bossCard = (
    <BossCard
      boss={boss}
      open={bossOpen}
      setOpen={setBossOpen}
      hintText={current ? current.hintText(repo) : null}
      showHint={showHint}
      toggleHint={() => {
        setShowHint((v) => !v);
        setBossOpen(true);
      }}
      asking={asking}
      toggleAsking={() => {
        setAsking((v) => !v);
        setBossOpen(true);
      }}
      question={question}
      setQuestion={setQuestion}
      thinking={thinking}
      onAsk={ask}
    />
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
          {sourceControl}
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
          <div className="min-h-0 flex-1 overflow-y-auto py-2">{editor}</div>
          <div className="absolute bottom-[276px] right-4 w-[380px]">{bossCard}</div>
          <div className="grid h-[260px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-t border-[var(--line)] bg-[var(--term)]">
            <div className="flex min-h-0 flex-col border-r border-[var(--line)]">
              <p className="border-b border-[var(--line)] px-3 py-1 text-[11px] font-bold text-[var(--muted)]">ターミナル</p>
              <div className="min-h-0 flex-1">{terminal}</div>
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
        <div className="max-h-[34%] shrink-0 overflow-y-auto py-1">{editor}</div>
        <div className="shrink-0 px-2 pb-2">{bossCard}</div>
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
          {mobileTab === "scm" && sourceControl}
          {mobileTab === "term" && <div className="h-full bg-[var(--term)]">{terminal}</div>}
          {mobileTab === "graph" && (
            <div className="space-y-4 p-3">
              <AreasView repo={repo} />
              <TreeView repo={repo} />
            </div>
          )}
        </div>
      </div>

      <StatusBar repo={repo} step={step} ahead={ahead} onCreateBranch={createBranch} />

      {zukanOpen && <ZukanModal zukan={zukan} onClose={() => setZukanOpen(false)} />}

      {finished && (
        <FinishScreen
          accidents={accidents}
          finalWord={finalWord}
          zukanCount={zukan.length}
          onRestart={restart}
          onOpenZukan={() => setZukanOpen(true)}
        />
      )}
    </div>
  );
}
