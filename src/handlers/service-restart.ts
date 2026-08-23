import { composeRestart } from "../compose";
import {
  firstMatchingStack,
  jsonError,
  requireAuth,
  unauthorized,
  wantsPull,
} from "./helpers";

export const postServiceRestart = async (
  req: Bun.BunRequest<"/services/:name/restart">
) => {
  if (!requireAuth(req)) return unauthorized();
  try {
    const pull = wantsPull(req);
    const output = await firstMatchingStack(
      (file, node, service) => composeRestart(file, node, service, pull),
      req.params.name,
    );
    return Response.json({ output, pull });
  } catch (error) {
    return jsonError(error, 500);
  }
};
