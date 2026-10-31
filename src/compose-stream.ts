import { dirname } from "node:path";
import { composeRestartArgs, projectName } from "./compose";
import { configDirAbs } from "./paths";
import type { StreamEvent } from "./types";

type DockerEventPayload = {
  Type?: string;
  Action?: string;
  Actor?: {
    ID?: string;
    Attributes?: Record<string, string>;
  };
};

type PipeStream = ReadableStream<Uint8Array> | number | null | undefined;

const pipeReadable = (stream: PipeStream, label: string): ReadableStream<Uint8Array> => {
  if (stream == null || typeof stream === "number") {
    throw new Error(`${label} unavailable`);
  }

  return stream;
};

const readPipeText = async (stream: PipeStream): Promise<string> => {
  if (stream == null || typeof stream === "number") {
    return "";
  }

  return stream.text();
};

const spawnCompose = (
  composeFile: string,
  args: string[],
  nodeName: string,
): ReturnType<typeof Bun.spawn> =>
  Bun.spawn(
    ["docker", "compose", "-p", projectName(nodeName, composeFile), "-f", composeFile, ...args],
    {
      cwd: dirname(composeFile),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        RDG_NODE: nodeName,
        RDG_CONFIG: configDirAbs(nodeName),
      },
    },
  );

const spawnDockerEvents = (
  project: string,
  service: string | undefined,
  signal: AbortSignal,
): ReturnType<typeof Bun.spawn> => {
  const filters = [`label=com.docker.compose.project=${project}`];

  if (service) {
    filters.push(`label=com.docker.compose.service=${service}`);
  }

  return Bun.spawn(
    ["docker", "events", "--format", "{{json .}}", ...filters.flatMap((f) => ["--filter", f])],
    {
      stdout: "pipe",
      stderr: "pipe",
      signal,
    },
  );
};

async function* readLines(
  stream: ReadableStream<Uint8Array>,
  label: "stdout" | "stderr",
): AsyncGenerator<StreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (part.length === 0) {
          continue;
        }

        yield { type: "compose", stream: label, line: part };
      }
    }

    const tail = buffer.trim();

    if (tail.length > 0) {
      yield { type: "compose", stream: label, line: tail };
    }
  } finally {
    reader.releaseLock();
  }
}

const parseDockerEvent = (line: string): StreamEvent | null => {
  try {
    const payload = JSON.parse(line) as DockerEventPayload;

    if (payload.Type !== "container" || !payload.Action || !payload.Actor?.ID) {
      return null;
    }

    const attrs = payload.Actor.Attributes ?? {};

    return {
      type: "docker",
      action: payload.Action,
      id: payload.Actor.ID.slice(0, 12),
      name: attrs.name,
      status: attrs.status,
      health: attrs.health_status,
    };
  } catch {
    return null;
  }
};

async function* readDockerEvents(
  proc: ReturnType<typeof spawnDockerEvents>,
): AsyncGenerator<StreamEvent> {
  let eventsStdout: ReadableStream<Uint8Array>;

  try {
    eventsStdout = pipeReadable(proc.stdout, "docker events stdout");
  } catch {
    return;
  }

  const reader = eventsStdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const event = parseDockerEvent(part.trim());

        if (event) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* mergeStreams(
  left: AsyncGenerator<StreamEvent>,
  right: AsyncGenerator<StreamEvent>,
): AsyncGenerator<StreamEvent> {
  const leftIter = left[Symbol.asyncIterator]();
  const rightIter = right[Symbol.asyncIterator]();
  let leftPending = leftIter.next();
  let rightPending = rightIter.next();
  let leftOpen = true;
  let rightOpen = true;

  while (leftOpen || rightOpen) {
    const racers: Promise<{
      side: "left" | "right";
      result: IteratorResult<StreamEvent>;
    }>[] = [];

    if (leftOpen) {
      racers.push(leftPending.then((result) => ({ side: "left", result })));
    }

    if (rightOpen) {
      racers.push(rightPending.then((result) => ({ side: "right", result })));
    }

    if (racers.length === 0) {
      break;
    }

    const { side, result } = await Promise.race(racers);

    if (result.done) {
      if (side === "left") {
        leftOpen = false;
      } else {
        rightOpen = false;
      }

      continue;
    }

    yield result.value;

    if (side === "left") {
      leftPending = leftIter.next();
    } else {
      rightPending = rightIter.next();
    }
  }
}

function* drainQueued(events: StreamEvent[]): Generator<StreamEvent> {
  while (events.length > 0) {
    const next = events.shift();

    if (next) {
      yield next;
    }
  }
}

export async function* streamComposeRun(
  composeFile: string,
  args: string[],
  nodeName: string,
  watchProject: string,
  watchService?: string,
): AsyncGenerator<StreamEvent> {
  const eventsAbort = new AbortController();
  const eventsProc = spawnDockerEvents(watchProject, watchService, eventsAbort.signal);
  const composeProc = spawnCompose(composeFile, args, nodeName);

  let composeStdout: ReadableStream<Uint8Array>;
  let composeStderr: ReadableStream<Uint8Array>;

  try {
    composeStdout = pipeReadable(composeProc.stdout, "docker compose stdout");
    composeStderr = pipeReadable(composeProc.stderr, "docker compose stderr");
  } catch (error) {
    eventsAbort.abort();
    throw error;
  }

  const eventQueue: StreamEvent[] = [];

  const pumpEvents = (async () => {
    try {
      for await (const event of readDockerEvents(eventsProc)) {
        eventQueue.push(event);
      }
    } catch {
      // events stream closed
    }
  })();

  for await (const chunk of mergeStreams(
    readLines(composeStdout, "stdout"),
    readLines(composeStderr, "stderr"),
  )) {
    yield* drainQueued(eventQueue);
    yield chunk;
  }

  const [exitCode, stderrText] = await Promise.all([
    composeProc.exited,
    readPipeText(eventsProc.stderr),
  ]);

  const graceUntil = Date.now() + 750;

  while (Date.now() < graceUntil) {
    yield* drainQueued(eventQueue);
    await Bun.sleep(25);
  }

  eventsAbort.abort();
  await pumpEvents.catch(() => undefined);
  yield* drainQueued(eventQueue);

  if (exitCode !== 0) {
    const message = stderrText.trim() || `docker compose failed (${exitCode})`;
    yield { type: "error", message };
    yield { type: "done", ok: false };
    return;
  }

  yield { type: "done", ok: true };
}

export async function* streamComposeRestart(
  composeFile: string,
  nodeName: string,
  service?: string,
  pull = false,
): AsyncGenerator<StreamEvent> {
  const project = projectName(nodeName, composeFile);
  const args = composeRestartArgs(service, pull);

  yield { type: "stack", project, file: composeFile };

  yield* streamComposeRun(composeFile, args, nodeName, project, service);
}
