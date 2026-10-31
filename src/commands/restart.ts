import { Command, Option } from "clipanion";
import { streamAllStacksRestart, streamMatchingRestart } from "../handlers/restart-stream";
import { streamQuery } from "../stream-http";
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
    const query = streamQuery({ pull: this.pull });
    const path = this.service
      ? `/services/${encodeURIComponent(this.service)}/restart${query}`
      : `/restart${query}`;

    if (target.kind === "remote") {
      return this.runRemoteStream(target.host, path);
    }

    if (this.service) {
      return this.runLocalStream(streamMatchingRestart(this.service, this.pull));
    }

    return this.runLocalStream(streamAllStacksRestart(this.pull));
  }
}
