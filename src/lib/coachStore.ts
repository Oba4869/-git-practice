// 試合の記録（PlayLog）の保存。ブラウザのlocalStorageに、直近の数試合だけ残す。
import type { PlayLog, StepLog } from "./coach";

const PLAYLOG_KEY = "play-logs-v1";
const MAX_LOGS = 10;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// 壊れたデータ・古い形のデータを読んでも落ちないよう、形を確かめる
function isStepLog(v: unknown): v is StepLog {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<StepLog>;
  return typeof s.stepId === "string" && isNum(s.errors) && isNum(s.hints);
}

function isPlayLog(v: unknown): v is PlayLog {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<PlayLog>;
  return isNum(p.playedAt) && Array.isArray(p.steps) && p.steps.every(isStepLog);
}

export function loadPlayLogs(): PlayLog[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAYLOG_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(isPlayLog) : [];
  } catch {
    return [];
  }
}

// 終わった試合の記録に今の時刻を付けて追記し、保存したあとの全記録を返す（保存できなくても返す）
export function appendPlayLog(log: PlayLog): PlayLog[] {
  const logs = [...loadPlayLogs(), { ...log, playedAt: Date.now() }].slice(-MAX_LOGS);
  try {
    localStorage.setItem(PLAYLOG_KEY, JSON.stringify(logs));
  } catch {
    /* 保存できない環境では何もしない */
  }
  return logs;
}
