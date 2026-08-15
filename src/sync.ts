/*
 * Cache the last seen commit, fetch the compose repo, and only
 * docker compose up this node when a new commit touches its files.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { composeUp } from "./compose";
import { config } from "./config";
import { NODE_CONFIG_PATH, registeredNode } from "./register";
import type { SyncResult } from "./types";

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

const composePathFor = (nodeName: string): string =>
  config.composePath.replaceAll("{node}", nodeName);

const emptyResult = (node: string, extra: Partial<SyncResult> = {}): SyncResult => ({
  changed: false,
  applied: false,
  node,
  commit: null,
  previousCommit: null,
  changedFiles: [],
  output: "",
  ...extra,
});

export const composeFilePath = async (): Promise<string> => {
  const { name } = await registeredNode();
  return join(STACK_DIR, composePathFor(name));
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

const affectsThisNode = (files: string[] | null, composePath: string): boolean => {
  if (files === null) {
    return true;
  }
  const nodeDir = `${dirname(composePath)}/`;
  return files.some((file) => file === composePath || file.startsWith(nodeDir));
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
    const composePath = composePathFor(name);
    const file = join(STACK_DIR, composePath);

    if (previous?.commit === remoteCommit) {
      return emptyResult(name, { commit: remoteCommit, previousCommit: previous.commit });
    }

    const changedFiles = previous
      ? await changedFilesBetween(previous.commit, remoteCommit)
      : null;

    await git(["reset", "--hard", `origin/${config.composeBranch}`], STACK_DIR);

    if (!(await Bun.file(file).exists())) {
      throw new Error(`Compose file not found for node "${name}": ${composePath}`);
    }

    const shouldApply = !previous || affectsThisNode(changedFiles, composePath);
    let output = "";
    if (shouldApply) {
      output = await composeUp(file);
    }

    await cache({ timestamp: new Date().toISOString(), commit: remoteCommit });

    return {
      changed: true,
      applied: shouldApply,
      node: name,
      commit: remoteCommit,
      previousCommit: previous?.commit ?? null,
      changedFiles: changedFiles ?? [composePath],
      output,
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
          `sync applied ${result.node} @ ${result.commit}: ${(result.changedFiles ?? []).join(", ")}`,
        );
      }
    } catch (error) {
      console.error("scheduled sync failed", error);
    }
  };

  void tick();
  setInterval(() => void tick(), config.syncIntervalMs);
};
