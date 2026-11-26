import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { NextStepButtons } from "./NextStepButtons";

const steps = [
  { label: "Commit & deploy", prompt: "Commit the fix and deploy it." },
  { label: "Check mood-browser", prompt: "Check mood-browser.tsx for the same bug." },
];

it("sends the prompt of the next step the user clicks", async () => {
  const onSend = vi.fn(() => Promise.resolve());
  await using screen = await render(<NextStepButtons steps={steps} onSend={onSend} />);

  await userEvent.click(screen.getByRole("button", { name: "Check mood-browser" }));

  expect(onSend.mock.calls).toEqual([["Check mood-browser.tsx for the same bug."]]);
  await expect.element(screen.getByRole("button", { name: "Commit & deploy" })).toBeEnabled();
});

it("shows nothing when the agent offered no next steps", async () => {
  await using screen = await render(<NextStepButtons steps={[]} onSend={vi.fn()} />);

  expect(screen.container.querySelector("[role=group]")).toBeNull();
});
