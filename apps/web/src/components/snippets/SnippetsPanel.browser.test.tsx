import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_SNIPPETS,
  type Snippet,
} from "@t3tools/contracts/settings";
import { createModelCapabilities } from "@t3tools/shared/model";
import { Atom } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { __setClientSettingsForTests, getClientSettings } from "../../hooks/useSettings";
import { SnippetsPanel } from "./SnippetsPanel";

const environmentId = EnvironmentId.make("local");
const codex = ProviderInstanceId.make("codex");

vi.mock(import("../../state/server"), async (original) => {
  const actual = await original();
  const providers = Atom.make<ReadonlyArray<ServerProvider>>([
    {
      instanceId: ProviderInstanceId.make("codex"),
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-11-03T00:00:00.000Z",
      models: [
        {
          slug: "gpt-5.4",
          name: "GPT-5.4",
          isCustom: false,
          capabilities: createModelCapabilities({
            optionDescriptors: [
              {
                id: "reasoningEffort",
                label: "Reasoning effort",
                type: "select",
                options: [
                  { id: "low", label: "Low", isDefault: true },
                  { id: "high", label: "High" },
                ],
                currentValue: "low",
              },
            ],
          }),
        },
      ],
      skills: [],
      slashCommands: [],
    },
  ]);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      providersValueAtom: (() => providers) as never,
    },
  };
});

function panel(
  props: {
    runDisabledReason?: string | null;
    onRun?: () => void;
    snippets?: ReadonlyArray<Snippet>;
  } = {},
) {
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    snippets: props.snippets ?? DEFAULT_SNIPPETS,
  });
  return (
    <SnippetsPanel
      environmentId={environmentId}
      projectId={ProjectId.make("project")}
      runDisabledReason={props.runDisabledReason ?? null}
      onRun={props.onRun ?? (() => undefined)}
    />
  );
}

describe("SnippetsPanel", () => {
  it("runs the default Linear snippet with one click", async () => {
    const onRun = vi.fn();
    await using screen = await render(panel({ onRun }));

    await expect.element(screen.getByText("My Linear tickets")).toBeVisible();
    await screen.getByRole("button", { name: "Run" }).first().click();

    expect(onRun).toHaveBeenCalledWith(DEFAULT_SNIPPETS[0], null);
  });

  it("shows why runs are off and keeps Run disabled", async () => {
    const onRun = vi.fn();
    await using screen = await render(
      panel({ onRun, runDisabledReason: "Side chats start after the first message." }),
    );

    await expect.element(screen.getByRole("button", { name: "Run" }).first()).toBeDisabled();
    await expect
      .element(screen.getByText("Side chats start after the first message."))
      .toBeVisible();
  });

  it("saves a new snippet and deletes it again", async () => {
    await using screen = await render(panel());

    await screen.getByRole("button", { name: "New snippet" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("Standup");
    await page.getByRole("textbox", { name: "Prompt" }).fill("Summarize what I did yesterday.");
    await screen.getByRole("button", { name: "Save" }).click();

    await expect.element(screen.getByText("Standup")).toBeVisible();
    expect(getClientSettings().snippets.map((snippet) => snippet.name)).toEqual([
      ...DEFAULT_SNIPPETS.map((snippet) => snippet.name),
      "Standup",
    ]);

    await screen.getByRole("button", { name: "Delete Standup" }).click();

    await expect.element(screen.getByText("Standup")).not.toBeInTheDocument();
    expect(getClientSettings().snippets).toEqual(DEFAULT_SNIPPETS);
  });

  it("asks for notes before running a snippet that wants them", async () => {
    const onRun = vi.fn();
    const standup = {
      id: "standup",
      name: "Standup",
      prompt: "Summarize yesterday.\n\n{{notes}}",
      modelSelection: null,
    };
    await using screen = await render(panel({ onRun, snippets: [standup] }));

    await screen.getByRole("button", { name: "Run…" }).click();
    await page.getByRole("textbox", { name: "Notes" }).fill("Skip the release work.");
    // The test page has no app styles, so the modal backdrop covers the popup for pointer clicks.
    (
      page.getByRole("dialog").getByRole("button", { name: "Run" }).element() as HTMLElement
    ).click();

    expect(onRun).toHaveBeenCalledWith(
      { ...standup, prompt: "Summarize yesterday.\n\nSkip the release work." },
      null,
    );
  });

  it("runs on a pasted pull request link without its #anchor", async () => {
    const onRun = vi.fn();
    const review = { id: "review", name: "Review", prompt: "Review {{pr}}", modelSelection: null };
    await using screen = await render(panel({ onRun, snippets: [review] }));

    await screen.getByRole("button", { name: "Run…" }).click();
    await page
      .getByRole("searchbox", { name: "Search pull requests" })
      .fill("https://github.com/o/r/pull/7#issuecomment-1");
    await expect
      .element(page.getByRole("option", { name: /github\.com\/o\/r\/pull\/7/ }))
      .toHaveAttribute("aria-selected", "true");
    // The test page has no app styles, so the modal backdrop covers the popup for pointer clicks.
    (
      page.getByRole("dialog").getByRole("button", { name: "Run" }).element() as HTMLElement
    ).click();

    expect(onRun).toHaveBeenCalledWith(
      { ...review, prompt: "Review https://github.com/o/r/pull/7" },
      null,
    );
  });

  it("saves a snippet's thinking level with its model", async () => {
    const review = {
      id: "review",
      name: "Review",
      prompt: "Review the branch.",
      modelSelection: {
        instanceId: codex,
        model: "gpt-5.4",
        options: [{ id: "reasoningEffort", value: "high" }],
      },
    };
    await using _screen = await render(panel({ snippets: [review] }));

    await page.getByRole("button", { name: "High", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Low/ }).click();

    await vi.waitFor(() =>
      expect(getClientSettings().snippets[0]?.modelSelection).toEqual({
        instanceId: codex,
        model: "gpt-5.4",
        options: expect.arrayContaining([{ id: "reasoningEffort", value: "low" }]),
      }),
    );
  });
});
