import { register, registeredNode } from "../register";
import { jsonError, requireAuth, unauthorized } from "./helpers";

export const getNode = async (req: Request) => {
  if (!requireAuth(req)) return unauthorized();

  try {
    return Response.json(await registeredNode());
  } catch (error) {
    return jsonError(error, 404);
  }
};

export const postNode = async (req: Request) => {
  if (!requireAuth(req)) return unauthorized();

  try {
    const body = (await req.json()) as { name?: string };

    if (!body.name) {
      return jsonError("name is required");
    }

    await register(body.name);
    return Response.json({ name: body.name });
  } catch (error) {
    return jsonError(error);
  }
};
