import { Command } from "clipanion";
import { composePs } from "../compose";
import { request } from "../client";
import { withStacks } from "../handlers/helpers";
import { RemoteCommand } from "./remote";

export class PsCommand extends RemoteCommand {
  static paths = [[`ps`]];

  static usage = Command.Usage({
    description: `List containers on the target host`,
  });

  async execute() {
    const target = await this.target();
    if (target.kind === "remote") {
      const body = await request(target.host, "/ps");
      this.context.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
      return;
    }

    const { results } = await withStacks(composePs);
    const lines = results.flatMap((chunk) => chunk.split("\n").filter(Boolean));
    this.context.stdout.write(`${lines.join("\n")}\n`);
  }
}
