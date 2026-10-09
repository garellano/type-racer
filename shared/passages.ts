export const RACE_LANGUAGES = ["english", "spanish", "java"] as const;
export type RaceLanguage = (typeof RACE_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<RaceLanguage, string> = {
  english: "English",
  spanish: "Spanish",
  java: "Java",
};

// Each round uses one complete passage, shared by every racer.
// Java challenges are original, single-line classes; players copy code, never execute it.
export const PASSAGES: Record<RaceLanguage, readonly [string, ...string[]]> = {
  english: [
    "The morning sun lights up the track. Eight tiny cars wait for the signal. Find a steady rhythm, and let each correct letter carry you forward. The finish line is close. Take a breath, stay focused, and enjoy the race with your team.",
    "A fresh cup of coffee sits beside the keyboard. Across the ocean, teammates gather for a quick race before standup. Type with care, correct your mistakes, and keep going. One car will reach the flag first. The whole team gets a bright start.",
  ],
  spanish: [
    "El sol de la mañana ilumina la pista. Ocho carritos esperan la señal. Encuentra un ritmo constante y deja que cada letra correcta te acerque a la meta. Respira, corrige con calma y disfruta la carrera. Tu equipo está listo para comenzar.",
    "Una taza de café espera junto al teclado. Al otro lado del océano, el equipo se reúne para una carrera antes de la junta. Escribe con cuidado, corrige los errores y sigue avanzando. La bandera espera al primer carrito. Hoy te toca abrir la charla.",
  ],
  java: [
    "class Race { static int advance(int position, int letters, int finish) { if (letters < 0) { return position; } if (position >= finish) { return finish; } int next = position + letters; if (next >= finish) { return finish; } return next; } }",
    "class Race { static int winner(int[] positions, int finish) { for (int car = 0; car < positions.length; car++) { if (positions[car] >= finish) { return car; } } return -1; } static boolean done(int car) { return car >= 0; } }",
    "class Grid { static int countReady(boolean[] racers) { int total = 0; for (boolean ready : racers) { if (ready) { total++; } } return total; } static boolean canStart(boolean[] racers) { return racers.length >= 2 && countReady(racers) == racers.length; } }",
    "class Timer { static int countdown(int seconds) { if (seconds < 0) { return 0; } int lights = 0; while (seconds > 0) { lights++; seconds--; } return lights; } static boolean go(int seconds) { return seconds == 0; } }",
    "class Lap { static int distance(int[] letters) { int meters = 0; for (int typed : letters) { if (typed > 0) { meters += typed; } } return meters; } static boolean finished(int meters, int goal) { return meters >= goal; } }",
    "class Standup { static int nextSpeaker(int winner, int teamSize) { if (teamSize <= 0) { return -1; } if (winner < 0) { return 0; } int next = winner + 1; if (next >= teamSize) { next = 0; } return next; } }",
  ],
};
