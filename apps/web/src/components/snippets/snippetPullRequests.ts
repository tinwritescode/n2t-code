import { parsePromptLinkPullRequest, promptLinkPullRequestUrl } from "@t3tools/shared/promptLinks";

import {
  type EnvironmentPullRequestEntry,
  matchesPullRequestQuery,
} from "../pullRequest/pullRequestList.logic";

/**
 * The pull requests a snippet run offers for what the user typed: the loaded open ones that
 * match, then what the host search found, each once. `searched` is null until a search settles.
 * A host that cannot search returns its list unfiltered, so its results still have to match.
 * A pasted link offers only the loaded pull request it names.
 */
export function snippetPullRequestChoices(
  query: string,
  open: ReadonlyArray<EnvironmentPullRequestEntry>,
  searched: ReadonlyArray<EnvironmentPullRequestEntry> | null,
  searchesOnHost: (host: string) => boolean,
): ReadonlyArray<EnvironmentPullRequestEntry> {
  const link = snippetPullRequestLink(query);
  if (link !== null) {
    return open.filter((entry) => entry.url.toLowerCase() === link.url.toLowerCase());
  }
  const local = open.filter((entry) => matchesPullRequestQuery(entry, query));
  const seen = new Set(local.map((entry) => entry.url));
  const found = (searched ?? []).filter(
    (entry) =>
      !seen.has(entry.url) && (searchesOnHost(entry.host) || matchesPullRequestQuery(entry, query)),
  );
  return [...local, ...found];
}

/**
 * A pasted pull request link, or `owner/repo#7`, as its plain URL: a #comment anchor or a
 * /files tail would not name the pull request to the agent as cleanly.
 */
export function snippetPullRequestLink(
  query: string,
): { readonly url: string; readonly repository: string } | null {
  const link = parsePromptLinkPullRequest(query);
  return link === null
    ? null
    : { url: promptLinkPullRequestUrl(link), repository: `${link.owner}/${link.name}` };
}
