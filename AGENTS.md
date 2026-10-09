# Development standards

## Product scope

Type Racer is a short multiplayer typing race for 2–8 standup participants. The current milestone proves synchronized starts, shared car progress, reconnection, and one authoritative winner. Keep visual effects simple until multiplayer validation is complete.

## Language and design

- Write source code, comments, documentation, commit messages, and interface copy in English.
- Use TypeScript with strict checking. Treat external data as unknown and validate it at the boundary.
- Prefer small, explicit modules and platform APIs. Avoid speculative abstractions, unnecessary dependencies, and mutable global server state.
- Keep presentation separate from transport and race rules. Share protocol schemas between the browser and Worker.
- Use semantic HTML, keyboard navigation, visible focus, sufficient contrast, and reduced-motion support.

## Multiplayer correctness

- One SQLite-backed Durable Object owns each room. The server controls the race epoch, start time, valid progress, and final result.
- Never trust client coordinates, finish times, player identities, or host claims. Authenticate sessions and validate every message.
- Make winner selection and persistence synchronous and atomic. Do not await external work between reading race state and committing a winner.
- Ignore stale or duplicate progress messages. Persist essential state before broadcasting it.
- Use hibernating WebSockets and bounded messages. Stop timers when no work remains; expire rooms and close their sockets.
- Preserve durable state and connection attachments across hibernation. Reconnection must recover the same player and result.
- A countdown is scheduled using the server clock; network arrivals do not individually start each client.

## Security and cost

- Never commit credentials, session tokens, local environment files, or private logs. Generate capabilities with Web Crypto.
- Keep host capabilities out of invitation URLs and public snapshots. Insert player text with textContent, never HTML.
- Validate request origins, payload sizes, room IDs, names, capacity, and race phases.
- Use the Cloudflare free plan. Do not enable paid products or upgrade billing without explicit user authorization.
- Use Wrangler configuration as the deployment source of truth and generate binding types with npm run types.
- Review the installed Cloudflare skills and current official documentation when changing platform behavior.

## Validation and delivery

- Run npm run check before delivery. Test actual Workers behavior for synchronization, simultaneous finishes, authorization, recovery, and expiration.
- Keep dependencies pinned and commit the lockfile. Use npm ci in CI.
- Update documentation when behavior or setup changes. Explain what was verified and any practical limitations.
- Do not deploy during a live team race: code deployments disconnect WebSockets.

## Browser cleanup

- Close every headless browser you launch as soon as it is no longer needed, including failed runs. Use browser.close() in finally for browser scripts, or the matching agent-browser session close command.
- Before finishing, inspect processes with ps -Ao pid,ppid,etime,command and filter for agent-browser-darwin, remote-debugging-port, and --headless, excluding Helper processes.
- Stop only processes created by this task. Never close the user's browser or another active agent's session.
