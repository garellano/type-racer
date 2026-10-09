# Multiplayer coordination

Selected October 9, 2026: GitHub Pages, a Cloudflare Worker, one SQLite-backed Durable Object per room, and WebSockets. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) define current quotas.

## Authority and persistence

The Worker validates origins, paths, names, and bounded JSON. Random room IDs route to separate objects; all racers in one room reach the same active object. An Eastern North America location hint (`enam`) is an initial hypothesis for US, Ireland, and Mexico. [Location hints are best effort](https://developers.cloudflare.com/durable-objects/reference/data-location/); real regional measurements remain necessary.

One SQLite row stores the bounded room state: players, credential hashes, race language, epoch, passage, start, deadline, sequences, progress, and result. Every accepted update persists before sending state. Storage output gates hold network output until writes complete. No index adds a second per-progress write. Stored rooms without a language field default to English; new writes preserve the selected language.

Winner selection reads and updates synchronously with no intervening await. A complete correct prefix changes the phase to finished and records one winner. Later updates cannot change the result. The animation never decides the outcome.

[Hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) retain authenticated player identity in connection attachments. Presence comes from live sockets. The constructor rebuilds the schema, and essential data is read from storage rather than depending on memory.

## Protocol

1. `POST /rooms` creates a room and admits its host.
2. `POST /rooms/:id/join` admits a guest or validates a session for resume.
3. `GET /rooms/:id/socket` upgrades to WebSocket; its first message authenticates.
4. `ready` changes lobby readiness. Only the host controls `configure`, `start`, and `reset`. Lobby-only `configure` selects `english`, `spanish`, or `java`; a changed choice clears all ready marks. Reset retains the choice.
5. `start` selects one passage from the chosen language's shared catalog, assigns a new epoch, common text, `startAt = server time + 5 seconds`, and a 90-second deadline. Language changes are rejected until the round finishes and resets.
6. `progress` carries epoch, increasing sequence, and typed text. The server calculates the correct prefix; it never accepts client coordinates or finish timestamps.
7. Browser changes group at 100 ms; the final character sends immediately. Server progress snapshots group at 100 ms while changes exist. Lifecycle events and results broadcast immediately.
8. `ping` / `pong` estimate clock offset and round-trip latency. Versioned snapshots include a server timestamp; older versions are discarded.
9. Resume returns current state and sequence. A second connection for a session replaces the first, preventing duplicate racers.

Shared runtime schemas live in `shared/protocol.ts`. Limits: 2 KiB WebSocket input, 1 KiB HTTP JSON, 24-character names, 500-character race input, eight racers, sixteen sockets. Session credentials travel in JSON and the first WebSocket message, never invitation URLs. Public snapshots omit secrets and hashes.

## Clock and fairness

The browser clock uses a `performance.now()` anchor. Three initial probes estimate server offset; the smallest round trip reduces queueing noise. Later probes refresh the estimate. A future scheduled start avoids starting each client on its individual packet arrival.

Clock estimates cannot eliminate asymmetric Internet routes. The first valid finish received by the room wins; very close finishes can favor lower latency. Immediate local feedback and final messages reduce avoidable delays. This is a casual team game without verified physical-keystroke anti-cheat.

## Lifecycle and cost

One alarm handles countdown, deadline, or expiry. Rooms expire two hours after creation; sockets close and stored data is deleted. Broadcast timers exist only while updates await delivery. There is no permanent backend game loop.

At eight racers and ten updates per second, a 60-second race produces up to roughly 4,800 progress messages and 4,800 progress-row writes, plus lifecycle work. Batched snapshots produce up to 4,800 client deliveries. Outgoing WebSocket messages have no Durable Object request charge. Incoming message billing uses Cloudflare's documented conversion; messages are not equivalent to billed requests.

Free supports SQLite Durable Objects. Its documented allocation includes 100,000 requests/day, 13,000 GB-s/day, 100,000 rows written/day, and 5 GB stored. Quotas are account-wide; excess Free operations fail rather than automatically upgrading billing. These are estimates, not measured usage or a spending guarantee.

The initial deployment creates only a Worker, SQLite namespace, and Workers subdomain. No paid subscription API is called. Observability uses sampling and does not log credentials or typed input. Billing-subscription API access may require additional permissions; a script usage-model field alone does not prove the account plan.

## Validation

Workers runtime tests cover synchronization, simultaneous finishes, prefix validation, stale packets, permissions, capacity, room isolation, hibernation, resume, reset, timeout, and expiry. A deployed smoke test checks actual WebSocket transport and countdown timing. Cross-region latency still requires the [team trial](validation.md).

Before broad public promotion, add creation/message throttling and quota monitoring. The current public prototype is intended for small invited standup sessions.
