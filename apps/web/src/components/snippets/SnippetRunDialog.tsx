import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  PullRequestListInput,
  ScopedProjectRef,
  Snippet,
} from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { CheckIcon, PlayIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { type EnvironmentQueryTarget, usePullRequestList } from "~/state/pullRequests";
import { useDebouncedValue } from "~/state/queries";
import type { EnvironmentPullRequestEntry } from "../pullRequest/pullRequestList.logic";
import {
  PULL_REQUEST_ROW_CLASS,
  PULL_REQUEST_ROW_NUMBER_CLASS,
  PullRequestRowGlyph,
  PullRequestRowLines,
} from "../pullRequest/PullRequestListRow";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import { fillSnippetPrompt, type SnippetInputs } from "./snippetPrompt";
import { SnippetPromptPreview } from "./SnippetPromptPreview";
import { snippetPullRequestChoices } from "./snippetPullRequests";

const OPEN_PULL_REQUEST_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 250;
// PullRequestListInput caps `query` at this length.
const MAX_QUERY_LENGTH = 200;
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
          <DialogDescription>
            <SnippetPromptPreview prompt={snippet.prompt} />
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-3">
            {inputs.pr ? (
              <PullRequestSearch
                environmentId={props.environmentId}
                selected={pullRequest}
                onSelect={setPullRequest}
              />
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

/**
 * Open pull requests, narrowed as the user types. The loaded ones filter at once; a pause in
 * typing also asks the host, which finds pull requests past the first page.
 */
function PullRequestSearch(props: {
  readonly environmentId: EnvironmentId;
  readonly selected: EnvironmentPullRequestEntry | null;
  readonly onSelect: (entry: EnvironmentPullRequestEntry) => void;
}) {
  const gt = useGT();
  const [query, setQuery] = useState("");
  const typed = query.trim().slice(0, MAX_QUERY_LENGTH);
  const sent = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS);
  const settled = sent === typed;
  const open = usePullRequestList([
    {
      environmentId: props.environmentId,
      input: { state: "open", limit: OPEN_PULL_REQUEST_LIMIT },
    },
  ]);
  const searched = usePullRequestList(
    sent
      ? [
          {
            environmentId: props.environmentId,
            input: { state: "open", limit: OPEN_PULL_REQUEST_LIMIT, query: sent },
          },
        ]
      : NO_TARGETS,
  );
  const providers = searched.data?.providers ?? [];
  const choices = snippetPullRequestChoices(
    typed,
    open.data?.entries ?? [],
    typed && settled ? (searched.data?.entries ?? null) : null,
    (host) => providers.some((provider) => provider.host === host && provider.searchesOnHost),
  );
  const searching = typed !== "" && (!settled || searched.isPending);

  return (
    <div className="flex flex-col gap-1.5">
      <InputGroup>
        <InputGroupAddon>
          {searching ? <Spinner aria-hidden /> : <SearchIcon aria-hidden />}
        </InputGroupAddon>
        <InputGroupInput
          type="text"
          role="searchbox"
          autoFocus
          aria-label={gt("Search pull requests")}
          placeholder={gt("Search pull requests")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Escape clears the search first, and closes the dialog only once it is empty.
            if (event.key !== "Escape" || !query) return;
            event.stopPropagation();
            setQuery("");
          }}
        />
      </InputGroup>
      <div
        role="listbox"
        aria-label={gt("Pull request")}
        className="flex h-64 scrollbar-gutter-both flex-col gap-px overflow-y-auto rounded-lg border border-border/60 p-1"
      >
        {choices.length === 0 ? (
          <p className="m-auto p-3 text-center text-xs text-muted-foreground">
            {open.isPending || searching ? (
              <T>Loading pull requests…</T>
            ) : typed ? (
              gt("No open pull request matches “{query}”.", { query: typed })
            ) : (
              <T>No open pull requests.</T>
            )}
          </p>
        ) : null}
        {choices.map((entry) => {
          const selected = entry.url === props.selected?.url;
          return (
            <button
              key={entry.url}
              type="button"
              role="option"
              aria-selected={selected}
              className={cn(
                PULL_REQUEST_ROW_CLASS,
                "px-2 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                selected && "bg-accent",
              )}
              onClick={() => props.onSelect(entry)}
            >
              <PullRequestRowGlyph state={entry.state} isDraft={entry.isDraft} />
              <PullRequestRowLines
                number={<span className={PULL_REQUEST_ROW_NUMBER_CLASS}>#{entry.number}</span>}
                title={entry.title}
                status={selected ? <CheckIcon aria-hidden className="size-3.5" /> : null}
                meta={<span className="truncate">{entry.repository}</span>}
                updatedAt={entry.updatedAt}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
