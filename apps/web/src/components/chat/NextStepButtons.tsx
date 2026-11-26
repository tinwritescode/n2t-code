import type { NextStep } from "@t3tools/shared/toolOutput";
import { useGT } from "gt-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

/** The next steps the agent offered with `suggest_next_steps`; clicking one sends its prompt. */
export function NextStepButtons(props: {
  readonly steps: ReadonlyArray<NextStep>;
  readonly onSend: (text: string) => Promise<void>;
}) {
  const gt = useGT();
  const [sending, setSending] = useState(false);
  if (props.steps.length === 0) return null;
  const send = (step: NextStep) => {
    setSending(true);
    props
      .onSend(step.prompt)
      .catch((error: unknown) =>
        toastManager.add({
          type: "error",
          title: gt("Could not send the next step."),
          description: error instanceof Error ? error.message : undefined,
        }),
      )
      .finally(() => setSending(false));
  };
  return (
    <div
      role="group"
      aria-label={gt("Suggested next steps")}
      className="mb-2 flex flex-wrap gap-1.5"
    >
      {props.steps.map((step) => (
        <Button
          key={`${step.label}\n${step.prompt}`}
          variant="outline"
          size="sm-pill"
          title={step.prompt}
          disabled={sending}
          onClick={() => send(step)}
        >
          {step.label}
        </Button>
      ))}
    </div>
  );
}
