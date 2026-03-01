import { mulberry32, shuffle, uniq } from './rng.ts';

export type DrillKind = 'interval' | 'triad';

export type DrillKey =
  | { kind: 'interval'; semitones: number }
  | { kind: 'triad'; quality: string };

export function drillKeyToId(k: DrillKey): string {
  return k.kind === 'interval' ? `interval:${k.semitones}` : `triad:${k.quality}`;
}

export function drillKeyFromId(id: string): DrillKey | null {
  const [kind, raw] = id.split(':');
  if (kind === 'interval') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return { kind: 'interval', semitones: n };
  }
  if (kind === 'triad') {
    if (!raw) return null;
    return { kind: 'triad', quality: raw };
  }
  return null;
}

function weightedSample<T>(items: T[], weights: number[], rng: () => number): T {
  if (items.length === 0) throw new Error('weightedSample: empty items');
  if (weights.length !== items.length) throw new Error('weightedSample: length mismatch');

  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return items[Math.floor(rng() * items.length)]!;

  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/**
 * Build a drill queue that:
 * - focuses only on the requested items
 * - avoids trivial repeats when possible
 * - is deterministic for a given seed
 */
export function buildDrillQueue(opts: {
  kind: DrillKind;
  focus: number[] | string[];
  total: number;
  seed: number;
}): string[] {
  const total = Math.max(0, Math.floor(opts.total));
  if (total === 0) return [];

  const rng = mulberry32(opts.seed);

  const focusIds =
    opts.kind === 'interval'
      ? uniq((opts.focus as number[]).map((n) => drillKeyToId({ kind: 'interval', semitones: n })))
      : uniq((opts.focus as string[]).map((q) => drillKeyToId({ kind: 'triad', quality: q })));

  if (focusIds.length === 0) return [];

  // Start from a shuffled cycle so early questions cover the set.
  let cycle = shuffle(focusIds, rng);

  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    if (cycle.length === 0) cycle = shuffle(focusIds, rng);

    // Prefer not to repeat the immediate previous item.
    const prev = out.length ? out[out.length - 1] : null;
    const candidates = cycle.filter((x) => x !== prev);
    const pickFrom = candidates.length ? candidates : cycle;

    // Tiny weight nudge: earlier items in cycle are slightly more likely.
    const weights = pickFrom.map((_, idx) => 1 + (pickFrom.length - idx) * 0.02);
    const next = weightedSample(pickFrom, weights, rng);
    out.push(next);

    // Remove one instance of next from the cycle.
    const j = cycle.indexOf(next);
    if (j >= 0) cycle.splice(j, 1);
  }

  return out;
}

/**
 * When the learner misses an item, reinsert it a few steps later (Duolingo-ish)
 * so they see it again soon, but not immediately.
 */
export function insertDrillRetry(opts: {
  queue: string[];
  pos: number;
  id: string;
  afterSteps?: number;
  maxRepeatsInQueue?: number;
}): string[] {
  const afterSteps = opts.afterSteps ?? 3;
  const maxRepeats = opts.maxRepeatsInQueue ?? 3;

  const queue = opts.queue.slice();
  const currentRepeats = queue.filter((x) => x === opts.id).length;
  if (currentRepeats >= maxRepeats) return queue;

  const insertAt = Math.min(queue.length, Math.max(opts.pos + afterSteps, opts.pos + 1));

  // Avoid creating immediate duplicates around insertion.
  const left = queue[insertAt - 1];
  const right = queue[insertAt];
  if (left === opts.id || right === opts.id) return queue;

  queue.splice(insertAt, 0, opts.id);
  return queue;
}
