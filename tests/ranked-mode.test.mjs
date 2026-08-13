import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ranked mode is wired through UI, persistence and localization", async () => {
  const [
    mode,
    app,
    game,
    pointerOrder,
    playerHook,
    soundHook,
    soundControl,
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
    read("../app/components/ranked/useRankedPointerOrder.ts"),
    read("../app/components/ranked/useRankedPlayer.ts"),
    read("../app/components/ranked/useRankedSounds.ts"),
    read("../app/components/ranked/RankedSoundControl.tsx"),
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
  assert.equal(game.match(/<RankedMedia/g)?.length, 1);
  assert.match(game, /className="ranked-card-play"/);
  assert.match(game, /beginPointerDrag/);
  assert.match(game, /onPointerDown/);
  assert.match(game, /beginPointerDrag\(event, entry\.itemId, "leader"\)/);
  assert.match(pointerOrder, /type DragSource = "group" \| "leader"/);
  assert.match(pointerOrder, /ranked-drag-preview/);
  assert.match(pointerOrder, /animateRankedPreviewOpen/);
  assert.match(pointerOrder, /playInPlayer\(itemId\)/);
  assert.match(playerHook, /function playInPlayer\(itemId: string\)/);
  assert.match(playerHook, /loadKeyRef\.current \+= 1/);
  assert.match(playerHook, /ranked-card-opening/);
  assert.match(playerHook, /ranked-card-closing/);
  assert.match(playerHook, /playSound\("play"\)/);
  assert.match(playerHook, /playSound\("stop"\)/);
  assert.match(playerHook, /height: `\$\{target\.height\}px`/);
  assert.match(playerHook, /width: `\$\{target\.width\}px`/);
  assert.doesNotMatch(playerHook, /scale\(\.18\)/);
  assert.match(pointerOrder, /playSound\("move"\)/);
  assert.match(pointerOrder, /playSound\("drop"\)/);
  assert.match(soundHook, /type RankedSoundCue = "drop" \| "move" \| "play" \| "stop"/);
  assert.match(soundHook, /new AudioContextConstructor\(\)/);
  assert.match(soundHook, /mranking:ranked-ui-volume:v1/);
  assert.match(soundHook, /webkitAudioContext/);
  assert.match(soundHook, /MOVE_COOLDOWN_MS/);
  assert.match(soundControl, /type="range"/);
  assert.match(soundControl, /ranked-sound-trigger/);
  assert.match(game, /key=\{`\$\{activeMedia\.id\}-\$\{player\?\.loadKey\}`\}/);
  assert.match(game, /ranked-player-drop-target/);
  assert.match(game, /activeMedia\.id/);
  assert.doesNotMatch(game, /ranked-phase|"Qualification"|"Top 100 ranking"/);
  assert.doesNotMatch(game, /targetRounds|Round \{current\}/);
  assert.match(game, /className="ranked-choice-slot"/);
  assert.match(game, /"STOP"/);
  assert.doesNotMatch(game, /"IN PLAYER"/);
  assert.doesNotMatch(game, /"PAUSE"|"Pause track"/);
  assert.match(game, /player\?\.itemId === id \? "Stop track" : "Play track"/);
  assert.match(game, /showControl=\{false\}/);
  assert.match(game, /t\("NEXT"\)/);
  assert.doesNotMatch(game, /Lock this order/);
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
  assert.match(translations, /STOP/);
  assert.match(translations, /Stop track/);
  assert.match(translations, /NEXT/);
  assert.match(translations, /Рейтинг готов/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /ranked-group-list \{[^}]*grid-template-columns: 1fr/);
  assert.match(styles, /grid-template-areas: "order player board"/);
  assert.match(styles, /ranked-player-dock > \.ranked-media/);
  assert.match(styles, /topbar\.topbar-game/);
  assert.match(styles, /ranked-live-toggle/);
  assert.match(styles, /app-shell:has\(\.ranked-game-view\) > footer \{ display: none/);
  assert.match(styles, /ranked-game-view > :not\(\.flow-back\)/);
  assert.match(styles, /ranked-game-view > \.flow-back \{[^}]*position: absolute/);
  assert.match(styles, /ranked-card-opening/);
  assert.match(styles, /ranked-card-closing/);
  assert.match(styles, /ranked-sound-panel/);
  assert.match(styles, /ranked-drag-preview[^}]*transition: none !important/);
  assert.match(styles, /ranked-choice-slot/);
  assert.match(styles, /ranked-player-receive/);
  assert.match(styles, /ranked-workspace \{[^}]*flex: 1 1 auto/);
  assert.match(app, /compact=\{view !== "home"\}/);
});

function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}
