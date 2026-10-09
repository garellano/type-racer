import { entrySchema, joinSchema, roomIdSchema } from "../shared/protocol";
import { RaceRoom, RoomError } from "./room";

export { RaceRoom };

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new RoomError(415, "Use application/json.");
  if (!request.body) throw new RoomError(400, "Missing request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new RoomError(413, "Request body too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new RoomError(400, "Invalid JSON.");
  }
}

export default {
  async fetch(request: Request, env: CloudflareBindings): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET")
      return Response.json({ status: "ok", service: "type-racer-api" });
    const origin = request.headers.get("Origin");
    if (!origin || !env.ALLOWED_ORIGINS.split(",").includes(origin))
      return Response.json({ error: "Origin is not allowed." }, { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      if (url.pathname === "/rooms" && request.method === "POST") {
        const body = entrySchema.safeParse(await jsonBody(request));
        if (!body.success)
          throw new RoomError(
            400,
            "Enter a name using 1–24 letters, numbers, spaces or simple punctuation.",
          );
        const roomId = crypto.randomUUID();
        const room = env.ROOMS.getByName(roomId, { locationHint: "enam" });
        return Response.json(await room.create(roomId, body.data.name), { status: 201, headers });
      }
      const match = /^\/rooms\/([^/]+)\/(join|socket)$/.exec(url.pathname);
      const roomId = roomIdSchema.safeParse(match?.[1]);
      if (!match || !roomId.success) throw new RoomError(404, "Route not found.");
      const room = env.ROOMS.getByName(roomId.data, { locationHint: "enam" });
      if (match[2] === "socket" && request.method === "GET") return await room.fetch(request);
      if (match[2] === "join" && request.method === "POST") {
        const body = joinSchema.safeParse(await jsonBody(request));
        if (!body.success) throw new RoomError(400, "Invalid name or session.");
        const admission =
          "session" in body.data
            ? await room.resume(body.data.session)
            : await room.join(body.data.name);
        return Response.json(admission, { headers });
      }
      throw new RoomError(405, "Method not allowed.");
    } catch (error) {
      // RPC exceptions preserve custom properties; validate them before returning a public error.
      if (error instanceof Error && "status" in error && typeof error.status === "number") {
        return Response.json({ error: error.message }, { status: error.status, headers });
      }
      console.error(
        JSON.stringify({ message: "Request failed", error: String(error), path: url.pathname }),
      );
      return Response.json(
        { error: "The room service is unavailable. Please try again." },
        { status: 503, headers },
      );
    }
  },
} satisfies ExportedHandler<CloudflareBindings>;
