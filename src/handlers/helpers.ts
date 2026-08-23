import { basename } from "node:path";
import { matchStack } from "../compose";
import { config } from "../config";
import { nodeStacks } from "../sync";

export const unauthorized = () =>
  Response.json({ error: "Unauthorized" }, { status: 401 });

export const requireAuth = (req: Request): boolean => {
  if (!config.token) {
    return true;
  }

  return req.headers.get("authorization") === `Bearer ${config.token}`;
};

export const jsonError = (error: unknown, status = 400) =>
  Response.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );

export const wantsPull = (req: Request): boolean => {
  const pull = new URL(req.url).searchParams.get("pull");
  return pull === "1" || pull === "true";
};

export const withStacks = async <T>(
  fn: (file: string, node: string) => Promise<T>,
): Promise<{ node: string; results: T[] }> => {
  const { node, stacks } = await nodeStacks();

  if (stacks.length === 0) {
    throw new Error("No compose yaml files found for this node");
  }

  const results: T[] = [];

  for (const stack of stacks) {
    results.push(await fn(stack.file, node));
  }

  return { node, results };
};

export const firstMatchingStack = async (
  fn: (file: string, node: string, service?: string) => Promise<string>,
  name?: string,
): Promise<string> => {
  const { node, stacks } = await nodeStacks();

  if (name) {
    const stack = matchStack(stacks, name);
    if (stack) {
      return fn(stack.file, node);
    }
  }

  const errors: string[] = [];

  for (const stack of stacks) {
    try {
      return await fn(stack.file, node, name);
    } catch (error) {
      errors.push(
        `${stack.project}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const available = stacks
    .map((stack) => basename(stack.file).replace(/\.ya?ml$/i, ""))
    .join(", ");
  throw new Error(
    errors.join("\n") ||
      (name
        ? `No stack or service named "${name}" (stacks: ${available})`
        : "No compose stacks found"),
  );
};
