import {
  type EnvironmentPullRequestEntry,
  matchesPullRequestQuery,
} from "../pullRequest/pullRequestList.logic";

/**
 * The pull requests a snippet run offers for what the user typed: the loaded open ones that
 * match, then what the host search found, each once. `searched` is null until a search settles.
 * A host that cannot search returns its list unfiltered, so its results still have to match.
 */
export function snippetPullRequestChoices(
  query: string,
  open: ReadonlyArray<EnvironmentPullRequestEntry>,
  searched: ReadonlyArray<EnvironmentPullRequestEntry> | null,
  searchesOnHost: (host: string) => boolean,
): ReadonlyArray<EnvironmentPullRequestEntry> {
  const local = open.filter((entry) => matchesPullRequestQuery(entry, query));
  const seen = new Set(local.map((entry) => entry.url));
  const found = (searched ?? []).filter(
    (entry) =>
      !seen.has(entry.url) && (searchesOnHost(entry.host) || matchesPullRequestQuery(entry, query)),
  );
  return [...local, ...found];
}
