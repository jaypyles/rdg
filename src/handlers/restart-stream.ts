import { basename } from "node:path";
import { matchStack } from "../compose";
import { streamComposeRestart } from "../compose-stream";
import { nodeStacks } from "../sync";
import type { StreamEvent } from "../types";

async function* streamOneRestart(
  file: string,
  node: string,
  service: string | undefined,
  pull: boolean,
): AsyncGenerator<StreamEvent> {
  for await (const event of streamComposeRestart(file, node, service, pull)) {
    yield event;
  }
}

export async function* streamAllStacksRestart(pull: boolean): AsyncGenerator<StreamEvent> {
  const { node, stacks } = await nodeStacks();

  if (stacks.length === 0) {
    throw new Error("No compose yaml files found for this node");
  }

  const lines: string[] = [];

  for (const stack of stacks) {
    for await (const event of streamComposeRestart(stack.file, node, undefined, pull)) {
      if (event.type === "compose") {
        lines.push(event.line);
      }

      if (event.type === "done") {
        if (!event.ok) {
          yield event;
          return;
        }

        continue;
      }

      yield event;
    }
  }

  yield {
    type: "done",
    ok: true,
    node,
    pull,
    output: lines.filter(Boolean).join("\n"),
  };
}

export async function* streamMatchingRestart(
  name: string | undefined,
  pull: boolean,
): AsyncGenerator<StreamEvent> {
  const { node, stacks } = await nodeStacks();

  if (name) {
    const stack = matchStack(stacks, name);

    if (stack) {
      yield* streamOneRestart(stack.file, node, undefined, pull);
      return;
    }
  }

  const errors: string[] = [];

  for (const stack of stacks) {
    try {
      yield* streamOneRestart(stack.file, node, name, pull);
      return;
    } catch (error) {
      errors.push(`${stack.project}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const available = stacks.map((stack) => basename(stack.file).replace(/\.ya?ml$/i, "")).join(", ");
  const message =
    errors.join("\n") ||
    (name
      ? `No stack or service named "${name}" (stacks: ${available})`
      : "No compose stacks found");

  yield { type: "error", message };
  yield { type: "done", ok: false, pull };
}
