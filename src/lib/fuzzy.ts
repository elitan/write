export interface FuzzyMatch {
  score: number;
  /** Indices into the target string that matched, for highlighting. */
  indices: number[];
}

function isBoundary(text: string, i: number) {
  if (i === 0) return true;
  const prev = text[i - 1];
  return prev === " " || prev === "-" || prev === "_" || prev === "/";
}

function scatter(q: string, t: string, preferWordStarts: boolean) {
  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    let found = t.indexOf(ch, ti);
    if (found === -1) return null;
    if (preferWordStarts && found !== ti) {
      for (let j = found; j < t.length; j++) {
        if (t[j] === ch && isBoundary(t, j)) {
          found = j;
          break;
        }
      }
    }
    const consecutive =
      indices.length > 0 && found === indices[indices.length - 1] + 1;
    // After the first run, every new run must start a word ("nn" → "New note").
    if (!consecutive && indices.length > 0 && !isBoundary(t, found))
      return null;
    streak = consecutive ? streak + 1 : 0;
    score +=
      10 +
      streak * 15 +
      (isBoundary(t, found) ? 25 : 0) -
      Math.min(found - ti, 10);
    indices.push(found);
    ti = found + 1;
  }
  return { score: score - t.length * 0.2, indices };
}

/**
 * Subsequence match with bonuses for consecutive characters, word starts and
 * an early first match. Returns null when not every query character is found.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!q) return { score: 0, indices: [] };
  const t = target.toLowerCase();

  // A plain substring match beats any scattered one.
  const at = t.indexOf(q);
  if (at !== -1) {
    return {
      score:
        1000 -
        at * 2 -
        (t.length - q.length) * 0.5 +
        (isBoundary(t, at) ? 200 : 0),
      indices: Array.from({ length: q.length }, (_, i) => at + i),
    };
  }
  return scatter(q, t, true) ?? scatter(q, t, false);
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, getText(item));
    if (match) out.push({ item, match });
  }
  return out.sort((a, b) => b.match.score - a.match.score);
}
