import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  findProjectByPath,
  inferProjectTitleFromPath,
} from "@t3tools/client-runtime/state/projects";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { DesktopUpdateState, EnvironmentId, ModelSelection } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { useState } from "react";

import { useStartPromptThread } from "~/hooks/useStartPromptThread";
import { newProjectId } from "~/lib/utils";
import { readProjects, waitForProject } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { OptionalModelPicker } from "../chat/OptionalModelPicker";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { SidebarMenuItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const MergeIcon = PullRequestGlyph.merged;

type ForkConflict = NonNullable<DesktopUpdateState["forkConflict"]>;

// Sent to the agent as the thread's first message, not shown as app copy.
const mergePrompt = ({ repo, branch }: ForkConflict) =>
  [
    `Update this T3 Code fork (${repo}) from upstream. Merging upstream/main into ${branch} conflicts, so the app's updater stopped.`,
    `1. On ${branch}, run \`git fetch upstream main && git merge upstream/main\` and resolve every conflict. Keep upstream's changes and the fork's own features (the Snippets pane, fork updates, scripts/fork).`,
    "2. Typecheck, lint, and test the files the conflicts touched, then commit the merge and push the branch to origin.",
    "3. Last, run `scripts/fork/update.sh`. It rebuilds and reinstalls T3 Code, which quits the app and ends this thread, so report what you merged before running it.",
  ].join("\n\n");

/** Replaces the update button when a fork update needs an agent to resolve upstream conflicts. */
export function ForkMergeControl(props: { readonly conflict: ForkConflict }) {
  const gt = useGT();
  const environmentId = usePrimaryEnvironmentId();
  const [open, setOpen] = useState(false);
  const label = gt("Upstream changes conflict with {branch}. Merge them with an agent.", {
    branch: props.conflict.branch,
  });
  return (
    <SidebarMenuItem className="ml-auto shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={label}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-sidebar-control-surface text-warning outline-hidden ring-ring transition-colors hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset"
              onClick={() => setOpen(true)}
            >
              <MergeIcon className="size-4" />
            </button>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
      {environmentId === null ? null : (
        <ForkMergeDialog
          open={open}
          onOpenChange={setOpen}
          environmentId={environmentId}
          conflict={props.conflict}
        />
      )}
    </SidebarMenuItem>
  );
}

function ForkMergeDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly conflict: ForkConflict;
}) {
  const gt = useGT();
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null);
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const startPromptThread = useStartPromptThread();
  const { environmentId, conflict } = props;

  // The fork's checkout as a project, added when the sidebar does not have it yet.
  const resolveProject = async () => {
    const existing = findProjectByPath(
      readProjects().filter((project) => project.environmentId === environmentId),
      conflict.repo,
    );
    if (existing) return existing;
    const projectId = newProjectId();
    const result = await createProject({
      environmentId,
      input: {
        projectId,
        title: inferProjectTitleFromPath(conflict.repo),
        workspaceRoot: conflict.repo,
        createWorkspaceRootIfMissing: false,
        defaultModelSelection: null,
      },
    });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    return waitForProject(scopeProjectRef(environmentId, projectId));
  };

  const start = () => {
    props.onOpenChange(false);
    startPromptThread(resolveProject, {
      title: gt("Merge upstream"),
      prompt: mergePrompt(conflict),
      modelSelection,
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            <T>Merge upstream with an agent</T>
          </DialogTitle>
          <DialogDescription>
            {gt(
              "An agent merges upstream into {branch} in {repo}, resolves the conflicts, then rebuilds and reinstalls T3 Code.",
              { branch: conflict.branch, repo: conflict.repo },
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex items-center gap-1.5">
            <OptionalModelPicker
              environmentId={environmentId}
              projectId={null}
              selection={modelSelection}
              onChange={setModelSelection}
            />
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            <T>Cancel</T>
          </Button>
          <Button onClick={start}>
            <MergeIcon />
            <T>Start merge</T>
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
