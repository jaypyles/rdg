#!/usr/bin/env bun
import { Builtins, Cli } from "clipanion";
import {
  HostAddCommand,
  HostListCommand,
  HostRemoveCommand,
  HostUseCommand,
} from "./commands/host";
import { LogsCommand } from "./commands/logs";
import { NodeCommand } from "./commands/node";
import { PsCommand } from "./commands/ps";
import { RegisterCommand } from "./commands/register";
import { RestartCommand } from "./commands/restart";
import { ServeCommand } from "./commands/serve";
import { SyncCommand } from "./commands/sync";

const cli = new Cli({
  binaryLabel: `Remote Docker Gateway`,
  binaryName: `rdg`,
  binaryVersion: `0.1.0`,
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(HostListCommand);
cli.register(HostAddCommand);
cli.register(HostRemoveCommand);
cli.register(HostUseCommand);
cli.register(ServeCommand);
cli.register(RegisterCommand);
cli.register(NodeCommand);
cli.register(SyncCommand);
cli.register(PsCommand);
cli.register(RestartCommand);
cli.register(LogsCommand);

await cli.runExit(process.argv.slice(2));
