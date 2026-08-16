import { Command, Option } from "clipanion";
import { resolveTarget, type Target } from "../hosts";

export abstract class RemoteCommand extends Command {
  hostName = Option.String(`-H,--host`, {
    description: `Host alias from ~/.config/rdg/hosts.json`,
  });

  local = Option.Boolean(`--local`, false, {
    description: `Run against this machine instead of a configured host`,
  });

  protected async target(): Promise<Target> {
    return resolveTarget({ host: this.hostName, local: this.local });
  }
}
