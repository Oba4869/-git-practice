// 1試合分のシナリオ。
// 事故は決め打ちで起こし（デモで崩れないように）、進行は「操作」ではなく「状態」で判定する。
// こうすると、どんな順番で操作しても破綻しにくい。

import {
  type Repo,
  bossCommitOnMain,
  hasDebug,
  head,
  isAncestor,
  titleOf,
} from "./git";

export const BOSS_NAME = "ひらたさん";
export const BRANCH_NAME = "feature/header";

export type ActionKey =
  | "branch"
  | "edit"
  | "debug"
  | "add"
  | "commit"
  | "push"
  | "pr"
  | "pull"
  | "resolve"
  | "revert"
  | "merge";

export type AccidentId = "main-direct" | "review" | "conflict" | "wrong-push";

export const ACCIDENTS: Record<
  AccidentId,
  { title: string; lesson: string; vscode: string }
> = {
  "main-direct": {
    title: "mainで直接作業しかけた事故",
    lesson:
      "作業は自分用のブランチで。変更したあとでも git switch -c で変更ごと移せる。",
    vscode: "左下のブランチ名をクリック →「新しいブランチを作成」",
  },
  review: {
    title: "レビューで修正をお願いされた",
    lesson:
      "修正はPRを作り直さなくていい。同じブランチにcommitしてpushすれば、PRに自動で追加される。",
    vscode: "ソース管理タブで変更を確認 → ✓ でcommit →「変更の同期」",
  },
  conflict: {
    title: "同じ行を2人で書き換えてコンフリクト",
    lesson:
      "<<<<<<< と >>>>>>> の間がぶつかった場所。どちらを残すか決めて印を消し、add → commit。",
    vscode: "ぶつかった箇所の上に出る「現在の変更を取り込む／入力側の変更を取り込む」を押す",
  },
  "wrong-push": {
    title: "まちがえてpushしちゃった事故",
    lesson:
      "push済みのものは git revert で「取り消すコミット」を足す。履歴を消さないのでチームに迷惑がかからない。",
    vscode: "タイムラインやGitLensで該当コミットを右クリック →「Revert Commit」",
  },
};

export type Step = {
  id: string;
  label: string; // 進捗バーの表示名
  intro: string[]; // このステップに入ったときの上司のセリフ
  onEnter?: (r: Repo) => Repo; // 上司が起こすできごと
  accident?: AccidentId;
  done: (r: Repo) => boolean;
  hint: (r: Repo) => ActionKey;
  hintText: (r: Repo) => string;
};

const titleHas = (r: Repo, ref: string | undefined, s: string) =>
  !!ref && titleOf(r.commits[ref].lines).includes(s);

const pushed = (r: Repo) => r.remote[r.current] === r.branches[r.current];
const dirty = (r: Repo) =>
  JSON.stringify(r.working) !== JSON.stringify(head(r).lines);

// 編集→add→commit→push のどこまで来ているかで次の一手を返す
function nextInCycle(r: Repo, needsEdit: boolean, editKey: ActionKey): ActionKey {
  if (needsEdit) return editKey;
  if (r.staged === null && dirty(r)) return "add";
  if (r.staged !== null) return "commit";
  return "push";
}

const CYCLE_TEXT: Record<string, string> = {
  edit: "まずファイルを編集してみよう",
  debug: "デバッグ用の行を足してみよう",
  add: "変更をステージに乗せよう（git add）",
  commit: "ステージの内容を記録しよう（git commit）",
  push: "記録をGitHubに送ろう（git push）",
};

export const STEPS: Step[] = [
  {
    id: "issue",
    label: "仕事を受ける",
    intro: [
      "やあ、今日からよろしく！ 僕がチームリーダーの" + BOSS_NAME + "。",
      "さっそく最初の仕事。Issue #1「ヘッダーのタイトルを新しくする」をお願いしたいんだ。",
      "作業はみんなの共有スペース（main）じゃなくて、自分用のコピー（ブランチ）でやるのがチームのルール。まずはブランチを作ってみて。",
    ],
    done: (r) => r.current !== "main",
    hint: () => "branch",
    hintText: () => "「自分用のコピーを作る」を押してみよう",
  },
  {
    id: "edit",
    label: "編集",
    intro: [
      `いいね、これで ${BRANCH_NAME} で作業できる。ここで何を壊してもmainは無事だよ。`,
      "じゃあ header.html のタイトルを好きなものに変えてみて。",
    ],
    done: (r) => dirty(r) || r.staged !== null || head(r).author === "you",
    hint: () => "edit",
    hintText: () => "「ファイルを編集」でタイトルを変えよう",
  },
  {
    id: "add",
    label: "add",
    intro: [
      "変更できたね。でもこれはまだ「作業場」にあるだけ。",
      "次は記録したい変更を「ステージ」に乗せよう。写真を撮る前に、写したいものを台に並べるイメージ。",
    ],
    done: (r) => r.staged !== null || head(r).author === "you",
    hint: () => "add",
    hintText: () => CYCLE_TEXT.add,
  },
  {
    id: "commit",
    label: "commit",
    intro: [
      "ステージに乗ったね。じゃあシャッターを押そう。commitで、今の状態がPCの履歴に記録される。",
    ],
    done: (r) => head(r).author === "you" && r.staged === null,
    hint: () => "commit",
    hintText: () => CYCLE_TEXT.commit,
  },
  {
    id: "push",
    label: "push",
    intro: [
      "記録できた！ ここまでは全部きみのPCの中（Git）の話。",
      "チームに見せるには、GitHub（ネット上の共有の場所）に送る必要がある。pushしてみよう。",
    ],
    done: (r) => r.current !== "main" && pushed(r),
    hint: () => "push",
    hintText: () => CYCLE_TEXT.push,
  },
  {
    id: "pr",
    label: "PR",
    intro: [
      "GitHubに届いたよ。最後に「mainに入れていいか見てください」とお願いするのがPR（プルリクエスト）。",
    ],
    done: (r) => r.pr.open || r.pr.merged,
    hint: () => "pr",
    hintText: () => "「PRを出す」を押そう",
  },
  {
    id: "review",
    label: "レビュー",
    accident: "review",
    intro: [
      "PRありがとう！ さっそく見たよ。いい感じ！",
      "1つだけお願い。タイトルの先頭に 🚀 を付けてくれる？ チームのアプリはみんなこのマークで揃えてるんだ。",
      "PRは作り直さなくていいよ。同じブランチで直してpushすれば、PRに自動で追加されるから。",
    ],
    done: (r) => titleHas(r, r.remote[r.pr.branch ?? ""], "🚀"),
    hint: (r) => nextInCycle(r, !titleOf(r.working).includes("🚀"), "edit"),
    hintText: (r) =>
      CYCLE_TEXT[nextInCycle(r, !titleOf(r.working).includes("🚀"), "edit")] +
      (titleOf(r.working).includes("🚀") ? "" : "（🚀付きを選ぼう）"),
  },
  {
    id: "conflict",
    label: "コンフリクト",
    accident: "conflict",
    onEnter: (r) =>
      bossCommitOnMain(r, "Team Hackathon App", "タイトルを仮で変更（ひらた）"),
    intro: [
      "修正ありがとう！ …あっ、ごめん！",
      "僕もさっき、mainで同じタイトルの行を「Team Hackathon App」に書き換えてpushしちゃってた。",
      "このままだとPRがぶつかってマージできない。これがコンフリクト。怖くないよ、一緒に直そう。",
      "まずはmainの最新を、きみのブランチに取り込んでみて。",
    ],
    done: (r) =>
      !r.conflict &&
      !!r.pr.branch &&
      !!r.remote[r.pr.branch] &&
      isAncestor(r, r.remote.main, r.remote[r.pr.branch]),
    hint: (r) => {
      if (r.conflict) return "resolve";
      if (r.staged !== null) return "commit";
      if (!isAncestor(r, r.remote.main, r.branches[r.current])) return "pull";
      return "push";
    },
    hintText: (r) => {
      if (r.conflict) return "ぶつかった行のどちらを残すか決めよう";
      if (r.staged !== null) return "解決した結果をcommitしよう";
      if (!isAncestor(r, r.remote.main, r.branches[r.current]))
        return "「mainの最新を取り込む」を押そう";
      return "解決した結果をpushしよう";
    },
  },
  {
    id: "oops",
    label: "うっかり",
    intro: [
      "完璧！ コンフリクトを自分で直せたね。もう本番でも大丈夫。",
      "最後に、もう1つだけ練習。本番でよくある「まちがえてpushしちゃった」をわざと体験しよう。",
      "デバッグ用の行を足して、そのままcommitしてpushしてみて。",
    ],
    done: (r) => !!r.pr.branch && hasDebug(r.commits[r.remote[r.pr.branch]].lines),
    hint: (r) => nextInCycle(r, !hasDebug(r.working), "debug"),
    hintText: (r) => CYCLE_TEXT[nextInCycle(r, !hasDebug(r.working), "debug")],
  },
  {
    id: "revert",
    label: "取り消し",
    accident: "wrong-push",
    intro: [
      "おっと、デバッグ用の行がGitHubに入っちゃったね。",
      "push済みのものは、履歴を消さずに「取り消すコミット」を足して戻すのが安全。それが git revert。",
      "さっきのコミットを取り消して、pushしてみよう。",
    ],
    done: (r) =>
      !!r.pr.branch &&
      !hasDebug(r.commits[r.remote[r.pr.branch]].lines) &&
      Object.values(r.commits).some((c) => c.revertOf),
    hint: (r) =>
      Object.values(r.commits).some((c) => c.revertOf) ? "push" : "revert",
    hintText: (r) =>
      Object.values(r.commits).some((c) => c.revertOf)
        ? "取り消しをpushしよう"
        : "「取り消す（revert）」でデバッグのコミットを選ぼう",
  },
  {
    id: "merge",
    label: "マージ",
    intro: [
      "きれいに戻ったね。履歴もちゃんと残ってる。",
      "じゃあ最後に、PRをマージしてmainに合流させよう！",
    ],
    done: (r) => r.pr.merged,
    hint: () => "merge",
    hintText: () => "「PRをマージ」を押そう",
  },
];
