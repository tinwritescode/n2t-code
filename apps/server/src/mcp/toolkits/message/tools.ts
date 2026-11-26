import { OrchestratorMcpFailure } from "@t3tools/contracts";
import {
  MAX_NEXT_STEPS,
  NEXT_STEP_LABEL_MAX_LENGTH,
  NEXT_STEP_PROMPT_MAX_LENGTH,
  SEND_TO_USER_MAX_LENGTH,
  SEND_TO_USER_TOOL_NAME,
  SUGGEST_NEXT_STEPS_TOOL_NAME,
} from "@t3tools/shared/toolOutput";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

// Claude 5.1+ returns text written before a tool call only as a short summary; tool input arrives intact.
// It affects only the caller's thread, so read-only sandboxes and plan mode may use it.
const SendToUserTool = Tool.make(SEND_TO_USER_TOOL_NAME, {
  description:
    "Show the user a Markdown message in this thread, exactly as written, before your turn ends. Use it for content the user must read in full mid-turn, such as a draft, a code block, or what a question you are about to ask refers to. Don't repeat it in your reply.",
  parameters: Schema.Struct({
    message: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(SEND_TO_USER_MAX_LENGTH),
    ).annotate({ description: "Markdown, shown verbatim." }),
  }),
  success: Schema.Struct({
    sentMessage: Schema.String,
    message: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
})
  .annotate(Tool.Title, "Send a message to the user")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients)
  // Claude Code defers MCP tools behind ToolSearch; Anthropic says to declare this from the first request.
  .annotate(Tool.Meta, { "anthropic/alwaysLoad": true });

const boundedText = (maxLength: number) =>
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(maxLength));
const NextStep = Schema.Struct({
  label: boundedText(NEXT_STEP_LABEL_MAX_LENGTH).annotate({
    description: 'Button text, a few words, e.g. "Commit & deploy".',
  }),
  prompt: boundedText(NEXT_STEP_PROMPT_MAX_LENGTH).annotate({
    description: "The message the user sends you by clicking it, written as the user.",
  }),
});

// Clients show the steps as buttons under the turn until the user sends another message.
const SuggestNextStepsTool = Tool.make(SUGGEST_NEXT_STEPS_TOOL_NAME, {
  description:
    "Offer the user the next steps as buttons they can click instead of typing. Call it once, at the end of a turn, only when the work has two or more distinct next steps the user would choose between, such as commit and deploy, or check a related file. Do not call it for open-ended questions or when the turn needs no follow-up. Still name the steps in your reply.",
  parameters: Schema.Struct({
    steps: Schema.Array(NextStep)
      .check(Schema.isMinLength(1), Schema.isMaxLength(MAX_NEXT_STEPS))
      .annotate({ description: "The steps, most likely first." }),
  }),
  success: Schema.Struct({
    nextSteps: Schema.Array(NextStep),
    message: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
})
  .annotate(Tool.Title, "Suggest next steps")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients)
  .annotate(Tool.Meta, { "anthropic/alwaysLoad": true });

export const MessageToolkit = Toolkit.make(SendToUserTool, SuggestNextStepsTool);
