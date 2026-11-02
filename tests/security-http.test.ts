import { env, exports } from "cloudflare:workers";
import { abortAllDurableObjects, reset, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { admissionSchema } from "../shared/protocol";

const origin = "http://127.0.0.1:5173";

function post(path: string, body: unknown): Promise<Response> {
  return exports.default.fetch(`https://test.local${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await abortAllDurableObjects();
  await reset();
});

describe("HTTP security boundaries in Workers", () => {
  it("leaves no persistent room tables or alarms when unknown room IDs are probed", async () => {
    for (const route of ["join", "socket"] as const) {
      const roomId = crypto.randomUUID();
      const path = `/rooms/${roomId}/${route}`;
      const response =
        route === "join"
          ? await post(path, { name: "Guest" })
          : await exports.default.fetch(`https://test.local${path}`, {
              headers: { Origin: origin, Upgrade: "websocket" },
            });
      expect(response.status).toBe(404);
      await abortAllDurableObjects();
      const stored = await runInDurableObject(
        env.ROOMS.getByName(roomId),
        async (_room, context) => ({
          tables: context.storage.sql
            .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room'")
            .toArray(),
          alarm: await context.storage.getAlarm(),
        }),
      );
      expect(stored.tables).toHaveLength(0);
      expect(stored.alarm).toBeNull();
    }
  });

  it("requires an exact allowed origin for creation, admission, upgrades and preflight", async () => {
    const created = admissionSchema.parse(await (await post("/rooms", { name: "Host" })).json());
    for (const suppliedOrigin of [undefined, "null", `${origin}.evil.test`, "https://evil.test"]) {
      for (const path of ["/rooms", `/rooms/${created.roomId}/join`]) {
        const headers = new Headers({ "Content-Type": "application/json" });
        if (suppliedOrigin !== undefined) headers.set("Origin", suppliedOrigin);
        const response = await exports.default.fetch(`https://test.local${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ name: "Guest" }),
        });
        expect(response.status).toBe(403);
        expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
      }
      const headers = new Headers({ Upgrade: "websocket" });
      if (suppliedOrigin !== undefined) headers.set("Origin", suppliedOrigin);
      const response = await exports.default.fetch(
        `https://test.local/rooms/${created.roomId}/socket`,
        { headers },
      );
      expect(response.status).toBe(403);
      expect(response.webSocket).toBeNull();
      const preflight = await exports.default.fetch("https://test.local/rooms", {
        method: "OPTIONS",
        headers,
      });
      expect(preflight.status).toBe(403);
    }
  });

  it("bounds streamed JSON by actual UTF-8 bytes without trusting Content-Length", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ name: "Host", extra: "é".repeat(520) }));
    expect(body.byteLength).toBeGreaterThan(1024);
    const response = await exports.default.fetch("https://test.local/rooms", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body.slice(0, 512));
          controller.enqueue(body.slice(512));
          controller.close();
        },
      }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Request body too large." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects client identity claims and sessions from another room and keeps admissions uncached", async () => {
    const created = await post("/rooms", { name: "Host" });
    expect(created.headers.get("Cache-Control")).toBe("no-store");
    expect(created.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(created.headers.get("Vary")).toBe("Origin");
    const host = admissionSchema.parse(await created.json());
    const other = admissionSchema.parse(await (await post("/rooms", { name: "Other" })).json());
    const response = await post(`/rooms/${other.roomId}/join`, { session: host.session });
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain(host.session.secret);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    for (const body of [
      { name: "Guest", playerId: host.session.playerId },
      { name: "Guest", hostId: host.session.playerId },
      { session: host.session, name: "Guest" },
      { session: { ...host.session, isHost: true } },
    ]) {
      expect((await post(`/rooms/${host.roomId}/join`, body)).status).toBe(400);
    }
  });
});
