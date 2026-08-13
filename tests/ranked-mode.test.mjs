import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ranked mode is wired through UI, persistence and localization", async () => {
  const [
    mode,
    app,
    game,
    library,
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
    read("../app/components/modes/RankedLibraryView.tsx"),
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
  assert.equal(game.match(/<RankedMedia/g)?.length, 1);
  assert.match(game, /className="ranked-card-play"/);
  assert.match(game, /onDrop=/);
  assert.match(game, /dataTransfer\.getData\("text\/plain"\)/);
  assert.match(game, /ranked-player-drop-target/);
  assert.match(game, /activeMedia\.id/);
  assert.match(game, /Cancel run/);
  assert.match(library, /onCancelRun/);
  assert.match(library, /className="danger"/);
  assert.doesNotMatch(game, /Move up/);
  assert.doesNotMatch(game, /Move down/);
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
  assert.match(translations, /Choose a track/);
  assert.match(translations, /Drag a track here to listen/);
  assert.match(translations, /Drop to play/);
  assert.match(translations, /Рейтинг готов/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /ranked-group-list \{[^}]*grid-template-columns: 1fr/);
  assert.match(styles, /grid-template-areas: "order player board"/);
  assert.match(styles, /ranked-player-dock > \.ranked-media/);
  assert.match(styles, /topbar\.topbar-game/);
  assert.match(styles, /ranked-live-toggle/);
  assert.match(styles, /app-shell:has\(\.ranked-game-view\) > footer \{ display: none/);
  assert.match(styles, /ranked-game-header > div:first-child \{[^}]*gap: 12px/);
  assert.match(styles, /ranked-workspace \{[^}]*flex: 1 1 auto/);
  assert.match(app, /compact=\{view !== "home"\}/);
});

function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}
