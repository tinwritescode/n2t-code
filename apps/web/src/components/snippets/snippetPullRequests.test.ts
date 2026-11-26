import { SourceControlProviderKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentPullRequestEntry } from "../pullRequest/pullRequestList.logic";
import { snippetPullRequestChoices } from "./snippetPullRequests";

const pullRequest = (number: number, title: string, host = "github.com") =>
  ({
    environmentId: "env-1",
    provider: SourceControlProviderKind.make("github"),
    host,
    projectId: "project-1",
    projectTitle: "t3code",
    repository: "pingdotgg/t3code",
    title,
    url: `https://${host}/pingdotgg/t3code/pull/${number}`,
    author: { login: "octocat", name: null, avatarUrl: null },
    headBranch: `feat/${number}`,
    baseBranch: "main",
    state: "open",
    isDraft: false,
    additions: 1,
    deletions: 0,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-02T00:00:00Z",
    viewerReviewRequested: false,
    labels: [],
  }) as unknown as EnvironmentPullRequestEntry;

const login = pullRequest(1, "Fix the login redirect");
const billing = pullRequest(2, "Add billing page");
const session = pullRequest(3, "Refresh sessions before they expire");
const searchesOnHost = (host: string) => host === "github.com";

describe("snippetPullRequestChoices", () => {
  it("offers every open pull request before anything is typed", () => {
    expect(snippetPullRequestChoices("", [login, billing], null, searchesOnHost)).toEqual([
      login,
      billing,
    ]);
  });

  it("narrows the loaded pull requests at once while the host search is on its way", () => {
    expect(snippetPullRequestChoices("login", [login, billing], null, searchesOnHost)).toEqual([
      login,
    ]);
  });

  it("adds what the host search found after the loaded matches, once each", () => {
    expect(
      snippetPullRequestChoices("login", [login, billing], [session, login], searchesOnHost),
    ).toEqual([login, session]);
  });

  it("keeps results from a host that cannot search only when they match", () => {
    const local = pullRequest(4, "Unrelated", "git.example.com");
    const loginOnLocal = pullRequest(5, "Login form", "git.example.com");
    expect(snippetPullRequestChoices("login", [], [local, loginOnLocal], searchesOnHost)).toEqual([
      loginOnLocal,
    ]);
  });
});
