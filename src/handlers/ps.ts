import { composePs } from "../compose";
import { jsonError, requireAuth, unauthorized, withStacks } from "./helpers";

export const getPs = async (req: Request) => {
  if (!requireAuth(req)) return unauthorized();

  try {
    const { results } = await withStacks(composePs);
    const lines = results.flatMap((chunk) => chunk.split("\n").filter(Boolean));

    return new Response(lines.join("\n"), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return jsonError(error, 500);
  }
};
