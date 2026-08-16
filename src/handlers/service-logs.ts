import { composeLogs } from "../compose";
import {
  firstMatchingStack,
  jsonError,
  requireAuth,
  unauthorized,
} from "./helpers";

export const getServiceLogs = async (
  req: Bun.BunRequest<"/services/:name/logs">
) => {
  if (!requireAuth(req)) return unauthorized();
  try {
    const tail = new URL(req.url).searchParams.get("tail") ?? "100";
    const output = await firstMatchingStack((file, node) =>
      composeLogs(file, node, req.params.name, tail)
    );
    return new Response(output, {
      headers: { "content-type": "text/plain" },
    });
  } catch (error) {
    return jsonError(error, 500);
  }
};
