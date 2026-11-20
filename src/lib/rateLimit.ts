// /api/boss の使いすぎを防ぐ、かんたんな回数制限（サーバー側のメモリで数える）。
// route handler は誰でも叩ける公開APIなので、無料枠（月3,000リクエスト）を使い切られないようにする。
// プロセスを再起動すると数え直しになる。1台のVPSで常駐させる前提（複数台なら共有ストアが必要）。

const IP_LIMIT = Number(process.env.BOSS_IP_LIMIT ?? 20); // 1つのIPが、窓の間に使える回数
const IP_WINDOW_MS = 10 * 60 * 1000; // 10分
const DAILY_LIMIT = Number(process.env.BOSS_DAILY_LIMIT ?? 600); // 全員合わせて、1日に使える回数
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_IPS = 5000; // 数えるIPの上限（メモリが増えすぎないように）

const hits = new Map<string, number[]>(); // IP → 使った時刻の一覧
let day = { startedAt: Date.now(), count: 0 };

export type LimitResult = { ok: true } | { ok: false; reason: "ip" | "daily" };

// 呼び出しを1回数えて、使ってよいかを返す。使ってよいときだけ数が増える。
export function checkRateLimit(ip: string, now = Date.now()): LimitResult {
  if (now - day.startedAt >= DAY_MS) day = { startedAt: now, count: 0 };
  if (day.count >= DAILY_LIMIT) return { ok: false, reason: "daily" };

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (recent.length >= IP_LIMIT) {
    hits.set(ip, recent);
    return { ok: false, reason: "ip" };
  }

  // 古いIPを掃除してから記録する
  if (!hits.has(ip) && hits.size >= MAX_TRACKED_IPS) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= IP_WINDOW_MS)) hits.delete(key);
    }
    if (hits.size >= MAX_TRACKED_IPS) return { ok: false, reason: "daily" }; // 掃除しても満杯なら、安全側に倒す
  }
  recent.push(now);
  hits.set(ip, recent);
  day.count += 1;
  return { ok: true };
}

// リクエストからIPを取り出す。
// nginx は X-Forwarded-For の右端に「実際に接続してきたIP」を足すので、右端を使う
// （左側はクライアントが好きに書けるので信用しない）。ヘッダーがなければ（開発中など）固定の名前にする。
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").at(-1)?.trim();
    if (last) return last;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}
