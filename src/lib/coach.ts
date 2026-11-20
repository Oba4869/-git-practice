// 苦手を狙うコーチ機能のロジック。
// 試合の記録から「苦手なステップ」を判定し、次に練習する事故を選ぶ。
// 判定は必ずここ（コード）で行い、LLMには任せない。副作用のない純粋関数だけで作る。

import { STEPS, type AccidentId, type ActionKey } from "./scenario";

// ---- 記録の型 ----

// 1ステップ分の記録
export type StepLog = {
  stepId: string; // STEPS の id（"push" など）
  errors: number; // エラー結果になった回数（ミス）
  hints: number; // ヒントを見た回数
  errorActions?: Partial<Record<ActionKey, number>>; // どの操作でミスしたか（任意）
};

// 1試合分の記録
export type PlayLog = {
  playedAt: number; // 試合を終えた時刻（Date.now()）
  steps: StepLog[];
};

// ---- 記録を作る・足すためのヘルパー（画面側から呼ぶ想定。元のデータは書き換えない） ----

export function newPlayLog(playedAt: number): PlayLog {
  return { playedAt, steps: [] };
}

function updateStep(
  log: PlayLog,
  stepId: string,
  update: (s: StepLog) => StepLog,
): PlayLog {
  const current = log.steps.find((s) => s.stepId === stepId) ?? {
    stepId,
    errors: 0,
    hints: 0,
  };
  const next = update(current);
  const exists = log.steps.some((s) => s.stepId === stepId);
  return {
    ...log,
    steps: exists
      ? log.steps.map((s) => (s.stepId === stepId ? next : s))
      : [...log.steps, next],
  };
}

// ミス（エラー結果）を1回足す。action が分かれば操作別にも数える
export function addMistake(log: PlayLog, stepId: string, action?: ActionKey): PlayLog {
  return updateStep(log, stepId, (s) => ({
    ...s,
    errors: s.errors + 1,
    errorActions: action
      ? { ...s.errorActions, [action]: (s.errorActions?.[action] ?? 0) + 1 }
      : s.errorActions,
  }));
}

// ヒントを見た回数を1回足す
export function addHintView(log: PlayLog, stepId: string): PlayLog {
  return updateStep(log, stepId, (s) => ({ ...s, hints: s.hints + 1 }));
}

// ---- 苦手の判定 ----

export type WeakSpot = {
  stepId: string;
  label: string; // 進捗バーの表示名（「push」「コンフリクト」など）
  score: number; // 大きいほど苦手
  errors: number; // 直近の試合も含めた合計ミス回数（重みなし）
  hints: number; // 合計ヒント回数（重みなし）
  worstAction?: ActionKey; // いちばんミスした操作（記録があれば）
  accident: AccidentId; // このステップの練習におすすめの事故
};

// ミス1回・ヒント1回の重み。ミスの方が「分かっていない」度合いが強い
const ERROR_WEIGHT = 2;
const HINT_WEIGHT = 1;
// 古い試合ほど軽く見る（直前の試合を1として、1試合前ごとにこの倍率をかける）
const RECENCY_DECAY = 0.7;
// この点数以上を「苦手」とみなす（ミス1回だけ＝2点なら苦手扱い、ヒント1回だけは見逃す）
export const WEAK_THRESHOLD = 2;

// ステップ → 練習におすすめの事故。
// 基本操作（編集・add・commit・push・PR）の苦手は、一通りの流れを回せる「review」で練習する
const STEP_TO_ACCIDENT: Record<string, AccidentId> = {
  issue: "main-direct",
  edit: "review",
  add: "review",
  commit: "review",
  push: "review",
  pr: "review",
  review: "review",
  conflict: "conflict",
  oops: "wrong-push",
  revert: "wrong-push",
  merge: "conflict",
};

const FALLBACK_ACCIDENT: AccidentId = "review";

// 利用者に見せる名前。専門用語は「言い換え（正式名）」の順で書く
// （scenario.ts の label は進捗バー用の短い名前なので、そのままは使わない）
const DISPLAY_LABEL: Record<string, string> = {
  issue: "仕事を受けて、ブランチを作る",
  edit: "ファイルの編集",
  add: "ステージに乗せる（add）",
  commit: "記録を確定する（commit）",
  push: "GitHubに送る（push）",
  pr: "確認をお願いする（PR）",
  review: "レビューで頼まれた修正",
  conflict: "ぶつかった場所を直す（コンフリクト）",
  oops: "まちがえてpushしたとき",
  revert: "取り消す（revert）",
  merge: "mainに合流させる（マージ）",
};

const isKnownStep = (stepId: string) => STEPS.some((s) => s.id === stepId);
const stepLabel = (stepId: string) => DISPLAY_LABEL[stepId] ?? STEPS.find((s) => s.id === stepId)?.label ?? stepId;

// 記録から苦手なステップを、苦手な順（点数の高い順）に返す。
// logs は古い順・新しい順どちらでもよい（playedAt で並べ替える）。
export function weakSpots(logs: PlayLog[]): WeakSpot[] {
  // 新しい試合が先頭
  const sorted = [...logs].sort((a, b) => b.playedAt - a.playedAt);
  const stats = new Map<
    string,
    { score: number; errors: number; hints: number; actions: Map<ActionKey, number> }
  >();

  sorted.forEach((log, age) => {
    const weight = RECENCY_DECAY ** age;
    for (const s of log.steps) {
      const st = stats.get(s.stepId) ?? {
        score: 0,
        errors: 0,
        hints: 0,
        actions: new Map<ActionKey, number>(),
      };
      st.score += (s.errors * ERROR_WEIGHT + s.hints * HINT_WEIGHT) * weight;
      st.errors += s.errors;
      st.hints += s.hints;
      for (const [action, n] of Object.entries(s.errorActions ?? {})) {
        st.actions.set(action as ActionKey, (st.actions.get(action as ActionKey) ?? 0) + (n ?? 0));
      }
      stats.set(s.stepId, st);
    }
  });

  const order = (id: string) => {
    const i = STEPS.findIndex((s) => s.id === id);
    return i === -1 ? STEPS.length : i;
  };

  return [...stats.entries()]
    // 今のシナリオにないステップ（古い記録）は無視する
    .filter(([stepId, st]) => isKnownStep(stepId) && st.score >= WEAK_THRESHOLD)
    .map(([stepId, st]): WeakSpot => {
      const worst = [...st.actions.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        stepId,
        label: stepLabel(stepId),
        score: Math.round(st.score * 100) / 100,
        errors: st.errors,
        hints: st.hints,
        worstAction: worst?.[0],
        accident: STEP_TO_ACCIDENT[stepId] ?? FALLBACK_ACCIDENT,
      };
    })
    // 点数の高い順。同点ならシナリオの順番が早い方を先に
    .sort((a, b) => b.score - a.score || order(a.stepId) - order(b.stepId));
}

// ---- 次の試合で重点的に練習する事故を選ぶ ----

// 事故の候補一覧（scenario.ts の ACCIDENTS と同じ並び）
const ACCIDENT_ORDER: AccidentId[] = ["main-direct", "review", "conflict", "wrong-push"];

// 苦手に合わせて、次の試合で重点的に練習する事故を選ぶ（苦手度の高い順）。
// - count: 選ぶ数（初期値 1）
// - seen: すでに図鑑に載っている事故。苦手が足りないときは、まだ経験していない事故で埋める
// 記録が空なら、未経験の事故 → ACCIDENT_ORDER の順で返す。
export function pickPracticeAccidents(
  logs: PlayLog[],
  options: { count?: number; seen?: AccidentId[] } = {},
): AccidentId[] {
  const count = Math.max(0, options.count ?? 1);
  const seen = new Set(options.seen ?? []);

  // 事故ごとに苦手の点数を合計する
  const total = new Map<AccidentId, number>();
  for (const w of weakSpots(logs)) {
    total.set(w.accident, (total.get(w.accident) ?? 0) + w.score);
  }
  const weak = [...total.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] || ACCIDENT_ORDER.indexOf(a[0]) - ACCIDENT_ORDER.indexOf(b[0]),
    )
    .map(([id]) => id);

  const picked: AccidentId[] = [...weak];
  // 足りなければ、未経験の事故 → 残りの順で補う
  for (const id of ACCIDENT_ORDER.filter((id) => !seen.has(id))) {
    if (!picked.includes(id)) picked.push(id);
  }
  for (const id of ACCIDENT_ORDER) {
    if (!picked.includes(id)) picked.push(id);
  }
  return picked.slice(0, count);
}

// ---- 表示用のひとこと（上司ひらたさんの口調。怒らず、理由を添える） ----

// 苦手のステップを、やさしい日本語で説明する。
// 回数は直近の練習の合計（今回だけではない）なので、「これまでの練習で」と書く。
export function coachComment(spot: WeakSpot): string {
  const detail =
    spot.errors > 0 && spot.hints > 0
      ? `${spot.errors}回つまずいて、ヒントも${spot.hints}回使っていたよ`
      : spot.errors > 0
        ? `${spot.errors}回つまずいていたよ`
        : `ヒントを${spot.hints}回使っていたよ`;
  return `「${spot.label}」は、これまでの練習で${detail}。ここは慣れるまで誰でも迷う場所だから、また練習して、少しずつ慣れていこう。`;
}
