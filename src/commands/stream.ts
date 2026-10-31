import { streamNdjson } from "../client";
import { printStreamEvent } from "../formatters/format-stream";
import type { RemoteHost, StreamEvent } from "../types";

export const foldStreamEvents = async (
  events: AsyncIterable<StreamEvent>,
  write: (line: string) => void,
): Promise<number> => {
  let ok = true;

  for await (const event of events) {
    if (!printStreamEvent(event, write)) {
      ok = false;
    }
  }

  return ok ? 0 : 1;
};

export const runRemoteStream = async (
  host: RemoteHost,
  path: string,
  write: (line: string) => void,
  init: RequestInit = { method: "POST" },
): Promise<number> => {
  let ok = true;

  await streamNdjson(host, path, init, (raw) => {
    if (!printStreamEvent(raw as StreamEvent, write)) {
      ok = false;
    }
  });

  return ok ? 0 : 1;
};
