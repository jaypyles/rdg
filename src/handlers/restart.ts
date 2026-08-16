import { composeRestart } from "../compose";
import { jsonError, requireAuth, unauthorized, withStacks } from "./helpers";

export const postRestart = async (req: Request) => {
  if (!requireAuth(req)) return unauthorized();
  try {
    const { node, results } = await withStacks((file, name) =>
      composeRestart(file, name)
    );
    return Response.json({
      node,
      output: results.filter(Boolean).join("\n"),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
};
