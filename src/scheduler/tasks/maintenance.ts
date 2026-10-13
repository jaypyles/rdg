import { composeDown, composeUp } from "../../compose";
import { config } from "../../config";
import { registeredNode } from "../../register";
import { listComposeFiles } from "../../sync";
import { msUntilNextLocalTime, scheduler } from "../core";

const TASK_ID = "maintenance";

export type MaintenanceResult = {
  node: string;
  stopped: number;
  started: number;
  commandRan: boolean;
  output: string;
};

const pad = (n: number): string => String(n).padStart(2, "0");

const runMaintenanceCmd = async (cmd: string): Promise<string> => {
  console.log(`maintenance running: ${cmd}`);

  const proc = Bun.spawn(["bash", "-lc", cmd], {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`maintenance command failed (${exitCode}): ${cmd}`);
  }

  return cmd;
};

let maintaining = false;

export const runMaintenance = async (): Promise<MaintenanceResult> => {
  if (maintaining) {
    const { name } = await registeredNode();

    return {
      node: name,
      stopped: 0,
      started: 0,
      commandRan: false,
      output: "maintenance already in progress",
    };
  }

  maintaining = true;

  try {
    const { name: node } = await registeredNode();
    const files = await listComposeFiles(node);

    console.log(`maintenance stopping ${files.length} stack(s) on ${node}`);

    for (const file of [...files].reverse()) {
      await composeDown(file, node);
    }

    let commandRan = false;

    try {
      if (config.maintenanceCmd) {
        await runMaintenanceCmd(config.maintenanceCmd);
        commandRan = true;
      } else {
        console.log("maintenance skipped command: RDG_MAINTENANCE_CMD unset");
      }
    } finally {
      console.log(`maintenance starting ${files.length} stack(s) on ${node}`);

      for (const file of files) {
        await composeUp(file, node);
      }
    }

    console.log(`maintenance complete on ${node}`);

    return {
      node,
      stopped: files.length,
      started: files.length,
      commandRan,
      output: commandRan
        ? `ran ${config.maintenanceCmd}`
        : "RDG_MAINTENANCE_CMD unset",
    };
  } finally {
    maintaining = false;
  }
};

export const startMaintenance = (): void => {
  const hour = config.maintenanceHour;
  const minute = config.maintenanceMinute;

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return;
  }

  const untilMs = msUntilNextLocalTime(hour, minute);
  const untilMin = Math.round(untilMs / 60_000);

  console.log(
    `maintenance scheduled daily at ${pad(hour)}:${pad(minute)} (in ~${untilMin}m)`,
  );

  scheduler.daily({
    id: TASK_ID,
    hour,
    minute,
    onError: (error) => {
      console.error("scheduled maintenance failed", error);
    },
    run: async () => {
      try {
        await registeredNode();
      } catch {
        return;
      }

      await runMaintenance();
    },
  });
};
