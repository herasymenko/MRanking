import type { RankedEntry } from "../../lib/types";

const PAIR_SEPARATOR = "\u0000";

export function rankedGroupCount(itemCount: number) {
  return balancedGroupSizes(itemCount).length;
}

export function buildRankedRound(
  entries: RankedEntry[],
  pairKeys: string[],
  round: number,
  phase: "qualification" | "ranking",
) {
  const sizes = balancedGroupSizes(entries.length);
  const history = new Set(pairKeys);
  const opponentCounts = new Map(entries.map((entry) => [entry.itemId, 0]));
  for (const key of pairKeys) {
    const [left, right] = key.split(PAIR_SEPARATOR);
    opponentCounts.set(left, (opponentCounts.get(left) ?? 0) + 1);
    opponentCounts.set(right, (opponentCounts.get(right) ?? 0) + 1);
  }
  const base = [...entries].sort(
    (left, right) =>
      right.points - left.points ||
      roundJitter(left.seed, round, phase) - roundJitter(right.seed, round, phase),
  );

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const pool = [...base].sort((left, right) => {
      const scoreDifference = right.points - left.points;
      if (scoreDifference !== 0) {
        return scoreDifference;
      }
      return (
        roundJitter(left.seed, round + attempt * 7, phase) -
        roundJitter(right.seed, round + attempt * 7, phase)
      );
    });
    const degrees = new Map(
      pool.map((entry) => [
        entry.itemId,
        pool.reduce(
          (total, candidate) =>
            total +
            (entry.itemId !== candidate.itemId &&
            !history.has(pairKey(entry.itemId, candidate.itemId))
              ? 1
              : 0),
          0,
        ),
      ]),
    );
    const takePoolEntry = (index: number) => {
      const [removed] = pool.splice(index, 1);
      for (const candidate of pool) {
        if (!history.has(pairKey(removed.itemId, candidate.itemId))) {
          degrees.set(
            candidate.itemId,
            Math.max(0, (degrees.get(candidate.itemId) ?? 0) - 1),
          );
        }
      }
      degrees.delete(removed.itemId);
      return removed;
    };
    const groups: string[][] = [];
    let failed = false;

    for (let groupIndex = 0; groupIndex < sizes.length; groupIndex += 1) {
      const groupSize = sizes[groupIndex];
      const anchorIndex = pool.reduce((bestIndex, candidate, index) => {
        const best = pool[bestIndex];
        const candidateDegree = degrees.get(candidate.itemId) ?? 0;
        const bestDegree = degrees.get(best.itemId) ?? 0;
        if (candidateDegree !== bestDegree) {
          return candidateDegree < bestDegree ? index : bestIndex;
        }
        return candidate.points > best.points ? index : bestIndex;
      }, 0);
      const group: RankedEntry[] = [takePoolEntry(anchorIndex)];
      while (group.length < groupSize) {
        const exploration = attempt < 40 ? 0.02 : attempt < 120 ? 0.8 : 4;
        const candidates = pool
          .map((candidate, index) => ({ candidate, index }))
          .filter(({ candidate }) =>
            group.every(
              (member) => !history.has(pairKey(member.itemId, candidate.itemId)),
            ),
          )
          .sort((left, right) => candidatePriority({
            left: left.candidate,
            right: right.candidate,
            group,
            phase,
            attempt,
            groupIndex,
            exploration,
            opponentCounts,
            degrees,
          }));
        if (!candidates.length) {
          failed = true;
          break;
        }
        group.push(takePoolEntry(candidates[0].index));
      }
      if (failed) {
        break;
      }
      groups.push(group.map((entry) => entry.itemId));
    }
    if (!failed && pool.length === 0) {
      return groups;
    }
  }

  // A defensive fallback keeps a run usable if a tiny field has no perfect
  // Swiss partition left after all prior meetings.
  const pool = [...base];
  return sizes.map((size) => pool.splice(0, size).map((entry) => entry.itemId));
}

export function appendRankedPairKeys(pairKeys: string[], group: string[]) {
  const next = [...pairKeys];
  for (let left = 0; left < group.length; left += 1) {
    for (let right = left + 1; right < group.length; right += 1) {
      next.push(pairKey(group[left], group[right]));
    }
  }
  return next;
}

export function rankedOpponentStrength(entries: RankedEntry[], pairKeys: string[]) {
  const points = new Map(entries.map((entry) => [entry.itemId, entry.points]));
  const strength = new Map(entries.map((entry) => [entry.itemId, 0]));
  for (const key of pairKeys) {
    const [left, right] = key.split(PAIR_SEPARATOR);
    if (!points.has(left) || !points.has(right)) {
      continue;
    }
    strength.set(left, (strength.get(left) ?? 0) + (points.get(right) ?? 0));
    strength.set(right, (strength.get(right) ?? 0) + (points.get(left) ?? 0));
  }
  return strength;
}

function candidatePriority({
  left,
  right,
  group,
  phase,
  attempt,
  groupIndex,
  exploration,
  opponentCounts,
  degrees,
}: {
  left: RankedEntry;
  right: RankedEntry;
  group: RankedEntry[];
  phase: "qualification" | "ranking";
  attempt: number;
  groupIndex: number;
  exploration: number;
  opponentCounts: Map<string, number>;
  degrees: Map<string, number>;
}) {
  const distance = (candidate: RankedEntry) =>
    group.reduce(
      (total, member) => total + Math.abs(member.points - candidate.points),
      0,
    );
  return (
    distance(left) - distance(right) +
    exploration *
      (roundJitter(left.seed, attempt + groupIndex, phase) -
        roundJitter(right.seed, attempt + groupIndex, phase)) +
    ((opponentCounts.get(right.itemId) ?? 0) -
      (opponentCounts.get(left.itemId) ?? 0)) *
      0.001 +
    ((degrees.get(left.itemId) ?? 0) - (degrees.get(right.itemId) ?? 0)) * 0.002
  );
}

function balancedGroupSizes(itemCount: number) {
  if (itemCount < 2) {
    return itemCount ? [itemCount] : [];
  }
  const fullGroups = Math.floor(itemCount / 4);
  const remainder = itemCount % 4;
  const sizes = Array.from({ length: fullGroups }, () => 4);
  if (remainder === 1) {
    if (sizes.length) {
      sizes[sizes.length - 1] = 3;
      sizes.push(2);
    } else {
      sizes.push(itemCount);
    }
  } else if (remainder > 0) {
    sizes.push(remainder);
  }
  return sizes;
}

function pairKey(left: string, right: string) {
  return left < right
    ? `${left}${PAIR_SEPARATOR}${right}`
    : `${right}${PAIR_SEPARATOR}${left}`;
}

function roundJitter(seed: number, round: number, phase: string) {
  const phaseOffset = phase === "qualification" ? 17.13 : 41.79;
  const value = Math.sin(seed * 9821.37 + round * 119.71 + phaseOffset) * 43758.5453;
  return value - Math.floor(value);
}
