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

This version combines the validated multiplayer core with an original top-down circuit: a five-second countdown, personal scrolling camera, full-field radar, starting lights, and a brief finish celebration. It uses original English and Spanish passages or small Java classes. Sentence-by-sentence presentation is deferred.

The host chooses the language in the lobby. Changing it clears readiness. The server selects one passage for all racers and locks the language during the round. Java challenges use familiar racing and standup ideas: advancing a car, finding a winner, counting ready racers, and choosing the next speaker. See [passage design](passages.md).

Distance is normalized: `correct prefix length / passage length × 300 meters`. Letters, spaces, and punctuation count. Deleting correct text recalculates progress. Errors must be corrected before the correct prefix grows further; backspace and navigation never add distance.

The host participates and starts only when at least two racers are connected and everyone is ready. The first finish closes the round. Remaining positions reflect distance at that moment, not completed finish times. Exact progress ties use a stable display order. If nobody finishes within 90 seconds, the round ends without a winner.

The host can reset after a result. Disconnected guests are removed at reset. Host transfer and spectator mode are deferred. A missing host can restore their original tab session.

## Race presentation

Toy cars face right in stable lanes. The camera follows the local racer's front bumper and shows exactly 50 meters behind and ahead. It includes pre-grid and post-finish space at track boundaries. A minimap shows the entire field and the clipped camera window, with edge indicators for opponents outside the main view. Rankings use confirmed server positions.

Starting lights reflect the estimated server clock. Movement adds a small chassis and tire effect, mistakes illuminate brake lights, confirmed overtakes show a short notice, and the final shared result shows a flag and brief confetti. Effects express progress without random advantages. Reduced motion uses immediate positions and removes decorations.

The local car responds to the current correct prefix. Time-based damping brings remote cars toward confirmed positions without overshooting or continuing beyond received progress. Both advance and deletion animate. Frame requests stop once positions settle, and hidden pages and disconnected sessions settle without drifting. The server determines the winner. Rendering uses the browser's animation frame schedule; device performance is not guaranteed.

Later work includes configurable lengths, sentence presentation, car selection, optional sound, and spectator mode. Tune passage length using the actual team; punctuation can make Java slower than prose of the same length.
