import { Command, Option } from "clipanion";
import { requestJson } from "../client";
import { register } from "../register";
import { RemoteCommand } from "./remote";

export class RegisterCommand extends RemoteCommand {
  static paths = [[`register`]];

  static usage = Command.Usage({
    description: `Register a node name on the target host`,
    examples: [
      [`Register this machine`, `$0 register media --local`],
      [`Register a remote gateway`, `$0 -H media register media`],
    ],
  });

  name = Option.String();

  async execute() {
    const target = await this.target();
    if (target.kind === "remote") {
      await requestJson(target.host, "/node", {
        method: "POST",
        body: JSON.stringify({ name: this.name }),
      });
      this.context.stdout.write(`registered ${this.name} on ${target.name}\n`);
      return;
    }
    await register(this.name);
    this.context.stdout.write(`registered ${this.name}\n`);
  }
}
