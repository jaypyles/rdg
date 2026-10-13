import { config } from "../../config";
import { registeredNode } from "../../register";
import { sync } from "../../sync";
import { scheduler } from "../core";

const TASK_ID = "compose-sync";

export const startComposeSync = (): void => {
  if (config.syncIntervalMs <= 0) {
    return;
  }

  scheduler.every({
    id: TASK_ID,
    intervalMs: config.syncIntervalMs,
    onError: (error) => {
      console.error("scheduled sync failed", error);
    },
    run: async () => {
      try {
        await registeredNode();
      } catch {
        return;
      }

      if (!config.composeRepo) {
        return;
      }

      const result = await sync();

      if (result.applied) {
        console.log(
          `sync applied ${result.node} @ ${result.commit}: ${[
            ...result.appliedFiles,
            ...result.restartedServices.map((service) => `restart:${service}`),
          ].join(", ")}`,
        );
      } else if (result.output === "sync already in progress") {
        console.log(`sync skipped ${result.node}: already in progress`);
      } else if (!result.changed) {
        console.log(
          `sync idle ${result.node} @ ${result.commit}: nothing to apply`,
        );
      } else {
        console.log(
          `sync idle ${result.node} @ ${result.commit}: no stacks or configs for this node`,
        );
      }
    },
  });
};
