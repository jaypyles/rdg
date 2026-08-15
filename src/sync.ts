/*
 * Cache the last seen commit, fetch the compose repo, and only
 * docker compose up stacks on this node whose files changed.
 */

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { composeDownProject, composeUp, projectName } from "./compose";
import { config } from "./config";
import { NODE_CONFIG_PATH, registeredNode } from "./register";
import type { ComposeStack, SyncResult } from "./types";

const STACK_DIR = join(NODE_CONFIG_PATH, "stack");
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
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    proc.stdout.text(),
    proc.stderr.text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `${cmd[0]} failed (${exitCode})`);
  }
  return stdout.trim();
};

const git = (args: string[], cwd?: string): Promise<string> => {
  const cmd = ["git"];
  if (config.gitToken) {
    cmd.push("-c", `http.extraHeader=Authorization: Bearer ${config.gitToken}`);
  }
  return run([...cmd, ...args], cwd);
};

const repoUrl = (): string => {
  if (!config.composeRepo) {
    throw new Error("Set RDG_COMPOSE_REPO to the git URL that holds Compose files");
  }
  return config.composeRepo;
};

const isComposeFile = (path: string): boolean => /\.ya?ml$/i.test(path);

const composePathFor = (nodeName: string): string =>
  config.composePath.replaceAll("{node}", nodeName).replace(/\/$/, "");

export const nodeDirFor = (nodeName: string): string => {
  const path = composePathFor(nodeName);
  return isComposeFile(path) ? path.slice(0, path.lastIndexOf("/")) : path;
};

const emptyResult = (node: string, extra: Partial<SyncResult> = {}): SyncResult => ({
  changed: false,
  applied: false,
  node,
  commit: null,
  previousCommit: null,
  changedFiles: [],
  appliedFiles: [],
  output: "",
  ...extra,
});

export const listComposeFiles = async (nodeName: string): Promise<string[]> => {
  const dir = join(STACK_DIR, nodeDirFor(nodeName));
  const entries = await readdir(dir).catch(() => null);
  if (!entries) {
    throw new Error(`Compose directory not found for node "${nodeName}": ${nodeDirFor(nodeName)}`);
  }
  return entries
    .filter((name) => isComposeFile(name) && !name.startsWith("."))
    .sort()
    .map((name) => join(dir, name));
};

export const nodeStacks = async (): Promise<{ node: string; stacks: ComposeStack[] }> => {
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
    await git(["clone", "--branch", config.composeBranch, repoUrl(), STACK_DIR]);
    return;
  }
  await git(["fetch", "origin", config.composeBranch], STACK_DIR);
};

const changedFilesBetween = async (from: string, to: string): Promise<string[] | null> => {
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

    const remoteCommit = await git(["rev-parse", `origin/${config.composeBranch}`], STACK_DIR);
    const previous = await readCache();
    const nodeDir = nodeDirFor(name);

    if (previous?.commit === remoteCommit) {
      return emptyResult(name, { commit: remoteCommit, previousCommit: previous.commit });
    }

    const changedFiles = previous
      ? await changedFilesBetween(previous.commit, remoteCommit)
      : null;

    await git(["reset", "--hard", `origin/${config.composeBranch}`], STACK_DIR);

    const stacks = await listComposeFiles(name);
    const nodePrefix = `${nodeDir}/`;
    const inNodeDir = (file: string) => file === nodeDir || file.startsWith(nodePrefix);
    const nodeChanges = changedFiles?.filter(inNodeDir) ?? null;
    const sharedChanged = nodeChanges?.some((file) => !isComposeFile(file)) ?? false;

    const toUp = stacks.filter((file) => {
      if (!previous || nodeChanges === null) {
        return true;
      }
      if (nodeChanges.length === 0) {
        return false;
      }
      const rel = file.slice(STACK_DIR.length + 1);
      return sharedChanged || nodeChanges.includes(rel);
    });

    const toDown =
      nodeChanges?.filter((file) => {
        if (!isComposeFile(file)) {
          return false;
        }
        const abs = join(STACK_DIR, file);
        return !stacks.includes(abs);
      }) ?? [];

    const outputs: string[] = [];
    for (const file of toDown) {
      outputs.push(await composeDownProject(name, file));
    }
    for (const file of toUp) {
      outputs.push(await composeUp(file, name));
    }

    await cache({ timestamp: new Date().toISOString(), commit: remoteCommit });

    const appliedFiles = [...toDown, ...toUp.map((file) => file.slice(STACK_DIR.length + 1))];
    return {
      changed: true,
      applied: appliedFiles.length > 0,
      node: name,
      commit: remoteCommit,
      previousCommit: previous?.commit ?? null,
      changedFiles: changedFiles ?? stacks.map((file) => file.slice(STACK_DIR.length + 1)),
      appliedFiles,
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
          `sync applied ${result.node} @ ${result.commit}: ${result.appliedFiles.join(", ")}`,
        );
      }
    } catch (error) {
      console.error("scheduled sync failed", error);
    }
  };

  void tick();
  setInterval(() => void tick(), config.syncIntervalMs);
};
