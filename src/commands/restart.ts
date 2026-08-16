import { Command, Option } from "clipanion";
import { composeRestart } from "../compose";
import { requestJson } from "../client";
import { firstMatchingStack, withStacks } from "../handlers/helpers";
import { RemoteCommand } from "./remote";

export class RestartCommand extends RemoteCommand {
  static paths = [[`restart`]];

  static usage = Command.Usage({
    description: `Restart every stack, or one service, on the target host`,
    examples: [
      [`Restart all stacks on the default host`, `$0 restart`],
      [`Restart nginx on media`, `$0 -H media restart nginx`],
    ],
  });

  service = Option.String({ required: false });

  async execute() {
    const target = await this.target();
    if (target.kind === "remote") {
      const path = this.service
        ? `/services/${encodeURIComponent(this.service)}/restart`
        : "/restart";
      const result = await requestJson(target.host, path, { method: "POST" });
      this.context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (this.service) {
      const output = await firstMatchingStack((file, node) =>
        composeRestart(file, node, this.service),
      );
      this.context.stdout.write(`${output}\n`);
      return;
    }

    const { node, results } = await withStacks((file, name) =>
      composeRestart(file, name),
    );
    this.context.stdout.write(
      `${JSON.stringify({ node, output: results.filter(Boolean).join("\n") }, null, 2)}\n`,
    );
  }
}
