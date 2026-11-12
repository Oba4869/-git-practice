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

type Msg =
  | { id: number; from: "boss"; text: string; tone?: "warn" | "ai" }
  | { id: number; from: "you"; text: string }
  | { id: number; from: "cmd"; text: string; ok: boolean };

type Sheet = null | "edit" | "commit" | "revert" | "resolve";

const TITLES = ["チーム開発アプリ", "はじめてのハッカソン", "🚀 チーム開発アプリ", "🚀 はじめてのハッカソン"];

const ACTIONS: { key: ActionKey; label: string; cmd: string; from: number; only?: number[] }[] = [
  { key: "branch", label: "自分用のコピーを作る", cmd: "git switch -c", from: 0 },
  { key: "edit", label: "ファイルを編集", cmd: "エディタ", from: 0 },
  { key: "debug", label: "デバッグ行を足す", cmd: "エディタ", from: 8, only: [8] },
  { key: "add", label: "ステージに乗せる", cmd: "git add", from: 1 },
  { key: "commit", label: "記録する", cmd: "git commit", from: 1 },
  { key: "push", label: "GitHubに送る", cmd: "git push", from: 1 },
  { key: "pr", label: "PRを出す", cmd: "GitHub", from: 5 },
  { key: "pull", label: "mainの最新を取り込む", cmd: "git pull origin main", from: 7 },
  { key: "revert", label: "取り消す", cmd: "git revert", from: 9 },
  { key: "merge", label: "PRをマージ", cmd: "GitHub", from: 10 },
];

const ZUKAN_KEY = "jiko-zukan-v1";

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

export default function Game() {
  const [repo, setRepo] = useState<G.Repo>(() => G.initRepo());
  const [step, setStep] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showHint, setShowHint] = useState(false);
  const [showViz, setShowViz] = useState(false);
  const [accidents, setAccidents] = useState<AccidentId[]>([]);
  const [finished, setFinished] = useState(false);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [finalWord, setFinalWord] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const queueEnd = useRef(0);
  const started = useRef(false);

  const say = (text: string, tone?: "warn" | "ai") =>
    setMsgs((m) => [...m, { id: nextId++, from: "boss", text, tone }]);

  // セリフは1本の列に並べて、順番が入れ替わらないようにする
  const sayLater = (lines: string[], startDelay = 300) => {
    let at = Math.max(Date.now() + startDelay, queueEnd.current);
    for (const line of lines) {
      const t = window.setTimeout(() => say(line), at - Date.now());
      timers.current.push(t);
      at += 650;
    }
    queueEnd.current = at;
  };

  // 最初のセリフ
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    sayLater(STEPS[0].intro, 200);
    const t = timers.current;
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, thinking]);

  const addAccident = (id: AccidentId) => {
    setAccidents((a) => (a.includes(id) ? a : [...a, id]));
    const z = loadZukan();
    if (!z.includes(id)) saveZukan([...z, id]);
  };

  // 操作結果を反映して、シナリオを進める
  const apply = (res: G.Result) => {
    setMsgs((m) => [...m, { id: nextId++, from: "cmd", text: res.command, ok: res.ok }]);
    setShowHint(false);
    if (!res.ok) {
      say(res.error, "warn");
      return;
    }
    let r = res.repo;
    if (res.note === "CONFLICT") {
      say("出た、コンフリクト！ 同じ行を2人で書き換えたから、Gitがどっちを残すか決められなかったんだ。");
      say("ファイルに <<<<<<< と >>>>>>> の印が入ってる。間にあるのがぶつかった2つの変更。どっちを残すか選んでみて。");
      setSheet("resolve");
    } else if (res.note) {
      say(res.note);
    }

    let i = step;
    while (i < STEPS.length && STEPS[i].done(r)) {
      i++;
      if (i < STEPS.length) {
        const s = STEPS[i];
        if (s.onEnter) r = s.onEnter(r);
        if (s.accident) addAccident(s.accident);
      }
    }
    // 一気に複数ステップ進んだときは、着いたステップのセリフだけ言う
    const intros = i < STEPS.length ? STEPS[i].intro : [];
    setRepo(r);
    if (i !== step) {
      setStep(i);
      if (i >= STEPS.length) {
        sayLater([
          "マージ完了！ おつかれさま！！",
          "Issueを受けて、ブランチ、commit、push、PR、レビュー対応、コンフリクト、取り消し、マージ。チーム開発を1周できたよ。",
        ]);
        window.setTimeout(() => setFinished(true), 1900);
        fetchFinalWord(r);
      } else {
        sayLater(intros, 500);
      }
    }
  };

  const onAction = (key: ActionKey) => {
    switch (key) {
      case "branch":
        return apply(G.switchCreate(repo, BRANCH_NAME));
      case "edit":
        return setSheet("edit");
      case "debug":
        return apply(G.addDebugLine(repo));
      case "add":
        return apply(G.add(repo));
      case "commit": {
        const s = STEPS[step]?.id;
        setCommitMsg(
          s === "review"
            ? "タイトルに🚀を追加"
            : s === "conflict"
              ? "mainの変更を取り込んでコンフリクトを解決"
              : s === "oops"
                ? "デバッグ用の行を追加"
                : "ヘッダーのタイトルを変更",
        );
        return setSheet("commit");
      }
      case "push":
        return apply(repo.current === "main" ? G.pushMainDirect() : G.push(repo));
      case "pr":
        return apply(G.openPR(repo));
      case "pull":
        return apply(G.pullMain(repo));
      case "resolve":
        return setSheet("resolve");
      case "revert":
        return setSheet("revert");
      case "merge":
        return apply(G.mergePR(repo));
    }
  };

  const onEdit = (title: string) => {
    setSheet(null);
    const res = G.edit(repo, title);
    if (res.ok && repo.current === "main" && step === 0) {
      apply(res);
      addAccident("main-direct");
      say("あ、ちょっと待って！ 今いるのはmain（みんなの共有スペース）だよ。", "warn");
      say("でも大丈夫。このまま「自分用のコピーを作る」を押せば、今の変更ごと新しいブランチに持っていけるから。");
      return;
    }
    apply(res);
  };

  const context = () =>
    `ステップ: ${STEPS[step]?.label ?? "終了"}\n次の一手: ${STEPS[step]?.hintText(repo) ?? "なし"}\n${G.summarize(repo)}`;

  const ask = async () => {
    const q = question.trim();
    if (!q || thinking) return;
    setQuestion("");
    setMsgs((m) => [...m, { id: nextId++, from: "you", text: q }]);
    setThinking(true);
    const history = [...msgs, { id: 0, from: "you" as const, text: q }]
      .filter((m) => m.from !== "cmd")
      .slice(-8)
      .map((m) => ({ role: m.from === "you" ? ("user" as const) : ("assistant" as const), content: m.text }));
    try {
      const res = await fetch("/api/boss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context: context() }),
      });
      const data = await res.json();
      say(data.reply, "ai");
    } catch {
      say("ごめん、うまく聞き取れなかった。もう一回送ってくれる？", "warn");
    } finally {
      setThinking(false);
    }
  };

  const fetchFinalWord = async (r: G.Repo) => {
    try {
      const res = await fetch("/api/boss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "練習試合が終わりました。今日の練習を振り返って、次の本番ハッカソンに向けた一言をください（2文以内）。",
            },
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
    timers.current.forEach(clearTimeout);
    timers.current = [];
    queueEnd.current = 0;
    setRepo(G.initRepo());
    setStep(0);
    setMsgs([]);
    setSheet(null);
    setAccidents([]);
    setFinished(false);
    setFinalWord(null);
    setShowHint(false);
    sayLater(STEPS[0].intro, 200);
  };

  const current = STEPS[step];
  const hintKey: ActionKey | null = current
    ? repo.conflict
      ? "resolve"
      : current.hint(repo)
    : null;
  const visible = ACTIONS.filter((a) => step >= a.from && (!a.only || a.only.includes(step)));
  const myCommits = repo.order
    .map((id) => repo.commits[id])
    .filter((c) => c.author === "you" && !c.revertOf && c.parents.length === 1 && G.isAncestor(repo, c.id, repo.branches[repo.current]))
    .reverse();

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--ink)]">
      {/* ヘッダー */}
      <header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--card)] px-4 py-2">
        <div className="min-w-0">
          <p className="text-[11px] text-[var(--muted)] leading-none">チーム開発の練習試合（仮）</p>
          <p className="truncate text-sm font-bold">
            {current ? `${step + 1}/${STEPS.length}　${current.label}` : "試合終了"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowViz((v) => !v)}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs md:hidden"
          >
            {showViz ? "チャット" : "図を見る"}
          </button>
          <button onClick={restart} className="rounded-full border border-[var(--line)] px-3 py-1 text-xs">
            やり直す
          </button>
        </div>
      </header>
      <div className="h-1 bg-[var(--line)]">
        <div
          className="h-1 bg-[var(--you)] transition-all duration-500"
          style={{ width: `${(Math.min(step, STEPS.length) / STEPS.length) * 100}%` }}
        />
      </div>

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] md:grid-rows-1 md:grid-cols-[minmax(0,1fr)_300px_minmax(0,420px)]">
        {/* チャット */}
        <section className={`flex min-h-0 flex-col ${showViz ? "hidden md:flex" : "flex"}`}>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
            {msgs.map((m) =>
              m.from === "cmd" ? (
                <div key={m.id} className="flex justify-end">
                  <code
                    className={`rounded-md px-2 py-1 font-mono text-[11px] ${
                      m.ok ? "bg-[var(--term)] text-[var(--term-ink)]" : "bg-[var(--term)] text-[var(--boss)] line-through decoration-1"
                    }`}
                  >
                    $ {m.text}
                  </code>
                </div>
              ) : m.from === "you" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--you)] px-3 py-2 text-sm text-white">{m.text}</p>
                </div>
              ) : (
                <div key={m.id} className="flex items-end gap-2">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--boss-soft)] text-sm font-bold text-[var(--boss)]">
                    ひ
                  </div>
                  <p
                    className={`max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed ${
                      m.tone === "warn" ? "bg-[var(--warn-soft)]" : "bg-[var(--card)] border border-[var(--line)]"
                    }`}
                  >
                    {m.text}
                    {m.tone === "ai" && <span className="ml-1 text-[10px] text-[var(--muted)]">AI</span>}
                  </p>
                </div>
              ),
            )}
            {thinking && <p className="pl-10 text-xs text-[var(--muted)]">{BOSS_NAME}が考え中…</p>}
            <div ref={chatEnd} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
            className="flex gap-2 border-t border-[var(--line)] bg-[var(--card)] px-3 py-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`${BOSS_NAME}に質問する（例：pushって何？）`}
              className="min-w-0 flex-1 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--you)]"
            />
            <button disabled={thinking} className="rounded-full bg-[var(--ink)] px-4 text-sm text-[var(--card)] disabled:opacity-40">
              送る
            </button>
          </form>
        </section>

        {/* 図（スマホでは切り替え） */}
        <section
          className={`min-h-0 overflow-y-auto border-[var(--line)] p-4 md:order-last md:block md:border-l ${
            showViz ? "block" : "hidden"
          }`}
        >
          <h2 className="mb-2 text-xs font-bold text-[var(--muted)]">ファイルの今いる場所</h2>
          <AreasView repo={repo} />
          <h2 className="mb-2 mt-5 text-xs font-bold text-[var(--muted)]">コミットの履歴</h2>
          <TreeView repo={repo} />
          <h2 className="mb-2 mt-5 text-xs font-bold text-[var(--muted)]">{repo.fileName}</h2>
          <pre className="overflow-x-auto rounded-lg bg-[var(--term)] p-3 font-mono text-[11px] leading-relaxed text-[var(--term-ink)]">
            {repo.working.join("\n")}
          </pre>
        </section>

        {/* 操作 */}
        <section className="border-t border-[var(--line)] bg-[var(--card)] p-3 md:border-l md:border-t-0">
          {current && (
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={() => setShowHint((v) => !v)}
                className="rounded-full bg-[var(--boss-soft)] px-3 py-1 text-xs font-bold text-[var(--boss)]"
              >
                💡 ヒント
              </button>
              {showHint && <p className="text-xs">{repo.conflict ? "ぶつかった行のどちらを残すか決めよう" : current.hintText(repo)}</p>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 md:grid-cols-2">
            {repo.conflict && (
              <ActionButton
                label="どっちを残すか決める"
                cmd="コンフリクト解決"
                glow
                onClick={() => setSheet("resolve")}
                wide
              />
            )}
            {visible.map((a) => (
              <ActionButton
                key={a.key}
                label={a.label}
                cmd={a.cmd}
                glow={showHint && hintKey === a.key}
                onClick={() => onAction(a.key)}
                disabled={finished}
              />
            ))}
          </div>
        </section>
      </main>

      {/* シート類 */}
      {sheet && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 md:items-center" onClick={() => setSheet(null)}>
          <div
            className="w-full max-w-md rounded-t-2xl bg-[var(--card)] p-5 md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sheet === "edit" && (
              <>
                <h3 className="font-bold">タイトルを何にする？</h3>
                <p className="mb-3 text-xs text-[var(--muted)]">header.html の &lt;h1&gt; を書き換えます</p>
                <div className="grid gap-2">
                  {TITLES.map((t) => (
                    <button
                      key={t}
                      onClick={() => onEdit(t)}
                      className="rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm hover:border-[var(--you)]"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
            {sheet === "commit" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSheet(null);
                  apply(G.commit(repo, commitMsg.trim() || "変更"));
                }}
              >
                <h3 className="font-bold">何をしたか一言で記録しよう</h3>
                <p className="mb-3 text-xs text-[var(--muted)]">コミットメッセージ。あとでチームが履歴を見たときの手がかりになるよ</p>
                <input
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3 text-sm outline-none focus:border-[var(--you)]"
                />
                <button className="mt-3 w-full rounded-xl bg-[var(--you)] py-3 text-sm font-bold text-white">記録する（git commit）</button>
              </form>
            )}
            {sheet === "revert" && (
              <>
                <h3 className="font-bold">どのコミットを取り消す？</h3>
                <p className="mb-3 text-xs text-[var(--muted)]">履歴は消さずに「取り消すコミット」が追加されます</p>
                <div className="grid gap-2">
                  {myCommits.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSheet(null);
                        apply(G.revert(repo, c.id));
                      }}
                      className="rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm hover:border-[var(--you)]"
                    >
                      <span className="mr-2 font-mono text-xs text-[var(--muted)]">{c.id}</span>
                      {c.message}
                    </button>
                  ))}
                  {myCommits.length === 0 && <p className="text-sm">取り消せるコミットがまだないよ。</p>}
                </div>
              </>
            )}
            {sheet === "resolve" && repo.conflict && (
              <>
                <h3 className="font-bold">コンフリクト：どっちを残す？</h3>
                <p className="mb-3 text-xs text-[var(--muted)]">印（&lt;&lt;&lt;&lt;&lt;&lt;&lt; ======= &gt;&gt;&gt;&gt;&gt;&gt;&gt;）は自動で消えます</p>
                <pre className="mb-3 overflow-x-auto rounded-lg bg-[var(--term)] p-3 font-mono text-[11px] leading-relaxed text-[var(--term-ink)]">
                  {repo.working.map((l, i) => (
                    <div
                      key={i}
                      className={
                        l.startsWith("<<<<<<<") || l.startsWith("=======") || l.startsWith(">>>>>>>")
                          ? "text-[var(--boss)]"
                          : ""
                      }
                    >
                      {l}
                    </div>
                  ))}
                </pre>
                <div className="grid gap-2">
                  {(
                    [
                      ["ours", "自分の変更を残す", G.titleOf(repo.conflict.ours)],
                      ["theirs", `${BOSS_NAME}の変更を残す`, G.titleOf(repo.conflict.theirs)],
                      ["both", "両方残す", "2行とも残す"],
                    ] as const
                  ).map(([key, label, sub]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setSheet(null);
                        apply(G.resolve(repo, key));
                        say("いいね！ 印が消えて、そのままステージにも乗ったよ。あとはcommitしてpushすれば解決！");
                      }}
                      className="rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm hover:border-[var(--you)]"
                    >
                      <span className="font-bold">{label}</span>
                      <span className="ml-2 text-xs text-[var(--muted)]">{sub}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
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
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--boss-soft)] text-sm font-bold text-[var(--boss)]">ひ</div>
                <p className="rounded-2xl rounded-tl-sm border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm">{finalWord}</p>
              </div>
            )}
            <h3 className="mt-6 text-sm font-bold">今回の事故（事故図鑑に追加）</h3>
            <div className="mt-2 grid gap-3">
              {accidents.map((id) => (
                <div key={id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
                  <p className="font-bold">✅ {ACCIDENTS[id].title}</p>
                  <p className="mt-1 text-sm">{ACCIDENTS[id].lesson}</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">本番のVS Codeなら：{ACCIDENTS[id].vscode}</p>
                </div>
              ))}
            </div>
            <button onClick={restart} className="mt-6 w-full rounded-xl bg-[var(--you)] py-3 font-bold text-white">
              もう一回練習する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  cmd,
  onClick,
  glow,
  disabled,
  wide,
}: {
  label: string;
  cmd: string;
  onClick: () => void;
  glow?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-2 py-2 text-left transition active:scale-[0.97] disabled:opacity-40 ${
        wide ? "col-span-3 md:col-span-2" : ""
      } ${glow ? "border-[var(--boss)] bg-[var(--boss-soft)] ring-2 ring-[var(--boss)]/40 shadow-md" : "border-[var(--line)] bg-[var(--bg)]"}`}
    >
      <span className="block text-[13px] font-bold leading-tight">{label}</span>
      <span className="block font-mono text-[10px] text-[var(--muted)]">{cmd}</span>
    </button>
  );
}
