# Type Racer

A short multiplayer typing race to choose who starts the daily standup.

**[Play Type Racer](https://garellano.github.io/type-racer/)** · [Product concept](docs/concept.md) · [Multiplayer design](docs/multiplayer.md) · [Validation guide](docs/validation.md)

## Multiplayer prototype

Create a room, copy its invitation link, and invite 2–8 teammates. Everyone marks ready before the host starts a shared five-second countdown. Correctly typed characters advance the cars. The server confirms one winner, who starts the standup. Reset after a result to race again.

This milestone tests real multiplayer with simple car graphics. Rich animation, a scrolling camera, a minimap, car selection, and selectable languages are future milestones. Current copy and passages are in English.

- Frontend: vanilla TypeScript and Vite, hosted on GitHub Pages.
- Coordination: Cloudflare Worker, one SQLite-backed Durable Object per room, and secure hibernating WebSockets.
- Cost target: Cloudflare Free, without enabling paid subscriptions. Account-wide quotas apply.
- Recovery: refreshing the same tab restores your session and confirmed progress. Temporary disconnects retry automatically.
- Privacy: invitation links contain only a random room ID. Credentials stay in tab session storage; the server stores hashes. Rooms expire two hours after creation and their data is deleted.

## Local development

Use Node.js 22.12 or later and npm.

```sh
npm ci
cp .env.example .env
npm run dev:worker
```

In a second terminal:

```sh
npm run dev
```

Open `http://127.0.0.1:5173/type-racer/`. Open an invitation in a second tab or browser. Create a new tab manually; duplicating an active racer tab can copy its session storage.

```sh
npm run types          # Regenerate bindings after Wrangler changes
npm run check          # Types, formatting, Workers tests, and both builds
npm run smoke -- http://127.0.0.1:8787 http://127.0.0.1:5173
```

## Deployment

The frontend deploys from `main` through GitHub Actions. Its public backend URL lives in `.github/workflows/pages.yml`; this configuration is not a secret. Fragment-based invitations work without a routing fallback. GitHub Pages must use GitHub Actions as its build source.

Wrangler configuration is the backend source of truth. For local CLI deployment:

```sh
npx wrangler login
npm run deploy:worker
```

An authorized Cloudflare MCP connection can also upload the bundle from `npm run build:worker` with the same bindings, migrations, compatibility, and observability settings. The initial deployment uses this connection. Never include an API token in this repository or frontend.

Update `ALLOWED_ORIGINS` if the frontend host changes. Deploy between races: backend deployments disconnect active WebSockets.

## Practical limits

A shared server timestamp and clock estimation coordinate the start; Internet latency still exists. The first valid complete passage **received by the server** wins. Close finishes can favor lower latency. This is a casual team game without verified physical-keystroke anti-cheat.

Pasting is blocked in the interface, but a modified client can automate typing. A round ends without a winner if nobody finishes within 90 seconds. The 45–60 second goal depends on typing speed and needs team tuning.

Rooms are unlisted and payloads/connections are bounded, but comprehensive abuse protection is outside this prototype. Add creation/message rate limits and quota monitoring before broad public promotion.

Read [AGENTS.md](AGENTS.md) for standards and [the validation guide](docs/validation.md) for the team trial.
