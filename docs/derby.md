# Office Derby

[Open Office Derby](https://garellano.github.io/type-racer/#game=derby) from the game chooser or its direct link. This is a host-operated game for **2–25 participants**: the host shares their screen, the characters race automatically, and **the winner opens standup**. Participants do not need to join a room, mark ready, type, or press any buttons.

## Hosting a round

Select the teammates who are present, add custom names when needed, and choose any character for each participant. The established team presets are Sam, Gary, Wil, Kate, Devan, Gerardo, Fabián, Emanuel Medrano, and Arath. Presets are explicit name-to-character matches; unfamiliar names never trigger guesses about gender, nationality, ethnicity, or appearance. Each character choice has an accessible visual description.

Start the round after selecting at least two people. The participant list and character choices freeze for the round. A **three-second countdown** precedes an **18-second automatic race**. Names stay associated with stable lanes while the chairs accelerate and overtake. The result celebrates one winner and warmly hands them the microphone to begin standup. Replay retains the team list for the next draw.

Office Derby uses its own host-controlled list. The existing room-based Race cars, Jump with sacks, and Defuse the bomb games keep their existing rules, capacities, invitations, and authoritative Worker state.

## Randomness and the result

Web Crypto supplies random integers with rejection sampling. A Fisher–Yates shuffle gives every selected participant an equal chance to win. The complete outcome and motion plan are frozen before the countdown is displayed; the animation presents that choice and cannot select a different winner.

Each planned path moves forward toward its fixed endpoint. The selected winner reaches the finish first, then every position freezes. A slow computer, hidden page, or reduced-motion setting cannot change the selected person. Returning to a hidden tab catches up to the saved timeline instead of replaying a queue of missed strides.

This is a casual draw operated by a trusted host. It is not a tamper-resistant giveaway or a result independently verified by a server.

## Animation and access

The nine approved team likenesses sit in cushioned office chairs. Each has four illustrated phases: coast, reach forward, heel pull, and recovery. Both knees and both feet remain in front of the hips and chair in every phase. Kate and Devan retain their distinct glasses; Gary retains his cap and sunglasses. See [artwork provenance](derby-art.md).

Time-based animation approaches the saved positions. Strides stop during the countdown, after the result, when the document is hidden, when reduced motion is enabled, and when leaving the game. The explicit reduced-motion control initially follows the browser preference. Interface controls use ordinary HTML buttons, checkboxes, and selects with visible focus; phase changes and the final invitation use status announcements. Participant names are inserted as text.

## Browser storage and recovery

The host's roster is kept in **local storage** for reuse in the same browser. The frozen round and result are kept in **session storage** for the current tab, validated when read, and expire after two hours. Refreshing that tab restores the same planned race or final speaker without making another draw. Resetting for a new round is an explicit new draw.

These choices and results are local to the host's browser. Opening the public link on another device does not synchronize the roster, race, or result. Share the host's screen during the call. Closing the tab, clearing browser data, using private browsing, or browser storage restrictions can limit recovery. If persistence is unavailable, the game reports that limitation; keeping the current tab open allows the in-memory round to continue.

Office Derby makes no room or WebSocket connection and does not send the roster to the multiplayer Worker. The game adds no infrastructure or paid product. Existing multiplayer games continue to use their original server authority and reconnection behavior.

## Validation

Before delivery, run the repository checks:

```sh
npm run check
```

Validate the host flow in a browser: select and edit the roster, choose characters, start a complete round, refresh during the countdown and race, recover the same result, replay, use keyboard navigation, test reduced motion, and leave the page during animation. Inspect both desktop and narrow layouts, including long names and the maximum field size.

Rule tests should cover unbiased integer sampling and winner eligibility, validated persisted state, duplicate names and IDs, immutable rosters, monotonic paths, the selected winner reaching the line first, frozen final positions, and expiry. Existing Workers tests remain part of `npm run check` to guard the three room-based games. Browser and publication evidence is recorded when those checks are performed; this document does not by itself assert a completed deployment.

### November 2, 2026 verification

The repository checks pass with 71 tests across 10 files, including 17 Office Derby rule tests. Both production builds and generated Worker bindings were checked; no Worker configuration or server behavior changed.

Browser validation exercised the game chooser and direct entry, the nine-person lineup, custom names and avatar changes, case-insensitive duplicate rejection, a complete race, countdown refresh recovery, the same opening speaker after result refresh, replay, and Back to games. A 390-pixel frame exercised all 25 seats, the disabled capacity control, a 24-character unbroken name, reduced motion, countdown recovery, and the final invitation. All test participants were removed afterward.

The desktop hallway includes its own countdown and clock and is framed when the round starts. Large fields and narrow screens can require vertical scrolling; the result is brought into view once. Browser tabs and the local preview server are closed after validation. Publication uses the existing GitHub Pages workflow and does not redeploy the multiplayer Worker.
