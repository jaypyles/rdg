import { Command } from "clipanion";
import { requestJson } from "../client";
import { runMaintenance } from "../scheduler/tasks/maintenance";
import { RemoteCommand } from "./remote";

const maintenanceTimeoutMs = Number(
  Bun.env.RDG_MAINTENANCE_TIMEOUT_MS ?? "3600000",
);

export class MaintenanceCommand extends RemoteCommand {
  static paths = [[`maintenance`]];

  static usage = Command.Usage({
    description: `Stop stacks, run the maintenance command, then start stacks`,
    examples: [
      [`Run maintenance on the default host`, `$0 maintenance`],
      [`Run maintenance on media`, `$0 -H media maintenance`],
      [`Run maintenance on this machine`, `$0 --local maintenance`],
    ],
  });

  async execute() {
    const target = await this.target();

    const result =
      target.kind === "remote"
        ? await requestJson(
            target.host,
            "/maintenance",
            { method: "POST" },
            maintenanceTimeoutMs,
          )
        : await runMaintenance();

    this.context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
};
