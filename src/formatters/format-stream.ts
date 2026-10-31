import type { StreamEvent } from "../types";

export const formatStreamEvent = (event: StreamEvent): string | null => {
  switch (event.type) {
    case "stack":
      return `[stack] ${event.project}`;
    case "compose":
      return event.line;
    case "docker": {
      const target = event.name ?? event.id;
      const health = event.health ? ` (${event.health})` : "";

      return `[docker] ${event.action} ${target}${health}`;
    }
    case "error":
      return event.message;
    case "done":
      return event.ok ? null : "failed";
    default:
      return null;
  }
};

export const printStreamEvent = (event: StreamEvent, write: (line: string) => void): boolean => {
  const line = formatStreamEvent(event);

  if (line) {
    write(`${line}\n`);
  }

  if (event.type === "done") {
    return event.ok;
  }

  if (event.type === "error") {
    return false;
  }

  return true;
};
