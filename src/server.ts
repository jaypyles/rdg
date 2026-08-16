import { config } from "./config";
import { health } from "./handlers/health";
import { getNode, postNode } from "./handlers/node";
import { getPs } from "./handlers/ps";
import { postRestart } from "./handlers/restart";
import { root } from "./handlers/root";
import { getServiceLogs } from "./handlers/service-logs";
import { postServiceRestart } from "./handlers/service-restart";
import { postSync } from "./handlers/sync";
import { startSyncSchedule } from "./sync";

export const startServer = () => {
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    routes: {
      "/": root,
      "/health": health,
      "/node": {
        GET: getNode,
        POST: postNode,
      },
      "/sync": {
        POST: postSync,
      },
      "/restart": {
        POST: postRestart,
      },
      "/ps": {
        GET: getPs,
      },
      "/services/:name/restart": {
        POST: postServiceRestart,
      },
      "/services/:name/logs": {
        GET: getServiceLogs,
      },
    },
    fetch() {
      return Response.json({ error: "Not found" }, { status: 404 });
    },
    error(error) {
      console.error(error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    },
  });

  console.log(`remote-docker-gateway listening on ${server.url}`);
  startSyncSchedule();
  return server;
};
