import type {
  RankedEntry,
  RankedPlacement,
  RankedSessionState,
  RankedSnapshot,
} from "./types";
import type { JsonObject, JsonValue } from "./json-value";

export function parseRankedState(value: string) {
  try {
    return sanitizeRankedState(JSON.parse(value) as JsonValue);
  } catch {
    return null;
  }
}

export function sanitizeRankedState(value: JsonValue | undefined): RankedSessionState | null {
  if (!isRecord(value)) {
    return null;
  }
  const snapshot = sanitizeSnapshot(value);
  const status = value.status;
  const totalActions = safeInteger(value.totalActions, 0, 100_000);
  const targetRounds = safeInteger(value.targetRounds, 0, 20);
  const finalRanking = sanitizePlacements(value.finalRanking);
  const manualRanking = sanitizePlacements(value.manualRanking);
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";
  if (
    !snapshot ||
    (status !== "active" && status !== "complete") ||
    totalActions === null ||
    targetRounds === null ||
    !finalRanking ||
    !manualRanking ||
    !updatedAt
  ) {
    return null;
  }
  const entryIds = new Set(snapshot.entries.map((entry) => entry.itemId));
  const finalIds = finalRanking.map((entry) => entry.itemId);
  const manualIds = manualRanking.map((entry) => entry.itemId);
  if (
    (status === "active" && (finalIds.length || manualIds.length)) ||
    (status === "complete" &&
      (!sameSet(finalIds, [...entryIds]) || !sameSet(manualIds, finalIds)))
  ) {
    return null;
  }
  const undoStackValue = Array.isArray(value.undoStack)
    ? value.undoStack.slice(-1)
    : null;
  if (!undoStackValue) {
    return null;
  }
  const undoStack: RankedSnapshot[] = [];
  for (const candidate of undoStackValue) {
    const undo = sanitizeSnapshot(candidate);
    if (!undo) {
      return null;
    }
    undoStack.push(undo);
  }
  return {
    ...snapshot,
    status,
    totalActions,
    targetRounds,
    finalRanking,
    manualRanking,
    undoStack,
    updatedAt,
  };
}

export function rankedStateMatchesPack(
  state: RankedSessionState,
  membership: Set<string>,
) {
  if (!state.entries.every((entry) => membership.has(entry.itemId))) {
    return false;
  }
  if (state.phase === "qualification") {
    return state.entries.length === membership.size;
  }
  return membership.size <= 100
    ? state.entries.length === membership.size
    : state.entries.length === 100;
}

function sanitizeSnapshot(value: JsonValue | undefined): RankedSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const phase = value.phase;
  const round = safeInteger(value.round, 1, 20);
  const entries = sanitizeEntries(value.entries);
  const currentGroup = stringArray(value.currentGroup, 8);
  const orderedGroup = stringArray(value.orderedGroup, 8);
  const pendingGroups = nestedStringArray(value.pendingGroups, 10_000, 8);
  const pairKeys = stringArray(value.pairKeys, 100_000, 1024);
  const completedActions = safeInteger(value.completedActions, 0, 100_000);
  const qualifiedIds = stringArray(value.qualifiedIds, 100);
  if (
    (phase !== "qualification" && phase !== "ranking") ||
    round === null ||
    !entries ||
    !currentGroup ||
    !orderedGroup ||
    !pendingGroups ||
    !pairKeys ||
    completedActions === null ||
    !qualifiedIds
  ) {
    return null;
  }
  const ids = new Set(entries.map((entry) => entry.itemId));
  if (
    !currentGroup.every((id) => ids.has(id)) ||
    !sameSet(currentGroup, orderedGroup) ||
    !pendingGroups.every(
      (group) => group.length >= 2 && group.every((id) => ids.has(id)),
    )
  ) {
    return null;
  }
  return {
    phase,
    round,
    entries,
    currentGroup,
    orderedGroup,
    pendingGroups,
    pairKeys,
    completedActions,
    qualifiedIds,
  };
}

function sanitizeEntries(value: JsonValue | undefined): RankedEntry[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 2_000) {
    return null;
  }
  const ids = new Set<string>();
  const entries: RankedEntry[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      return null;
    }
    const itemId = typeof candidate.itemId === "string" ? candidate.itemId : "";
    const points = safeNumber(candidate.points, 0, 100_000);
    const appearances = safeInteger(candidate.appearances, 0, 10_000);
    const firstPlaces = safeInteger(candidate.firstPlaces, 0, 10_000);
    const seed = safeNumber(candidate.seed, 0, 1);
    if (
      !itemId ||
      ids.has(itemId) ||
      points === null ||
      appearances === null ||
      firstPlaces === null ||
      seed === null
    ) {
      return null;
    }
    ids.add(itemId);
    entries.push({ itemId, points, appearances, firstPlaces, seed });
  }
  return entries;
}

function sanitizePlacements(value: JsonValue | undefined): RankedPlacement[] | null {
  if (!Array.isArray(value) || value.length > 100) {
    return null;
  }
  const ids = new Set<string>();
  const placements: RankedPlacement[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      return null;
    }
    const itemId = typeof candidate.itemId === "string" ? candidate.itemId : "";
    const points = safeNumber(candidate.points, 0, 100_000);
    if (!itemId || ids.has(itemId) || points === null) {
      return null;
    }
    ids.add(itemId);
    placements.push({ itemId, points });
  }
  return placements;
}

function stringArray(
  value: JsonValue | undefined,
  max: number,
  maxLength = 256,
): string[] | null {
  if (!Array.isArray(value) || value.length > max) {
    return null;
  }
  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length > maxLength) {
      return null;
    }
    strings.push(entry);
  }
  return strings;
}

function nestedStringArray(value: JsonValue | undefined, max: number, groupMax: number) {
  if (!Array.isArray(value) || value.length > max) {
    return null;
  }
  const groups: string[][] = [];
  for (const candidate of value) {
    const group = stringArray(candidate, groupMax);
    if (!group) {
      return null;
    }
    groups.push(group);
  }
  return groups;
}

function safeInteger(value: JsonValue | undefined, min: number, max: number) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

function safeNumber(value: JsonValue | undefined, min: number, max: number) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

function sameSet(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false;
  }
  const values = new Set(first);
  return values.size === first.length && second.every((item) => values.has(item));
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
