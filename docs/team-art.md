# Team likeness artwork

Generated with the built-in imagegen tool on October 11, 2026. The user supplied three photo collages and identified each teammate. These updated cartoon avatars use those photos for hair, facial features and accessories while preserving the existing six-pose layout, camera and colorful burlap-sack game style. Both women wear glasses in every pose. Names remain internal preset identifiers; the selector shows drawings with accessible descriptions.

Only generated artwork is stored in this repository. The photo references remain outside the repository. The earlier fictional sheets are retained separately in [sacks-art.md](sacks-art.md). Versioned runtime filenames prevent a browser from reusing an earlier sprite after an update. The original RGBA PNGs retain transparency; runtime WebP sheets preserve alpha in a 1152 × 768 canvas.

| Internal ID | Requested preset | Original                            | Runtime sheet                           |
| ----------- | ---------------- | ----------------------------------- | --------------------------------------- |
| `juno`      | Kate             | `art/source/sacks/juno-team.png`    | `public/assets/sacks/juno-team.webp`    |
| `orbit`     | Arath            | `art/source/sacks/orbit-team.png`   | `public/assets/sacks/orbit-team.webp`   |
| `moss`      | Emanuel Medrano  | `art/source/sacks/moss-team.png`    | `public/assets/sacks/moss-team.webp`    |
| `rio`       | Fabián           | `art/source/sacks/rio-team.png`     | `public/assets/sacks/rio-team.webp`     |
| `sunbeam`   | Sam              | `art/source/sacks/sunbeam-team.png` | `public/assets/sacks/sunbeam-team.webp` |
| `sol`       | Gerardo          | `art/source/sacks/sol-team.png`     | `public/assets/sacks/sol-team.webp`     |
| `ember`     | Devan            | `art/source/sacks/ember-team.png`   | `public/assets/sacks/ember-team.webp`   |
| `scout`     | Gary             | `art/source/sacks/scout-team.png`   | `public/assets/sacks/scout-team.webp`   |
| `clover`    | Wil              | `art/source/sacks/clover-team.png`  | `public/assets/sacks/clover-team.webp`  |

## Exact prompt set

Each generation used the common prompt below followed by its corresponding photo-selection and subject lines. Image 1 was the specified user-supplied collage. Image 2 was the original `art/source/sacks/juno.png` for both women and `art/source/sacks/sol.png` for the men, serving as a style, pose, texture and camera reference; the subject lines supplied each shirt color.

### Common prompt

```text
Use case: identity-preserve
Asset type: transparent six-pose sprite sheet for the existing multiplayer cartoon game "Jump with sacks".
Primary request: Update the illustrated adult sack racer to resemble the one specified person in the supplied reference collage. Create one cohesive six-pose sheet of that same recognizable friendly cartoon adult. This is an authorized playful avatar based on a supplied photo, not a photorealistic portrait.
Input images: Image 1 is a collage of three user-supplied reference photos; use ONLY the specified photo, ignore other people and the chat interface. Image 2 is the existing game sprite and controls the exact rendering style, elevated right-facing three-quarter camera, burlap texture, lighting, shirt/patch palette, anatomy, sprite layout and six poses. Replace the head/hair/accessories with the requested photo-based likeness and keep the established game art direction.
Style/medium: Polished warm comedic 3D cartoon game illustration, expressive face, friendly exaggerated adult proportions, detailed hair, soft sculpted highlights, woven jute sack with stitching and rolled rim. Charming rather than mocking; readable at 90 pixels.
Scene/backdrop: Actual transparent alpha, no background or ground. No brown backdrop, no painted checkerboard, no baked shadows.
Composition: EXACTLY SIX equal square cells, a precise THREE-COLUMN TWO-ROW grid, landscape 3:2 canvas. Each cell has one complete pose, horizontally centered. Same scale, baseline, character identity and camera in all six. Entire hair, eyeglasses, cap, arms and sack must fit within each own cell with at least 8 percent transparent padding on all edges. Sack bottoms at 88 percent of each cell height; character occupies about 78 percent height. Never blend adjacent poses.
Anatomy: Both legs and feet INSIDE one natural beige waist-high sack. BOTH hands grip the rolled rim at all times. Plain shirt and small shirt-colored sack patch. No steering wheels, props or brand logos.
Six poses in reading order: top-left READY relaxed upright smile; top-middle ANTICIPATION dip, gently squash the sack and determined smiling brows; top-right TAKEOFF stretch up, shoulders lift and delighted expression; bottom-left APEX slightly forward leaning torso, curled bag bottom, hair gently lifted and open joyful smile; bottom-middle DESCENT focused friendly expression and elongated sack; bottom-right LANDING dip and squash the sack with happy relieved face. The renderer will animate vertical position: keep the same sack-bottom baseline in every cell.
Constraints: All six must show the same adult likeness and requested eyewear in every pose. Preserve six complete individual illustrations, actual alpha, stable size/baseline and the established camera/style. No text, names, watermark, UI, flags or chat elements. No extra people.

```

### juno

```text
Photo selection: Use ONLY the TOP photo: the smiling woman with shoulder-length dark wavy hair in Image 1.
Subject, palette and accessories: Resemble the top woman's warm smile, brown eyes, dark eyebrows, light warm skin, oval face and shoulder-length loose dark brown waves. Add clearly visible tasteful dark oval eyeglasses because the user says she wears glasses, even though this reference photo shows none. No blonde ponytail. Keep the violet shirt and violet sack patch.
```

### orbit

```text
Photo selection: Use ONLY the MIDDLE black-and-white photo: the clean-shaven man with dark curly hair in Image 1.
Subject, palette and accessories: Resemble the middle man's rounded face, broad dark eyebrows, dark eyes and dense ear-length curly black hair with a relaxed side part. Clean-shaven, no glasses. The reference is monochrome: retain the existing avatar's medium warm tan skin. Raspberry-pink shirt and matching sack patch.
```

### moss

```text
Photo selection: Use ONLY the BOTTOM photo: the clean-shaven man in a striped shirt taking a mirror photo in Image 1.
Subject, palette and accessories: Resemble the bottom man's rounded face, straight dark eyebrows, short upright black hair and neatly trimmed sides. Medium warm skin matching the supplied color photo, clean-shaven, no glasses. Use the established green T-shirt with two subtle cream sleeve stripes and green sack patch, not the photo's striped dress shirt; no phone or mirror.
```

### rio

```text
Photo selection: Use ONLY the TOP photo: the clean-shaven man outdoors with white wired earphones and high dark hair in Image 1.
Subject, palette and accessories: Resemble the top man's lean face, dark brown eyes, strong dark eyebrows, high swept black quiff and closely trimmed sides. Warm medium skin as in the photo, clean-shaven. No glasses, no earphones or wires. Turquoise T-shirt and matching sack patch.
```

### sunbeam

```text
Photo selection: Use ONLY the MIDDLE photo: the smiling fair-skinned man with short light blond hair outdoors in Image 1.
Subject, palette and accessories: Resemble the middle man's lean smiling face, blue eyes, fair skin, straight short light blond hair and neat close crop, pale eyebrows. Clean-shaven, no glasses, no curly hair. Mint-green T-shirt with small plain cream collar and mint patch.
```

### sol

```text
Photo selection: Use ONLY the BOTTOM photo: the man with a full dark beard and high dark quiff in Image 1.
Subject, palette and accessories: Resemble the bottom man's warm medium skin, strong dark eyebrows, dark brown eyes, tall brushed-up black quiff with short sides, neatly defined full black beard connected to mustache, gently tapered face. No glasses. Gold-yellow T-shirt and gold sack patch.
```

### ember

```text
Photo selection: Use ONLY the TOP photo: the woman with shoulder-length dark hair, side-swept bangs and large rectangular eyeglasses in Image 1.
Subject, palette and accessories: Resemble the top woman's light warm skin, softly rounded oval face, brown eyes, straight shoulder-length dark brown hair and side-swept fringe. Large dark charcoal rectangular eyeglasses with transparent lenses and a soft blue-gray rim reflection, present on ALL six poses. Coral-red T-shirt and coral sack patch. No auburn bob; no necklace needed.
```

### scout

```text
Photo selection: Use ONLY the MIDDLE photo: the smiling man wearing a pale cap, wraparound black sunglasses and short beard in Image 1.
Subject, palette and accessories: Resemble the middle man's fair skin, round joyful face, cheerful toothy smile, short brown/gray stubble beard and mustache, pale stone-colored baseball cap and dark wraparound sunglasses. Cap and sunglasses appear consistently in every pose; no logos. Orange T-shirt and orange sack patch.
```

### clover

```text
Photo selection: Use ONLY the BOTTOM photo: the fair-skinned man with short silver-blond hair and rectangular eyeglasses in Image 1.
Subject, palette and accessories: Resemble the bottom man's fair skin, oval face, blue-gray eyes, softly textured short silver-blond hair swept upward, dark thin rectangular eyeglasses with transparent lenses. Clean-shaven, friendly mature adult with subtle expression lines, no red quiff. Sky-blue T-shirt and matching sack patch.
```
