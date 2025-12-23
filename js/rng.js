export function randomIntInclusive(min, max) {
  const minNum = Number(min);
  const maxNum = Number(max);
  if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) return NaN;

  const lo = Math.ceil(Math.min(minNum, maxNum));
  const hi = Math.floor(Math.max(minNum, maxNum));
  const range = hi - lo + 1;
  if (range <= 1) return lo;

  if (globalThis.crypto?.getRandomValues) {
    const maxUint32Plus1 = 0x100000000; // 2^32
    const limit = Math.floor(maxUint32Plus1 / range) * range;
    const buf = new Uint32Array(1);
    let x = 0;
    do {
      globalThis.crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return lo + (x % range);
  }

  return lo + Math.floor(Math.random() * range);
}

export function rollDie(sides = 6) {
  const s = Number(sides);
  if (!Number.isFinite(s) || s <= 1) return 1;
  return randomIntInclusive(1, Math.floor(s));
}

export function rollDiceTotal(sides, count = 1) {
  const c = Math.max(1, Math.floor(Number(count) || 1));
  let total = 0;
  for (let i = 0; i < c; i += 1) total += rollDie(sides);
  return total;
}

