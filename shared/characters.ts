export const CHARACTER_IDS = [
  "sunbeam",
  "scout",
  "clover",
  "juno",
  "ember",
  "sol",
  "rio",
  "moss",
  "orbit",
] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTERS: readonly {
  id: CharacterId;
  name: string;
  color: string;
  detail: string;
}[] = [
  { id: "sunbeam", name: "Sunbeam", color: "#9fd5b5", detail: "Short blond hair · mint shirt" },
  { id: "scout", name: "Scout", color: "#ffad59", detail: "Pale cap · sunglasses · orange shirt" },
  { id: "clover", name: "Clover", color: "#6ebce5", detail: "Silver hair · glasses · blue shirt" },
  { id: "juno", name: "Juno", color: "#bf9be8", detail: "Wavy dark hair · glasses · violet shirt" },
  {
    id: "ember",
    name: "Ember",
    color: "#f68c7d",
    detail: "Dark side-swept hair · glasses · coral shirt",
  },
  { id: "sol", name: "Sol", color: "#ffcf58", detail: "Dark quiff and beard · gold shirt" },
  { id: "rio", name: "Rio", color: "#55dbd4", detail: "Dark quiff · turquoise shirt" },
  { id: "moss", name: "Moss", color: "#9dc88d", detail: "Short dark hair · green shirt" },
  { id: "orbit", name: "Orbit", color: "#ee88b2", detail: "Dark curls · raspberry shirt" },
];

// These are team-requested avatar presets, never demographic guesses about new names.
const TEAM_PRESETS: Readonly<Record<string, CharacterId>> = {
  sam: "sunbeam",
  gary: "scout",
  wil: "clover",
  kate: "juno",
  devan: "ember",
  gerardo: "sol",
  fabian: "rio",
  emanuel: "moss",
  arath: "orbit",
};

export function teamCharacter(name: string): CharacterId | undefined {
  const first = name.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().split(/\s+/)[0];
  return first ? TEAM_PRESETS[first] : undefined;
}

export function chooseCharacter(name: string, used: readonly CharacterId[] = []): CharacterId {
  return teamCharacter(name) ?? CHARACTER_IDS.find((id) => !used.includes(id)) ?? "sunbeam";
}

export function character(id: CharacterId) {
  return CHARACTERS.find((item) => item.id === id) ?? CHARACTERS[0]!;
}
