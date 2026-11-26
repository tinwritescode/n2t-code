import { useGT } from "gt-react";
import { StickyNoteIcon } from "lucide-react";
import { Fragment } from "react";

import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Badge } from "../ui/badge";
import { snippetPromptParts } from "./snippetPrompt";

const PullRequestIcon = PullRequestGlyph.pullRequest;

/** A snippet's prompt with what it asks for at run time shown as slots, not placeholders. */
export function SnippetPromptPreview(props: { readonly prompt: string }) {
  const gt = useGT();
  return snippetPromptParts(props.prompt).map((part) =>
    part.kind === "text" ? (
      <Fragment key={part.at}>{part.text}</Fragment>
    ) : (
      <Badge key={part.at} variant="info" size="sm" className="mx-0.5">
        {part.kind === "pr" ? <PullRequestIcon aria-hidden /> : <StickyNoteIcon aria-hidden />}
        {part.kind === "pr" ? gt("Pull request") : gt("Notes")}
      </Badge>
    ),
  );
}
