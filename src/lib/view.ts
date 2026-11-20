// リポジトリの状態から、画面表示に使う値を求める。
import * as G from "./git";

const same = (a: string[] | null, b: string[] | null) => JSON.stringify(a) === JSON.stringify(b);

export function deriveView(repo: G.Repo) {
  const h = G.head(repo);
  const unstaged =
    !!repo.conflict || !same(repo.working, repo.staged ?? h.lines) || (!!repo.mergeHead && repo.staged === null);
  const staged = repo.staged !== null;
  const ahead = repo.remote[repo.current] !== repo.branches[repo.current];
  const behindMain = repo.current !== "main" && !G.isAncestor(repo, repo.remote.main, repo.branches[repo.current]);
  const myCommits = repo.order
    .map((id) => repo.commits[id])
    .filter(
      (c) =>
        c.author === "you" &&
        !c.revertOf &&
        c.parents.length === 1 &&
        G.isAncestor(repo, c.id, repo.branches[repo.current]),
    )
    .reverse();
  return { unstaged, staged, ahead, behindMain, myCommits };
}

export type View = ReturnType<typeof deriveView>;
