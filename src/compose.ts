import { dirname } from "node:path";

const run = async (cmd: string[], cwd?: string): Promise<string> => {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    proc.stdout.text(),
    proc.stderr.text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `${cmd.join(" ")} failed (${exitCode})`);
  }
  return (stdout + stderr).trim();
};

export const compose = async (composeFile: string, args: string[]): Promise<string> =>
  run(["docker", "compose", "-f", composeFile, ...args], dirname(composeFile));

export const composeUp = (composeFile: string): Promise<string> =>
  compose(composeFile, ["up", "-d", "--remove-orphans"]);

export const composePs = (composeFile: string): Promise<string> =>
  compose(composeFile, ["ps", "--format", "json"]);

export const composeLogs = (composeFile: string, service: string, tail = "100"): Promise<string> =>
  compose(composeFile, ["logs", "--no-color", "--tail", tail, service]);

export const composeRestart = (composeFile: string, service: string): Promise<string> =>
  compose(composeFile, ["restart", service]);
