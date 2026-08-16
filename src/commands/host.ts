import { Command, Option } from "clipanion";
import { addHost, readHosts, removeHost, setDefaultHost } from "../hosts";

const formatHosts = async () => {
  const data = await readHosts();
  const names = Object.keys(data.hosts).sort();
  if (names.length === 0) {
    return `No hosts in ~/.config/rdg/hosts.json\nAdd one with: rdg host add <name> <url>\n`;
  }
  return names
    .map((name) => {
      const host = data.hosts[name];
      const mark = data.default === name ? "*" : " ";
      const token = host.token ? " token" : "";
      return `${mark} ${name}\t${host.url}${token}\n`;
    })
    .join("");
};

export class HostListCommand extends Command {
  static paths = [[`host`], [`host`, `ls`], [`host`, `list`]];

  static usage = Command.Usage({
    description: `List hosts in ~/.config/rdg/hosts.json`,
  });

  async execute() {
    this.context.stdout.write(await formatHosts());
  }
}

export class HostAddCommand extends Command {
  static paths = [[`host`, `add`]];

  static usage = Command.Usage({
    description: `Save a gateway host for the master CLI`,
    examples: [
      [
        `Add a host and make it the default`,
        `$0 host add media http://192.168.1.10:6005 --token secret`,
      ],
    ],
  });

  name = Option.String();
  url = Option.String();
  token = Option.String(`--token`, {
    description: `Bearer token if the host sets RDG_TOKEN`,
  });
  makeDefault = Option.Boolean(`--default`, false);

  async execute() {
    await addHost(this.name, this.url, {
      token: this.token,
      makeDefault: this.makeDefault,
    });
    this.context.stdout.write(`added host ${this.name} (${this.url})\n`);
  }
}

export class HostRemoveCommand extends Command {
  static paths = [[`host`, `rm`], [`host`, `remove`]];

  static usage = Command.Usage({
    description: `Remove a saved host`,
  });

  name = Option.String();

  async execute() {
    await removeHost(this.name);
    this.context.stdout.write(`removed host ${this.name}\n`);
  }
}

export class HostUseCommand extends Command {
  static paths = [[`host`, `use`]];

  static usage = Command.Usage({
    description: `Set the default host for CLI commands`,
    examples: [[`Use media by default`, `$0 host use media`]],
  });

  name = Option.String();

  async execute() {
    await setDefaultHost(this.name);
    this.context.stdout.write(`default host is ${this.name}\n`);
  }
}
