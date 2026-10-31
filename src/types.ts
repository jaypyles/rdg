export type Node = {
  name: string;
};

export type RemoteHost = {
  url: string;
  token?: string;
};

export type HostsFile = {
  default?: string;
  hosts: Record<string, RemoteHost>;
};

export type ComposeStack = {
  file: string;
  project: string;
};

export type SyncResult = {
  changed: boolean;
  applied: boolean;
  node: string;
  commit: string | null;
  previousCommit: string | null;
  changedFiles: string[];
  appliedFiles: string[];
  restartedServices: string[];
  output: string;
};

export type StreamErrorEvent = { type: "error"; message: string };

export type StreamDoneEvent = {
  type: "done";
  ok: boolean;
  node?: string;
  pull?: boolean;
  output?: string;
};

export type StreamEvent =
  | { type: "stack"; project: string; file: string }
  | { type: "compose"; stream: "stdout" | "stderr"; line: string }
  | {
      type: "docker";
      action: string;
      id: string;
      name?: string;
      status?: string;
      health?: string;
    }
  | StreamErrorEvent
  | StreamDoneEvent;
