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
  fn: (file: string, node: string) => Promise<string>,
): Promise<string> => {
  const { node, stacks } = await nodeStacks();
  const errors: string[] = [];

  for (const stack of stacks) {
    try {
      return await fn(stack.file, node);
    } catch (error) {
      errors.push(
        `${stack.project}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throw new Error(errors.join("\n") || "No compose stacks found");
};
