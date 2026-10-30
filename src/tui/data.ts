import { request, requestJson } from "../client";
import { parsePs } from "../formatters/format-ps";
import { readHosts } from "../hosts";
import type { RemoteHost } from "../types";

export type ServiceRow = {
  name: string;
  service: string;
  project: string;
  state: string;
  health: string;
  ports: string;
  image: string;
};

export type HostSnapshot = {
  name: string;
  url: string;
  isDefault: boolean;
  reachable: boolean;
  health: string;
  node: string | null;
  error: string | null;
  services: ServiceRow[];
  fetchedAt: number;
};

export type DashboardSnapshot = {
  hosts: HostSnapshot[];
  fetchedAt: number;
};

type Publisher = {
  URL?: string;
  TargetPort?: number;
  PublishedPort?: number;
  Protocol?: string;
};

type ComposePsRow = {
  Name?: string;
  Service?: string;
  State?: string;
  Status?: string;
  Health?: string;
  Image?: string;
  Project?: string;
  Ports?: string;
  Publishers?: Publisher[];
};

const formatPorts = (row: ComposePsRow): string => {
  if (row.Ports?.trim()) {
    return row.Ports;
  }

  if (!row.Publishers?.length) {
    return "";
  }

  return row.Publishers.map((publisher) => {
    const proto = publisher.Protocol ?? "tcp";

    if (publisher.PublishedPort) {
      const host = publisher.URL || "0.0.0.0";
      return `${host}:${publisher.PublishedPort}->${publisher.TargetPort}/${proto}`;
    }

    return `${publisher.TargetPort}/${proto}`;
  }).join(", ");
};

const toServiceRow = (row: ComposePsRow): ServiceRow => ({
  name: row.Name ?? "",
  service: row.Service ?? "",
  project: row.Project ?? "",
  state: row.Status || row.State || "",
  health: row.Health ?? "",
  ports: formatPorts(row),
  image: row.Image ?? "",
});

const loadHost = async (
  name: string,
  host: RemoteHost,
  isDefault: boolean,
): Promise<HostSnapshot> => {
  const fetchedAt = Date.now();
  const base: HostSnapshot = {
    name,
    url: host.url,
    isDefault,
    reachable: false,
    health: "unknown",
    node: null,
    error: null,
    services: [],
    fetchedAt,
  };

  try {
    const health = await requestJson<{ status?: string }>(host, "/health");
    base.reachable = true;
    base.health = health.status ?? "ok";
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
    return base;
  }

  try {
    const node = await requestJson<{ name?: string }>(host, "/node");
    base.node = node.name ?? null;
  } catch {
    // /node may require auth or registration; health alone is enough.
  }

  try {
    const body = await request(host, "/ps");
    base.services = parsePs(body).map(toServiceRow);
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
  }

  return base;
};

export const loadDashboard = async (): Promise<DashboardSnapshot> => {
  const data = await readHosts();
  const names = Object.keys(data.hosts).sort();

  const hosts = await Promise.all(
    names.map((name) => loadHost(name, data.hosts[name], data.default === name)),
  );

  return { hosts, fetchedAt: Date.now() };
};
