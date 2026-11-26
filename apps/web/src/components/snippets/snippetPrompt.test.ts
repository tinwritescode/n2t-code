import { describe, expect, it } from "vite-plus/test";

import { fillSnippetPrompt, snippetInputs } from "./snippetPrompt";

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
