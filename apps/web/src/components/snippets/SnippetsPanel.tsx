import type { EnvironmentId, ProjectId, ScopedProjectRef, Snippet } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { PencilIcon, PlayIcon, PlusIcon, Trash2Icon, Zap } from "lucide-react";
import { useState } from "react";

import { updateClientSettings, useClientSettings } from "~/hooks/useSettings";
import { randomUUID } from "~/lib/utils";
import { OptionalModelPicker } from "../chat/OptionalModelPicker";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SnippetRunDialog } from "./SnippetRunDialog";
import { snippetInputs } from "./snippetPrompt";

type Draft = { readonly id: string | null; readonly name: string; readonly prompt: string };

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {snippets.length === 0 && draft === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Zap aria-hidden className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium">
              <T>No snippets</T>
            </p>
            <p className="max-w-60 text-xs text-muted-foreground">
              <T>Save a prompt once, then run it in a side chat with one click.</T>
            </p>
          </div>
        ) : null}
        <ul className="flex flex-col gap-1.5">
          {snippets.map((snippet) =>
            draft?.id === snippet.id ? (
              <li key={snippet.id}>
                <SnippetForm
                  draft={draft}
                  onChange={setDraft}
                  onSave={save}
                  onCancel={() => setDraft(null)}
                />
              </li>
            ) : (
              <li
                key={snippet.id}
                className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{snippet.name}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{snippet.prompt}</p>
                  </div>
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
                    variant="ghost"
                    aria-label={gt("Delete {name}", { name: snippet.name })}
                    onClick={() => remove(snippet.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <OptionalModelPicker
                    environmentId={props.environmentId}
                    projectId={props.projectId}
                    selection={snippet.modelSelection}
                    onChange={(modelSelection) => replace({ ...snippet, modelSelection })}
                  />
                  <Button
                    size="xs"
                    className="ms-auto"
                    disabled={props.runDisabledReason !== null}
                    title={props.runDisabledReason ?? undefined}
                    onClick={() => run(snippet)}
                  >
                    <PlayIcon />
                    <T>Run</T>
                  </Button>
                </div>
              </li>
            ),
          )}
          {draft !== null && draft.id === null ? (
            <li>
              <SnippetForm
                draft={draft}
                onChange={setDraft}
                onSave={save}
                onCancel={() => setDraft(null)}
              />
            </li>
          ) : null}
        </ul>
      </div>
      <footer className="flex items-center justify-between border-t border-border/60 px-2 py-1.5">
        <span className="text-2xs text-muted-foreground">{props.runDisabledReason}</span>
        <Button
          size="xs"
          variant="outline"
          disabled={draft !== null}
          onClick={() => setDraft({ id: null, name: "", prompt: "" })}
        >
          <PlusIcon />
          <T>New snippet</T>
        </Button>
      </footer>
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
      className="flex flex-col gap-1.5 rounded-lg border border-border p-2"
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
