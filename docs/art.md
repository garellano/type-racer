# Arcade car artwork

The garage contains six original models, all generated with the built-in imagegen tool. TypeRush informed the elevated side perspective and readable racing silhouettes. No TypeRush artwork, manufacturer badge, or Contrast Security brand asset was copied.

| Model           | Production sprite                                             | Original source                                          |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| Sport coupe     | [arcade-coupe.webp](../public/assets/arcade-coupe.webp)       | [arcade-coupe.png](../public/assets/arcade-coupe.png)    |
| Rally hatchback | [rally-hatch.webp](../public/assets/rally-hatch.webp)         | [rally-hatch.png](../art/source/rally-hatch.png)         |
| Muscle fastback | [muscle-fastback.webp](../public/assets/muscle-fastback.webp) | [muscle-fastback.png](../art/source/muscle-fastback.png) |
| Open roadster   | [open-roadster.webp](../public/assets/open-roadster.webp)     | [open-roadster.png](../art/source/open-roadster.png)     |
| Sport pickup    | [sport-pickup.webp](../public/assets/sport-pickup.webp)       | [sport-pickup.png](../art/source/sport-pickup.png)       |
| Wedge supercar  | [wedge-supercar.webp](../public/assets/wedge-supercar.webp)   | [wedge-supercar.png](../art/source/wedge-supercar.png)   |

The original 1774 × 887 RGBA PNGs remain unaltered. Production assets are 480 × 240 WebP copies encoded with cwebp at quality 88 and alpha quality 100. This is delivery-format preparation; the artwork itself comes from imagegen. At up to 144 CSS pixels wide, the copies provide more than three source pixels per display pixel. Browsers load only the models shown and reuse their cached textures. The original coupe PNG stays at its previous public path for older cached clients.

CSS hue rotation supplies nine paint colors, including silver. Rim overlays use model-specific wheel positions; headlights, brake lights, and chassis motion remain decorative. Shared room/round identity determines model rotation, so all screens and reconnections agree. The field uses every model before repeating: five racers show five different models, six to nine show all six. Two to four racers each receive different models, with other models appearing in later rounds. There are no extra bot competitors and no runtime image-generation service.

## Sport coupe prompt

```text
Use case: stylized-concept
Asset type: production sprite for a browser typing racing game
Primary request: One beautifully detailed original arcade sports coupe facing directly RIGHT, viewed from an elevated side three-quarter perspective: clearly see the roof, windshield, front bumper and near side of the car, with the car's travel axis strictly horizontal. A playful premium racing game sprite, with sculpted golden-yellow paint, subtle white racing stripes, black panoramic glass, visible seat silhouettes, detailed wheel arches, two near-side black tires with crisp alloy rims, wing mirrors, compact rear spoiler, door seams, small air intakes and bright headlights. Cohesive polished painted 3D illustration, clean readable silhouette and convincing material highlights, appealing rather than photorealistic. The front of the car is on the right and rear on the left.
Composition/framing: Single isolated full car, landscape composition, tight framing with only 5 percent safe margin, no clipping. View from the side at roughly 25 degrees elevation, almost orthographic, no dramatic lens distortion. Wheels align on a nearly horizontal ground line. Light from upper left. An extremely subtle translucent contact shadow only immediately under the car.
Scene/backdrop: Actual fully transparent alpha background, no floor, no background scene.
Constraints: Original design with no manufacturer badge, no logo, no text, no numbers, no watermark, no UI, no multiple views, no sprite sheet. Preserve sharp usable details at a rendered width of 140 pixels. Actual transparency, never a drawn checkerboard.
```

## rally-hatch prompt

```text
Use case: stylized-concept
Asset type: production sprite for a polished multiplayer browser typing racing game
Style/medium: Detailed original premium arcade game car, painted 3D illustration with convincing sculpted panels, crisp material highlights, dark windows, chrome alloy rims, mirrors, wheel arches, vents, seams, headlight lenses and a strong readable silhouette. Match a coherent playful racing game fleet, rather than a photographic catalog.
Color palette: Saturated golden-yellow body paint, neutral white accents, black glass and black rubber tires, metallic silver rims. Yellow body paint will be recolored in CSS, so keep neutral details neutral.
Composition/framing: Exactly ONE complete vehicle facing RIGHT. Front bumper on the right, rear on the left. Elevated side three-quarter view from approximately 25 degrees above: see the roof or cabin interior, near side and right-facing front bumper. Travel direction strictly horizontal, nearly orthographic, no dramatic lens distortion, near wheels along a nearly horizontal ground line. Landscape canvas at a 2:1 aspect ratio, car spans roughly 90 percent of the width, full body and tires visible with 5 percent safe margin. Light from upper left, extremely subtle translucent contact shadow immediately underneath.
Scene/backdrop: Actual fully transparent alpha background. No floor, no scene, no drawn checkerboard.
Constraints: Original unbranded design; no manufacturer badges, logos, text, numbers, watermark, UI, people or other objects. No multiple views, no sprite sheet. Preserve crisp useful detail when shown at 100–144 pixels wide.
Primary request: A compact boxy two-door rally hatchback. A short square hood, steep windshield, upright hatchback rear, squared fender flares, thick sporty bumper with two round auxiliary rally lamps, a small roof spoiler, visible black window frames and rugged alloy wheels. Make the silhouette unmistakably short, upright and angular; it must NOT look like a low sports coupe.
```

## muscle-fastback prompt

```text
Use case: stylized-concept
Asset type: production sprite for a polished multiplayer browser typing racing game
Style/medium: Detailed original premium arcade game car, painted 3D illustration with convincing sculpted panels, crisp material highlights, dark windows, chrome alloy rims, mirrors, wheel arches, vents, seams, headlight lenses and a strong readable silhouette. Match a coherent playful racing game fleet, rather than a photographic catalog.
Color palette: Saturated golden-yellow body paint, neutral white accents, black glass and black rubber tires, metallic silver rims. Yellow body paint will be recolored in CSS, so keep neutral details neutral.
Composition/framing: Exactly ONE complete vehicle facing RIGHT. Front bumper on the right, rear on the left. Elevated side three-quarter view from approximately 25 degrees above: see the roof or cabin interior, near side and right-facing front bumper. Travel direction strictly horizontal, nearly orthographic, no dramatic lens distortion, near wheels along a nearly horizontal ground line. Landscape canvas at a 2:1 aspect ratio, car spans roughly 90 percent of the width, full body and tires visible with 5 percent safe margin. Light from upper left, extremely subtle translucent contact shadow immediately underneath.
Scene/backdrop: Actual fully transparent alpha background. No floor, no scene, no drawn checkerboard.
Constraints: Original unbranded design; no manufacturer badges, logos, text, numbers, watermark, UI, people or other objects. No multiple views, no sprite sheet. Preserve crisp useful detail when shown at 100–144 pixels wide.
Primary request: A muscular vintage fastback inspired by classic pony-car proportions, without copying any brand. Very long broad hood, short rear deck, sloping fastback roof, wide squared shoulders, chrome bumpers, two broad white hood stripes, inset circular headlights, chunky rear haunches and deep dish alloy wheels. Low and strong, clearly different from a modern compact coupe.
```

## open-roadster prompt

```text
Use case: stylized-concept
Asset type: production sprite for a polished multiplayer browser typing racing game
Style/medium: Detailed original premium arcade game car, painted 3D illustration with convincing sculpted panels, crisp material highlights, dark windows, chrome alloy rims, mirrors, wheel arches, vents, seams, headlight lenses and a strong readable silhouette. Match a coherent playful racing game fleet, rather than a photographic catalog.
Color palette: Saturated golden-yellow body paint, neutral white accents, black glass and black rubber tires, metallic silver rims. Yellow body paint will be recolored in CSS, so keep neutral details neutral.
Composition/framing: Exactly ONE complete vehicle facing RIGHT. Front bumper on the right, rear on the left. Elevated side three-quarter view from approximately 25 degrees above: see the roof or cabin interior, near side and right-facing front bumper. Travel direction strictly horizontal, nearly orthographic, no dramatic lens distortion, near wheels along a nearly horizontal ground line. Landscape canvas at a 2:1 aspect ratio, car spans roughly 90 percent of the width, full body and tires visible with 5 percent safe margin. Light from upper left, extremely subtle translucent contact shadow immediately underneath.
Scene/backdrop: Actual fully transparent alpha background. No floor, no scene, no drawn checkerboard.
Constraints: Original unbranded design; no manufacturer badges, logos, text, numbers, watermark, UI, people or other objects. No multiple views, no sprite sheet. Preserve crisp useful detail when shown at 100–144 pixels wide.
Primary request: A compact two-seat open-top roadster. Fully open cabin with NO roof: clearly visible two black bucket seats, steering wheel, simple dashboard, two small rollover hoops and a short windscreen. Rounded short hood, sculpted fenders, petite rear trunk, a simple narrow white stripe and polished small alloy wheels. A clearly recognizable convertible silhouette, not a hardtop coupe.
```

## sport-pickup prompt

```text
Use case: stylized-concept
Asset type: production sprite for a polished multiplayer browser typing racing game
Style/medium: Detailed original premium arcade game car, painted 3D illustration with convincing sculpted panels, crisp material highlights, dark windows, chrome alloy rims, mirrors, wheel arches, vents, seams, headlight lenses and a strong readable silhouette. Match a coherent playful racing game fleet, rather than a photographic catalog.
Color palette: Saturated golden-yellow body paint, neutral white accents, black glass and black rubber tires, metallic silver rims. Yellow body paint will be recolored in CSS, so keep neutral details neutral.
Composition/framing: Exactly ONE complete vehicle facing RIGHT. Front bumper on the right, rear on the left. Elevated side three-quarter view from approximately 25 degrees above: see the roof or cabin interior, near side and right-facing front bumper. Travel direction strictly horizontal, nearly orthographic, no dramatic lens distortion, near wheels along a nearly horizontal ground line. Landscape canvas at a 2:1 aspect ratio, car spans roughly 90 percent of the width, full body and tires visible with 5 percent safe margin. Light from upper left, extremely subtle translucent contact shadow immediately underneath.
Scene/backdrop: Actual fully transparent alpha background. No floor, no scene, no drawn checkerboard.
Constraints: Original unbranded design; no manufacturer badges, logos, text, numbers, watermark, UI, people or other objects. No multiple views, no sprite sheet. Preserve crisp useful detail when shown at 100–144 pixels wide.
Primary request: A playful short-bed sport pickup truck. Boxy single cab with upright windshield, a clearly visible EMPTY open cargo bed behind the cab, a higher squared bonnet, broad wheel arches, chunky black tires with alloy rims, subtle white stripe at the lower doors, dark front grille and rectangular headlight lenses. Lowered street-racer stance but unmistakably a pickup; no roof on its cargo bed.
```

## wedge-supercar prompt

```text
Use case: stylized-concept
Asset type: production sprite for a polished multiplayer browser typing racing game
Style/medium: Detailed original premium arcade game car, painted 3D illustration with convincing sculpted panels, crisp material highlights, dark windows, chrome alloy rims, mirrors, wheel arches, vents, seams, headlight lenses and a strong readable silhouette. Match a coherent playful racing game fleet, rather than a photographic catalog.
Color palette: Saturated golden-yellow body paint, neutral white accents, black glass and black rubber tires, metallic silver rims. Yellow body paint will be recolored in CSS, so keep neutral details neutral.
Composition/framing: Exactly ONE complete vehicle facing RIGHT. Front bumper on the right, rear on the left. Elevated side three-quarter view from approximately 25 degrees above: see the roof or cabin interior, near side and right-facing front bumper. Travel direction strictly horizontal, nearly orthographic, no dramatic lens distortion, near wheels along a nearly horizontal ground line. Landscape canvas at a 2:1 aspect ratio, car spans roughly 90 percent of the width, full body and tires visible with 5 percent safe margin. Light from upper left, extremely subtle translucent contact shadow immediately underneath.
Scene/backdrop: Actual fully transparent alpha background. No floor, no scene, no drawn checkerboard.
Constraints: Original unbranded design; no manufacturer badges, logos, text, numbers, watermark, UI, people or other objects. No multiple views, no sprite sheet. Preserve crisp useful detail when shown at 100–144 pixels wide.
Primary request: A dramatic low wedge-shaped mid-engine supercar. Very flat pointed nose, slim slit headlights, low trapezoid cabin, sculpted side air intake behind the door, huge rear haunches, engine vents on the rear deck, crisp angular folded body panels, a broad low rear wing and modern multi-spoke alloy rims. A single thin white accent on the angular hood. Exotic and futuristic with an unmistakable sharp wedge silhouette, not a rounded front-engine coupe.
```
