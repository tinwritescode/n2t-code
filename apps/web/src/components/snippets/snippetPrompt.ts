// A snippet asks for these when it runs: `{{pr}}` becomes the chosen pull request's URL and
// `{{notes}}` whatever the user types.
const PR = /\{\{\s*pr\s*\}\}/g;
const NOTES = /\{\{\s*notes\s*\}\}/g;

export interface SnippetInputs {
  readonly pr: boolean;
  readonly notes: boolean;
}

/** What to ask for before the snippet runs, or null when it runs as written. */
export function snippetInputs(prompt: string): SnippetInputs | null {
  const inputs = { pr: new RegExp(PR).test(prompt), notes: new RegExp(NOTES).test(prompt) };
  return inputs.pr || inputs.notes ? inputs : null;
}

export function fillSnippetPrompt(
  prompt: string,
  values: { readonly pr: string; readonly notes: string },
): string {
  return prompt
    .replace(PR, values.pr)
    .replace(NOTES, values.notes.trim())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
