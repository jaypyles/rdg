import { Command, Option } from "clipanion";
import { resolveTarget, type Target } from "../hosts";
import type { RemoteHost, StreamEvent } from "../types";
import { foldStreamEvents, runRemoteStream } from "./stream";

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

  protected writeStreamLine(line: string): void {
    this.context.stdout.write(line);
  }

  protected runLocalStream(events: AsyncIterable<StreamEvent>): Promise<number> {
    return foldStreamEvents(events, (line) => this.writeStreamLine(line));
  }

  protected runRemoteStream(
    host: RemoteHost,
    path: string,
    init: RequestInit = { method: "POST" },
  ): Promise<number> {
    return runRemoteStream(host, path, (line) => this.writeStreamLine(line), init);
  }
}
