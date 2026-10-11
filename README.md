# Type Racer

A short multiplayer typing race to choose who starts the daily standup.

**[Play Type Racer](https://garellano.github.io/type-racer/)** · [Product concept](docs/concept.md) · [Multiplayer design](docs/multiplayer.md) · [Validation guide](docs/validation.md)

## The standup circuit

Create a room, copy its invitation link, and invite 2–9 teammates. The host chooses **English**, **Spanish**, or **Java** in the lobby. Everyone marks ready before the host starts a shared five-second countdown. Correctly typed characters advance the cars. Celebrate the server-confirmed winner, then see the final standings: **the last race position opens standup**. The invitation is positive: “The opening lap is yours.” Reset after a result to race again; the host can keep or change the language.

Changing the language clears everyone's readiness. Each round gives every racer the same randomly selected passage. Each mode has **24 original challenges**, with three available per Mexico City calendar day. Consecutive daily decks never overlap, including in newly created rooms; the eight-day rotation eventually repeats. A room exhausts its daily deck before recycling and avoids immediate repeats. Themes include standup, racing, collaboration, and application security at Contrast Security. Java uses small classes with simple methods, loops, conditions, and reserved words. Copy the code exactly; solving or executing it is not required. Read [the passage design](docs/passages.md).

The garage contains six original illustrated models: a sport coupe, rally hatchback, muscle fastback, open roadster, sport pickup, and wedge supercar. All share a detailed elevated three-quarter perspective. Each racer has a distinct color and stable lane. The field uses different models before repeating one, so five racers always have five models and six or more racers show the full fleet. Models rotate between rounds and stay identical on every screen and after reconnection. Your camera follows your car with exactly **50 meters behind and 50 meters ahead**. Opponents outside that view have direction and distance indicators; the race radar shows everyone across all 300 meters and highlights your camera window. Starting lights follow the shared countdown, correct typing moves the car, mistakes light the brakes, and the server-confirmed result triggers a short flag celebration. The HUD shows confirmed rank, average WPM, and elapsed race time. See [art provenance and generation prompt](docs/art.md).

Motion approaches known positions without predicting extra progress. It pauses when positions settle or the page is hidden. **Reduce motion** switches to immediate positions and removes decorative animation; the initial setting follows the browser preference. Interface copy and project documentation are in English; gameplay text follows the chosen language. Car selection, sound, and sentence-by-sentence presentation are future work.

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
npm run smoke -- http://127.0.0.1:8787 http://127.0.0.1:5173 java
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

The first finish freezes everyone's distance. The table ranks those distances, with shared places for exact ties. If several racers share the least progress, the server makes one shared draw to choose the opening speaker and saves it with the result. Reconnecting cannot redraw it. Offline participants retain their confirmed distance for that round.

Pasting is blocked in the interface, but a modified client can automate typing. A round ends without a winner if nobody finishes within 90 seconds. The 45–60 second goal depends on typing speed and needs team tuning.

Java reduces reliance on English or Spanish prose, but familiarity with Java and keyboard symbols can still affect results. All participants type identical characters, spaces, case, and punctuation within a round. Different modes are not speed benchmarks against each other.

Rooms are unlisted and payloads/connections are bounded, but comprehensive abuse protection is outside this prototype. Add creation/message rate limits and quota monitoring before broad public promotion.

Read [AGENTS.md](AGENTS.md) for standards and [the validation guide](docs/validation.md) for the team trial.
