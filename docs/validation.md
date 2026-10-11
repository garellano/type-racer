# Multiplayer validation

Open the [game](https://garellano.github.io/type-racer/) on desktop browsers with physical keyboards. Start with two people, then test up to nine participants in the US, Ireland, and Mexico.

1. Create a room and share its invitation. Everyone uses a distinct name. Check that participants and readiness match on all screens.
   Choose English, Spanish, and Java in separate rounds. Only the host can change the lobby choice; changing it clears ready marks on every screen. Once the countdown begins, the choice is locked. In Java, compare the complete code on both screens and type its spaces, case, and punctuation exactly.
2. Open **Connection check**, mark ready, and start. The exact **Shared start** timestamp must match everywhere. The countdown should end together within measured network limits.
3. Type at different speeds, make a mistake, correct it, and delete correct characters. Only the correct prefix should contribute distance.
4. Arrange two close finishes. Every screen must show the same single winner and finish duration. All racers stop at the confirmed result. After the winner celebration, compare the full standings and the same opening speaker: the least-progress racer opens standup. Test an exact tie at the last position; the shared draw must survive refresh without changing.
5. Refresh during a round and briefly disconnect the network. The same name, confirmed progress, epoch, and result must recover. Watch the connection indicator.
6. Reset. Progress and readiness return to zero; the next round uses a new epoch and another passage from the daily deck. Three rounds exhaust the deck before recycling. Tomorrow's deck is different, including in a new room. Avoid duplicating an active racer tab: some browsers copy its session storage.

Record date, region, browser, round-trip times, visible remote-update delay, and disconnects. A large idle **Last update** value in the lobby is normal because state is sent when it changes; it is not a heartbeat indicator.

Product target: most remote changes appear within roughly 300 ms on normal connections. Network paths and batching add delay. A same-machine test cannot prove cross-region latency, and close finishes use server arrival order.

## Automated validation

`npm run check` runs strict types, formatting, Cloudflare runtime integration tests, frontend building, and backend packaging. Runtime tests accelerate countdown/deadline timestamps through test-only storage helpers; the public service has no test clock controls.

`npm run smoke -- API_URL FRONTEND_ORIGIN [english|spanish|java]` opens nine real WebSocket clients, confirms a shared language and passage, observes a common future start, waits through the actual countdown, advances cars, finishes concurrently, checks one shared winner and a shared least-progress opening speaker, and resumes a session without redrawing the result. Input is programmatic, so finish durations are not human benchmarks. All sockets close in a finally block; the temporary room expires normally.

## Race scene validation

1. During the countdown, compare the red/amber/green lights and shared start on two screens. Typing remains disabled until the estimated server start.
2. Advance one racer halfway. Their front bumper stays at the horizontal center; **Your view** reads approximately 100–200 m. Other racers keep their lanes when ranks change.
3. Separate racers by more than 50 m in both directions. The main view shows direction/distance indicators; the radar and standings still include all participants.
4. Stop typing, introduce a typo, and delete correct characters. Cars settle at their targets, errors do not add distance, brake lights respond, and deleting all text returns the car to zero without a later snapshot restoring the deleted input.
5. Use **Reduce motion**, and separately load with a browser reduced-motion preference. Positions update without smoothing or decorative animation. Hide and reopen the tab; the camera returns to current positions without replaying old movement.
6. Finish, compare the same winner everywhere, and reset. Check that the result celebration runs briefly, then stops, and that the next countdown starts from the grid. Try nine racers and a narrow viewport; names remain available in standings. Confirm six distinct model sprites and nine different colors. With five racers, all five models must be different. Compare the same participant's model and color on another screen and after refresh. Start another round and verify that the model rotation comes from the shared round identity.

Camera bounds, radar clipping, frame-rate-independent damping, corrections, and shared timer formatting have automated tests. Browser validation covers the actual scene; it does not establish cross-region latency or guarantee a particular frame rate. Deploy backend changes between races because deployments disconnect sockets.
