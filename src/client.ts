import type { RemoteHost } from "./types";

const timeoutMs = Number(Bun.env.RDG_HTTP_TIMEOUT_MS ?? "10000");
export const pullTimeoutMs = Number(Bun.env.RDG_PULL_TIMEOUT_MS ?? "600000");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const headersFor = (host: RemoteHost, init?: RequestInit["headers"]): Headers => {
  const headers = new Headers(init);

  if (host.token) {
    headers.set("authorization", `Bearer ${host.token}`);
  }

  return headers;
};

const connectError = (url: string, error: unknown): Error => {
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new Error(`Timed out after ${timeoutMs}ms waiting for ${url}`);
  }
  const cause = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to reach ${url}: ${cause}`);
};

export const request = async (
  host: RemoteHost,
  path: string,
  init: RequestInit = {},
  timeout = timeoutMs,
): Promise<string> => {
  const url = `${host.url.replace(/\/$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: headersFor(host, init.headers),
      signal: init.signal ?? AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw connectError(url, error);
  }

  const text = await res.text();
  if (!res.ok) {
    let message = text.trim() || res.statusText;
    try {
      const json = JSON.parse(text) as { error?: string };
      if (json.error) {
        message = json.error;
      }
    } catch {
      // keep text
    }
    throw new ApiError(message, res.status);
  }
  return text;
};

export const requestJson = async <T>(
  host: RemoteHost,
  path: string,
  init: RequestInit = {},
  timeout = timeoutMs,
): Promise<T> => {
  const headers = headersFor(host, init.headers);
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  const text = await request(host, path, { ...init, headers }, timeout);
  return JSON.parse(text) as T;
};
