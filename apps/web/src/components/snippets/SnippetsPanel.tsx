import type { EnvironmentId, ProjectId, ScopedProjectRef, Snippet } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { PencilIcon, PlayIcon, PlusIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { useState } from "react";

import { updateClientSettings, useClientSettings } from "~/hooks/useSettings";
import { randomUUID } from "~/lib/utils";
import { OptionalModelPicker } from "../chat/OptionalModelPicker";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SnippetPromptPreview } from "./SnippetPromptPreview";
import { SnippetRunDialog } from "./SnippetRunDialog";
import { snippetInputs } from "./snippetPrompt";

type Draft = { readonly id: string | null; readonly name: string; readonly prompt: string };

const PullRequestIcon = PullRequestGlyph.pullRequest;
const NEW_DRAFT: Draft = { id: null, name: "", prompt: "" };

const saveSnippets = (snippets: ReadonlyArray<Snippet>) => void updateClientSettings({ snippets });

/** Saved prompts, each run as a side chat with its own model. */
export function SnippetsPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
  /** Why runs are off right now, such as a thread that has not started; null when they work. */
  readonly runDisabledReason: string | null;
  /** `project` is the chosen pull request's project, for snippets that ask for one. */
  readonly onRun: (snippet: Snippet, project: ScopedProjectRef | null) => void;
}) {
  const gt = useGT();
  const snippets = useClientSettings((settings) => settings.snippets);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [asking, setAsking] = useState<Snippet | null>(null);
  const askingInputs = asking === null ? null : snippetInputs(asking.prompt);
  const run = (snippet: Snippet) =>
    snippetInputs(snippet.prompt) === null ? props.onRun(snippet, null) : setAsking(snippet);

  const replace = (next: Snippet) =>
    saveSnippets(snippets.map((snippet) => (snippet.id === next.id ? next : snippet)));
  const remove = (id: string) => saveSnippets(snippets.filter((snippet) => snippet.id !== id));
  const save = (value: Draft) => {
    const name = value.name.trim();
    const prompt = value.prompt.trim();
    if (!name || !prompt) return;
    const existing = snippets.find((snippet) => snippet.id === value.id);
    if (existing) replace({ ...existing, name, prompt });
    else saveSnippets([...snippets, { id: randomUUID(), name, prompt, modelSelection: null }]);
    setDraft(null);
  };
  const form = (value: Draft) => (
    <SnippetForm draft={value} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} />
  );
  const newSnippet = (
    <Button
      size="xs"
      variant="outline"
      disabled={draft !== null}
      onClick={() => setDraft(NEW_DRAFT)}
    >
      <PlusIcon />
      <T>New snippet</T>
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{props.runDisabledReason}</p>
        {newSnippet}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {snippets.length === 0 && draft === null ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <ZapIcon aria-hidden className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">
              <T>No snippets</T>
            </p>
            <p className="max-w-64 text-xs text-muted-foreground">
              <T>Save a prompt once, then run it in a side chat with one click.</T>
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
            {snippets.map((snippet) => {
              if (draft?.id === snippet.id) return <li key={snippet.id}>{form(draft)}</li>;
              const asks = snippetInputs(snippet.prompt);
              const KindIcon = asks?.pr ? PullRequestIcon : ZapIcon;
              return (
                <li
                  key={snippet.id}
                  className="group/snippet flex gap-3 px-3 py-3 transition-colors hover:bg-accent/40 focus-within:bg-accent/40"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <KindIcon aria-hidden className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{snippet.name}</p>
                      {/* Shown on hover or focus, so the list reads as names and prompts. */}
                      <div className="flex shrink-0 opacity-0 transition-opacity group-hover/snippet:opacity-100 group-focus-within/snippet:opacity-100 pointer-coarse:opacity-100">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={gt("Edit {name}", { name: snippet.name })}
                          onClick={() => setDraft(snippet)}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost-destructive"
                          aria-label={gt("Delete {name}", { name: snippet.name })}
                          onClick={() => remove(snippet.id)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      <SnippetPromptPreview prompt={snippet.prompt} />
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <OptionalModelPicker
                        environmentId={props.environmentId}
                        projectId={props.projectId}
                        selection={snippet.modelSelection}
                        onChange={(modelSelection) => replace({ ...snippet, modelSelection })}
                      />
                      <Button
                        size="xs"
                        variant="secondary"
                        className="ms-auto"
                        disabled={props.runDisabledReason !== null}
                        title={props.runDisabledReason ?? undefined}
                        onClick={() => run(snippet)}
                      >
                        <PlayIcon />
                        {asks === null ? <T>Run</T> : <T>Run…</T>}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
            {draft !== null && draft.id === null ? <li>{form(draft)}</li> : null}
          </ul>
        )}
      </div>
      {asking !== null && askingInputs !== null ? (
        <SnippetRunDialog
          environmentId={props.environmentId}
          snippet={asking}
          inputs={askingInputs}
          onRun={props.onRun}
          onClose={() => setAsking(null)}
        />
      ) : null}
    </div>
  );
}

function SnippetForm(props: {
  readonly draft: Draft;
  readonly onChange: (draft: Draft) => void;
  readonly onSave: (draft: Draft) => void;
  readonly onCancel: () => void;
}) {
  const gt = useGT();
  const { draft } = props;
  const valid = draft.name.trim() !== "" && draft.prompt.trim() !== "";
  return (
    <form
      className="flex flex-col gap-2 bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave(draft);
      }}
    >
      <Input
        size="sm"
        autoFocus
        aria-label={gt("Name")}
        placeholder={gt("Name")}
        value={draft.name}
        onChange={(event) => props.onChange({ ...draft, name: event.target.value })}
      />
      <Textarea
        rows={4}
        aria-label={gt("Prompt")}
        placeholder={gt("Prompt")}
        value={draft.prompt}
        onChange={(event) => props.onChange({ ...draft, prompt: event.target.value })}
      />
      <p className="text-2xs text-muted-foreground">
        {gt("Write {pr} or {notes} to choose a pull request or add notes when it runs.", {
          pr: "{{pr}}",
          notes: "{{notes}}",
        })}
      </p>
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="xs" variant="ghost" onClick={props.onCancel}>
          <T>Cancel</T>
        </Button>
        <Button type="submit" size="xs" disabled={!valid}>
          <T>Save</T>
        </Button>
      </div>
    </form>
  );
}
