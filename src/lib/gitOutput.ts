// ボタン操作の結果を、本物のgitっぽい出力にする。
import * as G from "./git";
import type { ActionKey } from "./scenario";

export const REPO_URL = "github.com/team/hackathon-app";

export function gitOutput(key: ActionKey, before: G.Repo, res: G.Result): string {
  if (!res.ok) return res.error;
  const r = res.repo;
  switch (key) {
    case "branch":
      return `Switched to a new branch '${r.current}'`;
    case "commit": {
      const h = G.head(r);
      return `[${r.current} ${h.id}] ${h.message}\n 1 file changed`;
    }
    case "push":
      return before.remote[before.current]
        ? `To ${REPO_URL}.git\n   ${before.remote[before.current]}..${r.remote[r.current]}  ${r.current} -> ${r.current}`
        : `To ${REPO_URL}.git\n * [new branch]      ${r.current} -> ${r.current}`;
    case "pull":
      return res.note === "CONFLICT"
        ? `CONFLICT (content): Merge conflict in ${r.fileName}\nAutomatic merge failed; fix conflicts and then commit the result.`
        : "Merge made by the 'ort' strategy.";
    case "revert":
      return `[${r.current} ${G.head(r).id}] ${G.head(r).message}`;
    case "pr":
      return `Pull request #1 を作成しました（${r.pr.branch} → main）`;
    case "merge":
      return "Pull request #1 をmainにマージしました";
    default:
      return "";
  }
}
