/*
 * Cache the last seen commit, fetch the compose repo, and only
 * docker compose up stacks on this node whose files changed.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  composeDownProject,
  composeRestartFirstMatch,
  composeUp,
  projectName,
} from "./compose";
import { config } from "./config";
import {
  STACK_DIR,
  configPathFor,
  inDir,
  isComposeFile,
  isSharedComposeFile,
  listConfigServices,
  listNodeComposeFiles,
  listSharedComposeFiles,
  nodeDirFor,
  serviceFromConfigFile,
  sharedPathFor,
  sharedStackName,
  toRepoPath,
} from "./paths";
import { NODE_CONFIG_PATH, registeredNode } from "./register";
import type { ComposeStack, SyncResult } from "./types";

const CACHE_PATH = join(NODE_CONFIG_PATH, "compose.cache.json");

type CachedApply = {
  timestamp: string;
  commit: string;
};

const run = async (cmd: string[], cwd?: string): Promise<string> => {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    proc.stdout.text(),
    proc.stderr.text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(
      stderr.trim() || stdout.trim() || `${cmd[0]} failed (${exitCode})`,
    );
  }

  return stdout.trim();
};

const git = (args: string[], cwd?: string): Promise<string> => {
  const cmd = ["git"];
  if (config.gitToken) {
    cmd.push(
      "-c",
      `url.https://x-access-token:${config.gitToken}@github.com/.insteadOf=https://github.com/`,
    );
  }

  return run([...cmd, ...args], cwd);
};

const repoUrl = (): string => {
  if (!config.composeRepo) {
    throw new Error(
      "Set RDG_COMPOSE_REPO to the git URL that holds Compose files",
    );
  }

  return config.composeRepo;
};

const emptyResult = (
  node: string,
  extra: Partial<SyncResult> = {},
): SyncResult => ({
  changed: false,
  applied: false,
  node,
  commit: null,
  previousCommit: null,
  changedFiles: [],
  appliedFiles: [],
  restartedServices: [],
  output: "",
  ...extra,
});

export const listComposeFiles = async (nodeName: string): Promise<string[]> => {
  const nodeFiles = await listNodeComposeFiles(nodeName);
  const sharedFiles = await listSharedComposeFiles();
  const files = [...sharedFiles, ...nodeFiles];
  if (files.length === 0) {
    throw new Error(
      `No compose yaml files found for node "${nodeName}" (checked ${nodeDirFor(nodeName)} and ${sharedPathFor()})`,
    );
  }
  return files;
};

export const nodeStacks = async (): Promise<{
  node: string;
  stacks: ComposeStack[];
}> => {
  const { name } = await registeredNode();
  const files = await listComposeFiles(name);
  return {
    node: name,
    stacks: files.map((file) => ({ file, project: projectName(name, file) })),
  };
};

export const cache = async (entry: CachedApply): Promise<void> => {
  await mkdir(NODE_CONFIG_PATH, { recursive: true });
  await Bun.write(CACHE_PATH, `${JSON.stringify(entry, null, 2)}\n`);
};

export const readCache = async (): Promise<CachedApply | null> => {
  const file = Bun.file(CACHE_PATH);
  if (!(await file.exists())) {
    return null;
  }
  return (await file.json()) as CachedApply;
};

const ensureRepo = async (): Promise<void> => {
  await mkdir(NODE_CONFIG_PATH, { recursive: true });
  if (!(await Bun.file(join(STACK_DIR, ".git", "HEAD")).exists())) {
    await git([
      "clone",
      "--branch",
      config.composeBranch,
      repoUrl(),
      STACK_DIR,
    ]);
    return;
  }

  await git(["fetch", "origin", config.composeBranch], STACK_DIR);
};

const changedFilesBetween = async (
  from: string,
  to: string,
): Promise<string[] | null> => {
  try {
    const out = await git(["diff", "--name-only", from, to], STACK_DIR);
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return null;
  }
};

let syncing = false;

export const sync = async (): Promise<SyncResult> => {
  if (syncing) {
    const { name } = await registeredNode();
    return emptyResult(name, { output: "sync already in progress" });
  }

  syncing = true;

  try {
    const { name } = await registeredNode();
    await ensureRepo();

    const remoteCommit = await git(
      ["rev-parse", `origin/${config.composeBranch}`],
      STACK_DIR,
    );

    const previous = await readCache();
    const nodeDir = nodeDirFor(name);

    if (previous?.commit === remoteCommit) {
      return emptyResult(name, {
        commit: remoteCommit,
        previousCommit: previous.commit,
      });
    }

    const changedFiles = previous
      ? await changedFilesBetween(previous.commit, remoteCommit)
      : null;

    await git(["reset", "--hard", `origin/${config.composeBranch}`], STACK_DIR);

    const stacks = await listComposeFiles(name);
    const configDir = configPathFor(name);
    const sharedDir = sharedPathFor();
    const nodeChanges =
      changedFiles?.filter(
        (file) =>
          inDir(file, nodeDir) ||
          inDir(file, configDir) ||
          inDir(file, sharedDir),
      ) ?? null;
    const nodeSharedChanged =
      nodeChanges?.some(
        (file) => inDir(file, nodeDir) && !isComposeFile(file),
      ) ?? false;
    const sharedRootChanged =
      nodeChanges?.some((file) => {
        if (file === sharedDir) {
          return true;
        }
        if (!inDir(file, sharedDir)) {
          return false;
        }
        const rest = file.slice(sharedDir.length + 1);
        return !rest.includes("/") && !isComposeFile(rest);
      }) ?? false;

    const toUp = stacks.filter((file) => {
      if (!previous || nodeChanges === null) {
        return true;
      }
      if (nodeChanges.length === 0) {
        return false;
      }
      const rel = toRepoPath(file);
      if (isSharedComposeFile(rel)) {
        if (sharedRootChanged || nodeChanges.includes(rel)) {
          return true;
        }
        const stack = sharedStackName(rel);
        return nodeChanges.some(
          (changed) =>
            inDir(changed, sharedDir) && sharedStackName(changed) === stack,
        );
      }
      return nodeSharedChanged || nodeChanges.includes(rel);
    });

    const toDown =
      nodeChanges?.filter((file) => {
        if (!isComposeFile(file)) {
          return false;
        }
        if (!inDir(file, nodeDir) && !inDir(file, sharedDir)) {
          return false;
        }
        const abs = join(STACK_DIR, file);
        return !stacks.includes(abs);
      }) ?? [];

    const configServices = (
      previous && nodeChanges === null
        ? await listConfigServices(name)
        : [
            ...new Set(
              (nodeChanges ?? [])
                .map((file) => serviceFromConfigFile(file, name))
                .filter((service): service is string => service !== null),
            ),
          ]
    ).sort();

    const outputs: string[] = [];
    for (const file of toDown) {
      outputs.push(await composeDownProject(name, file));
    }
    for (const file of toUp) {
      outputs.push(await composeUp(file, name));
    }

    const restartedServices: string[] = [];
    if (previous && configServices.length > 0) {
      for (const service of configServices) {
        outputs.push(await composeRestartFirstMatch(stacks, name, service));
        restartedServices.push(service);
      }
    }

    await cache({ timestamp: new Date().toISOString(), commit: remoteCommit });

    const appliedFiles = [...toDown, ...toUp.map((file) => toRepoPath(file))];
    return {
      changed: true,
      applied: appliedFiles.length > 0 || restartedServices.length > 0,
      node: name,
      commit: remoteCommit,
      previousCommit: previous?.commit ?? null,
      changedFiles: changedFiles ?? stacks.map((file) => toRepoPath(file)),
      appliedFiles,
      restartedServices,
      output: outputs.filter(Boolean).join("\n"),
    };
  } finally {
    syncing = false;
  }
};

export const startSyncSchedule = (): void => {
  if (config.syncIntervalMs <= 0) {
    return;
  }

  const tick = async () => {
    try {
      await registeredNode();
    } catch {
      return;
    }

    if (!config.composeRepo) {
      return;
    }

    try {
      const result = await sync();

      if (result.applied) {
        console.log(
          `sync applied ${result.node} @ ${result.commit}: ${[
            ...result.appliedFiles,
            ...result.restartedServices.map((service) => `restart:${service}`),
          ].join(", ")}`,
        );
      } else if (result.output === "sync already in progress") {
        console.log(`sync skipped ${result.node}: already in progress`);
      } else if (!result.changed) {
        console.log(
          `sync idle ${result.node} @ ${result.commit}: nothing to apply`,
        );
      } else {
        console.log(
          `sync idle ${result.node} @ ${result.commit}: no stacks or configs for this node`,
        );
      }
    } catch (error) {
      console.error("scheduled sync failed", error);
    }
  };

  void tick();
  setInterval(() => void tick(), config.syncIntervalMs);
};
