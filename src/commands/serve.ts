import { Command } from "clipanion";
import { startServer } from "../server";

export class ServeCommand extends Command {
  static paths = [[`serve`]];

  static usage = Command.Usage({
    description: `Start the HTTP gateway and sync schedule`,
    examples: [[`Start the server`, `$0 serve`]],
  });

  async execute() {
    startServer();
  }
}
