import { Command, Option } from "clipanion";
import { runTui } from "../tui/run";

export class TuiCommand extends Command {
  static paths = [[`tui`], [`ui`]];

  static usage = Command.Usage({
    description: `Live dashboard of hosts/nodes with collapsible service panels`,
    examples: [
      [`Open the dashboard`, `$0 tui`],
      [`Refresh every 2 seconds`, `$0 tui --interval 2`],
    ],
  });

  interval = Option.String(`--interval`, `5`, {
    description: `Refresh interval in seconds`,
  });

  async execute() {
    const seconds = Number(this.interval);

    if (!Number.isFinite(seconds) || seconds <= 0) {
      this.context.stderr.write(`Invalid --interval "${this.interval}"\n`);
      return 1;
    }

    // Use process stdio so raw-mode / pause on quit actually ends the process.
    // Clipanion's context streams can keep the event loop alive after `q`.
    const code = await runTui({
      intervalMs: Math.round(seconds * 1000),
      colorize: this.context.colorDepth > 1,
      stdout: process.stdout,
      stdin: process.stdin,
    });

    process.exitCode = code;
    return code;
  }
}
