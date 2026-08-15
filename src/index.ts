import { composeLogs, composePs, composeRestart } from "./compose";
import { config } from "./config";
import { register, registeredNode } from "./register";
import { composeFilePath, startSyncSchedule, sync } from "./sync";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

const requireAuth = (req: Request): boolean => {
  if (!config.token) {
    return true;
  }
  return req.headers.get("authorization") === `Bearer ${config.token}`;
};

const jsonError = (error: unknown, status = 400) =>
  Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  routes: {
    "/": () =>
      Response.json({
        service: "remote-docker-gateway",
        status: "ok",
      }),
    "/health": () => Response.json({ status: "healthy" }),
    "/node": {
      GET: async (req) => {
        if (!requireAuth(req)) return unauthorized();
        try {
          return Response.json(await registeredNode());
        } catch (error) {
          return jsonError(error, 404);
        }
      },
      POST: async (req) => {
        if (!requireAuth(req)) return unauthorized();
        try {
          const body = (await req.json()) as { name?: string };
          if (!body.name) {
            return jsonError("name is required");
          }
          await register(body.name);
          return Response.json({ name: body.name });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
    "/sync": {
      POST: async (req) => {
        if (!requireAuth(req)) return unauthorized();
        try {
          return Response.json(await sync());
        } catch (error) {
          return jsonError(error, 500);
        }
      },
    },
    "/ps": {
      GET: async (req) => {
        if (!requireAuth(req)) return unauthorized();
        try {
          const output = await composePs(await composeFilePath());
          return new Response(output, { headers: { "content-type": "application/json" } });
        } catch (error) {
          return jsonError(error, 500);
        }
      },
    },
    "/services/:name/restart": {
      POST: async (req) => {
        if (!requireAuth(req)) return unauthorized();
        try {
          const output = await composeRestart(await composeFilePath(), req.params.name);
          return Response.json({ output });
        } catch (error) {
          return jsonError(error, 500);
        }
      },
    },
    "/services/:name/logs": {
      GET: async (req) => {
        if (!requireAuth(req)) return unauthorized();
        try {
          const tail = new URL(req.url).searchParams.get("tail") ?? "100";
          const output = await composeLogs(await composeFilePath(), req.params.name, tail);
          return new Response(output, { headers: { "content-type": "text/plain" } });
        } catch (error) {
          return jsonError(error, 500);
        }
      },
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
