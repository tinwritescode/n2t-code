// A snippet asks for these when it runs: `{{pr}}` becomes the chosen pull request's URL and
// `{{notes}}` whatever the user types.
const INPUT = /\{\{\s*(pr|notes)\s*\}\}/g;

export interface SnippetInputs {
  readonly pr: boolean;
  readonly notes: boolean;
}

/** `at` is where the part starts in the prompt. */
export type SnippetPromptPart =
  | { readonly kind: "text"; readonly at: number; readonly text: string }
  | { readonly kind: "pr" | "notes"; readonly at: number };

/** The prompt as text and the inputs it asks for, in order, for showing it. */
export function snippetPromptParts(prompt: string): ReadonlyArray<SnippetPromptPart> {
  const parts: Array<SnippetPromptPart> = [];
  let last = 0;
  for (const match of prompt.matchAll(INPUT)) {
    if (match.index > last) {
      parts.push({ kind: "text", at: last, text: prompt.slice(last, match.index) });
    }
    parts.push({ kind: match[1] === "pr" ? "pr" : "notes", at: match.index });
    last = match.index + match[0].length;
  }
  if (last < prompt.length) parts.push({ kind: "text", at: last, text: prompt.slice(last) });
  return parts;
}

/** What to ask for before the snippet runs, or null when it runs as written. */
export function snippetInputs(prompt: string): SnippetInputs | null {
  const kinds = new Set(snippetPromptParts(prompt).map((part) => part.kind));
  const inputs = { pr: kinds.has("pr"), notes: kinds.has("notes") };
  return inputs.pr || inputs.notes ? inputs : null;
}

export function fillSnippetPrompt(
  prompt: string,
  values: { readonly pr: string; readonly notes: string },
): string {
  return prompt
    .replace(INPUT, (_input, kind: string) => (kind === "pr" ? values.pr : values.notes.trim()))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
