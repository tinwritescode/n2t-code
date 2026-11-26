import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ModelSelection, ProjectId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useGT } from "gt-react";
import { XIcon } from "lucide-react";

import { useEnvironmentSettings } from "~/hooks/useSettings";
import { getCustomModelOptionsByInstance, selectsPlanAgent } from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { TraitsPicker } from "./TraitsPicker";

/**
 * A model picker, with the chosen model's traits such as thinking level, that can also be left on
 * the thread's model, which `null` stands for.
 */
export function OptionalModelPicker(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
  readonly selection: ModelSelection | null;
  readonly onChange: (selection: ModelSelection | null) => void;
}) {
  const gt = useGT();
  const settings = useEnvironmentSettings(props.environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(props.environmentId)) ??
    EMPTY_SERVER_PROVIDERS;
  const entries = providerInstanceEntriesFor(providers, settings, props.projectId);
  const { selection } = props;
  const instanceId = selection?.instanceId ?? entries[0]?.instanceId;
  if (instanceId === undefined) return null;
  const model = selection?.model ?? "";
  const entry =
    selection === null ? undefined : entries.find((each) => each.instanceId === instanceId);
  return (
    <>
      <ProviderModelPicker
        environmentId={props.environmentId}
        activeInstanceId={instanceId}
        model={model}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={getCustomModelOptionsByInstance(
          settings,
          providers,
          instanceId,
          model,
        )}
        isComposerOwned={false}
        compact
        {...(selection === null ? { triggerLabel: gt("Thread model") } : {})}
        onInstanceModelChange={(nextInstanceId, nextModel) =>
          props.onChange(createModelSelection(nextInstanceId, nextModel))
        }
      />
      {selection !== null && entry ? (
        <TraitsPicker
          provider={entry.driverKind}
          instanceId={instanceId}
          models={entry.models}
          model={model}
          modelOptions={selection.options ?? []}
          allowPromptInjectedEffort={false}
          includePlanAgent={selectsPlanAgent(selection.options)}
          onModelOptionsChange={(options) =>
            props.onChange(createModelSelection(instanceId, model, options))
          }
        />
      ) : null}
      {selection !== null ? (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={gt("Use the thread's model")}
          title={gt("Use the thread's model")}
          onClick={() => props.onChange(null)}
        >
          <XIcon />
        </Button>
      ) : null}
    </>
  );
}
