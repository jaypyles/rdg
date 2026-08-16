import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";
import { NODE_CONFIG_PATH } from "./register";

export const STACK_DIR = join(NODE_CONFIG_PATH, "stack");

export const isComposeFile = (path: string): boolean => /\.ya?ml$/i.test(path);

const interpolateNode = (template: string, nodeName: string): string =>
  template.replaceAll("{node}", nodeName).replace(/\/$/, "");

export const composePathFor = (nodeName: string): string =>
  interpolateNode(config.composePath, nodeName);

export const nodeDirFor = (nodeName: string): string => {
  const path = composePathFor(nodeName);
  return isComposeFile(path) ? path.slice(0, path.lastIndexOf("/")) : path;
};

export const configPathFor = (nodeName: string): string =>
  interpolateNode(config.configPath, nodeName);

export const configDirAbs = (nodeName: string): string =>
  join(STACK_DIR, configPathFor(nodeName));

export const sharedPathFor = (): string => config.sharedPath.replace(/\/$/, "");

export const toRepoPath = (file: string): string => {
  const normalized = file.replace(/\\/g, "/");
  const root = STACK_DIR.replace(/\\/g, "/");
  if (normalized === root) {
    return "";
  }
  if (normalized.startsWith(`${root}/`)) {
    return normalized.slice(root.length + 1);
  }
  return normalized.replace(/^\.\//, "");
};

export const inDir = (file: string, dir: string): boolean =>
  file === dir || file.startsWith(`${dir}/`);

export const isSharedComposeFile = (file: string): boolean =>
  inDir(toRepoPath(file), sharedPathFor());

export const sharedStackName = (composeFile: string): string => {
  const rest = toRepoPath(composeFile).slice(sharedPathFor().length + 1);
  const [first] = rest.split("/");
  return (first ?? rest).replace(/\.ya?ml$/i, "");
};

const yamlFilesIn = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && isComposeFile(entry.name) && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => join(dir, entry.name));
};

export const listNodeComposeFiles = async (nodeName: string): Promise<string[]> =>
  yamlFilesIn(join(STACK_DIR, nodeDirFor(nodeName)));

export const listSharedComposeFiles = async (): Promise<string[]> => {
  const dir = join(STACK_DIR, sharedPathFor());
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isFile() && isComposeFile(entry.name)) {
      files.push(join(dir, entry.name));
    } else if (entry.isDirectory()) {
      files.push(...(await yamlFilesIn(join(dir, entry.name))));
    }
  }
  return files;
};

export const serviceFromConfigFile = (
  file: string,
  nodeName: string,
): string | null => {
  const prefix = `${configPathFor(nodeName)}/`;

  if (!file.startsWith(prefix)) {
    return null;
  }

  const [service] = file.slice(prefix.length).split("/");

  if (!service || service.startsWith(".")) {
    return null;
  }

  return service;
};

export const listConfigServices = async (nodeName: string): Promise<string[]> => {
  const entries = await readdir(configDirAbs(nodeName), { withFileTypes: true }).catch(
    () => null,
  );

  if (!entries) {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
};
