export type Node = {
  name: string;
};

export type SyncResult = {
  changed: boolean;
  applied: boolean;
  node: string;
  commit: string | null;
  previousCommit: string | null;
  changedFiles: string[];
  output: string;
};
