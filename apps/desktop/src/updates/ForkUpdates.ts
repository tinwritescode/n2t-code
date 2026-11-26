import type { DesktopUpdateState } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopState from "../app/DesktopState.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as IpcChannels from "../ipc/channels.ts";
import type { DesktopUpdates } from "./DesktopUpdates.ts";
import {
  type ForkConfig,
  forkStateAfterCheck,
  forkStateAfterDownload,
  initialForkState,
  parseForkConfig,
  parseForkProgress,
} from "./forkUpdates.logic.ts";

type Updates = DesktopUpdates["Service"];
type ForkAction = "check" | "download" | "install";

const MAX_RELEASE_NOTE_ITEMS = 30;

/**
 * Replaces the release updater in builds installed by scripts/fork/update.sh. Check counts the
 * upstream commits the fork's branch lacks, download merges them and rebuilds, and install
 * swaps the new app in. A conflicted merge is aborted and reported as `forkConflict`.
 */
const makeForkUpdates = Effect.fn("desktop.forkUpdates.make")(function* (
  base: Updates,
  config: ForkConfig,
  updateLog: string,
) {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const desktopState = yield* DesktopState.DesktopState;
  const fileSystem = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const stateRef = yield* Ref.make(
    initialForkState(environment.appVersion, environment.runtimeInfo),
  );
  const changes = yield* PubSub.sliding<DesktopUpdateState>(16);
  const activeRef = yield* Ref.make<ForkAction | null>(null);
  const shell = yield* Config.String("SHELL").pipe(Config.withDefault("/bin/zsh"));

  // A login shell gives the update script the user's PATH (node, pnpm), which an app opened
  // from Finder does not inherit. Arguments pass through "$@", so nothing is re-parsed.
  // `onLine` sees each stdout line as it arrives, for progress.
  const run = (
    args: ReadonlyArray<string>,
    onLine: (line: string) => Effect.Effect<void> = () => Effect.void,
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const child = yield* spawner.spawn(
          ChildProcess.make(shell, ["-lc", '"$@"', "fork", ...args], {
            cwd: config.repo,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          }),
        );
        const [stdout, stderr, code] = yield* Effect.all(
          [
            Stream.decodeText(child.stdout).pipe(
              Stream.splitLines,
              Stream.tap(onLine),
              Stream.runFold(
                () => "",
                (text, line) => `${text}${line}\n`,
              ),
            ),
            Stream.mkString(Stream.decodeText(child.stderr)),
            child.exitCode,
          ],
          { concurrency: 3 },
        );
        return { code: Number(code), stdout, output: stdout + stderr };
      }),
    ).pipe(
      Effect.catch((error) =>
        Effect.succeed({ code: -1, stdout: "", output: `${String(error)}\n` }),
      ),
    );

  const emitState = Ref.get(stateRef).pipe(
    Effect.flatMap((state) => electronWindow.sendAll(IpcChannels.UPDATE_STATE_CHANNEL, state)),
  );
  const setState = (state: DesktopUpdateState) =>
    Ref.set(stateRef, state).pipe(
      Effect.andThen(PubSub.publish(changes, state)),
      Effect.andThen(emitState),
    );
  // One action at a time; a second request gets `busy` back.
  const exclusive = <A>(action: ForkAction, busy: A, effect: Effect.Effect<A>) =>
    Ref.modify(activeRef, (active): [boolean, ForkAction | null] =>
      active === null ? [true, action] : [false, active],
    ).pipe(
      Effect.flatMap((started) =>
        started ? effect.pipe(Effect.ensuring(Ref.set(activeRef, null))) : Effect.succeed(busy),
      ),
    );

  const check = Effect.fn("desktop.forkUpdates.check")(function* (reason: string) {
    yield* Effect.annotateCurrentSpan({ reason });
    const busy = { checked: false, state: yield* Ref.get(stateRef) };
    return yield* exclusive(
      "check",
      busy,
      Effect.gen(function* () {
        const before = yield* Ref.get(stateRef);
        yield* setState({ ...before, status: "checking" });
        const range = `${config.branch}..upstream/main`;
        const fetched = yield* run(["git", "fetch", "--quiet", "upstream", "main"]);
        const count = yield* run(["git", "rev-list", "--count", range]);
        const log = yield* run(["git", "log", "--format=%s", `-n${MAX_RELEASE_NOTE_ITEMS}`, range]);
        const behind = Number.parseInt(count.stdout.trim(), 10);
        const checkedAt = DateTime.formatIso(yield* DateTime.now);
        yield* setState(
          fetched.code !== 0 || count.code !== 0 || !Number.isFinite(behind)
            ? {
                ...before,
                status: "error",
                errorContext: "check",
                message: `Could not compare ${config.repo} with upstream/main.`,
                checkedAt,
                canRetry: true,
              }
            : forkStateAfterCheck(
                before,
                { behind, subjects: log.stdout.split("\n").filter(Boolean) },
                checkedAt,
              ),
        );
        return { checked: true, state: yield* Ref.get(stateRef) };
      }),
    );
  });

  const download = Effect.gen(function* () {
    const busy = { accepted: false, completed: false, state: yield* Ref.get(stateRef) };
    return yield* exclusive(
      "download",
      busy,
      Effect.gen(function* () {
        const before = yield* Ref.get(stateRef);
        yield* setState({ ...before, status: "downloading", downloadPercent: null, message: null });
        const branch = (yield* run(["git", "branch", "--show-current"])).stdout.trim();
        const result =
          branch === config.branch
            ? yield* run(["bash", "scripts/fork/update.sh", "--sync", "--no-install"], (line) => {
                const percent = parseForkProgress(line);
                return percent === null
                  ? Effect.void
                  : Ref.get(stateRef).pipe(
                      Effect.flatMap((state) => setState({ ...state, downloadPercent: percent })),
                    );
              })
            : {
                code: 1,
                output: `${config.repo} is on ${branch || "a detached HEAD"}, not ${config.branch}.\n`,
              };
        yield* fileSystem.writeFileString(updateLog, result.output).pipe(Effect.ignore);
        yield* setState(forkStateAfterDownload(before, config, result.code, updateLog));
        const state = yield* Ref.get(stateRef);
        return { accepted: true, completed: state.status === "downloaded", state };
      }),
    );
  }).pipe(Effect.withSpan("desktop.forkUpdates.download"));

  const install = Effect.gen(function* () {
    const busy = { accepted: false, completed: false, state: yield* Ref.get(stateRef) };
    return yield* exclusive(
      "install",
      busy,
      Effect.gen(function* () {
        // The script hands the swap to a detached process that quits and reopens this app.
        const result = yield* run(["bash", "scripts/fork/update.sh", "--install-only"]);
        if (result.code !== 0) {
          yield* fileSystem.writeFileString(updateLog, result.output).pipe(Effect.ignore);
          yield* setState({
            ...(yield* Ref.get(stateRef)),
            errorContext: "install",
            message: `Could not start the fork install. See ${updateLog}.`,
          });
        }
        return { accepted: true, completed: result.code === 0, state: yield* Ref.get(stateRef) };
      }),
    );
  }).pipe(Effect.withSpan("desktop.forkUpdates.install"));

  const service: Updates = {
    ...base,
    getState: Ref.get(stateRef),
    isActionActive: Ref.get(activeRef).pipe(Effect.map((active) => active !== null)),
    isInstallActive: Ref.get(activeRef).pipe(Effect.map((active) => active === "install")),
    subscribe: Effect.gen(function* () {
      const subscription = yield* PubSub.subscribe(changes);
      return { latest: yield* Ref.get(stateRef), changes: Stream.fromSubscription(subscription) };
    }),
    emitState,
    disabledReason: Effect.succeedNone,
    configure: Effect.gen(function* () {
      yield* Ref.set(desktopState.canInstallUpdates, true);
      yield* emitState;
      yield* check("poll").pipe(
        Effect.delay("30 seconds"),
        Effect.repeat(Schedule.spaced("6 hours")),
        Effect.forkScoped,
      );
    }),
    setChannel: () => Ref.get(stateRef),
    check: (reason) => check(reason),
    download,
    install,
    installPrepared: () =>
      install.pipe(Effect.map((result) => ({ ...result, failed: !result.completed }))),
  };
  return service;
});

/**
 * Swaps in fork updates when ~/.t3/fork.json names the checkout this build came from. Only
 * packaged apps read it, so dev runs and tests keep the release updater.
 */
export const withForkUpdates = Effect.fn("desktop.forkUpdates.wrap")(function* <E, R>(
  make: Effect.Effect<Updates, E, R>,
) {
  const base = yield* make;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  if (!environment.isPackaged) return base;
  const fileSystem = yield* FileSystem.FileSystem;
  const forkDir = environment.path.join(environment.homeDirectory, ".t3");
  const config = yield* fileSystem.readFileString(environment.path.join(forkDir, "fork.json")).pipe(
    Effect.map(parseForkConfig),
    Effect.orElseSucceed(() => null),
  );
  return config === null
    ? base
    : yield* makeForkUpdates(base, config, environment.path.join(forkDir, "fork-update.log"));
});
