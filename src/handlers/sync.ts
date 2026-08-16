import { sync } from "../sync";
import { jsonError, requireAuth, unauthorized } from "./helpers";

export const postSync = async (req: Request) => {
  if (!requireAuth(req)) return unauthorized();
  try {
    return Response.json(await sync());
  } catch (error) {
    return jsonError(error, 500);
  }
};
