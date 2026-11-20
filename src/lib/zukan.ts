// 事故図鑑の保存（ブラウザのlocalStorage）。
import { ACCIDENTS, type AccidentId } from "./scenario";

const ZUKAN_KEY = "jiko-zukan-v1";

export const ALL_ACCIDENTS = Object.keys(ACCIDENTS) as AccidentId[];

export function loadZukan(): AccidentId[] {
  try {
    return JSON.parse(localStorage.getItem(ZUKAN_KEY) ?? "[]");
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
