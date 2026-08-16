import { Command } from "clipanion";
import { requestJson } from "../client";
import { registeredNode } from "../register";
import { RemoteCommand } from "./remote";

export class NodeCommand extends RemoteCommand {
  static paths = [[`node`]];

  static usage = Command.Usage({
    description: `Print the registered node name`,
  });

  async execute() {
    const target = await this.target();
    const node =
      target.kind === "remote"
        ? await requestJson(target.host, "/node")
        : await registeredNode();
    this.context.stdout.write(`${JSON.stringify(node, null, 2)}\n`);
  }
}
