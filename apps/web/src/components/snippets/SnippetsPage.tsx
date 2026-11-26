import type { ScopedProjectRef, Snippet } from "@t3tools/contracts";
import { useGT } from "gt-react";

import { isElectron } from "~/env";
import { useScratchProject } from "~/hooks/useScratchProject";
import { useStartPromptThread } from "~/hooks/useStartPromptThread";
import { waitForProject } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { SnippetsPanel } from "./SnippetsPanel";

/** Snippets as a page: Run starts a new thread, without a project unless one is chosen. */
export function SnippetsPage() {
  const gt = useGT();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, openScratchProject } = useScratchProject();
  const startPromptThread = useStartPromptThread();
  const environmentId = scratchEnvironmentId(primaryEnvironmentId);

  // A snippet run on a pull request works in that pull request's project.
  const run = (snippet: Snippet, project: ScopedProjectRef | null) => {
    if (environmentId === null) return;
    const resolveProject = project
      ? () => waitForProject(project)
      : () => openScratchProject(environmentId);
    startPromptThread(resolveProject, {
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
