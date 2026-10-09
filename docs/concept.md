# Product concept

Type Racer turns the choice of the first standup speaker into a short typing competition. The winner begins; the team then follows its usual practice of naming the next speaker. [Type Rush](https://www.typerush.com/) is a reference for the mechanic; this project uses original passages and graphics.

## Agreed direction

- 2–8 participants join by invitation without accounts.
- A fixed finish line: completing the shared text first wins.
- Approximately 45–60 seconds per round, tuned with the team.
- A selectable language for each race: English, Spanish, or Java.
- Top-down cars, stable lanes, fluid motion, and live shared positions.
- A public GitHub repository, GitHub Pages frontend, and Cloudflare Free coordination.

## Current milestone

Prove a shared start time, valid progress, one consistent result, and session recovery before adding rich animation. This version uses a five-second countdown, original English and Spanish passages or small Java classes, and a simple full-track view. Sentence-by-sentence presentation is deferred.

The host chooses the language in the lobby. Changing it clears readiness. The server selects one passage for all racers and locks the language during the round. Java challenges use familiar racing and standup ideas: advancing a car, finding a winner, counting ready racers, and choosing the next speaker. See [passage design](passages.md).

Distance is normalized: `correct prefix length / passage length × 300 meters`. Letters, spaces, and punctuation count. Deleting correct text recalculates progress. Errors must be corrected before the correct prefix grows further; backspace and navigation never add distance.

The host participates and starts only when at least two racers are connected and everyone is ready. The first finish closes the round. Remaining positions reflect distance at that moment, not completed finish times. Exact progress ties use a stable display order. If nobody finishes within 90 seconds, the round ends without a winner.

The host can reset after a result. Disconnected guests are removed at reset. Host transfer and spectator mode are deferred. A missing host can restore their original tab session.

## Later visual milestone

Use toy cars viewed from above and a camera following the local racer, initially showing about 50 meters behind and ahead. A minimap shows the entire field, with edge indicators for opponents outside the camera window. Keep lanes stable when rankings change.

Design grid entry, readiness, starting lights, acceleration, overtaking, mistakes, sentence changes, finish approach, flag, and celebration. Effects express progress without random advantages. Add optional sound and reduced motion.

The local car responds immediately to typing. Remote cars interpolate between confirmed positions without extrapolating progress during disconnection. The server determines the winner. Aim for 60 frames per second where devices support it.

After multiplayer validation, choose configurable lengths, sentence presentation, car selection, spectator mode, and the visual style. Tune passage length using the actual team; punctuation can make Java slower than prose of the same length.
