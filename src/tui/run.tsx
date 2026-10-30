import { render, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import type { Readable, Writable } from "node:stream";
import { loadDashboard, type DashboardSnapshot } from "./data";
import { Dashboard, defaultExpanded } from "./view";

type TtyStream = {
  isTTY?: boolean;
};

export type RunTuiOptions = {
  intervalMs?: number;
  colorize?: boolean;
  stdout?: Writable;
  stdin?: Readable;
};

const loadSnapshot = async (): Promise<DashboardSnapshot> => {
  try {
    return await loadDashboard();
  } catch (error) {
    return {
      hosts: [
        {
          name: "error",
          url: "",
          isDefault: false,
          reachable: false,
          health: "error",
          node: null,
          error: error instanceof Error ? error.message : String(error),
          services: [],
          fetchedAt: Date.now(),
        },
      ],
      fetchedAt: Date.now(),
    };
  }
};

const syncExpanded = (
  previousHosts: DashboardSnapshot["hosts"],
  next: DashboardSnapshot,
  expanded: ReadonlySet<string>,
): Set<string> => {
  const previous = new Set(previousHosts.map((host) => host.name));
  const names = new Set(next.hosts.map((host) => host.name));
  const kept = new Set([...expanded].filter((name) => names.has(name)));

  for (const host of next.hosts) {
    if (!previous.has(host.name)) {
      kept.add(host.name);
    }
  }

  return kept;
};

type AppProps = {
  initialSnapshot: DashboardSnapshot;
  intervalMs: number;
  colorize: boolean;
  interactive: boolean;
};

const App = ({
  initialSnapshot,
  intervalMs,
  colorize,
  interactive,
}: AppProps) => {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(() =>
    defaultExpanded(initialSnapshot),
  );
  const loading = useRef(false);
  const closed = useRef(false);
  const snapshotRef = useRef(snapshot);
  const expandedRef = useRef(expanded);

  snapshotRef.current = snapshot;
  expandedRef.current = expanded;

  const refresh = async () => {
    if (loading.current || closed.current) {
      return;
    }

    loading.current = true;

    try {
      const next = await loadSnapshot();

      if (closed.current) {
        return;
      }

      setExpanded(
        syncExpanded(snapshotRef.current.hosts, next, expandedRef.current),
      );
      setSnapshot(next);
    } finally {
      loading.current = false;
    }
  };

  useEffect(() => {
    if (!interactive) {
      return;
    }

    const timer = setInterval(() => {
      void refresh();
    }, intervalMs);

    return () => {
      closed.current = true;
      clearInterval(timer);
    };
  }, [intervalMs, interactive]);

  useInput(
    (input, key) => {
      if (input === "q" || input === "Q") {
        closed.current = true;
        exit();
        return;
      }

      if (input === "r" || input === "R") {
        void refresh();
        return;
      }

      if (input === "a" || input === "A") {
        setExpanded(new Set(snapshot.hosts.map((host) => host.name)));
        return;
      }

      if (input === "c" || input === "C") {
        setExpanded(new Set());
        return;
      }

      if (key.downArrow || input === "j" || input === "J") {
        if (snapshot.hosts.length === 0) {
          return;
        }

        setSelected((value) => (value + 1) % snapshot.hosts.length);
        return;
      }

      if (key.upArrow || input === "k" || input === "K") {
        if (snapshot.hosts.length === 0) {
          return;
        }

        setSelected(
          (value) =>
            (value - 1 + snapshot.hosts.length) % snapshot.hosts.length,
        );
        return;
      }

      if (input === " " || key.return) {
        const host = snapshot.hosts[selected];

        if (!host) {
          return;
        }

        setExpanded((prev) => {
          const next = new Set(prev);

          if (next.has(host.name)) {
            next.delete(host.name);
          } else {
            next.add(host.name);
          }

          return next;
        });
      }
    },
    { isActive: interactive },
  );

  const clamped =
    snapshot.hosts.length === 0
      ? 0
      : Math.max(0, Math.min(selected, snapshot.hosts.length - 1));

  return (
    <Dashboard
      snapshot={snapshot}
      selected={clamped}
      expanded={expanded}
      intervalMs={intervalMs}
      colorize={colorize}
    />
  );
};

export const runTui = async (opts: RunTuiOptions = {}): Promise<number> => {
  const intervalMs = opts.intervalMs ?? 5000;
  const colorize = opts.colorize ?? true;
  const stdout = (opts.stdout ?? process.stdout) as Writable & TtyStream;
  const stdin = (opts.stdin ?? process.stdin) as Readable & TtyStream;
  const interactive = Boolean(stdout.isTTY && stdin.isTTY);

  if (interactive) {
    stdout.write("Loading hosts…\n");
  }

  const initialSnapshot = await loadSnapshot();

  const instance = render(
    <App
      initialSnapshot={initialSnapshot}
      intervalMs={intervalMs}
      colorize={interactive ? colorize : false}
      interactive={interactive}
    />,
    {
      stdout: stdout as NodeJS.WriteStream,
      stdin: stdin as NodeJS.ReadStream,
      alternateScreen: interactive,
      exitOnCtrlC: true,
      interactive,
    },
  );

  if (!interactive) {
    instance.unmount();
  }

  await instance.waitUntilExit();

  // In-flight host fetches otherwise keep Bun's event loop alive after quit.
  process.exit(0);
};
