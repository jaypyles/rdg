import { Command, Option } from "clipanion";
import { composeLogs } from "../compose";
import { request } from "../client";
import { firstMatchingStack } from "../handlers/helpers";
import { RemoteCommand } from "./remote";

export class LogsCommand extends RemoteCommand {
  static paths = [[`logs`]];

  static usage = Command.Usage({
    description: `Print logs for a service on the target host`,
    examples: [[`Last 100 lines on media`, `$0 -H media logs nginx --tail 100`]],
  });

  service = Option.String();
  tail = Option.String(`--tail`, `100`);

  async execute() {
    const target = await this.target();

    if (target.kind === "remote") {
      const query = new URLSearchParams({ tail: this.tail });
      const body = await request(
        target.host,
        `/services/${encodeURIComponent(this.service)}/logs?${query}`,
      );

      this.context.stdout.write(body.endsWith("\n") ? body : `${body}\n`);

      return;
    }

    const output = await firstMatchingStack((file, node) =>
      composeLogs(file, node, this.service, this.tail),
    );

    this.context.stdout.write(`${output}\n`);
  }
}
