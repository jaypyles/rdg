export const root = () =>
  Response.json({
    service: "remote-docker-gateway",
    status: "ok",
  });
