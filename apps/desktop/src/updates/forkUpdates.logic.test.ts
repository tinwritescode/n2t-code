import { describe, expect, it } from "vite-plus/test";

import {
  FORK_CONFLICT_EXIT_CODE,
  forkStateAfterCheck,
  forkStateAfterDownload,
  initialForkState,
  parseForkConfig,
} from "./forkUpdates.logic.ts";

const runtimeInfo = {
  hostArch: "arm64",
  appArch: "arm64",
  runningUnderArm64Translation: false,
} as const;
const config = { repo: "/code/t3code", branch: "custom" };
const idle = initialForkState("0.1.13-nightly.20261126.1", runtimeInfo);
const checkedAt = "2026-11-26T08:00:00.000Z";

describe("parseForkConfig", () => {
  it("reads the checkout the update script wrote", () => {
    expect(parseForkConfig('{"repo":"/code/t3code","branch":"custom"}\n')).toEqual(config);
  });

  it("ignores a missing branch or unreadable file", () => {
    expect(parseForkConfig('{"repo":"/code/t3code"}')).toBeNull();
    expect(parseForkConfig("not json")).toBeNull();
  });
});

describe("fork update states", () => {
  it("starts enabled so the sidebar offers a check", () => {
    expect(idle).toMatchObject({ enabled: true, status: "idle", message: null });
  });

  it("offers upstream commits with their subjects as release notes", () => {
    const state = forkStateAfterCheck(
      idle,
      { behind: 2, subjects: ["fix a", "feat b"] },
      checkedAt,
    );
    expect(state).toMatchObject({
      status: "available",
      availableVersion: "2 upstream commits",
      checkedAt,
      releaseNotes: [{ version: "2 upstream commits", items: ["fix a", "feat b"], totalItems: 2 }],
    });
  });

  it("reports up to date when upstream has nothing new", () => {
    const state = forkStateAfterCheck(idle, { behind: 0, subjects: [] }, checkedAt);
    expect(state).toMatchObject({ status: "up-to-date", availableVersion: null, releaseNotes: [] });
  });

  it("marks a finished build as ready to install", () => {
    const offered = forkStateAfterCheck(idle, { behind: 1, subjects: ["fix a"] }, checkedAt);
    expect(forkStateAfterDownload(offered, config, 0, "")).toMatchObject({
      status: "downloaded",
      downloadedVersion: "1 upstream commit",
    });
  });

  it("hands a merge conflict to the renderer with the checkout to fix", () => {
    const offered = forkStateAfterCheck(idle, { behind: 1, subjects: ["fix a"] }, checkedAt);
    const state = forkStateAfterDownload(offered, config, FORK_CONFLICT_EXIT_CODE, "conflict");
    expect(state).toMatchObject({
      status: "error",
      errorContext: "download",
      forkConflict: config,
      downloadedVersion: null,
    });
  });

  it("keeps a failed build retryable and points at the log", () => {
    const offered = forkStateAfterCheck(idle, { behind: 1, subjects: ["fix a"] }, checkedAt);
    const state = forkStateAfterDownload(offered, config, 1, "/home/me/.t3/fork-update.log");
    expect(state).toMatchObject({ status: "error", errorContext: "download", canRetry: true });
    expect(state.message).toContain("/home/me/.t3/fork-update.log");
    expect(state.forkConflict).toBeUndefined();
  });
});
