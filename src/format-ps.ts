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

const asRows = (value: unknown): ComposePsRow[] => {
  if (Array.isArray(value)) {
    return value.flatMap(asRows);
  }
  if (value && typeof value === "object") {
    return [value as ComposePsRow];
  }
  return [];
};

export const parsePs = (body: string): ComposePsRow[] => {
  const rows: ComposePsRow[] = [];
  let pending = "";

  for (const line of body.split("\n")) {
    const trimmed = line.trim();

    if (!pending) {
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        continue;
      }
      pending = trimmed;
    } else {
      pending += trimmed;
    }

    try {
      rows.push(...asRows(JSON.parse(pending) as unknown));
      pending = "";
    } catch {
      // Compose may split a value across lines; keep buffering.
    }
  }

  return rows;
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

const formatState = (row: ComposePsRow): string => {
  const state = row.Status || row.State || "";
  if (row.Health && !state.toLowerCase().includes(row.Health.toLowerCase())) {
    return `${state} (${row.Health})`;
  }
  return state;
};

const pad = (value: string, width: number): string =>
  value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;

const color = (value: string, code: string, enabled: boolean): string =>
  enabled ? `\u001b[${code}m${value}\u001b[0m` : value;

const colorState = (value: string, enabled: boolean): string => {
  const lower = value.toLowerCase();
  if (
    lower.includes("running") ||
    lower.includes("healthy") ||
    lower.includes("up")
  ) {
    return color(value, "32", enabled);
  }
  if (
    lower.includes("exit") ||
    lower.includes("dead") ||
    lower.includes("unhealthy")
  ) {
    return color(value, "31", enabled);
  }
  if (
    lower.includes("restart") ||
    lower.includes("paused") ||
    lower.includes("created")
  ) {
    return color(value, "33", enabled);
  }
  return value;
};

export const formatPsTable = (body: string, colorize = false): string => {
  let rows: ComposePsRow[];
  try {
    rows = parsePs(body);
  } catch {
    return body.endsWith("\n") ? body : `${body}\n`;
  }

  if (rows.length === 0) {
    return "No containers\n";
  }

  const table = rows.map((row) => ({
    NAME: row.Name ?? "",
    SERVICE: row.Service ?? "",
    PROJECT: row.Project ?? "",
    STATE: formatState(row),
    PORTS: formatPorts(row),
    IMAGE: row.Image ?? "",
  }));

  const cols = [
    "NAME",
    "SERVICE",
    "PROJECT",
    "STATE",
    "PORTS",
    "IMAGE",
  ] as const;
  const widths = Object.fromEntries(
    cols.map((col) => [
      col,
      Math.max(col.length, ...table.map((row) => row[col].length)),
    ]),
  ) as Record<(typeof cols)[number], number>;

  const line = (
    row: Record<(typeof cols)[number], string>,
    paint = false,
  ): string =>
    cols
      .map((col) => {
        const cell = pad(row[col], widths[col]);
        return paint && col === "STATE" ? colorState(cell, colorize) : cell;
      })
      .join("  ");

  const header = line({
    NAME: "NAME",
    SERVICE: "SERVICE",
    PROJECT: "PROJECT",
    STATE: "STATE",
    PORTS: "PORTS",
    IMAGE: "IMAGE",
  });
  const rule = cols.map((col) => "-".repeat(widths[col])).join("  ");
  return `${[header, rule, ...table.map((row) => line(row, true))].join("\n")}\n`;
};
