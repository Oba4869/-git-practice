// 事故図鑑の保存（ブラウザのlocalStorage）。
import { ACCIDENTS, type AccidentId } from "./scenario";

const ZUKAN_KEY = "jiko-zukan-v1";

export const ALL_ACCIDENTS = Object.keys(ACCIDENTS) as AccidentId[];

export function loadZukan(): AccidentId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ZUKAN_KEY) ?? "[]");
    // 壊れたデータでも落ちないよう、配列で、今ある事故のIDだけを残す
    return Array.isArray(raw) ? raw.filter((id): id is AccidentId => ALL_ACCIDENTS.includes(id)) : [];
  } catch {
    return [];
  }
}

export function saveZukan(ids: AccidentId[]) {
  try {
    localStorage.setItem(ZUKAN_KEY, JSON.stringify(ids));
  } catch {
    /* 保存できない環境では何もしない */
  }
}
