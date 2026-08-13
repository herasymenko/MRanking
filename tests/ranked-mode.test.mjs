import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ranked mode is wired through UI, persistence and localization", async () => {
  const [
    mode,
    app,
    game,
    result,
    runsApi,
    resultsApi,
    migration,
    translations,
    styles,
  ] = await Promise.all([
    read("../app/components/modes/ModeView.tsx"),
    read("../app/components/MRankingApp.tsx"),
    read("../app/components/ranked/RankedGameView.tsx"),
    read("../app/components/ranked/RankedResultView.tsx"),
    read("../app/api/ranked-runs/route.ts"),
    read("../app/api/ranked-results/route.ts"),
    read("../drizzle/0004_ranked_mode.sql"),
    read("../app/i18n/translations/ranked.ts"),
    read("../app/styles/ranked.css"),
  ]);

  assert.match(mode, /id: "ranked"/);
  assert.match(mode, /onOpenRanked/);
  assert.match(app, /<RankedAppSection/);
  assert.match(app, /useRankedRun/);
  assert.match(game, /draggable/);
  assert.match(game, /Your top right now/);
  assert.match(game, /confirmRankedOrder/);
  assert.match(result, /setManualRankedOrder/);
  assert.match(result, /Reset to automatic/);
  assert.match(runsApi, /INSERT INTO ranked_runs/);
  assert.match(resultsApi, /INSERT INTO ranked_results/);
  assert.match(resultsApi, /UPDATE ranked_results SET state_json/);
  assert.match(migration, /CREATE TABLE `ranked_runs`/);
  assert.match(migration, /CREATE TABLE `ranked_results`/);
  assert.match(translations, /"Ranking complete"/);
  assert.match(translations, /Рейтинг готов/);
  assert.match(styles, /@media \(max-width: 640px\)/);
});

function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}
