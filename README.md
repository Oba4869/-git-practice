# チーム開発の練習試合（仮）

1人でも、AIの上司「ひらたさん」とチーム開発の練習試合ができるWebアプリ。
本番で事故る前に、AIと事故っておこう。

画面はVS Code風。左のソース管理（＋でadd、✓でcommit、↑でpush）、中央のエディタ、下のターミナル、
右下に上司のひとことが出る。練習した操作がそのまま本番のVS Codeで使える。
スマホでは「エディタ → 上司 → ソース管理／ターミナル／図」のタブ構成になる。

## 1試合の流れ（10〜15分）
1. 仕事を受ける → 自分用のコピー（ブランチ）を作る（mainで編集すると上司が止めてくれる）
2. ファイルを編集 → add → commit → push
3. PRを出す → 上司からレビュー（🚀を付けて）→ 直してpush
4. 上司がmainで同じ行を書き換えてコンフリクト → 取り込んで解決
5. わざとデバッグ行をpush → revertで取り消し
6. PRをマージ → 事故図鑑に追加

## 動かし方
```bash
npm install
cp .env.example .env.local   # SAKURA_AI_API_KEY を入れる（なくても決まったセリフで動く）
npm run dev                  # http://localhost:3000
```

APIキーは、さくらのクラウドのコントロールパネルで「さくらのAI Engine」を有効にして発行します。
基盤モデル無償プランなら月3,000リクエストまで無料です。

## 構成
| ファイル | 役割 |
| --- | --- |
| `src/lib/git.ts` | 練習用の簡易Gitエンジン（1ファイルだけ扱う。本物のGitの前提条件とエラーを再現） |
| `src/lib/scenario.ts` | 1試合のシナリオ。進行は「操作」ではなく「状態」で判定する |
| `src/lib/coach.ts` / `coachStore.ts` | 苦手を狙うコーチ機能。ミスとヒントの記録から苦手を判定（コードで行う）し、記録をlocalStorageに保存 |
| `src/lib/rateLimit.ts` | `/api/boss` の使いすぎ防止（メモリ内で数える。1台のVPSで常駐させる前提） |
| `src/lib/gitOutput.ts` / `view.ts` / `zukan.ts` | gitっぽい出力の文字列、画面用の派生値、事故図鑑の保存 |
| `src/components/Game.tsx` | 画面の状態と配置（PC・スマホの切り替え）だけを持つ |
| `src/components/SourceControl.tsx` / `Editor.tsx` / `Terminal.tsx` / `BossCard.tsx` / `StatusBar.tsx` | 画面の部品（ソース管理・エディタ・ターミナル・上司・ステータスバー） |
| `src/components/ZukanModal.tsx` / `FinishScreen.tsx` | 事故図鑑と試合終了画面 |
| `scripts/compare-models.mjs` | 上司AIのモデル比較（`SAKURA_AI_API_KEY` が必要） |
| `src/components/AreasView.tsx` | 作業場 → ステージ → PCの履歴 → GitHub の図 |
| `src/components/TreeView.tsx` | コミットツリーのSVG |
| `src/app/api/boss/route.ts` | 上司AI（さくらのAI Engine、OpenAI互換）。APIキーはサーバー側だけで使う |
| `src/app/manifest.ts` | PWA（ホーム画面に追加） |

## AIの使いどころ
- 決まったセリフ・事故・正解判定はコードで持つ（デモで崩れないように）
- AIは「自由な質問への回答」と「試合後のひとこと」だけ → リクエストを節約
- モデルは `SAKURA_AI_MODEL` で切り替え（初期値: gpt-oss-120b）

## 公開（さくらのVPS）
```bash
npm run build
PORT=3000 npm start   # pm2 などで常駐させ、nginxでHTTPS化
```

## 次にやること
- [ ] アプリ名と上司のキャラ（名前・見た目）を決める
- [ ] 実際のAPIキーでモデルを比較（PLaMo 3.0 Prime / Kimi-K2.7-Code / gemma-4-31B-it / Qwen3.6-35B-A3B）
- [x] 事故図鑑の画面
- [ ] コーチ機能：今は終了画面に「見直したいところ」を出すだけ。次の試合の事故の選び方への反映は未実装（`pickPracticeAccidents` はまだ使っていない）
- [x] `/api/boss` の回数制限（IPごとに10分20回、全体で1日600回。`BOSS_IP_LIMIT` / `BOSS_DAILY_LIMIT` で変更可）。公開時はnginxで `X-Forwarded-For` を付けること
- [ ] ターミナル式モード、本物のGitHub連携
