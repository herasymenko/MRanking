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
} from "./rankedPairing";

export { rankedGroupCount } from "./rankedPairing";

const FINALIST_LIMIT = 100;
const QUALIFICATION_GROUP_SIZE = 10;

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
  const targetRounds = qualification ? 1 : rankedRoundCount(entries.length);
  const qualificationGroups = qualification
    ? buildFastQualification(entries)
    : null;
  const groups = qualificationGroups
    ? qualificationGroups.groups
    : buildRankedRound(entries, [], 1, phase);
  const now = new Date().toISOString();
  return {
    id: `ranked-${crypto.randomUUID()}`,
    packId: pack.id,
    updatedAt: now,
    state: {
      phase,
      qualificationStyle: "multi",
      round: 1,
      entries,
      currentGroup: groups[0] ?? [],
      orderedGroup: groups[0] ?? [],
      pendingGroups: groups.slice(1),
      pairKeys: [],
      completedActions: 0,
      qualifiedIds: qualificationGroups
        ? []
        : entries.map((entry) => entry.itemId),
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
    qualificationActionCount(itemCount) +
    rankedGroupCount(FINALIST_LIMIT) * rankedRoundCount(FINALIST_LIMIT)
  );
}

export function qualificationActionCount(itemCount: number) {
  return itemCount > FINALIST_LIMIT
    ? Math.ceil(itemCount / QUALIFICATION_GROUP_SIZE)
    : 0;
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
  if (state.phase === "qualification") {
    return confirmQualification(run, snapshot, []);
  }
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

export function confirmRankedQualifiers(run: RankedRun, itemIds: string[]) {
  const selectedIds = [...new Set(itemIds)];
  if (
    run.state.phase !== "qualification" ||
    selectedIds.some((itemId) => !run.state.currentGroup.includes(itemId))
  ) {
    return run;
  }
  return confirmQualification(run, rankedSnapshot(run.state), selectedIds);
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
    totalActions:
      snapshot.phase === "qualification"
        ? estimateRankedActions(snapshot.entries.length)
        : run.state.totalActions,
    targetRounds:
      snapshot.phase === "qualification"
        ? 1
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
  const currentOrder = state.manualRanking.length
    ? state.manualRanking
    : state.finalRanking;
  if (
    itemIds.some(
      (itemId, index) =>
        points.get(itemId) !== points.get(currentOrder[index]?.itemId),
    )
  ) {
    return state;
  }
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
  qualifiedIds: string[],
  pairKeys: string[],
  completedActions: number,
  snapshot: RankedSnapshot,
) {
  const qualified = qualifiedIds.map((itemId) => {
    const previous = state.entries.find((entry) => entry.itemId === itemId)!;
    return { ...previous, points: 0, appearances: 0, firstPlaces: 0 };
  });
  if (qualified.length < 2) {
    const finalRanking = qualified.map(({ itemId, points }) => ({ itemId, points }));
    return withRankedState(run, {
      ...state,
      phase: "ranking",
      entries: qualified,
      pairKeys,
      completedActions,
      qualifiedIds,
      currentGroup: [],
      orderedGroup: [],
      pendingGroups: [],
      status: "complete",
      totalActions: completedActions,
      targetRounds: 0,
      finalRanking,
      manualRanking: finalRanking.map((entry) => ({ ...entry })),
      undoStack: [snapshot],
    });
  }
  const targetRounds = rankedRoundCount(qualified.length);
  const groups = buildRankedRound(qualified, pairKeys, 1, "ranking");
  return withRankedState(run, {
    ...state,
    phase: "ranking",
    round: 1,
    targetRounds,
    entries: qualified,
    pairKeys,
    completedActions,
    qualifiedIds,
    currentGroup: groups[0] ?? [],
    orderedGroup: groups[0] ?? [],
    pendingGroups: groups.slice(1),
    totalActions:
      completedActions + rankedGroupCount(qualified.length) * targetRounds,
    undoStack: [snapshot],
  });
}

function confirmQualification(
  run: RankedRun,
  snapshot: RankedSnapshot,
  selectedIds: string[],
) {
  const state = run.state;
  const qualifiedIds = [...state.qualifiedIds, ...selectedIds];
  const completedActions = state.completedActions + 1;
  if (state.pendingGroups.length > 0) {
    const [currentGroup, ...pendingGroups] = state.pendingGroups;
    return withRankedState(run, {
      ...state,
      completedActions,
      currentGroup,
      orderedGroup: currentGroup,
      pendingGroups,
      qualifiedIds,
      undoStack: [snapshot],
    });
  }
  return startFinalRanking(
    run,
    state,
    qualifiedIds,
    state.pairKeys,
    completedActions,
    snapshot,
  );
}

function buildFastQualification(entries: RankedEntry[]) {
  const pool = [...entries].sort((left, right) => left.seed - right.seed);
  const groups: string[][] = [];
  while (pool.length) {
    const group = pool
      .splice(0, QUALIFICATION_GROUP_SIZE)
      .map((entry) => entry.itemId);
    groups.push(group);
  }
  return { groups };
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

function rankedSnapshot(state: RankedSessionState): RankedSnapshot {
  return cloneSnapshot({
    phase: state.phase,
    qualificationStyle: state.qualificationStyle,
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
