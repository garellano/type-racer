function uint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

// Rejection sampling avoids modulo bias, including for a 25-person field.
export function randomIndex(count: number, draw: () => number = uint32): number {
  if (!Number.isInteger(count) || count < 1 || count > 25) throw new Error("Invalid draw size.");
  const limit = 0x100000000 - (0x100000000 % count);
  let value: number;
  do value = draw();
  while (value >= limit);
  return value % count;
}

export function shuffled<T>(
  items: readonly T[],
  draw: (count: number) => number = randomIndex,
): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = draw(index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
