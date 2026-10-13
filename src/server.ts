import { config } from "./config";
import { health } from "./handlers/health";
import { getNode, postNode } from "./handlers/node";
import { getPs } from "./handlers/ps";
import { postRestart } from "./handlers/restart";
import { root } from "./handlers/root";
import { postMaintenance } from "./handlers/maintenance";
import { getServiceLogs } from "./handlers/service-logs";
import { postServiceRestart } from "./handlers/service-restart";
import { postSync } from "./handlers/sync";
import { startScheduledTasks } from "./scheduler";

const noIdleTimeout = <Req extends Request>(
  handler: (req: Req) => Response | Promise<Response>,
) => {
  return (
    req: Req,
    server: { timeout: (req: Request, seconds: number) => void },
  ) => {
    server.timeout(req, 0);
    return handler(req);
  };
};

export const startServer = () => {
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    // Long handlers (sync / maintenance / pull) write nothing until done.
    idleTimeout: 0,
    routes: {
      "/": root,
      "/health": health,
      "/node": {
        GET: getNode,
        POST: postNode,
      },
      "/sync": {
        POST: noIdleTimeout(postSync),
      },
      "/maintenance": {
        POST: noIdleTimeout(postMaintenance),
      },
      "/restart": {
        POST: noIdleTimeout(postRestart),
      },
      "/ps": {
        GET: getPs,
      },
      "/services/:name/restart": {
        POST: noIdleTimeout(postServiceRestart),
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
  startScheduledTasks();
  return server;
};
