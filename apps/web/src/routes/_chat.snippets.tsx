import { createFileRoute } from "@tanstack/react-router";

import { SnippetsPage } from "../components/snippets/SnippetsPage";

export const Route = createFileRoute("/_chat/snippets")({
  component: SnippetsPage,
});
