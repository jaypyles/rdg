import { runMaintenance } from "../scheduler/tasks/maintenance";
import { jsonError, requireAuth, unauthorized } from "./helpers";

export const postMaintenance = async (req: Request) => {
  if (!requireAuth(req)) {
    return unauthorized();
  }

  try {
    return Response.json(await runMaintenance());
  } catch (error) {
    return jsonError(error, 500);
  }
};
