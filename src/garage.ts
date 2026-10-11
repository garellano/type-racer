type WheelGeometry = {
  x: number;
  y: number;
  diameter: number;
  aspect: number;
};

export type CarModel = {
  id: string;
  name: string;
  asset: string;
  rearWheel: WheelGeometry;
  frontWheel: WheelGeometry;
};

export const CAR_MODELS: readonly CarModel[] = [
  {
    id: "coupe",
    name: "Sport coupe",
    asset: "arcade-coupe.webp",
    rearWheel: { x: 18.3, y: 66, diameter: 13.6, aspect: 0.85 },
    frontWheel: { x: 73, y: 73, diameter: 13.8, aspect: 0.9 },
  },
  {
    id: "rally",
    name: "Rally hatchback",
    asset: "rally-hatch.webp",
    rearWheel: { x: 15.4, y: 70, diameter: 12.3, aspect: 0.82 },
    frontWheel: { x: 66.5, y: 80.2, diameter: 13.4, aspect: 0.86 },
  },
  {
    id: "muscle",
    name: "Muscle fastback",
    asset: "muscle-fastback.webp",
    rearWheel: { x: 15.5, y: 60, diameter: 11.7, aspect: 0.76 },
    frontWheel: { x: 59.3, y: 74.5, diameter: 11.4, aspect: 0.8 },
  },
  {
    id: "roadster",
    name: "Open roadster",
    asset: "open-roadster.webp",
    rearWheel: { x: 17.3, y: 64.4, diameter: 12.8, aspect: 0.88 },
    frontWheel: { x: 68.5, y: 76.1, diameter: 12.5, aspect: 0.93 },
  },
  {
    id: "pickup",
    name: "Sport pickup",
    asset: "sport-pickup.webp",
    rearWheel: { x: 15.8, y: 61.3, diameter: 12.3, aspect: 0.81 },
    frontWheel: { x: 64.4, y: 71.3, diameter: 12.7, aspect: 0.87 },
  },
  {
    id: "supercar",
    name: "Wedge supercar",
    asset: "wedge-supercar.webp",
    rearWheel: { x: 12.1, y: 51.6, diameter: 14.1, aspect: 0.68 },
    frontWheel: { x: 57.5, y: 69.8, diameter: 14.7, aspect: 0.82 },
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
