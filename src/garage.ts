type WheelPosition = readonly [number, number];

export type CarModel = {
  id: string;
  name: string;
  asset: string;
  rearWheel: WheelPosition;
  frontWheel: WheelPosition;
};

export const CAR_MODELS: readonly CarModel[] = [
  {
    id: "coupe",
    name: "Sport coupe",
    asset: "arcade-coupe.webp",
    rearWheel: [18.3, 66],
    frontWheel: [73, 73],
  },
  {
    id: "rally",
    name: "Rally hatchback",
    asset: "rally-hatch.webp",
    rearWheel: [15.4, 70],
    frontWheel: [66.5, 80.2],
  },
  {
    id: "muscle",
    name: "Muscle fastback",
    asset: "muscle-fastback.webp",
    rearWheel: [15.5, 60],
    frontWheel: [59.3, 74.5],
  },
  {
    id: "roadster",
    name: "Open roadster",
    asset: "open-roadster.webp",
    rearWheel: [17.3, 64.4],
    frontWheel: [68.5, 76.1],
  },
  {
    id: "pickup",
    name: "Sport pickup",
    asset: "sport-pickup.webp",
    rearWheel: [15.8, 61.3],
    frontWheel: [64.4, 71.3],
  },
  {
    id: "supercar",
    name: "Wedge supercar",
    asset: "wedge-supercar.webp",
    rearWheel: [12.1, 51.6],
    frontWheel: [57.5, 69.8],
  },
];

const PAINTS = [
  { color: "#ffc94a", hue: 0, saturation: 1 },
  { color: "#5ad9c2", hue: 115, saturation: 1 },
  { color: "#ff9378", hue: 325, saturation: 1 },
  { color: "#86b9ff", hue: 175, saturation: 1 },
  { color: "#cca0f2", hue: 220, saturation: 1 },
  { color: "#b7df69", hue: 50, saturation: 1 },
  { color: "#f5a9d1", hue: 275, saturation: 1 },
  { color: "#b1dee4", hue: 145, saturation: 1 },
  { color: "#dbe4e5", hue: 0, saturation: 0 },
] as const;

// Appearance comes from shared room/round identity, never a client's random draw.
// Cycling the full fleet uses every model before repeating one in the field.
export function carAppearance(slot: number, seed: string) {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const model = CAR_MODELS[(slot + (hash % CAR_MODELS.length)) % CAR_MODELS.length];
  const paint = PAINTS[slot % PAINTS.length];
  if (!model || !paint) throw new Error("Missing car appearance.");
  return { model, paint };
}
