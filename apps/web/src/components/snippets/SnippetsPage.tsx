import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { Snippet } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useNavigate } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { useRef } from "react";

import { isElectron } from "~/env";
import { useScratchProject } from "~/hooks/useScratchProject";
import { m } from "~/i18n/messages";
import { newMessageId, newThreadId } from "~/lib/utils";
import { resolveProjectDefaultProviderModelSelection } from "../../providerInstances";
import {
  readEnvironment,
  readEnvironmentProviders,
  usePrimaryEnvironmentId,
} from "../../state/environments";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { SidebarInset } from "../ui/sidebar";
import { toastManager } from "../ui/toast";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { SnippetsPanel } from "./SnippetsPanel";

/** Snippets as a page: Run starts a new thread without a project and sends the prompt. */
export function SnippetsPage() {
  const gt = useGT();
  const navigate = useNavigate();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, openScratchProject } = useScratchProject();
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const pendingRef = useRef(false);
  const environmentId = scratchEnvironmentId(primaryEnvironmentId);
  const couldNotStart = gt("T3 Code could not open a new thread.");

  const start = async (snippet: Snippet) => {
    if (environmentId === null) return;
    const project = await openScratchProject(environmentId);
    if (project === null) return;
    const serverSettings = readEnvironment(environmentId)?.serverConfig?.settings;
    if (!serverSettings) throw new Error(couldNotStart);
    const { settings } = resolveProjectSettings(serverSettings, project.id, project);
    const modelSelection =
      snippet.modelSelection ??
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
        message: { messageId: newMessageId(), role: "user", text: snippet.prompt, attachments: [] },
        modelSelection,
        titleSeed: snippet.name,
        runtimeMode,
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: project.id,
            title: snippet.name,
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

  const run = (snippet: Snippet) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    start(snippet)
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

  const pickerEnvironmentId = environmentId ?? primaryEnvironmentId;
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <WorkspacePageHeader electron={isElectron} className="bg-background">
        <h1 className="truncate text-sm font-medium">{gt("Snippets")}</h1>
      </WorkspacePageHeader>
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col pb-4">
        {pickerEnvironmentId === null ? null : (
          <SnippetsPanel
            environmentId={pickerEnvironmentId}
            projectId={null}
            runDisabledReason={
              environmentId === null
                ? gt("None of your machines can start a thread without a project right now.")
                : null
            }
            onRun={run}
          />
        )}
      </div>
    </SidebarInset>
  );
}
