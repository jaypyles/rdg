import { Command, Option } from "clipanion";
import { composeRestart } from "../compose";
import { pullTimeoutMs, requestJson } from "../client";
import { firstMatchingStack, withStacks } from "../handlers/helpers";
import { RemoteCommand } from "./remote";

export class RestartCommand extends RemoteCommand {
  static paths = [[`restart`]];

  static usage = Command.Usage({
    description: `Restart every stack, or one service, on the target host`,
    examples: [
      [`Restart all stacks on the default host`, `$0 restart`],
      [`Restart nginx on media`, `$0 -H media restart nginx`],
      [`Pull latest and recreate nginx`, `$0 restart nginx --pull`],
    ],
  });

  service = Option.String({ required: false });
  pull = Option.Boolean(`--pull`, false, {
    description: `Pull images and recreate containers (needed for :latest)`,
  });

  async execute() {
    const target = await this.target();
    if (target.kind === "remote") {
      const query = this.pull ? "?pull=true" : "";
      const path = this.service
        ? `/services/${encodeURIComponent(this.service)}/restart${query}`
        : `/restart${query}`;
      const result = await requestJson(
        target.host,
        path,
        { method: "POST" },
        this.pull ? pullTimeoutMs : undefined,
      );
      this.context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (this.service) {
      const output = await firstMatchingStack((file, node) =>
        composeRestart(file, node, this.service, this.pull),
      );
      this.context.stdout.write(`${output}\n`);
      return;
    }

    const { node, results } = await withStacks((file, name) =>
      composeRestart(file, name, undefined, this.pull),
    );
    this.context.stdout.write(
      `${JSON.stringify({ node, pull: this.pull, output: results.filter(Boolean).join("\n") }, null, 2)}\n`,
    );
  }
}
