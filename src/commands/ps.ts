import { Command, Option } from "clipanion";
import { request } from "../client";
import { composePs } from "../compose";
import { formatPsTable } from "../format-ps";
import { withStacks } from "../handlers/helpers";
import { RemoteCommand } from "./remote";

export class PsCommand extends RemoteCommand {
  static paths = [[`ps`]];

  static usage = Command.Usage({
    description: `List containers on the target host`,
    examples: [
      [`Table`, `$0 ps`],
      [`Raw compose JSON`, `$0 ps --json`],
    ],
  });

  json = Option.Boolean(`--json`, false, {
    description: `Print docker compose JSON instead of a table`,
  });

  async execute() {
    const target = await this.target();
    const body =
      target.kind === "remote"
        ? await request(target.host, "/ps")
        : (await withStacks(composePs)).results.filter(Boolean).join("\n");

    if (this.json) {
      this.context.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
      return;
    }

    this.context.stdout.write(formatPsTable(body, this.context.colorDepth > 1));
  }
}
