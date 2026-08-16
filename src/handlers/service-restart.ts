import { composeRestart } from "../compose";
import {
  firstMatchingStack,
  jsonError,
  requireAuth,
  unauthorized,
} from "./helpers";

export const postServiceRestart = async (
  req: Bun.BunRequest<"/services/:name/restart">
) => {
  if (!requireAuth(req)) return unauthorized();
  try {
    const output = await firstMatchingStack((file, node) =>
      composeRestart(file, node, req.params.name)
    );
    return Response.json({ output });
  } catch (error) {
    return jsonError(error, 500);
  }
};
