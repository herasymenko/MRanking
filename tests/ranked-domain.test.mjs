import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/domain/ranked.ts", import.meta.url),
  "utf8",
);
const pairingSource = await readFile(
  new URL("../app/domain/rankedPairing.ts", import.meta.url),
  "utf8",
);
const pairingJavascript = ts.transpileModule(pairingSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const pairingUrl = `data:text/javascript;base64,${Buffer.from(pairingJavascript).toString("base64")}`;
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replaceAll("./rankedPairing", pairingUrl);
const ranked = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

function pack(size) {
  return {
    id: `pack-${size}`,
    items: Array.from({ length: size }, (_, index) => ({
      id: `item-${String(index + 1).padStart(3, "0")}`,
    })),
  };
}

function seededRandom(seed = 17) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function finish(run) {
  let current = run;
  while (current.state.status === "active") {
    current = ranked.confirmRankedOrder(current);
  }
  return current;
}

test("small packs receive a complete ranked result", () => {
  const run = ranked.createRankedRun(pack(16), seededRandom());
  assert.equal(run.state.phase, "ranking");
  assert.equal(run.state.totalActions, 20);

  const complete = finish(run);
  assert.equal(complete.state.status, "complete");
  assert.equal(complete.state.completedActions, 20);
  assert.equal(complete.state.finalRanking.length, 16);
  assert.equal(new Set(complete.state.finalRanking.map((entry) => entry.itemId)).size, 16);
  assert.ok(complete.state.entries.every((entry) => entry.appearances === 5));
});

test("large packs qualify exactly 100 finalists before ranking", () => {
  let run = ranked.createRankedRun(pack(128), seededRandom(91));
  const reviewed = new Set();
  assert.equal(run.state.phase, "qualification");
  assert.equal(run.state.targetRounds, 1);
  assert.equal(run.state.qualifiedIds.length, 94);
  assert.equal(run.state.totalActions, 156);

  while (run.state.phase === "qualification") {
    for (const id of run.state.currentGroup) {
      assert.equal(reviewed.has(id), false);
      reviewed.add(id);
    }
    assert.ok(run.state.currentGroup.length >= 5);
    assert.ok(run.state.currentGroup.length <= 6);
    run = ranked.confirmRankedQualifier(
      run,
      run.state.currentGroup.at(-1),
    );
  }
  assert.equal(run.state.phase, "ranking");
  assert.equal(run.state.qualifiedIds.length, 100);
  assert.equal(run.state.entries.length, 100);
  assert.ok(run.state.entries.every((entry) => entry.appearances === 0));
  assert.equal(reviewed.size, 34);
  assert.equal(run.state.completedActions, 6);

  const complete = finish(run);
  assert.equal(complete.state.finalRanking.length, 100);
  assert.equal(complete.state.completedActions, complete.state.totalActions);
});

test("fast qualification scales to the largest supported pack", () => {
  let run = ranked.createRankedRun(pack(512), seededRandom(13));
  let actions = 0;
  while (run.state.phase === "qualification") {
    assert.ok(run.state.currentGroup.length >= 5);
    assert.ok(run.state.currentGroup.length <= 6);
    run = ranked.confirmRankedQualifier(run, run.state.currentGroup[0]);
    actions += 1;
  }
  assert.equal(actions, 83);
  assert.equal(run.state.qualifiedIds.length, 100);
  assert.equal(run.state.entries.length, 100);
});

test("undo restores the previous group and scores", () => {
  const run = ranked.createRankedRun(pack(32), seededRandom(5));
  const group = [...run.state.currentGroup];
  const scored = ranked.confirmRankedOrder(run);
  assert.equal(scored.state.completedActions, 1);
  const restored = ranked.undoRankedOrder(scored);
  assert.deepEqual(restored.state.currentGroup, group);
  assert.equal(restored.state.completedActions, 0);
  assert.ok(restored.state.entries.every((entry) => entry.points === 0));
});

test("manual result ordering preserves automatic scores", () => {
  const complete = finish(ranked.createRankedRun(pack(16), seededRandom(7)));
  const reversedIds = complete.state.finalRanking
    .map((entry) => entry.itemId)
    .reverse();
  const adjusted = ranked.setManualRankedOrder(complete.state, reversedIds);
  assert.deepEqual(
    adjusted.manualRanking.map((entry) => entry.itemId),
    reversedIds,
  );
  assert.deepEqual(adjusted.finalRanking, complete.state.finalRanking);
});

test("group ordering only accepts the current participants", () => {
  const run = ranked.createRankedRun(pack(16), seededRandom(11));
  const reversed = [...run.state.currentGroup].reverse();
  const changed = ranked.setRankedGroupOrder(run, reversed);
  assert.deepEqual(changed.state.orderedGroup, reversed);
  assert.equal(
    ranked.setRankedGroupOrder(run, ["unknown", ...reversed.slice(1)]),
    run,
  );
});

test("adaptive rounds avoid repeating the same pair", () => {
  let run = ranked.createRankedRun(pack(100), seededRandom(23));
  const seen = new Set();
  while (run.state.status === "active") {
    const group = run.state.currentGroup;
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        const key = [group[left], group[right]].sort().join("|");
        assert.equal(seen.has(key), false, `repeated pair ${key}`);
        seen.add(key);
      }
    }
    run = ranked.confirmRankedOrder(run);
  }
});
