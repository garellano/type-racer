# Multiplayer validation

Open the [game](https://garellano.github.io/type-racer/) on desktop browsers with physical keyboards. Start with two people, then test up to eight participants in the US, Ireland, and Mexico.

1. Create a room and share its invitation. Everyone uses a distinct name. Check that participants and readiness match on all screens.
2. Open **Connection check**, mark ready, and start. The exact **Shared start** timestamp must match everywhere. The countdown should end together within measured network limits.
3. Type at different speeds, make a mistake, correct it, and delete correct characters. Only the correct prefix should contribute distance.
4. Arrange two close finishes. Every screen must show the same single winner and finish duration. All racers stop at the confirmed result.
5. Refresh during a round and briefly disconnect the network. The same name, confirmed progress, epoch, and result must recover. Watch the connection indicator.
6. Reset. Progress and readiness return to zero; the next round uses a new epoch. Avoid duplicating an active racer tab: some browsers copy its session storage.

Record date, region, browser, round-trip times, visible remote-update delay, and disconnects. A large idle **Last update** value in the lobby is normal because state is sent when it changes; it is not a heartbeat indicator.

Product target: most remote changes appear within roughly 300 ms on normal connections. Network paths and batching add delay. A same-machine test cannot prove cross-region latency, and close finishes use server arrival order.

## Automated validation

`npm run check` runs strict types, formatting, Cloudflare runtime integration tests, frontend building, and backend packaging. Runtime tests accelerate countdown/deadline timestamps through test-only storage helpers; the public service has no test clock controls.

`npm run smoke -- API_URL FRONTEND_ORIGIN` opens eight real WebSocket clients, observes a common future start, waits through the actual countdown, advances cars, finishes concurrently, checks one shared result, and resumes a session. Input is programmatic, so finish durations are not human benchmarks. All sockets close in a finally block; the temporary room expires normally.

Accept the milestone after the team's screens show a common start, useful remote progress, one consistent winner, and session recovery. Then proceed to motion, the personal camera, minimap, starting lights, and celebration. Deploy backend changes between races because deployments disconnect sockets.
