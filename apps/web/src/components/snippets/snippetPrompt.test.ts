import { describe, expect, it } from "vite-plus/test";

import { fillSnippetPrompt, snippetInputs, snippetPromptParts } from "./snippetPrompt";

describe("snippetInputs", () => {
  it("asks for a pull request and notes only when the prompt has their placeholders", () => {
    expect(snippetInputs("/council opus {{pr}}\n\n{{notes}}")).toEqual({ pr: true, notes: true });
    expect(snippetInputs("Review {{ pr }}")).toEqual({ pr: true, notes: false });
    expect(snippetInputs("List my Linear tickets")).toBeNull();
  });
});

describe("fillSnippetPrompt", () => {
  it("puts the chosen pull request and notes in place", () => {
    expect(
      fillSnippetPrompt("/council opus {{pr}}\n\n{{notes}}", {
        pr: "https://github.com/o/r/pull/7",
        notes: "Focus on the migration.",
      }),
    ).toBe("/council opus https://github.com/o/r/pull/7\n\nFocus on the migration.");
  });

  it("drops the blank lines an empty note leaves behind", () => {
    expect(fillSnippetPrompt("/council opus {{pr}}\n\n{{notes}}", { pr: "#7", notes: "  " })).toBe(
      "/council opus #7",
    );
  });
});

describe("snippetPromptParts", () => {
  it("splits a prompt into its text and the inputs it asks for", () => {
    expect(snippetPromptParts("/council opus {{pr}}\n\n{{ notes }}")).toEqual([
      { kind: "text", at: 0, text: "/council opus " },
      { kind: "pr", at: 14 },
      { kind: "text", at: 20, text: "\n\n" },
      { kind: "notes", at: 22 },
    ]);
    expect(snippetPromptParts("List my tickets")).toEqual([
      { kind: "text", at: 0, text: "List my tickets" },
    ]);
  });
});
