# Arcade car artwork

The production sprite is `public/assets/arcade-coupe.png`, an original transparent 1774 × 887 PNG generated with the built-in imagegen tool. TypeRush screenshots informed the elevated side perspective and readable racing silhouette. No TypeRush artwork, manufacturer logo, or Contrast Security brand asset was copied.

The generated alpha is preserved. All cars reuse this one cached image; CSS hue rotation supplies distinct paint colors, and small CSS overlays animate rims, headlights, and brake lights. The scene scales the asset for two to eight lanes. The source PNG is approximately 1.6 MB, fetched once and reused across the field; it adds no runtime image-generation dependency or service cost.

## Final generation prompt

```text
Use case: stylized-concept
Asset type: production sprite for a browser typing racing game
Primary request: One beautifully detailed original arcade sports coupe facing directly RIGHT, viewed from an elevated side three-quarter perspective: clearly see the roof, windshield, front bumper and near side of the car, with the car's travel axis strictly horizontal. A playful premium racing game sprite, with sculpted golden-yellow paint, subtle white racing stripes, black panoramic glass, visible seat silhouettes, detailed wheel arches, two near-side black tires with crisp alloy rims, wing mirrors, compact rear spoiler, door seams, small air intakes and bright headlights. Cohesive polished painted 3D illustration, clean readable silhouette and convincing material highlights, appealing rather than photorealistic. The front of the car is on the right and rear on the left.
Composition/framing: Single isolated full car, landscape composition, tight framing with only 5 percent safe margin, no clipping. View from the side at roughly 25 degrees elevation, almost orthographic, no dramatic lens distortion. Wheels align on a nearly horizontal ground line. Light from upper left. An extremely subtle translucent contact shadow only immediately under the car.
Scene/backdrop: Actual fully transparent alpha background, no floor, no background scene.
Constraints: Original design with no manufacturer badge, no logo, no text, no numbers, no watermark, no UI, no multiple views, no sprite sheet. Preserve sharp usable details at a rendered width of 140 pixels. Actual transparency, never a drawn checkerboard.
```
