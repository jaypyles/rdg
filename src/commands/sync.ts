import { Command } from "clipanion";
import { requestJson } from "../client";
import { sync } from "../sync";
import { RemoteCommand } from "./remote";

export class SyncCommand extends RemoteCommand {
  static paths = [[`sync`]];

  static usage = Command.Usage({
    description: `Fetch the compose repo and apply stacks on the target host`,
  });

  async execute() {
    const target = await this.target();
    const result =
      target.kind === "remote"
        ? await requestJson(target.host, "/sync", { method: "POST" })
        : await sync();
    this.context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
