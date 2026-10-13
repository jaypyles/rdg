import { startComposeSync } from "./compose-sync";
import { startMaintenance } from "./maintenance";

export const startScheduledTasks = (): void => {
  startComposeSync();
  startMaintenance();
};
