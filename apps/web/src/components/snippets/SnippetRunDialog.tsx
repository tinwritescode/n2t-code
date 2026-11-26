import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  PullRequestListInput,
  ScopedProjectRef,
  Snippet,
} from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { PlayIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { type EnvironmentQueryTarget, usePullRequestList } from "~/state/pullRequests";
import type { EnvironmentPullRequestEntry } from "../pullRequest/pullRequestList.logic";
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
import { Textarea } from "../ui/textarea";
import { fillSnippetPrompt, type SnippetInputs } from "./snippetPrompt";

const OPEN_PULL_REQUEST_LIMIT = 50;
const NO_TARGETS: ReadonlyArray<EnvironmentQueryTarget<PullRequestListInput>> = [];

/**
 * Asks for what a snippet's placeholders need, then runs it with them filled in. A chosen pull
 * request also names the project to run in, so the agent works in that repository.
 */
export function SnippetRunDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly snippet: Snippet;
  readonly inputs: SnippetInputs;
  readonly onRun: (snippet: Snippet, project: ScopedProjectRef | null) => void;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const { snippet, inputs } = props;
  const [pullRequest, setPullRequest] = useState<EnvironmentPullRequestEntry | null>(null);
  const [notes, setNotes] = useState("");
  const list = usePullRequestList(
    inputs.pr
      ? [
          {
            environmentId: props.environmentId,
            input: { state: "open", limit: OPEN_PULL_REQUEST_LIMIT },
          },
        ]
      : NO_TARGETS,
  );
  const entries = list.data?.entries ?? [];
  const ready = !inputs.pr || pullRequest !== null;

  const run = () => {
    if (!ready) return;
    props.onRun(
      {
        ...snippet,
        prompt: fillSnippetPrompt(snippet.prompt, { pr: pullRequest?.url ?? "", notes }),
      },
      pullRequest === null
        ? null
        : scopeProjectRef(pullRequest.environmentId, pullRequest.projectId),
    );
    props.onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{snippet.name}</DialogTitle>
          <DialogDescription>{snippet.prompt}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-3">
            {inputs.pr ? (
              <div
                role="listbox"
                aria-label={gt("Pull request")}
                className="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border/60 p-1"
              >
                {entries.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    {list.isPending ? <T>Loading pull requests…</T> : <T>No open pull requests.</T>}
                  </p>
                ) : null}
                {entries.map((entry) => {
                  const selected = entry.url === pullRequest?.url;
                  return (
                    <button
                      key={entry.url}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={cn(
                        "flex min-w-0 flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent",
                        selected && "bg-accent",
                      )}
                      onClick={() => setPullRequest(entry)}
                    >
                      <span className="truncate text-sm">{entry.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.repository}#{entry.number} · {entry.projectTitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {inputs.notes ? (
              <Textarea
                rows={3}
                aria-label={gt("Notes")}
                placeholder={gt("Notes (optional)")}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>
            <T>Cancel</T>
          </Button>
          <Button disabled={!ready} onClick={run}>
            <PlayIcon />
            <T>Run</T>
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
