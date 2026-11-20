// 上司AIに使うモデルを比べるスクリプト。
// 同じ質問を候補モデルに送り、返答と所要時間を並べて表示する。
//
// 使い方:
//   SAKURA_AI_API_KEY=xxxx node scripts/compare-models.mjs
//   （プロジェクト直下の .env.local に SAKURA_AI_API_KEY があれば、それも読む）
//
// 省略可の環境変数:
//   SAKURA_AI_BASE_URL … エンドポイント（初期値は route.ts と同じ）
//   COMPARE_MODELS     … 比べるモデルIDをカンマ区切りで指定（下の候補を上書き）
//   COMPARE_TIMEOUT_MS … 1回あたりの待ち時間の上限（初期値 30000）
//
// 注意: 候補数 x 質問数 ぶんのリクエストを送る（無償プランは月3,000リクエストまで）。
// APIキーはこのスクリプトを動かすPCの中だけで使い、画面やログには出さない。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 置いてあれば .env.local を読む（すでにある環境変数は上書きしない）
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  /* なくてよい */
}

const apiKey = process.env.SAKURA_AI_API_KEY;
if (!apiKey) {
  console.log(
    [
      "SAKURA_AI_API_KEY が設定されていないので、比べるのをやめました。",
      "",
      "次のどちらかでキーを渡してから、もう一度実行してね。",
      "  1) .env.local に SAKURA_AI_API_KEY=（発行したキー）と書く",
      "  2) bash:        SAKURA_AI_API_KEY=xxxx node scripts/compare-models.mjs",
      "     PowerShell:  $env:SAKURA_AI_API_KEY='xxxx'; node scripts/compare-models.mjs",
      "",
      "キーは、さくらのクラウドのコントロールパネルで「さくらのAI Engine」を有効にして発行できます。",
    ].join("\n"),
  );
  process.exit(0);
}

// route.ts と同じエンドポイント（OpenAI互換の /chat/completions）を使う。
// モデルはリクエストの "model" に名前を入れて指定する。
const BASE_URL = (process.env.SAKURA_AI_BASE_URL ?? "https://api.ai.sakura.ad.jp/v1").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.COMPARE_TIMEOUT_MS) || 30_000;

// 候補モデル。モデルIDは、さくらのAI Engineで表示される名前に合わせて直してね
// （合わないと「モデルが見つからない」エラーになる。その場合も他のモデルの比較は続く）。
const DEFAULT_MODELS = [
  "PLaMo 3.0 Prime",
  "Kimi-K2.7-Code",
  "gemma-4-31B-it",
  "Qwen3.6-35B-A3B",
  "gpt-oss-120b",
];
const MODELS = process.env.COMPARE_MODELS
  ? process.env.COMPARE_MODELS.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_MODELS;

const QUESTIONS = [
  "pushって何？",
  "コンフリクトが怖い",
  "mainで作業しちゃった…どうしよう？",
];

// 比較用の「今の状況」（実際のアプリが送る context と同じ形式のダミー）
const CONTEXT = "ステップ: コンフリクト\n次の一手: エディタでぶつかった場所を直そう\n（比較用のダミーの状況）";

// route.ts の SYSTEM_PROMPT をそのまま読み取る（プロンプトを直したら比較にも反映される）
function loadSystemPrompt() {
  try {
    const src = readFileSync(new URL("../src/app/api/boss/route.ts", import.meta.url), "utf8");
    const m = src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
    if (m) return m[1];
  } catch {
    /* 下の簡易版を使う */
  }
  return "あなたはGit練習の上司「ひらたさん」。絶対に怒らず、理由を添え、ヒントを先に出し、自分もミスをする。返答は3行以内の日本語。";
}
const SYSTEM_PROMPT = `${loadSystemPrompt()}\n\n# 今の状況\n${CONTEXT}`;

// route.ts と同じく、考え中の <think>…</think> は取り除いて表示する
const clean = (t) =>
  t.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/gi, "").trim();

async function ask(model, question) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
      }),
      signal: ctrl.signal,
    });
    const sec = (performance.now() - started) / 1000;
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
      return { sec, error: `HTTP ${res.status} ${detail}` };
    }
    const data = await res.json();
    const reply = clean(data.choices?.[0]?.message?.content ?? "");
    return { sec, reply: reply || null, error: reply ? null : "返答が空でした", tokens: data.usage?.total_tokens };
  } catch (e) {
    const sec = (performance.now() - started) / 1000;
    const msg = e?.name === "AbortError" ? `${TIMEOUT_MS / 1000}秒たっても返事が来ませんでした` : String(e?.message ?? e);
    return { sec, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

console.log(`エンドポイント: ${BASE_URL}`);
console.log(`比べるモデル: ${MODELS.join(" / ")}`);
console.log(`質問の数: ${QUESTIONS.length}（合計 ${MODELS.length * QUESTIONS.length} リクエスト）`);

const summary = MODELS.map((m) => ({ model: m, total: 0, ok: 0, ng: 0, chars: 0 }));

for (const q of QUESTIONS) {
  console.log(`\n${"=".repeat(60)}\n質問: ${q}\n${"=".repeat(60)}`);
  // 順番に送る（同時に送ると待ち時間が正しく比べられないので）
  for (const [i, model] of MODELS.entries()) {
    const r = await ask(model, q);
    const s = summary[i];
    s.total += r.sec;
    console.log(`\n--- ${model}（${r.sec.toFixed(1)}秒${r.tokens ? `・${r.tokens}トークン` : ""}）`);
    if (r.error) {
      s.ng += 1;
      console.log(`  失敗: ${r.error}`);
    } else {
      s.ok += 1;
      s.chars += r.reply.length;
      console.log(`${r.reply}\n  （${r.reply.length}文字）`);
    }
  }
}

console.log(`\n${"=".repeat(60)}\nまとめ（平均の所要時間・成功数・平均文字数）\n${"=".repeat(60)}`);
for (const s of summary) {
  const n = s.ok + s.ng;
  const avgSec = n ? (s.total / n).toFixed(1) : "-";
  const avgChars = s.ok ? Math.round(s.chars / s.ok) : "-";
  console.log(`${s.model.padEnd(20)} ${avgSec}秒  成功 ${s.ok}/${n}  平均 ${avgChars}文字`);
}
console.log("\n見るポイント: 怒らない／理由がある／ヒントが先／専門用語が「言い換え（正式名）」／120文字前後／速さ");
