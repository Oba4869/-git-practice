// 画面の部品どうしで共有する型。
import type { ActionKey } from "@/lib/scenario";

export type TermLine = { id: number; cmd: string; out: string; ok: boolean };
export type MobileTab = "scm" | "term" | "graph";
export type Tone = "normal" | "warn" | "ai";
export type BossState = { lines: string[]; tone: Tone };

// 操作の結果を画面に反映する関数（Game.tsx が持っている）
export type Apply = (key: ActionKey, res: import("@/lib/git").Result, extra?: string[]) => void;

// ヒントで光らせるボタンかどうか
export type Glow = (k: ActionKey) => boolean;
