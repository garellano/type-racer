# Defuse the bomb

A shared game of chance for **2–25 participants**. Race cars and Jump with sacks retain their existing nine-person limit. The host selects the game in the existing room controls, or creates a bomb room from the entry screen. No new account, transport, database, or platform service is required.

## The player's minute

The host starts once at least two people have joined. Unlike typing races, a bomb round does not require ready marks. Starting freezes the entire admitted roster, including temporarily offline participants; guests cannot join until reset. Session holders can reconnect at any phase.

Players have **20 seconds** to choose a numbered, colored wire. Unclaimed wires begin as a tangle inside the illustrated bomb. A confirmed choice extends its wire to the owner's name and initial avatar. Cards stay in the same position throughout the round. Numbered plugs have keyboard focus and accessible descriptions; color alone never identifies a choice. The server rejects concurrent claims on an occupied wire and the interface asks the second person to choose again. Confirmed choices cannot be changed. At the deadline, missing choices are automatically assigned without removing anyone from eligibility.

As soon as all wires are assigned, everyone receives the same **three-second countdown**. The cutting sequence takes **26 seconds** regardless of field size. Weighted intervals decrease across the sequence, with a three-second pause after the final cut. Thus the round takes **32–52 seconds** after the host starts in normal conditions. Two-person rounds have one long anticipation interval; larger fields have more frequent cuts. The clock shows the time to the next authoritative event. A delayed alarm catches up to the scheduled timeline instead of replaying an unbounded animation queue.

Each disconnected wire has a visible gap and its owner's card becomes green with “Safe!” The last connected wire remains visible through the dramatic pause. An original cartoon burst and smoke announce **one opening speaker**, accompanied by a warm invitation to start standup. The host can reset and reuse the room. Disconnected guests are removed only between rounds, following the existing room rules.

## Fairness and authority

The room's existing SQLite Durable Object owns assignments and the result. `wire` messages contain only a round ID and wire number; identity comes exclusively from the authenticated WebSocket attachment. Assignment, permutation generation, phase transitions, and result persistence have no asynchronous gap between reading and writing the room state.

After selection closes, the server uses a cryptographic Fisher–Yates shuffle with rejection sampling. Every participant has exactly the same probability of being the final connected wire, independent of color, seat, speed, automatic assignment, or connection status. The future permutation is stored in a **private** `bombPlan`; snapshots omit it. Clients receive only revealed cut timestamps and the timestamp of the next event. The opening speaker remains null until the scheduled explosion. As the field narrows, the remaining candidate naturally becomes evident; there is no hidden future-order payload to inspect.

Expected closed-round and full-room admission refusals cross RPC as ordinary values, then become HTTP 409 responses. A rejected late guest cannot disturb the room lifecycle or prevent later recovery.

The result reuses the existing `standupStarterId`, with `winnerId = null`: this game selects an opening speaker rather than a typing winner. The typing standings and passage decks remain unchanged. Older room records default to no bomb state. A group larger than nine cannot switch to a typing mode; the host receives an explanation and can keep the bomb game or create a smaller room.

One Durable Object alarm schedules selection timeout, countdown, each cut, finale, or room expiry. Repeated alarms, repeated wire messages, delayed packets, and stale round IDs cannot redraw a result. Hibernation retains SQLite state and connection attachments. Rooms still expire two hours after creation, including if a round starts just before expiry. This takes precedence over finishing a round.

The implementation follows the existing [hibernating WebSocket](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) model and [alarm lifecycle guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/). No infrastructure or paid subscription was added.

## Presentation and access

The bomb, wire paths, cartoon burst, and smoke are original SVG/CSS artwork authored in this change, without generation references or external assets. Participant initials do not infer gender, appearance, or nationality. Names are inserted with `textContent`.

The layout keeps all 25 names visible on desktop and wraps long names on mobile. Mobile rooms can require vertical scrolling. Wire choice uses ordinary buttons with keyboard navigation, visible focus, numeric labels, and server-confirmed feedback. Cut announcements and the final invitation use status regions. Reduced motion follows the browser setting and has an explicit toggle. Hidden pages and lost connections stop decorative motion; returning renders current server state. Optional synthesized tones start only after pressing “Sound off”; sound is off by default and can be toggled at any time.

No cursor presence infrastructure existed, so cursor sharing was deliberately omitted as requested.

## Validation

```sh
npm run types
npm run check
npm run dev:worker
npm run dev # in a second terminal
npm run smoke:bomb -- http://127.0.0.1:8787 http://127.0.0.1:5173 25
```

The Workers suite covers 2, 5, 10, and 25 participants, uniform sampling and shuffling, concurrent claims, duplicate and stale messages, automatic assignment, frozen rosters, authorization, every revealed cut, one immutable opening speaker, eviction/recovery, late alarm catch-up, reset, capacity, expiry, and typing-mode compatibility.

The live smoke script waits through a normal 52-second round, with one participant offline and automatically assigned, compares every cut across connected clients, and reconnects the absent participant to the same final result. It uses the project's existing WebSocket dependency and closes every socket in `finally`.

For optional browser validation, provide an installed Playwright module (no browser dependency is added to the app):

```sh
TYPE_RACER_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/bomb-browser.mjs
```

The browser script uses the local development endpoints and writes the evidence folder. It starts and closes its own headless browser.

Browser validation used Chromium with 25 participants, a desktop host and a 390-pixel mobile guest. It exercised keyboard choice, every shared phase, refresh during cuts, identical final announcements, reduced motion, and reset, with no page errors or horizontal overflow. Screenshots and the machine-readable report are in [evidence/bomb](evidence/bomb/). All launched browsers were closed in `finally`.

Cross-region latency, sound preferences, and how the suspense feels in a real standup still benefit from a team trial. Server timestamps preserve the event order and outcome, but network delay can shift when a particular screen receives a cut. No production deployment is part of this change.
