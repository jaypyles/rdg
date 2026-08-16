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
