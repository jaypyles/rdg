import { basename, dirname } from "node:path";

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

export const projectName = (nodeName: string, composeFile: string): string => {
  const stack = basename(composeFile).replace(/\.ya?ml$/i, "");
  return `rdg-${nodeName}-${stack}`.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
};

export const compose = async (
  composeFile: string,
  args: string[],
  nodeName: string,
): Promise<string> =>
  run(
    ["docker", "compose", "-p", projectName(nodeName, composeFile), "-f", composeFile, ...args],
    dirname(composeFile),
  );

export const composeUp = (composeFile: string, nodeName: string): Promise<string> =>
  compose(composeFile, ["up", "-d", "--remove-orphans"], nodeName);

export const composeDown = (composeFile: string, nodeName: string): Promise<string> =>
  compose(composeFile, ["down"], nodeName);

export const composeDownProject = async (nodeName: string, stackFileName: string): Promise<string> => {
  const project = projectName(nodeName, stackFileName);
  return run(["docker", "compose", "-p", project, "down"]);
};

export const composePs = (composeFile: string, nodeName: string): Promise<string> =>
  compose(composeFile, ["ps", "--format", "json"], nodeName);

export const composeLogs = (
  composeFile: string,
  nodeName: string,
  service: string,
  tail = "100",
): Promise<string> => compose(composeFile, ["logs", "--no-color", "--tail", tail, service], nodeName);

export const composeRestart = (
  composeFile: string,
  nodeName: string,
  service?: string,
): Promise<string> =>
  compose(composeFile, service ? ["restart", service] : ["restart"], nodeName);
