import { Box, Text } from "ink";
import type { DashboardSnapshot, HostSnapshot, ServiceRow } from "./data";

export type DashboardProps = {
  snapshot: DashboardSnapshot;
  selected: number;
  expanded: ReadonlySet<string>;
  intervalMs: number;
  colorize: boolean;
};

const ago = (ms: number): string => {
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));

  if (sec < 1) {
    return "just now";
  }

  if (sec < 60) {
    return `${sec}s ago`;
  }

  return `${Math.floor(sec / 60)}m ago`;
};

const serviceCounts = (host: HostSnapshot): string => {
  if (!host.reachable) {
    return "offline";
  }

  const total = host.services.length;

  if (total === 0) {
    return "0 services";
  }

  const unhealthy = host.services.filter((row) => {
    const label = `${row.state} ${row.health}`.toLowerCase();

    return label.includes("unhealthy") || label.includes("exit") || label.includes("dead");
  }).length;

  if (unhealthy > 0) {
    return `${total} services · ${unhealthy} bad`;
  }

  return `${total} services`;
};

const healthColor = (value: string, colorize: boolean): string | undefined => {
  if (!colorize) {
    return undefined;
  }

  const lower = value.toLowerCase();

  if (lower.includes("healthy") || lower === "ok") {
    return "green";
  }

  if (lower.includes("unhealthy") || lower.includes("error")) {
    return "red";
  }

  return "yellow";
};

const stateColor = (state: string, health: string, colorize: boolean): string | undefined => {
  if (!colorize) {
    return undefined;
  }

  const label = `${state} ${health}`.toLowerCase();

  if (label.includes("running") || label.includes("healthy") || label.includes("up")) {
    return "green";
  }

  if (label.includes("exit") || label.includes("dead") || label.includes("unhealthy")) {
    return "red";
  }

  if (label.includes("restart") || label.includes("paused") || label.includes("created")) {
    return "yellow";
  }

  return undefined;
};

const stateLabel = (state: string, health: string): string => {
  if (health && !state.toLowerCase().includes(health.toLowerCase())) {
    return `${state} (${health})`;
  }

  return state;
};

const truncate = (value: string, width: number): string => {
  if (value.length <= width) {
    return value;
  }

  if (width <= 1) {
    return value.slice(0, width);
  }

  return `${value.slice(0, width - 1)}…`;
};

const columnWidths = (
  services: ServiceRow[],
): { name: number; service: number; state: number; ports: number } => {
  const name = Math.min(
    28,
    Math.max(8, ...services.map((row) => (row.name || row.service || "—").length), 4),
  );
  const service = Math.min(
    18,
    Math.max(7, ...services.map((row) => (row.service || "—").length), 7),
  );
  const state = Math.min(
    24,
    Math.max(8, ...services.map((row) => stateLabel(row.state, row.health).length), 5),
  );
  const ports = Math.min(36, Math.max(5, ...services.map((row) => (row.ports || "—").length), 5));

  return { name, service, state, ports };
};

const ServiceTable = ({ services, colorize }: { services: ServiceRow[]; colorize: boolean }) => {
  if (services.length === 0) {
    return <Text dimColor={colorize}>(no containers)</Text>;
  }

  const widths = columnWidths(services);

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={widths.name}>
          <Text dimColor={colorize}>NAME</Text>
        </Box>
        <Box width={widths.service + 2}>
          <Text dimColor={colorize}> SERVICE</Text>
        </Box>
        <Box width={widths.state + 2}>
          <Text dimColor={colorize}> STATE</Text>
        </Box>
        <Box width={widths.ports + 2}>
          <Text dimColor={colorize}> PORTS</Text>
        </Box>
      </Box>
      {services.map((row) => {
        const name = row.name || row.service || "—";
        const service = row.service || "—";
        const state = stateLabel(row.state, row.health);
        const ports = row.ports || "—";

        return (
          <Box key={`${row.name}:${row.service}:${row.ports}`}>
            <Box width={widths.name}>
              <Text>{truncate(name, widths.name)}</Text>
            </Box>
            <Box width={widths.service + 2}>
              <Text> {truncate(service, widths.service)}</Text>
            </Box>
            <Box width={widths.state + 2}>
              <Text color={stateColor(row.state, row.health, colorize)}>
                {"  "}
                {truncate(state, widths.state)}
              </Text>
            </Box>
            <Box width={widths.ports + 2}>
              <Text> {truncate(ports, widths.ports)}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

const HostPanel = ({
  host,
  selected,
  expanded,
  colorize,
}: {
  host: HostSnapshot;
  selected: boolean;
  expanded: boolean;
  colorize: boolean;
}) => {
  const caret = expanded ? "▼" : "▶";
  const borderColor = selected && colorize ? "magenta" : undefined;
  const health = host.reachable ? host.health : "unreachable";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      borderDimColor={!selected && colorize}
      paddingX={1}
      marginBottom={1}
    >
      <Box gap={1}>
        <Text color={selected && colorize ? "magenta" : undefined}>
          {selected ? "›" : " "}
          {caret}
        </Text>
        <Text color={host.reachable && colorize ? "green" : colorize ? "red" : undefined}>
          {host.reachable ? "●" : "○"}
        </Text>
        <Text>
          <Text color={host.isDefault && colorize ? "yellow" : undefined}>
            {host.isDefault ? "*" : " "}
          </Text>
          <Text bold={colorize}>{host.name}</Text>
        </Text>
        <Text color={host.node && colorize ? "cyan" : undefined} dimColor={!host.node && colorize}>
          {host.node ? `node:${host.node}` : "node:—"}
        </Text>
        <Text color={healthColor(health, colorize)}>{health}</Text>
        <Text dimColor={colorize}>{serviceCounts(host)}</Text>
      </Box>
      <Text dimColor={colorize}>{host.url}</Text>
      {expanded ? (
        <Box flexDirection="column" marginTop={1}>
          {host.error ? <Text color={colorize ? "red" : undefined}>{host.error}</Text> : null}
          {host.reachable ? (
            <ServiceTable services={host.services} colorize={colorize} />
          ) : !host.error ? (
            <Text color={colorize ? "red" : undefined}>host unreachable</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
};

export const Dashboard = ({
  snapshot,
  selected,
  expanded,
  intervalMs,
  colorize,
}: DashboardProps) => {
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="single"
        borderDimColor={colorize}
        paddingX={1}
        marginBottom={1}
      >
        <Box>
          <Text color={colorize ? "cyan" : undefined}>rdg</Text>
          <Text bold={colorize}> · node dashboard</Text>
        </Box>
        <Text dimColor={colorize}>
          refreshed {ago(snapshot.fetchedAt)} · every {Math.round(intervalMs / 1000)}s
        </Text>
        <Text dimColor={colorize}>
          ↑↓/jk move · ⏎/space toggle · a expand · c collapse · r refresh · q quit
        </Text>
      </Box>

      {snapshot.hosts.length === 0 ? (
        <Box flexDirection="column">
          <Text>No hosts in ~/.config/rdg/hosts.json</Text>
          <Text>Add one with: rdg host add &lt;name&gt; &lt;url&gt;</Text>
        </Box>
      ) : (
        snapshot.hosts.map((host, index) => (
          <HostPanel
            key={host.name}
            host={host}
            selected={index === selected}
            expanded={expanded.has(host.name)}
            colorize={colorize}
          />
        ))
      )}
    </Box>
  );
};

export const defaultExpanded = (snapshot: DashboardSnapshot): Set<string> =>
  new Set(snapshot.hosts.map((host) => host.name));
