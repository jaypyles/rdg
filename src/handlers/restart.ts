import { composeRestart } from "../compose";
import { ndjsonResponse, wantsStream } from "../stream-http";
import { jsonError, requireAuth, unauthorized, wantsPull, withStacks } from "./helpers";
import { streamAllStacksRestart } from "./restart-stream";

export const postRestart = async (req: Request) => {
  if (!requireAuth(req)) return unauthorized();

  const pull = wantsPull(req);

  if (wantsStream(req)) {
    try {
      return ndjsonResponse(streamAllStacksRestart(pull));
    } catch (error) {
      return jsonError(error, 500);
    }
  }

  try {
    const { node, results } = await withStacks((file, name) =>
      composeRestart(file, name, undefined, pull),
    );

    return Response.json({
      node,
      pull,
      output: results.filter(Boolean).join("\n"),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
};
