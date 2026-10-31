export const wantsStream = (req: Request): boolean => {
  const accept = req.headers.get("accept") ?? "";

  if (accept.includes("application/x-ndjson")) {
    return true;
  }

  const stream = new URL(req.url).searchParams.get("stream");

  return stream === "1" || stream === "true";
};

export const streamQuery = (params: Record<string, string | boolean | undefined>): string => {
  const parts = ["stream=true"];

  for (const [key, value] of Object.entries(params)) {
    if (value === true) {
      parts.push(`${key}=true`);
    } else if (value !== false && value !== undefined && value !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return `?${parts.join("&")}`;
};

export const ndjsonResponse = (events: AsyncIterable<unknown>): Response => {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message })}\n`));
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done", ok: false })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson" },
  });
};
