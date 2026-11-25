import type { Snippet } from "@t3tools/contracts";
import { useGT } from "gt-react";

import { isElectron } from "~/env";
import { useScratchProject } from "~/hooks/useScratchProject";
import { useStartPromptThread } from "~/hooks/useStartPromptThread";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { SnippetsPanel } from "./SnippetsPanel";

/** Snippets as a page: Run starts a new thread without a project and sends the prompt. */
export function SnippetsPage() {
  const gt = useGT();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, openScratchProject } = useScratchProject();
  const startPromptThread = useStartPromptThread();
  const environmentId = scratchEnvironmentId(primaryEnvironmentId);

  const run = (snippet: Snippet) => {
    if (environmentId === null) return;
    startPromptThread(() => openScratchProject(environmentId), {
      title: snippet.name,
      prompt: snippet.prompt,
      modelSelection: snippet.modelSelection,
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
