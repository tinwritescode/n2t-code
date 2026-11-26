import type { DesktopRuntimeInfo, DesktopUpdateState } from "@t3tools/contracts";

import { createInitialDesktopUpdateState } from "./updateMachine.ts";

/** The checkout a fork build updates from, written by scripts/fork/update.sh on install. */
export interface ForkConfig {
  readonly repo: string;
  readonly branch: string;
}

/** scripts/fork/update.sh --sync exits with this after aborting a conflicted merge. */
export const FORK_CONFLICT_EXIT_CODE = 3;

export function parseForkConfig(text: string): ForkConfig | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return null;
    const { repo, branch } = value as Record<string, unknown>;
    return typeof repo === "string" && repo && typeof branch === "string" && branch
      ? { repo, branch }
      : null;
  } catch {
    return null;
  }
}

// scripts/fork/update.sh prints "==> [45%] Building T3 Code" as it starts each step.
const PROGRESS_LINE = /^==> \[(\d{1,3})%\]/;

export function parseForkProgress(line: string): number | null {
  const match = PROGRESS_LINE.exec(line);
  return match ? Math.min(100, Number(match[1])) : null;
}

const describeCommits = (count: number) => `${count} upstream commit${count === 1 ? "" : "s"}`;

export function initialForkState(
  currentVersion: string,
  runtimeInfo: DesktopRuntimeInfo,
): DesktopUpdateState {
  return {
    ...createInitialDesktopUpdateState(currentVersion, runtimeInfo, "nightly"),
    enabled: true,
    status: "idle",
  };
}

const settled = ({ forkConflict: _forkConflict, ...state }: DesktopUpdateState) => ({
  ...state,
  message: null,
  errorContext: null,
  downloadPercent: null,
});

export function forkStateAfterCheck(
  state: DesktopUpdateState,
  upstream: { readonly behind: number; readonly subjects: ReadonlyArray<string> },
  checkedAt: string,
): DesktopUpdateState {
  if (upstream.behind === 0) {
    return {
      ...settled(state),
      status: "up-to-date",
      availableVersion: null,
      downloadedVersion: null,
      releaseNotes: [],
      checkedAt,
      canRetry: false,
    };
  }
  const version = describeCommits(upstream.behind);
  return {
    ...settled(state),
    status: "available",
    availableVersion: version,
    downloadedVersion: null,
    releaseNotes: [{ version, items: [...upstream.subjects], totalItems: upstream.behind }],
    checkedAt,
    canRetry: true,
  };
}

export function forkStateAfterDownload(
  state: DesktopUpdateState,
  config: ForkConfig,
  exitCode: number,
  logPath: string,
): DesktopUpdateState {
  if (exitCode === 0) {
    return {
      ...settled(state),
      status: "downloaded",
      downloadedVersion: state.availableVersion,
      canRetry: true,
    };
  }
  const failed = {
    ...settled(state),
    status: "error" as const,
    errorContext: "download" as const,
    downloadedVersion: null,
    canRetry: true,
  };
  return exitCode === FORK_CONFLICT_EXIT_CODE
    ? {
        ...failed,
        message: `Upstream changes conflict with ${config.branch}. Merge them with an agent.`,
        forkConflict: config,
      }
    : { ...failed, message: `The fork update failed. See ${logPath}.` };
}
