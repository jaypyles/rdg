import { basename, dirname } from "node:path";
import { configDirAbs, isSharedComposeFile, sharedStackName } from "./paths";
import type { ComposeStack } from "./types";

const run = async (
  cmd: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
  stdoutOnly = false,
): Promise<string> => {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    proc.stdout.text(),
    proc.stderr.text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `${cmd.join(" ")} failed (${exitCode})`);
  }

  return (stdoutOnly ? stdout : stdout + stderr).trim();
};

export const projectName = (nodeName: string, composeFile: string): string => {
  const stack = isSharedComposeFile(composeFile)
    ? `shared-${sharedStackName(composeFile)}`
    : basename(composeFile).replace(/\.ya?ml$/i, "");

  return `rdg-${nodeName}-${stack}`.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
};

const normalizeName = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();

const stackAliases = (stack: ComposeStack): string[] => {
  const fileKey = basename(stack.file).replace(/\.ya?ml$/i, "");
  const aliases = [stack.project, fileKey];
  if (isSharedComposeFile(stack.file)) {
    aliases.push(sharedStackName(stack.file), `shared-${sharedStackName(stack.file)}`);
  }
  return aliases.map(normalizeName);
};

export const matchStack = (
  stacks: ComposeStack[],
  name: string,
): ComposeStack | null => {
  const needle = normalizeName(name);
  const hits = stacks.filter((stack) => {
    const aliases = stackAliases(stack);
    return aliases.includes(needle) || stack.project.toLowerCase().endsWith(`-${needle}`);
  });

  if (hits.length > 1) {
    throw new Error(
      `Ambiguous name "${name}" matches ${hits.map((stack) => stack.project).join(", ")}`,
    );
  }

  return hits[0] ?? null;
};

export const compose = async (
  composeFile: string,
  args: string[],
  nodeName: string,
  stdoutOnly = false,
): Promise<string> =>
  run(
    ["docker", "compose", "-p", projectName(nodeName, composeFile), "-f", composeFile, ...args],
    dirname(composeFile),
    {
      RDG_NODE: nodeName,
      RDG_CONFIG: configDirAbs(nodeName),
    },
    stdoutOnly,
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
  compose(composeFile, ["ps", "--format", "json"], nodeName, true);

export const composeLogs = (
  composeFile: string,
  nodeName: string,
  service?: string,
  tail = "100",
): Promise<string> =>
  compose(
    composeFile,
    ["logs", "--no-color", "--tail", tail, ...(service ? [service] : [])],
    nodeName,
  );

export const composeRestart = (
  composeFile: string,
  nodeName: string,
  service?: string,
  pull = false,
): Promise<string> => {
  if (pull) {
    return compose(
      composeFile,
      service
        ? ["up", "-d", "--pull", "always", "--force-recreate", "--no-deps", service]
        : ["up", "-d", "--pull", "always", "--force-recreate", "--remove-orphans"],
      nodeName,
    );
  }

  return compose(composeFile, service ? ["restart", service] : ["restart"], nodeName);
};

export const composeRestartFirstMatch = async (
  composeFiles: string[],
  nodeName: string,
  service: string,
): Promise<string> => {
  const stacks = composeFiles.map((file) => ({
    file,
    project: projectName(nodeName, file),
  }));
  const stack = matchStack(stacks, service);
  if (stack) {
    return composeRestart(stack.file, nodeName);
  }

  const errors: string[] = [];
  for (const file of composeFiles) {
    try {
      return await composeRestart(file, nodeName, service);
    } catch (error) {
      errors.push(
        `${basename(file)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(errors.join("\n") || `Service "${service}" not found`);
};
