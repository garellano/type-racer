# Bomb artwork and sound

Two original sprites were generated on October 13, 2026 with the built-in imagegen tool (default tool mode). No reference photographs, third-party art, brands, or existing characters were supplied. The final assets are [bomb-v2.webp](../public/art/bomb/bomb-v2.webp) and [boom-v2.webp](../public/art/bomb/boom-v2.webp), both 1254 × 1254 pixels. Versioned filenames avoid stale cached artwork.

Generated PNGs were encoded with `cwebp -q 90 -alpha_q 100 -m 6 -exact`, without cropping or resizing. Their alpha channels were compared pixel by pixel against the generated originals and match exactly, including translucent edges. The delivered sprites total 434,008 bytes. The countdown, wire paths, and BOOM title remain live SVG/HTML so they stay sharp, synchronized, and readable. The explosion stays within the central space between participant cards.

## Bomb prompt

```text
Use case: stylized-concept
Asset type: original transparent game sprite for a friendly multiplayer standup suspense game.
Primary request: create one polished, charming arcade bomb prop, straight-on front view, on a genuinely transparent background. A single round dark navy steel body, glossy cool blue rim highlights, brass rivets, a short curling cream fuse with a tiny warm gold spark at upper right. Rich toy-like 3D illustration, crisp edges and readable silhouette at small sizes, consistent with a modern dark navy/gold arcade interface. The bomb is playful, never realistic weaponry.
Composition: square canvas, whole object fully inside frame with small transparent margin. Spherical body centered horizontally, body occupying roughly x20–80% and y30–87%; fuse above it within y8–30%. Front middle has a simple wide blank recessed black digital display, centered at approximately x50%, y56%, with thin brass rim. Bottom front has a wide dark open wire socket at approximately x50%, y76%; it is empty so live colorful wires can be overlaid by the game. Very subtle contact shadow below only.
Constraints: isolated object only; actual alpha transparency, no background or ground plane, no lettering, numbers, labels, logo, face, hands, wires, extra objects, checkerboard, or harsh threatening imagery.
```

## Explosion prompt

```text
Use case: stylized-concept
Asset type: original transparent explosion sprite for a friendly multiplayer arcade game, companion to a glossy dark navy/brass toy bomb.
Primary request: create one polished, playful cartoon BOOM burst illustration without any text. A compact three-dimensional golden flash with coral-orange inner petals and a ring of fluffy warm cream and blue-gray smoke, a few tiny gold spark stars. Friendly celebratory surprise, rich toy-like shading, crisp silhouette readable at small sizes, no realistic destruction. Soft luminous middle left spacious and pale golden so a live BOOM! title can be placed over it.
Composition: square canvas, burst centered and radial, fully visible within frame, transparent margin 8% all around. Central pale golden flash roughly middle 40% of image, chunky layered smoke lobes around perimeter. Slightly irregular silhouette, no mushroom cloud, no objects or debris. Match a dark navy/gold arcade interface. No background or floor, actual alpha transparency, no lettering, logo, face, people, realistic flames, weapons, damage, or checkerboard.
```

## Original audio

The Web Audio score is authored in [bomb-audio.ts](../src/bomb-audio.ts), with no downloaded music, samples, or new dependencies. A sparse eight-note phrase (A3, C4, E-flat4, C4, A-flat3, C4, E-flat4, B3) sits above a synthesized double heartbeat. The pulse accelerates as the server reveals fewer connected wires. Countdown notes, a filtered noise snip and safe chime, and a short low-frequency/noise burst with a warm closing chord complete the round. Audio never affects selection or results.

Sound starts disabled. A click unlocks audio and plays a short confirmation even in the lobby. A failed unlock restores the off label and displays an explanation. Rapid clicks cannot revive an obsolete request. Muting, hiding the page, losing the connection, switching to another mode, or leaving cancels all voices. Scheduling looks ahead only 120 milliseconds with at most two beats per tick; it never catches up an unbounded backlog or replays expired cuts and explosions. Playback stops at the server deadline while waiting for a delayed final snapshot.

## Motion

The prop gently sways during selection, then a double pulse and a soft halo accelerate as fewer wires remain. Its inner SVG group moves around the socket while the outer layout and participant cards stay fixed. Fuse embers, server-clock countdown beats, a traveling light after a confirmed connection, and a ring/avatar reaction on each revealed cut provide feedback. The finale adds a small shake; the explosion springs open with a fading shockwave, sparks, and smoke particles behind the participant cards.

Connection effects expire after 1.5 seconds, cut reactions after 900 milliseconds, and explosion effects after 1.8 seconds, using the existing shared-clock tick. No new animation loop or per-frame layout reads were introduced. CSS effects, including pseudo-elements, stop for reduced motion, hidden pages, lost connections, inactive modes, or a passed round deadline. Returning never replays expired effects. The result settles to a static invitation, and animation never reveals a future cut or chooses a speaker.

## Browser evidence

[evidence/bomb-polish](evidence/bomb-polish/) contains desktop/mobile screenshots, a machine-readable PCM report, and a recording of the synthesized score captured from the real browser output. The recording contains no microphone input. The browser checks delay authenticated snapshots for creation, invitation joins, and seat recovery; measure nonzero PCM through selection, countdown, cutting, finale, and explosion; verify silence after mute, hidden state, disconnect, result, and mode change; and exercise failed audio startup, rapid clicks, and admission retry. They also verify real transform changes during suspense, traveling wire highlights, saved-card reactions, finite explosion effects, full motion cancellation (including pseudo-elements), wire endpoints, and that the burst leaves every name visible. A [short animated preview](evidence/bomb-polish/animation-preview.gif) captures the normal finale and explosion; the game then settles to its static result. The broader 25-person check remains in [evidence/bomb](evidence/bomb/).
