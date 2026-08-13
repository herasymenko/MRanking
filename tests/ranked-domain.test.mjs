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

function finishRanking(run) {
  let current = run;
  while (current.state.status === "active") {
    assert.equal(current.state.phase, "ranking");
    current = ranked.confirmRankedOrder(current);
  }
  return current;
}

test("small packs receive a complete ranked result", () => {
  const run = ranked.createRankedRun(pack(16), seededRandom());
  assert.equal(run.state.phase, "ranking");
  assert.equal(run.state.totalActions, 20);

  const complete = finishRanking(run);
  assert.equal(complete.state.status, "complete");
  assert.equal(complete.state.completedActions, 20);
  assert.equal(complete.state.finalRanking.length, 16);
  assert.equal(new Set(complete.state.finalRanking.map((entry) => entry.itemId)).size, 16);
  assert.ok(complete.state.entries.every((entry) => entry.appearances === 5));
});

test("large packs are reviewed once in batches of ten and keep every selection", () => {
  let run = ranked.createRankedRun(pack(128), seededRandom(91));
  const reviewed = new Set();
  let batches = 0;
  let expectedSurvivors = 0;
  assert.equal(run.state.phase, "qualification");
  assert.equal(run.state.qualificationStyle, "multi");
  assert.equal(run.state.qualifiedIds.length, 0);
  assert.equal(ranked.qualificationActionCount(128), 13);

  while (run.state.phase === "qualification") {
    assert.ok(run.state.currentGroup.length >= 1);
    assert.ok(run.state.currentGroup.length <= 10);
    for (const id of run.state.currentGroup) {
      assert.equal(reviewed.has(id), false);
      reviewed.add(id);
    }
    const selected = batches === 0 ? [] : run.state.currentGroup.slice(0, 5);
    expectedSurvivors += selected.length;
    run = ranked.confirmRankedQualifiers(run, selected);
    batches += 1;
  }

  assert.equal(batches, 13);
  assert.equal(reviewed.size, 128);
  assert.equal(run.state.qualifiedIds.length, expectedSurvivors);
  assert.equal(run.state.entries.length, expectedSurvivors);
  assert.ok(run.state.entries.every((entry) => entry.appearances === 0));
  assert.equal(run.state.completedActions, 13);

  const complete = finishRanking(run);
  assert.equal(complete.state.finalRanking.length, expectedSurvivors);
  assert.equal(complete.state.completedActions, complete.state.totalActions);
});

test("qualification scales to the largest supported pack", () => {
  let run = ranked.createRankedRun(pack(512), seededRandom(13));
  let actions = 0;
  while (run.state.phase === "qualification") {
    run = ranked.confirmRankedQualifiers(run, run.state.currentGroup.slice(0, 2));
    actions += 1;
  }
  assert.equal(actions, 52);
  assert.equal(run.state.qualifiedIds.length, 104);
  assert.equal(run.state.entries.length, 104);
});

test("qualification may eliminate every item", () => {
  let run = ranked.createRankedRun(pack(101), seededRandom(3));
  while (run.state.status === "active") {
    run = ranked.confirmRankedQualifiers(run, []);
  }
  assert.equal(run.state.status, "complete");
  assert.deepEqual(run.state.finalRanking, []);
});

test("undo restores a qualification batch and its previous survivors", () => {
  const run = ranked.createRankedRun(pack(128), seededRandom(5));
  const group = [...run.state.currentGroup];
  const selected = group.slice(0, 4);
  const advanced = ranked.confirmRankedQualifiers(run, selected);
  const restored = ranked.undoRankedOrder(advanced);
  assert.deepEqual(restored.state.currentGroup, group);
  assert.deepEqual(restored.state.qualifiedIds, []);
  assert.equal(restored.state.completedActions, 0);
});

test("manual result ordering only permits equal-score positions", () => {
  const complete = finishRanking(ranked.createRankedRun(pack(16), seededRandom(7)));
  const placements = complete.state.finalRanking.map((entry) => ({ ...entry }));
  placements[1].points = placements[0].points;
  const state = {
    ...complete.state,
    finalRanking: placements,
    manualRanking: placements.map((entry) => ({ ...entry })),
  };
  const ids = placements.map((entry) => entry.itemId);
  const equalSwap = [ids[1], ids[0], ...ids.slice(2)];
  const adjusted = ranked.setManualRankedOrder(state, equalSwap);
  assert.deepEqual(adjusted.manualRanking.map((entry) => entry.itemId), equalSwap);

  const differentIndex = placements.findIndex(
    (entry, index) => index > 1 && entry.points !== placements[0].points,
  );
  assert.ok(differentIndex > 1);
  const invalid = [...equalSwap];
  [invalid[0], invalid[differentIndex]] = [invalid[differentIndex], invalid[0]];
  assert.equal(ranked.setManualRankedOrder(adjusted, invalid), adjusted);
  assert.deepEqual(adjusted.finalRanking, placements);
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
