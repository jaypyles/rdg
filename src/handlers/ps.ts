import { composePs } from "../compose";
import { jsonError, requireAuth, unauthorized, withStacks } from "./helpers";

export const getPs = async (req: Request) => {
  if (!requireAuth(req)) return unauthorized();

  try {
    const { results } = await withStacks(composePs);
    return new Response(results.filter(Boolean).join("\n"), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return jsonError(error, 500);
  }
};
