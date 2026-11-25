import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { ModelSelection } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useNavigate } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { useRef } from "react";

import { toastManager } from "~/components/ui/toast";
import { m } from "~/i18n/messages";
import { newMessageId, newThreadId } from "~/lib/utils";
import { resolveProjectDefaultProviderModelSelection } from "../providerInstances";
import { readEnvironment, readEnvironmentProviders } from "../state/environments";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { buildThreadRouteParams } from "../threadRoutes";

export interface PromptThread {
  readonly title: string;
  readonly prompt: string;
  /** Null uses the project's default model. */
  readonly modelSelection: ModelSelection | null;
}

/**
 * Starts a thread in a project, sends its first message, and opens it. `start` takes the
 * project lazily so callers can open or create it first; it ignores clicks while one starts
 * and reports failures in a toast.
 */
export function useStartPromptThread() {
  const gt = useGT();
  const navigate = useNavigate();
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const pendingRef = useRef(false);
  const couldNotStart = gt("T3 Code could not open a new thread.");

  const send = async (project: EnvironmentProject, thread: PromptThread) => {
    const { environmentId } = project;
    const serverSettings = readEnvironment(environmentId)?.serverConfig?.settings;
    if (!serverSettings) throw new Error(couldNotStart);
    const { settings } = resolveProjectSettings(serverSettings, project.id, project);
    const modelSelection =
      thread.modelSelection ??
      settings.defaultModelSelection ??
      resolveProjectDefaultProviderModelSelection(
        readEnvironmentProviders(environmentId) ?? [],
        serverSettings,
        project.id,
      );
    if (modelSelection === null) throw new Error(couldNotStart);
    const threadId = newThreadId();
    const createdAt = new Date().toISOString();
    const { defaultRuntimeMode: runtimeMode } = settings;
    const result = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId: newMessageId(), role: "user", text: thread.prompt, attachments: [] },
        modelSelection,
        titleSeed: thread.title,
        runtimeMode,
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: project.id,
            title: thread.title,
            modelSelection,
            runtimeMode,
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt,
          },
        },
        createdAt,
      },
    });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    await navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
    });
  };

  return (resolveProject: () => Promise<EnvironmentProject | null>, thread: PromptThread) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    resolveProject()
      .then((project) => (project === null ? undefined : send(project, thread)))
      .catch((error: unknown) =>
        toastManager.add({
          type: "error",
          title: couldNotStart,
          description: thrownErrorMessage(error, m) ?? undefined,
        }),
      )
      .finally(() => {
        pendingRef.current = false;
      });
  };
}
