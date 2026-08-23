import { composeRestart } from "../compose";
import {
  jsonError,
  requireAuth,
  unauthorized,
  wantsPull,
  withStacks,
} from "./helpers";

export const postRestart = async (req: Request) => {
  if (!requireAuth(req)) return unauthorized();
  try {
    const pull = wantsPull(req);
    const { node, results } = await withStacks((file, name) =>
      composeRestart(file, name, undefined, pull)
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
