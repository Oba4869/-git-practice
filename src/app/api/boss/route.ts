import OpenAI from "openai";

// 上司AI（さくらのAI Engine）を呼ぶAPI。
// APIキーはサーバー側だけで使い、ブラウザには出さない。

const BASE_URL = process.env.SAKURA_AI_BASE_URL ?? "https://api.ai.sakura.ad.jp/v1";
const MODEL = process.env.SAKURA_AI_MODEL ?? "gpt-oss-120b";

const SYSTEM_PROMPT = `あなたは、ハッカソン初参加の学生と一緒にチーム開発の「練習試合」をしている、理想の上司「ひらたさん」です。

性格:
- 絶対に怒らない。失敗は「いい事故だね」と前向きに受け止める
- 操作の「なぜ」を一言添える
- 答えをすぐ言わず、まずヒントを出す
- フランクな敬語まじり。上から目線にしない
- 自分もミスをする人間らしい上司

ルール:
- 返答はスマホの吹き出し3行以内（120文字程度まで）
- 専門用語は、言い換えを先に言ってから正式名を添える（例: 自分用のコピー（ブランチ））
- Git/GitHubとチーム開発に関係ない話題は、やんわり練習に戻す
- 今の練習の状況（下に書く）に合わせて答える`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const body = (await request.json()) as {
    messages?: ChatMessage[];
    context?: string;
  };
  const messages = (body.messages ?? []).slice(-8);
  const context = (body.context ?? "").slice(0, 2000);

  const apiKey = process.env.SAKURA_AI_API_KEY;
  if (!apiKey) {
    return Response.json({
      reply:
        "（AIがまだつながっていないみたい。.env.local に SAKURA_AI_API_KEY を設定してね。それまでは決まったセリフだけで進めるよ！）",
      offline: true,
    });
  }

  const client = new OpenAI({ apiKey, baseURL: BASE_URL });
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 400,
      temperature: 0.7,
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n# 今の状況\n${context}` },
        ...messages,
      ],
    });
    const reply = res.choices[0]?.message?.content?.trim() || "ごめん、うまく考えがまとまらなかった。もう一回聞いてくれる？";
    return Response.json({ reply, usage: res.usage ?? null });
  } catch (e) {
    console.error("[boss] AI Engine error", e);
    return Response.json(
      { reply: "ごめん、今ちょっと通信の調子が悪いみたい。少ししてからもう一回聞いてね。", error: true },
      { status: 200 },
    );
  }
}
