export type Node = {
  name: string;
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
  output: string;
};
