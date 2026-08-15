import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Node } from "./types";

export const NODE_CONFIG_PATH = join(homedir(), ".config", "rdg");

export const register = async (nodeName: string) => {
  await mkdir(NODE_CONFIG_PATH, { recursive: true });
  const node: Node = { name: nodeName };
  await Bun.write(join(NODE_CONFIG_PATH, "node.json"), `${JSON.stringify(node, null, 2)}\n`);
};

export const registeredNode = async (): Promise<Node> => {
  const file = Bun.file(join(NODE_CONFIG_PATH, "node.json"));
  if (!(await file.exists())) {
    throw new Error(`Node is not registered. Missing ${join(NODE_CONFIG_PATH, "node.json")}`);
  }
  const node = (await file.json()) as Node;
  if (!node.name) {
    throw new Error("Registered node.json is missing a name");
  }
  return node;
};
