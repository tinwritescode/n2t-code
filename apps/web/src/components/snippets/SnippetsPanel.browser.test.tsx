import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS, DEFAULT_SNIPPETS } from "@t3tools/contracts/settings";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { __setClientSettingsForTests, getClientSettings } from "../../hooks/useSettings";
import { SnippetsPanel } from "./SnippetsPanel";

const environmentId = EnvironmentId.make("local");

function panel(props: { runDisabledReason?: string | null; onRun?: () => void } = {}) {
  __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
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
    await screen.getByRole("button", { name: "Run" }).click();

    expect(onRun).toHaveBeenCalledWith(DEFAULT_SNIPPETS[0]);
  });

  it("shows why runs are off and keeps Run disabled", async () => {
    const onRun = vi.fn();
    await using screen = await render(
      panel({ onRun, runDisabledReason: "Side chats start after the first message." }),
    );

    await expect.element(screen.getByRole("button", { name: "Run" })).toBeDisabled();
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
      "My Linear tickets",
      "Standup",
    ]);

    await screen.getByRole("button", { name: "Delete Standup" }).click();

    await expect.element(screen.getByText("Standup")).not.toBeInTheDocument();
    expect(getClientSettings().snippets).toEqual(DEFAULT_SNIPPETS);
  });
});
