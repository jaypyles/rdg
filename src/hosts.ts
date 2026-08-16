import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NODE_CONFIG_PATH } from "./register";
import type { HostsFile, RemoteHost } from "./types";

export const HOSTS_PATH = join(NODE_CONFIG_PATH, "hosts.json");

const emptyHosts = (): HostsFile => ({ hosts: {} });

export const readHosts = async (): Promise<HostsFile> => {
  const file = Bun.file(HOSTS_PATH);
  if (!(await file.exists())) {
    return emptyHosts();
  }
  const data = (await file.json()) as HostsFile;
  return {
    default: data.default,
    hosts: data.hosts ?? {},
  };
};

const writeHosts = async (data: HostsFile): Promise<void> => {
  await mkdir(NODE_CONFIG_PATH, { recursive: true });
  await Bun.write(HOSTS_PATH, `${JSON.stringify(data, null, 2)}\n`);
  await chmod(HOSTS_PATH, 0o600);
};

export const normalizeUrl = (url: string): string => {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Host URL must start with http:// or https:// (got "${url}")`);
  }
  return trimmed;
};

export const getHost = async (name: string): Promise<RemoteHost> => {
  const { hosts } = await readHosts();
  const host = hosts[name];
  if (!host) {
    throw new Error(
      `Unknown host "${name}". Add it with: rdg host add ${name} <url>`,
    );
  }
  return host;
};

export const addHost = async (
  name: string,
  url: string,
  opts: { token?: string; makeDefault?: boolean } = {},
): Promise<HostsFile> => {
  const data = await readHosts();
  const previous = data.hosts[name];
  const host: RemoteHost = { url: normalizeUrl(url) };
  const token = opts.token ?? previous?.token;
  if (token) {
    host.token = token;
  }
  data.hosts[name] = host;
  if (opts.makeDefault || !data.default) {
    data.default = name;
  }
  await writeHosts(data);
  return data;
};

export const removeHost = async (name: string): Promise<HostsFile> => {
  const data = await readHosts();
  if (!data.hosts[name]) {
    throw new Error(`Unknown host "${name}"`);
  }
  delete data.hosts[name];
  if (data.default === name) {
    const remaining = Object.keys(data.hosts);
    data.default = remaining[0];
  }
  await writeHosts(data);
  return data;
};

export const setDefaultHost = async (name: string): Promise<HostsFile> => {
  await getHost(name);
  const data = await readHosts();
  data.default = name;
  await writeHosts(data);
  return data;
};

export type Target =
  | { kind: "local" }
  | { kind: "remote"; name: string; host: RemoteHost };

export const resolveTarget = async (opts: {
  host?: string;
  local?: boolean;
}): Promise<Target> => {
  if (opts.local && opts.host) {
    throw new Error("Use either --host or --local, not both");
  }
  if (opts.local) {
    return { kind: "local" };
  }
  if (opts.host) {
    return { kind: "remote", name: opts.host, host: await getHost(opts.host) };
  }
  const data = await readHosts();
  if (data.default) {
    return {
      kind: "remote",
      name: data.default,
      host: await getHost(data.default),
    };
  }
  return { kind: "local" };
};
