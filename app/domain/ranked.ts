import type {
  Pack,
  RankedEntry,
  RankedRun,
  RankedSessionState,
  RankedSnapshot,
} from "../../lib/types";
import {
  appendRankedPairKeys,
  buildRankedRound,
  rankedGroupCount,
  rankedOpponentStrength,
} from "./rankedPairing";

export { rankedGroupCount } from "./rankedPairing";

const QUALIFICATION_ROUNDS = 4;
const FINALIST_LIMIT = 100;

export function createRankedRun(
  pack: Pick<Pack, "id" | "items">,
  random: () => number = Math.random,
): RankedRun {
  const entries = pack.items.map((item) => ({
    itemId: item.id,
    points: 0,
    appearances: 0,
    firstPlaces: 0,
    seed: random(),
  }));
  const qualification = entries.length > FINALIST_LIMIT;
  const phase = qualification ? "qualification" : "ranking";
  const targetRounds = qualification
    ? QUALIFICATION_ROUNDS
    : rankedRoundCount(entries.length);
  const groups = buildRankedRound(entries, [], 1, phase);
  const now = new Date().toISOString();
  return {
    id: `ranked-${crypto.randomUUID()}`,
    packId: pack.id,
    updatedAt: now,
    state: {
      phase,
      round: 1,
      entries,
      currentGroup: groups[0] ?? [],
      orderedGroup: groups[0] ?? [],
      pendingGroups: groups.slice(1),
      pairKeys: [],
      completedActions: 0,
      qualifiedIds: qualification ? [] : entries.map((entry) => entry.itemId),
      status: "active",
      totalActions: estimateRankedActions(entries.length),
      targetRounds,
      finalRanking: [],
      manualRanking: [],
      undoStack: [],
      updatedAt: now,
    },
  };
}

export function estimateRankedActions(itemCount: number) {
  if (itemCount <= FINALIST_LIMIT) {
    return rankedGroupCount(itemCount) * rankedRoundCount(itemCount);
  }
  return (
    rankedGroupCount(itemCount) * QUALIFICATION_ROUNDS +
    rankedGroupCount(FINALIST_LIMIT) * rankedRoundCount(FINALIST_LIMIT)
  );
}

export function rankedRoundCount(itemCount: number) {
  if (itemCount < 2) {
    return 0;
  }
  return Math.max(1, Math.min(6, Math.floor((itemCount - 1) / 3)));
}

export function moveRankedItem(
  orderedGroup: string[],
  fromIndex: number,
  toIndex: number,
) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= orderedGroup.length ||
    toIndex >= orderedGroup.length ||
    fromIndex === toIndex
  ) {
    return orderedGroup;
  }
  const next = [...orderedGroup];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function setRankedGroupOrder(run: RankedRun, orderedGroup: string[]) {
  if (!sameIds(run.state.currentGroup, orderedGroup)) {
    return run;
  }
  return withRankedState(run, { ...run.state, orderedGroup: [...orderedGroup] });
}

export function confirmRankedOrder(run: RankedRun): RankedRun {
  const state = run.state;
  if (
    state.status !== "active" ||
    state.currentGroup.length < 2 ||
    !sameIds(state.currentGroup, state.orderedGroup)
  ) {
    return run;
  }

  const snapshot = rankedSnapshot(state);
  const entries = scoreGroup(state.entries, state.orderedGroup);
  const pairKeys = appendRankedPairKeys(state.pairKeys, state.currentGroup);
  const completedActions = state.completedActions + 1;

  if (state.pendingGroups.length > 0) {
    const [currentGroup, ...pendingGroups] = state.pendingGroups;
    return withRankedState(run, {
      ...state,
      entries,
      pairKeys,
      completedActions,
      currentGroup,
      orderedGroup: currentGroup,
      pendingGroups,
      undoStack: [snapshot],
    });
  }

  if (state.round < state.targetRounds) {
    const round = state.round + 1;
    const groups = buildRankedRound(entries, pairKeys, round, state.phase);
    return withRankedState(run, {
      ...state,
      round,
      entries,
      pairKeys,
      completedActions,
      currentGroup: groups[0] ?? [],
      orderedGroup: groups[0] ?? [],
      pendingGroups: groups.slice(1),
      undoStack: [snapshot],
    });
  }

  if (state.phase === "qualification") {
    return startFinalRanking(run, state, entries, pairKeys, completedActions, snapshot);
  }

  const finalRanking = rankedLeaderboard(entries).map(({ itemId, points }) => ({
    itemId,
    points,
  }));
  return withRankedState(run, {
    ...state,
    entries,
    pairKeys,
    completedActions,
    currentGroup: [],
    orderedGroup: [],
    pendingGroups: [],
    status: "complete",
    finalRanking,
    manualRanking: finalRanking.map((entry) => ({ ...entry })),
    undoStack: [snapshot],
  });
}

export function undoRankedOrder(run: RankedRun): RankedRun {
  const snapshot = run.state.undoStack.at(-1);
  if (!snapshot) {
    return run;
  }
  return withRankedState(run, {
    ...run.state,
    ...cloneSnapshot(snapshot),
    status: "active",
    targetRounds:
      snapshot.phase === "qualification"
        ? QUALIFICATION_ROUNDS
        : rankedRoundCount(snapshot.entries.length),
    finalRanking: [],
    manualRanking: [],
    undoStack: [],
  });
}

export function setManualRankedOrder(
  state: RankedSessionState,
  itemIds: string[],
): RankedSessionState {
  if (
    state.status !== "complete" ||
    !sameIds(state.finalRanking.map((entry) => entry.itemId), itemIds)
  ) {
    return state;
  }
  const points = new Map(
    state.finalRanking.map((entry) => [entry.itemId, entry.points]),
  );
  return {
    ...state,
    manualRanking: itemIds.map((itemId) => ({
      itemId,
      points: points.get(itemId) ?? 0,
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function rankedLeaderboard(entries: RankedEntry[]) {
  return [...entries].sort(
    (left, right) =>
      right.points - left.points ||
      right.firstPlaces - left.firstPlaces ||
      left.seed - right.seed,
  );
}

export function rankedProgressLabel(state: RankedSessionState) {
  return `${Math.min(state.totalActions, state.completedActions + 1)} / ${state.totalActions}`;
}

function startFinalRanking(
  run: RankedRun,
  state: RankedSessionState,
  entries: RankedEntry[],
  pairKeys: string[],
  completedActions: number,
  snapshot: RankedSnapshot,
) {
  const qualifiedIds = rankQualificationEntries(entries, pairKeys)
    .slice(0, FINALIST_LIMIT)
    .map((entry) => entry.itemId);
  const qualified = qualifiedIds.map((itemId) => {
    const previous = entries.find((entry) => entry.itemId === itemId)!;
    return { ...previous, points: 0, appearances: 0, firstPlaces: 0 };
  });
  const groups = buildRankedRound(qualified, pairKeys, 1, "ranking");
  return withRankedState(run, {
    ...state,
    phase: "ranking",
    round: 1,
    targetRounds: rankedRoundCount(qualified.length),
    entries: qualified,
    pairKeys,
    completedActions,
    qualifiedIds,
    currentGroup: groups[0] ?? [],
    orderedGroup: groups[0] ?? [],
    pendingGroups: groups.slice(1),
    undoStack: [snapshot],
  });
}

function scoreGroup(entries: RankedEntry[], orderedGroup: string[]) {
  const placements = new Map(orderedGroup.map((id, index) => [id, index]));
  const denominator = Math.max(1, orderedGroup.length - 1);
  return entries.map((entry) => {
    const placement = placements.get(entry.itemId);
    if (placement === undefined) {
      return entry;
    }
    const points = (3 * (orderedGroup.length - 1 - placement)) / denominator;
    return {
      ...entry,
      points: roundScore(entry.points + points),
      appearances: entry.appearances + 1,
      firstPlaces: entry.firstPlaces + (placement === 0 ? 1 : 0),
    };
  });
}

function rankQualificationEntries(entries: RankedEntry[], pairKeys: string[]) {
  const strength = rankedOpponentStrength(entries, pairKeys);
  return [...entries].sort(
    (left, right) =>
      right.points - left.points ||
      (strength.get(right.itemId) ?? 0) - (strength.get(left.itemId) ?? 0) ||
      right.firstPlaces - left.firstPlaces ||
      left.seed - right.seed,
  );
}

function rankedSnapshot(state: RankedSessionState): RankedSnapshot {
  return cloneSnapshot({
    phase: state.phase,
    round: state.round,
    entries: state.entries,
    currentGroup: state.currentGroup,
    orderedGroup: state.orderedGroup,
    pendingGroups: state.pendingGroups,
    pairKeys: state.pairKeys,
    completedActions: state.completedActions,
    qualifiedIds: state.qualifiedIds,
  });
}

function cloneSnapshot(snapshot: RankedSnapshot): RankedSnapshot {
  return {
    ...snapshot,
    entries: snapshot.entries.map((entry) => ({ ...entry })),
    currentGroup: [...snapshot.currentGroup],
    orderedGroup: [...snapshot.orderedGroup],
    pendingGroups: snapshot.pendingGroups.map((group) => [...group]),
    pairKeys: [...snapshot.pairKeys],
    qualifiedIds: [...snapshot.qualifiedIds],
  };
}

function withRankedState(run: RankedRun, state: RankedSessionState): RankedRun {
  const updatedAt = new Date().toISOString();
  return { ...run, updatedAt, state: { ...state, updatedAt } };
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sameIds(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false;
  }
  const ids = new Set(first);
  return ids.size === first.length && second.every((id) => ids.has(id));
}
