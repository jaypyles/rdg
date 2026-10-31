import { composeRestart } from "../compose";
import { ndjsonResponse, wantsStream } from "../stream-http";
import { firstMatchingStack, jsonError, requireAuth, unauthorized, wantsPull } from "./helpers";
import { streamMatchingRestart } from "./restart-stream";

export const postServiceRestart = async (req: Bun.BunRequest<"/services/:name/restart">) => {
  if (!requireAuth(req)) return unauthorized();

  const pull = wantsPull(req);

  if (wantsStream(req)) {
    try {
      return ndjsonResponse(streamMatchingRestart(req.params.name, pull));
    } catch (error) {
      return jsonError(error, 500);
    }
  }

  try {
    const output = await firstMatchingStack(
      (file, node, service) => composeRestart(file, node, service, pull),
      req.params.name,
    );

    return Response.json({ output, pull });
  } catch (error) {
    return jsonError(error, 500);
  }
};
