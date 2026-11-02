# Office Derby artwork

The approved Office Derby artwork was generated with the **built-in imagegen tool on November 2, 2026**. It adapts the existing generated team likenesses from [Jump with sacks](team-art.md) into office-chair racers. The source references were the local generated `public/assets/sacks/*-team.webp` character sheets; no original private photo references are copied into this project.

The user approved the seated animation after requesting both legs in front of the chair. All 36 poses keep both knees and both feet forward. Kate and Devan retain their distinct glasses, Gary keeps his pale cap and sunglasses, and every character preserves their established face, hair, facial hair, and shirt palette.

## Files and layout

Each atlas has **four columns and three rows**. Every row contains one character through the same four phases, read left to right: **coast / neutral**, **reach forward**, **heel pull**, and **recovery**. The fourth frame returns naturally to the first.

| Atlas | Rows, top to bottom            | Original PNG                      | Runtime WebP                          |
| ----- | ------------------------------ | --------------------------------- | ------------------------------------- |
| A     | Sam, Gary, Wil                 | `art/source/derby/chair-a-v2.png` | `public/assets/derby/chair-a-v2.webp` |
| B     | Kate, Devan, Gerardo           | `art/source/derby/chair-b-v2.png` | `public/assets/derby/chair-b-v2.webp` |
| C     | Fabián, Emanuel Medrano, Arath | `art/source/derby/chair-c-v2.png` | `public/assets/derby/chair-c-v2.webp` |

Original PNGs are **1448 × 1086 RGBA** with 362-pixel square cells. Runtime atlases are **1024 × 768 RGBA**, with 256-pixel square cells. The three runtime files total **563,164 bytes**. Versioned `v2` filenames prevent browsers from reusing the earlier fixed-pose concept artwork.

The runtime files were resized and encoded with `cwebp`, color quality 82, alpha quality 100, and method 6. Alpha is preserved losslessly at the resized dimensions. This was format and size optimization only; the generated drawings were not creatively edited with local image-processing code. The original PNGs are copied unchanged.

[Portable provenance and SHA-256 hashes](../art/source/derby/provenance.json) record the layouts, dimensions, source generation filenames, runtime settings, and alpha bounding boxes for every cell. [Exact machine-readable prompts](../art/source/derby/prompts.json) are retained alongside the originals.

The browser presents one square cell with `background-size: 400% 300%`, selecting a phase across the four columns and a character down the three rows. Stride timing is separate from the race's saved outcome. Wheel baselines vary by at most three source pixels within each character's cycle; the renderer preserves the complete cell, including hair close to the upper edge.

## Exact generation prompts

The following prompts are copied verbatim from the approved generation. Each atlas used its three corresponding existing generated team sprite sheets, in the listed row order, with transparent background requested.

### Atlas A — Sam, Gary, Wil

```text
Use case: identity-preserve.
Asset type: FOUR-FRAME chair-scooting animation sprite atlas, transparent background, for an existing cartoon team game.
Primary request: Replace the sack activity of the THREE reference avatars with a REAL SEATED OFFICE-CHAIR SCOOTING CYCLE. These must be the SAME recognizable avatars from the supplied reference images, in the same beautiful warm polished 3D cartoon style. Use the top-left pose of each reference for identity only; REMOVE all sacks.
CRITICAL POSTURE CORRECTION: The user specifically requests BOTH LEGS IN FRONT OF THE CHAIR at ALL TIMES. This means both knees and BOTH shoes point toward the RIGHT, in front of the seated person's hips and in front of the chair's central stem. NEVER extend any leg, calf, or shoe backward to the LEFT behind the chair. No split-leg running pose, no leg under/behind backrest, no standing. Both thighs rest forward on the seat, hips stay seated, hands stay on armrests. Natural adult seated posture.
Exact atlas composition: ONE landscape FOUR-COLUMN by THREE-ROW regular grid: exactly TWELVE complete individual full-body illustrations in TWELVE equal SQUARE cells, no gap or dividers. Each ROW is ONE avatar through FOUR animation phases, left-to-right. The three rows are three different reference avatars in specified order. Prefer 2048x1536. Fixed character/chair scale, locked camera and stable five-caster wheel baseline at 88% of each square cell. Keep whole chair, head and BOTH front shoes within each cell with at least 8% padding. Across all four phases the chair frame, seat, face, hips and hair must stay registered to the SAME pixel positions; only knees, lower legs, feet, and a tiny torso effort move. No per-frame zooming, drifting or camera changes.
Four exact columns, for EACH row:
COLUMN 1 — COAST / NEUTRAL: seated upright, both thighs forward, both knees comfortably bent around 100 degrees, both sneakers together IN FRONT of the chair base, slightly lifted. Friendly focused smile.
COLUMN 2 — REACH FORWARD: hips still seated, BOTH lower legs extend further FORWARD TO THE RIGHT, BOTH heels reaching out ahead, toes slightly lifted. Knees open, neither leg goes backward.
COLUMN 3 — HEEL PULL: BOTH heels plant on the imaginary floor IN FRONT of the chair, toes raised, knees flex closer toward a seated right angle, lightly lean torso forward as heels pull the rolling chair toward the feet. BOTH feet remain to the RIGHT of the chair's central post.
COLUMN 4 — RECOVER: both feet lift slightly in front, knees bend, one shoe a little higher than the other while returning toward neutral, feet still FORWARD. This should flow smoothly into column1; no leg behind the body.
Chair and wardrobe: ordinary cushioned ergonomic office chair, colored upholstery matching each shirt, graphite frame, armrests, center stem and rolling five-caster base. Chair back stays behind torso on the LEFT. Plain dark navy trousers and gray clean sneakers with light soles. Elevated SIDE THREE-QUARTER view looking at face, all avatars face and travel RIGHT. Large expressive head, friendly original adult proportions, soft upper-left studio highlights and detailed hair matching references.
Transparency: genuinely empty alpha background throughout the atlas. NO ground, backdrop, gradients, halos, shadows, painted checkerboard or dividers.
Constraints: EXACTLY12 cells with 3 identities x4 poses. Same face/accessories/shirt per row. Preserve all eyewear and cap in every phase. Complete shoes and casters visible. No sack or burlap. No text, names, arrows, numbers, logos or watermark. Both legs IN FRONT in ALL12 images.
EXACT ROW IDENTITY ORDER:
ROW 1: Sam, exactly the avatar from reference image 1: short neat light blond hair, blue eyes, fair skin, clean-shaven, mint shirt with cream collar, no glasses.
ROW 2: Gary, exactly the avatar from reference image 2: pale stone baseball cap, black wraparound sunglasses, short brown-gray beard and mustache, orange shirt.
ROW 3: Wil, exactly the avatar from reference image 3: short silver-blond hair, thin dark rectangular clear-lens eyeglasses, clean-shaven mature friendly face, sky-blue shirt.
```

### Atlas B — Kate, Devan, Gerardo

```text
Use case: identity-preserve.
Asset type: FOUR-FRAME chair-scooting animation sprite atlas, transparent background, for an existing cartoon team game.
Primary request: Replace the sack activity of the THREE reference avatars with a REAL SEATED OFFICE-CHAIR SCOOTING CYCLE. These must be the SAME recognizable avatars from the supplied reference images, in the same beautiful warm polished 3D cartoon style. Use the top-left pose of each reference for identity only; REMOVE all sacks.
CRITICAL POSTURE CORRECTION: The user specifically requests BOTH LEGS IN FRONT OF THE CHAIR at ALL TIMES. This means both knees and BOTH shoes point toward the RIGHT, in front of the seated person's hips and in front of the chair's central stem. NEVER extend any leg, calf, or shoe backward to the LEFT behind the chair. No split-leg running pose, no leg under/behind backrest, no standing. Both thighs rest forward on the seat, hips stay seated, hands stay on armrests. Natural adult seated posture.
Exact atlas composition: ONE landscape FOUR-COLUMN by THREE-ROW regular grid: exactly TWELVE complete individual full-body illustrations in TWELVE equal SQUARE cells, no gap or dividers. Each ROW is ONE avatar through FOUR animation phases, left-to-right. The three rows are three different reference avatars in specified order. Prefer 2048x1536. Fixed character/chair scale, locked camera and stable five-caster wheel baseline at 88% of each square cell. Keep whole chair, head and BOTH front shoes within each cell with at least 8% padding. Across all four phases the chair frame, seat, face, hips and hair must stay registered to the SAME pixel positions; only knees, lower legs, feet, and a tiny torso effort move. No per-frame zooming, drifting or camera changes.
Four exact columns, for EACH row:
COLUMN 1 — COAST / NEUTRAL: seated upright, both thighs forward, both knees comfortably bent around 100 degrees, both sneakers together IN FRONT of the chair base, slightly lifted. Friendly focused smile.
COLUMN 2 — REACH FORWARD: hips still seated, BOTH lower legs extend further FORWARD TO THE RIGHT, BOTH heels reaching out ahead, toes slightly lifted. Knees open, neither leg goes backward.
COLUMN 3 — HEEL PULL: BOTH heels plant on the imaginary floor IN FRONT of the chair, toes raised, knees flex closer toward a seated right angle, lightly lean torso forward as heels pull the rolling chair toward the feet. BOTH feet remain to the RIGHT of the chair's central post.
COLUMN 4 — RECOVER: both feet lift slightly in front, knees bend, one shoe a little higher than the other while returning toward neutral, feet still FORWARD. This should flow smoothly into column1; no leg behind the body.
Chair and wardrobe: ordinary cushioned ergonomic office chair, colored upholstery matching each shirt, graphite frame, armrests, center stem and rolling five-caster base. Chair back stays behind torso on the LEFT. Plain dark navy trousers and gray clean sneakers with light soles. Elevated SIDE THREE-QUARTER view looking at face, all avatars face and travel RIGHT. Large expressive head, friendly original adult proportions, soft upper-left studio highlights and detailed hair matching references.
Transparency: genuinely empty alpha background throughout the atlas. NO ground, backdrop, gradients, halos, shadows, painted checkerboard or dividers.
Constraints: EXACTLY12 cells with 3 identities x4 poses. Same face/accessories/shirt per row. Preserve all eyewear and cap in every phase. Complete shoes and casters visible. No sack or burlap. No text, names, arrows, numbers, logos or watermark. Both legs IN FRONT in ALL12 images.
EXACT ROW IDENTITY ORDER:
ROW 1: Kate, exactly the avatar from reference image 1: shoulder-length loose dark brown WAVY hair, DARK OVAL CLEAR-LENS EYEGLASSES in all four frames, violet shirt.
ROW 2: Devan, exactly the avatar from reference image 2: shoulder-length STRAIGHT dark brown hair, side-swept fringe, LARGE CHARCOAL RECTANGULAR CLEAR-LENS EYEGLASSES in all four frames, coral-red shirt.
ROW 3: Gerardo, exactly the avatar from reference image 3: tall swept-up black quiff, full defined black beard connected to mustache, gold-yellow shirt, no glasses.
```

### Atlas C — Fabián, Emanuel Medrano, Arath

```text
Use case: identity-preserve.
Asset type: FOUR-FRAME chair-scooting animation sprite atlas, transparent background, for an existing cartoon team game.
Primary request: Replace the sack activity of the THREE reference avatars with a REAL SEATED OFFICE-CHAIR SCOOTING CYCLE. These must be the SAME recognizable avatars from the supplied reference images, in the same beautiful warm polished 3D cartoon style. Use the top-left pose of each reference for identity only; REMOVE all sacks.
CRITICAL POSTURE CORRECTION: The user specifically requests BOTH LEGS IN FRONT OF THE CHAIR at ALL TIMES. This means both knees and BOTH shoes point toward the RIGHT, in front of the seated person's hips and in front of the chair's central stem. NEVER extend any leg, calf, or shoe backward to the LEFT behind the chair. No split-leg running pose, no leg under/behind backrest, no standing. Both thighs rest forward on the seat, hips stay seated, hands stay on armrests. Natural adult seated posture.
Exact atlas composition: ONE landscape FOUR-COLUMN by THREE-ROW regular grid: exactly TWELVE complete individual full-body illustrations in TWELVE equal SQUARE cells, no gap or dividers. Each ROW is ONE avatar through FOUR animation phases, left-to-right. The three rows are three different reference avatars in specified order. Prefer 2048x1536. Fixed character/chair scale, locked camera and stable five-caster wheel baseline at 88% of each square cell. Keep whole chair, head and BOTH front shoes within each cell with at least 8% padding. Across all four phases the chair frame, seat, face, hips and hair must stay registered to the SAME pixel positions; only knees, lower legs, feet, and a tiny torso effort move. No per-frame zooming, drifting or camera changes.
Four exact columns, for EACH row:
COLUMN 1 — COAST / NEUTRAL: seated upright, both thighs forward, both knees comfortably bent around 100 degrees, both sneakers together IN FRONT of the chair base, slightly lifted. Friendly focused smile.
COLUMN 2 — REACH FORWARD: hips still seated, BOTH lower legs extend further FORWARD TO THE RIGHT, BOTH heels reaching out ahead, toes slightly lifted. Knees open, neither leg goes backward.
COLUMN 3 — HEEL PULL: BOTH heels plant on the imaginary floor IN FRONT of the chair, toes raised, knees flex closer toward a seated right angle, lightly lean torso forward as heels pull the rolling chair toward the feet. BOTH feet remain to the RIGHT of the chair's central post.
COLUMN 4 — RECOVER: both feet lift slightly in front, knees bend, one shoe a little higher than the other while returning toward neutral, feet still FORWARD. This should flow smoothly into column1; no leg behind the body.
Chair and wardrobe: ordinary cushioned ergonomic office chair, colored upholstery matching each shirt, graphite frame, armrests, center stem and rolling five-caster base. Chair back stays behind torso on the LEFT. Plain dark navy trousers and gray clean sneakers with light soles. Elevated SIDE THREE-QUARTER view looking at face, all avatars face and travel RIGHT. Large expressive head, friendly original adult proportions, soft upper-left studio highlights and detailed hair matching references.
Transparency: genuinely empty alpha background throughout the atlas. NO ground, backdrop, gradients, halos, shadows, painted checkerboard or dividers.
Constraints: EXACTLY12 cells with 3 identities x4 poses. Same face/accessories/shirt per row. Preserve all eyewear and cap in every phase. Complete shoes and casters visible. No sack or burlap. No text, names, arrows, numbers, logos or watermark. Both legs IN FRONT in ALL12 images.
EXACT ROW IDENTITY ORDER:
ROW 1: Fabián, exactly the avatar from reference image 1: high swept black quiff, closely trimmed sides, lean clean-shaven face, turquoise shirt, no glasses or earphones.
ROW 2: Emanuel Medrano, exactly the avatar from reference image 2: short upright black hair, rounded clean-shaven face, green shirt with TWO CREAM SLEEVE STRIPES, no glasses.
ROW 3: Arath, exactly the avatar from reference image 3: dense ear-length black curls, broad eyebrows, rounded clean-shaven face, raspberry pink shirt, no glasses.
```
