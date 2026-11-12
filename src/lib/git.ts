// 練習用の簡易Gitエンジン。
// 本物のGitの「前提条件」と「エラー」をなるべく再現しつつ、
// 1ファイル（header.html）だけを扱うシンプルなモデルにしている。

export type Lines = string[];

export type Author = "you" | "boss";

export type Commit = {
  id: string;
  message: string;
  parents: string[];
  author: Author;
  lines: Lines; // このコミット時点のファイル内容
  branch: string; // 作られたブランチ（ツリー表示用）
  revertOf?: string;
};

export type Conflict = {
  base: Lines;
  ours: Lines;
  theirs: Lines;
  theirsCommit: string;
  line: number; // ぶつかった行
};

export type Repo = {
  fileName: string;
  working: Lines; // 作業場
  staged: Lines | null; // ステージ（nullなら何も乗っていない）
  commits: Record<string, Commit>;
  order: string[]; // 作られた順
  branches: Record<string, string>; // ローカルのブランチ → コミットID
  current: string; // 今いるブランチ
  remote: Record<string, string>; // GitHub上のブランチ → コミットID
  conflict: Conflict | null;
  mergeHead: string | null; // マージ中の相手コミット
  pr: { open: boolean; merged: boolean; branch: string | null };
  seq: number;
};

export type Result =
  | { ok: true; repo: Repo; command: string; note?: string }
  | { ok: false; command: string; error: string };

export const FILE = "header.html";
const TITLE_LINE = 1;

const INITIAL: Lines = ["<header>", "  <h1>My App</h1>", "</header>"];

const clone = (r: Repo): Repo => structuredClone(r);
const same = (a: Lines | null, b: Lines | null) =>
  JSON.stringify(a) === JSON.stringify(b);

function newCommit(
  r: Repo,
  data: Omit<Commit, "id">,
): { repo: Repo; id: string } {
  const repo = clone(r);
  repo.seq += 1;
  const id = `c${repo.seq}`;
  repo.commits[id] = { ...data, id };
  repo.order.push(id);
  return { repo, id };
}

export function initRepo(): Repo {
  const base: Commit = {
    id: "c0",
    message: "最初のコミット",
    parents: [],
    author: "boss",
    lines: INITIAL,
    branch: "main",
  };
  return {
    fileName: FILE,
    working: [...INITIAL],
    staged: null,
    commits: { c0: base },
    order: ["c0"],
    branches: { main: "c0" },
    current: "main",
    remote: { main: "c0" },
    conflict: null,
    mergeHead: null,
    pr: { open: false, merged: false, branch: null },
    seq: 0,
  };
}

export const head = (r: Repo) => r.commits[r.branches[r.current]];

export function isAncestor(r: Repo, anc: string, desc: string): boolean {
  const stack = [desc];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === anc) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(r.commits[id]?.parents ?? []));
  }
  return false;
}

function mergeBase(r: Repo, a: string, b: string): string {
  const ancestorsOfA = new Set<string>();
  const stack = [a];
  while (stack.length) {
    const id = stack.pop()!;
    if (ancestorsOfA.has(id)) continue;
    ancestorsOfA.add(id);
    stack.push(...r.commits[id].parents);
  }
  // bから幅優先で、最初に見つかった共通の祖先
  const queue = [b];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (ancestorsOfA.has(id)) return id;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...r.commits[id].parents);
  }
  return "c0";
}

// 行ごとの3方向マージ（行数が同じ前提の簡易版。違う場合は丸ごと比較）
function threeWay(
  base: Lines,
  ours: Lines,
  theirs: Lines,
): { lines: Lines } | { conflictLine: number } {
  if (same(ours, theirs)) return { lines: ours };
  if (same(base, ours)) return { lines: theirs };
  if (same(base, theirs)) return { lines: ours };
  const len = Math.max(base.length, ours.length, theirs.length);
  const out: Lines = [];
  for (let i = 0; i < len; i++) {
    const b = base[i],
      o = ours[i],
      t = theirs[i];
    if (o === t) out.push(o);
    else if (b === o) out.push(t);
    else if (b === t) out.push(o);
    else return { conflictLine: i };
  }
  return { lines: out.filter((l) => l !== undefined) };
}

// ---- ユーザーが行う操作 ----

export function switchCreate(r: Repo, name: string): Result {
  const command = `git switch -c ${name}`;
  if (r.conflict)
    return { ok: false, command, error: "コンフリクトを解決してからにしよう。" };
  if (r.branches[name])
    return { ok: false, command, error: `「${name}」というブランチはもうあるよ。` };
  const repo = clone(r);
  repo.branches[name] = repo.branches[repo.current];
  repo.current = name;
  return {
    ok: true,
    repo,
    command,
    note: "作業中の変更は、そのまま新しいブランチに持っていけるよ。",
  };
}

export function edit(r: Repo, newTitle: string): Result {
  const command = `（エディタで ${r.fileName} を編集）`;
  if (r.conflict)
    return {
      ok: false,
      command,
      error: "今はコンフリクト中。先に「どっちを残すか」を決めよう。",
    };
  const repo = clone(r);
  repo.working[TITLE_LINE] = `  <h1>${newTitle}</h1>`;
  return { ok: true, repo, command };
}

export function addDebugLine(r: Repo): Result {
  const repo = clone(r);
  repo.working = [...repo.working, "<!-- debug: あとで消す -->"];
  return { ok: true, repo, command: `（エディタで ${r.fileName} にデバッグ用の行を追加）` };
}

export function add(r: Repo): Result {
  const command = `git add ${r.fileName}`;
  const base = r.staged ?? head(r).lines;
  if (same(r.working, base) && !r.conflict && !(r.mergeHead && r.staged === null))
    return {
      ok: false,
      command,
      error: "ステージに乗せる変更がないよ。先にファイルを編集しよう。",
    };
  if (r.conflict)
    return {
      ok: false,
      command,
      error: "まだ <<<<<<< の印が残ってる。どっちを残すか決めてからaddしよう。",
    };
  const repo = clone(r);
  repo.staged = [...repo.working];
  return { ok: true, repo, command };
}

export function commit(r: Repo, message: string): Result {
  const command = `git commit -m "${message}"`;
  if (r.conflict)
    return { ok: false, command, error: "コンフリクトを解決してからcommitしよう。" };
  if (r.staged === null)
    return {
      ok: false,
      command,
      error: "ステージに何も乗っていないよ。commitの前に git add が必要。",
    };
  const h = head(r);
  if (same(r.staged, h.lines) && !r.mergeHead)
    return { ok: false, command, error: "前回のcommitから何も変わっていないよ。" };
  const parents = r.mergeHead ? [h.id, r.mergeHead] : [h.id];
  const { repo, id } = newCommit(r, {
    message,
    parents,
    author: "you",
    lines: [...r.staged],
    branch: r.current,
  });
  repo.branches[repo.current] = id;
  repo.staged = null;
  repo.mergeHead = null;
  return { ok: true, repo, command };
}

export function push(r: Repo): Result {
  const command = `git push origin ${r.current}`;
  if (r.conflict)
    return { ok: false, command, error: "コンフリクト中はpushできないよ。" };
  const local = r.branches[r.current];
  const remote = r.remote[r.current];
  if (remote === local)
    return { ok: false, command, error: "GitHubはもう最新。送るものがないよ。" };
  if (remote && !isAncestor(r, remote, local))
    return {
      ok: false,
      command,
      error:
        "GitHubの方が進んでいて送れない（rejected）。先に git pull で取り込もう。",
    };
  const repo = clone(r);
  repo.remote[repo.current] = local;
  return { ok: true, repo, command };
}

export function pushMainDirect(): Result {
  // mainに直接pushしようとしたときの「守ってくれる」動き
  return {
    ok: false,
    command: "git push origin main",
    error:
      "mainはみんなの共有スペース。直接pushせず、自分用のブランチからPRを出そう。",
  };
}

export function openPR(r: Repo): Result {
  const command = `（GitHubで ${r.current} → main のPRを作成）`;
  if (r.current === "main")
    return {
      ok: false,
      command,
      error: "mainからmainへのPRは作れないよ。まず自分用のブランチを作ろう。",
    };
  if (!r.remote[r.current])
    return {
      ok: false,
      command,
      error: "PRを出す前に、ブランチをGitHubに送ろう（git push）。",
    };
  if (r.pr.open)
    return { ok: false, command, error: "PRはもう出ているよ。" };
  const repo = clone(r);
  repo.pr = { open: true, merged: false, branch: repo.current };
  return { ok: true, repo, command };
}

export function pullMain(r: Repo): Result {
  const command = "git pull origin main";
  if (r.conflict)
    return { ok: false, command, error: "今はコンフリクトの解決中だよ。" };
  if (r.staged !== null || !same(r.working, head(r).lines))
    return {
      ok: false,
      command,
      error: "まだcommitしていない変更があるよ。先にcommitしておこう。",
    };
  const theirsId = r.remote.main;
  const oursId = r.branches[r.current];
  if (isAncestor(r, theirsId, oursId))
    return { ok: false, command, error: "mainの最新はもう取り込み済み（Already up to date）。" };
  const repo = clone(r);
  if (isAncestor(r, oursId, theirsId)) {
    repo.branches[repo.current] = theirsId;
    repo.working = [...r.commits[theirsId].lines];
    return { ok: true, repo, command, note: "fast-forward で追いついたよ。" };
  }
  const baseId = mergeBase(r, oursId, theirsId);
  const base = r.commits[baseId].lines;
  const ours = r.commits[oursId].lines;
  const theirs = r.commits[theirsId].lines;
  const merged = threeWay(base, ours, theirs);
  if ("conflictLine" in merged) {
    repo.conflict = {
      base,
      ours,
      theirs,
      theirsCommit: theirsId,
      line: merged.conflictLine,
    };
    repo.mergeHead = theirsId;
    repo.working = conflictMarkers(ours, theirs, merged.conflictLine);
    return { ok: true, repo, command, note: "CONFLICT" };
  }
  const { repo: r2, id } = newCommit(repo, {
    message: "Merge branch 'main'",
    parents: [oursId, theirsId],
    author: "you",
    lines: merged.lines,
    branch: repo.current,
  });
  r2.branches[r2.current] = id;
  r2.working = [...merged.lines];
  return { ok: true, repo: r2, command };
}

export function conflictMarkers(ours: Lines, theirs: Lines, line: number): Lines {
  const out: Lines = [];
  for (let i = 0; i < Math.max(ours.length, theirs.length); i++) {
    if (i === line) {
      out.push("<<<<<<< HEAD（自分の変更）");
      out.push(ours[i]);
      out.push("=======");
      out.push(theirs[i]);
      out.push(">>>>>>> main（相手の変更）");
    } else out.push(ours[i] ?? theirs[i]);
  }
  return out;
}

export type Resolution = "ours" | "theirs" | "both";

export function resolve(r: Repo, choice: Resolution): Result {
  const command = "（エディタで印を消して、残す方を決める）";
  if (!r.conflict) return { ok: false, command, error: "今はコンフリクトしていないよ。" };
  const { ours, theirs, line } = r.conflict;
  const lines = [...ours];
  if (choice === "theirs") lines[line] = theirs[line];
  if (choice === "both") lines.splice(line, 1, ours[line], theirs[line]);
  const repo = clone(r);
  repo.working = lines;
  repo.conflict = null; // 印は消えた。あとは git add で「解決済み」と伝える
  return { ok: true, repo, command };
}

export function revert(r: Repo, commitId: string): Result {
  const target = r.commits[commitId];
  const command = `git revert ${commitId}`;
  if (!target) return { ok: false, command, error: "そのコミットは見つからないよ。" };
  if (r.staged !== null || !same(r.working, head(r).lines))
    return { ok: false, command, error: "commitしていない変更があるよ。先にcommitしよう。" };
  if (!isAncestor(r, commitId, r.branches[r.current]))
    return { ok: false, command, error: "今のブランチにないコミットは取り消せないよ。" };
  const parent = r.commits[target.parents[0]];
  const { repo, id } = newCommit(r, {
    message: `Revert "${target.message}"`,
    parents: [head(r).id],
    author: "you",
    lines: [...parent.lines],
    branch: r.current,
    revertOf: commitId,
  });
  repo.branches[repo.current] = id;
  repo.working = [...parent.lines];
  return {
    ok: true,
    repo,
    command,
    note: "履歴を消さずに「取り消すコミット」を足すのがrevert。だからpush済みでも安全。",
  };
}

export function mergePR(r: Repo): Result {
  const command = "（GitHubで Merge pull request を押す）";
  if (!r.pr.open || !r.pr.branch)
    return { ok: false, command, error: "まだPRが出ていないよ。" };
  const branchHead = r.remote[r.pr.branch];
  if (!isAncestor(r, r.remote.main, branchHead))
    return {
      ok: false,
      command,
      error: "このPRはmainとぶつかっていてマージできない。mainの最新を取り込もう。",
    };
  const repo = clone(r);
  repo.remote.main = branchHead;
  repo.pr = { ...repo.pr, open: false, merged: true };
  return { ok: true, repo, command };
}

// ---- 上司（シナリオ）が行う操作 ----

export function bossCommitOnMain(r: Repo, title: string, message: string): Repo {
  const base = r.commits[r.remote.main];
  const lines = [...base.lines];
  lines[TITLE_LINE] = `  <h1>${title}</h1>`;
  const { repo, id } = newCommit(r, {
    message,
    parents: [base.id],
    author: "boss",
    lines,
    branch: "main",
  });
  repo.remote.main = id;
  return repo;
}

// ---- 表示用のヘルパー ----

export const titleOf = (lines: Lines) =>
  (lines[TITLE_LINE] ?? "").replace(/<\/?h1>/g, "").trim();

export const hasDebug = (lines: Lines) => lines.some((l) => l.includes("debug"));

export function summarize(r: Repo): string {
  const h = head(r);
  return [
    `今いるブランチ: ${r.current}`,
    `作業場: ${r.working.join(" / ")}`,
    `ステージ: ${r.staged ? "変更あり" : "空"}`,
    `最新コミット: ${h.message}`,
    `GitHub: ${Object.entries(r.remote)
      .map(([b, c]) => `${b}=${r.commits[c].message}`)
      .join(", ")}`,
    `PR: ${r.pr.merged ? "マージ済み" : r.pr.open ? "オープン" : "なし"}`,
    `コンフリクト: ${r.conflict ? "発生中" : "なし"}`,
  ].join("\n");
}
