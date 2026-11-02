# Development standards

## Product scope

Type Racer is a collection of short games to choose who opens standup. Preserve all five games: Race cars and Jump with sacks are multiplayer typing races for 2–9 participants; Defuse the bomb is a multiplayer chance game for 2–25; Office Derby is a host-operated automatic race for 2–25; Hot Mic is a host-operated automatic picker for 2–9. Typing races celebrate the winner, then invite the last race position to open standup. Bomb chooses an opening speaker directly; Derby's winner and Hot Mic's final recipient open standup. Keep every invitation warm and never ridicule a teammate or label them a loser.

## Language and design

- Write source code, comments, documentation, commit messages, and interface copy in English.
- Gameplay passages may use the selected race language (English, Spanish, or Java). Keep identifiers and explanations in English; do not translate the interface with the passage.
- Use TypeScript with strict checking. Treat external data as unknown and validate it at the boundary.
- Prefer small, explicit modules and platform APIs. Avoid speculative abstractions, unnecessary dependencies, and mutable global server state.
- Keep presentation separate from transport and race rules. Share protocol schemas between the browser and Worker.
- Use semantic HTML, keyboard navigation, visible focus, sufficient contrast, and reduced-motion support.

## Room-based multiplayer correctness

- One SQLite-backed Durable Object owns each room. The server controls the round epoch, scheduled phases, valid progress, and final result. Preserve synchronized starts, shared progress, reconnection, and one authoritative typing winner.
- Only the host chooses the room mode and language in the lobby. Changing either clears readiness. For typing rounds, freeze mode, language, characters, and shared passage; each participant chooses only their own character before the countdown, and changing it clears their readiness.
- Never trust client coordinates, finish times, player identities, or host claims. Authenticate sessions and validate every message.
- Make outcome selection and persistence synchronous and atomic. Do not await external work between reading round state and committing the result.
- Freeze typing standings when the round ends. Select the opening speaker from the least-progress group on the server, drawing once for an exact tie; persist that choice with the result.
- Rotate original typing passages through disjoint daily decks in America/Mexico_City. Preserve the room's recent deck history across resets and hibernation; do not promise indefinite uniqueness.
- Ignore stale or duplicate progress and wire messages. Persist essential state before broadcasting it.
- Use hibernating WebSockets and bounded messages. Stop timers when no work remains; expire rooms and close their sockets.
- Preserve durable state and connection attachments across hibernation. Reconnection must recover the same player and result.
- A countdown is scheduled using the server clock; network arrivals do not individually start each client.

### Defuse the bomb

- Starting requires at least two admitted participants, without ready marks. Freeze the complete roster, including temporarily offline participants; authenticate wire claims, reject occupied wires, and automatically assign missing choices at the deadline without removing anyone from eligibility.
- Use an unbiased cryptographic shuffle so every participant has the same chance. Keep the future cut order private; snapshots expose only revealed cuts and the next event time. Persist one opening speaker in standupStarterId, with winnerId null, at the finale.
- Reconnection, hibernation, duplicate messages, and delayed alarms must recover or catch up to the same fixed result without replaying an unbounded queue. Room expiry takes precedence over finishing. Do not allow a room larger than nine to switch to a typing mode.

## Host-operated games

- Office Derby and Hot Mic run in the host's browser for screen sharing. Teammates do not join, mark ready, or interact; these games must not create rooms or WebSocket connections.
- Use Web Crypto with unbiased sampling. Freeze the selected roster, characters, outcome, and complete motion plan before animation or countdown begins. Seat position, frame rate, reduced motion, and sound must never decide the opening speaker.
- Save reusable setup in local storage and the frozen round in the current tab's session storage. Validate saved data at the boundary, preserve the same result after refresh or hidden-page catch-up, and enforce the two-hour recovery expiry. Report storage failures while keeping an in-memory round usable. A replay is an explicit new draw; these are trusted-host draws, not server-verified results.
- Preserve Derby's custom names, character choices, three-second countdown, 18-second race, and frozen final positions. Hot Mic uses the nine established team presets, allows any character for each attendee, and retains its 13-second sequence, two false pauses, and distinct final handoff to the opening speaker.

## Rendering

- In typing races, derive distance from valid characters. The personal camera shows exactly 50 meters behind and ahead, including space outside the start and finish lines.
- In typing races, keep lanes stable while ranks change. Show every racer in the radar and indicate opponents outside the personal camera.
- Use time-based requestAnimationFrame motion toward known positions. Never extrapolate remote progress or let animation decide the winner.
- Avoid layout reads in animation loops. Stop frame requests when positions settle, pause in hidden documents, and release observers and listeners on exit.
- Honor reduced-motion preferences and provide an explicit toggle. Freeze disconnected racers; decorative effects must not suggest continued progress.
- Use original artwork, preserve image alpha, document generated asset provenance, and insert all player-provided text with textContent.
- Keep at least five distinct car models in the garage. Use different models before repeating in the field and distinct colors for all nine seats. Derive appearances from shared identity so all screens and reconnections show the same cars.
- Maintain the nine established sack characters, six jump poses, and one ordinary hop per two correct characters. Allow an odd final character to reach the finish; catch up delayed network bursts without replaying an unbounded queue. Finish, disconnect, hidden-page, and reduced-motion states must stop hops.
- Use only the explicitly requested team-name presets. Do not infer gender, skin tone, nationality, or ethnicity for unfamiliar names. Every participant may use any character; persist choices on the server for multiplayer rounds and in validated browser storage for host-operated games.
- Show sack character choices as spacious, complete illustrations without fictional names. Give each choice an accessible visual description. Keep lobby controls aligned and their positions stable when readiness changes.
- Keep the user-requested team likenesses consistent across all six sack poses and four seated chair poses, including Kate's and Devan's glasses. Both legs must remain in front of the chair in every seated pose. Use the supplied photos only as local generation references; commit generated sprites and provenance. Version replacement sprite filenames so browsers load the updated artwork.

## Sound

- Sound is optional, starts off on each page load, and unlocks through a user gesture. Keep sound and reduced-motion controls independent; audio must never affect an outcome.
- Bound voices, sample loading, and scheduling. Muting, hiding, leaving, starting a new round, or losing a room connection must stop applicable active and scheduled effects. Never queue missed sounds or replay a celebration for a restored result or a finish that occurred while hidden.
- Release audio resources and handle failed activation with usable controls and feedback. Preserve original composition and sample provenance, licensing, and versioned asset paths.

## Security and cost

- Never commit credentials, session tokens, local environment files, or private logs. Generate capabilities with Web Crypto.
- Keep host capabilities out of invitation URLs and public snapshots. Insert player text with textContent, never HTML.
- Validate request origins, payload sizes, room IDs, names, capacity, and race phases.
- Use the Cloudflare free plan. Do not enable paid products or upgrade billing without explicit user authorization.
- Use Wrangler configuration as the deployment source of truth and generate binding types with npm run types.
- Review the installed Cloudflare skills and current official documentation when changing platform behavior.

## Validation and delivery

- Run npm run check before delivery. Test actual Workers behavior for synchronization, simultaneous finishes, authorization, recovery, and expiration.
- Cover host-operated games' unbiased draws, frozen plans, validated recovery, expiry, and audio lifecycle. When gameplay or presentation changes, verify the affected host/player flow in a browser, including narrow layouts, reduced motion, and refresh recovery. Documentation-only or dependency-only maintenance does not by itself require new browser work.
- Keep dependencies pinned and commit the lockfile. Use npm ci in CI.
- Update documentation when behavior or setup changes. Explain what was verified and any practical limitations.
- The frontend publishes from main through GitHub Pages; Worker deployment is separate and uses Wrangler configuration. Do not deploy the Worker during a live room game: Worker deployments disconnect WebSockets. Frontend-only publication must not unnecessarily redeploy the Worker.

## Browser cleanup

- Close every headless browser you launch as soon as it is no longer needed, including failed runs. Use browser.close() in finally for browser scripts, or the matching agent-browser session close command.
- Before finishing, inspect processes with ps -Ao pid,ppid,etime,command and filter for agent-browser-darwin, remote-debugging-port, and --headless, excluding Helper processes.
- Stop only processes created by this task. Never close the user's browser or another active agent's session.
