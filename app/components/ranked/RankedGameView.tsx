"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Pack, RankedRun } from "../../../lib/types";
import {
  confirmRankedQualifier,
  confirmRankedOrder,
  qualificationActionCount,
  rankedLeaderboard,
  rankedProgressLabel,
  undoRankedOrder,
} from "../../domain/ranked";
import { useI18n } from "../../i18n/I18nContext";
import { FlowBack } from "../shared/FlowBack";
import { RemoteImage } from "../shared/RemoteImage";
import { RankedMedia } from "./RankedMedia";
import { RankedSoundControl } from "./RankedSoundControl";
import { useRankedPlayer } from "./useRankedPlayer";
import { useRankedPointerOrder } from "./useRankedPointerOrder";
import { useRankedSounds } from "./useRankedSounds";

export function RankedGameView({
  pack,
  run,
  onChange,
  onBack,
  onCancel,
}: {
  pack: Pack;
  run: RankedRun;
  onChange: (run: RankedRun) => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [topOpen, setTopOpen] = useState(false);
  const [matchSummary, setMatchSummary] = useState<
    Array<{ delta: number }> | null
  >(null);
  const [qualificationPick, setQualificationPick] = useState<string | null>(null);
  const summaryTimerRef = useRef<number | null>(null);
  const qualificationTimerRef = useRef<number | null>(null);
  const { playSound, setVolume, unlockSound, volume } = useRankedSounds();
  const {
    closePlayer,
    playInPlayer,
    player,
    playerRef,
    receiving,
    toggleFromTile,
  } = useRankedPlayer(playSound);
  function playManually(itemId: string) {
    playInPlayer(itemId);
  }
  function toggleTrack(itemId: string, source: HTMLElement) {
    toggleFromTile(itemId, source);
  }
  const {
    beginPointerDrag,
    draftOrder,
    dragged,
    playerDragActive,
    rowRefs,
  } = useRankedPointerOrder({
    run,
    onChange,
    playerRef,
    playInPlayer: playManually,
    playSound,
  });
  const itemMap = useMemo(
    () => new Map(pack.items.map((item) => [item.id, item])),
    [pack.items],
  );
  const activeMedia = player ? itemMap.get(player.itemId) ?? null : null;
  const activeGroupItem = Boolean(
    activeMedia && draftOrder.includes(activeMedia.id),
  );
  const isQualification = run.state.phase === "qualification";
  const leaders = rankedLeaderboard(run.state.entries).slice(0, 100);
  const boardEntries = isQualification
    ? [...run.state.qualifiedIds]
        .reverse()
        .map((itemId) => ({ itemId, points: 0 }))
    : leaders;
  const qualificationTotal = qualificationActionCount(pack.items.length);
  const progress = Math.min(
    100,
    ((run.state.completedActions + 1) / Math.max(1, run.state.totalActions)) *
      100,
  );

  useEffect(
    () => () => {
      if (summaryTimerRef.current !== null) {
        window.clearTimeout(summaryTimerRef.current);
      }
      if (qualificationTimerRef.current !== null) {
        window.clearTimeout(qualificationTimerRef.current);
      }
    },
    [],
  );

  function confirm() {
    if (isQualification) {
      return;
    }
    playSound("next");
    const before = new Map(
      rankedLeaderboard(run.state.entries).map((entry, index) => [
        entry.itemId,
        index,
      ]),
    );
    const nextRun = confirmRankedOrder(run);
    const after = new Map(
      rankedLeaderboard(nextRun.state.entries).map((entry, index) => [
        entry.itemId,
        index,
      ]),
    );
    const summary = draftOrder.flatMap((itemId) => {
      const previousPlace = before.get(itemId);
      const nextPlace = after.get(itemId);
      return previousPlace !== undefined && nextPlace !== undefined
        ? [{
            delta: previousPlace - nextPlace,
          }]
        : [];
    });
    setMatchSummary(summary);
    if (summaryTimerRef.current !== null) {
      window.clearTimeout(summaryTimerRef.current);
    }
    summaryTimerRef.current = window.setTimeout(() => {
      setMatchSummary(null);
      summaryTimerRef.current = null;
    }, 1_180);
    onChange(nextRun);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseQualifier(itemId: string) {
    if (!isQualification || qualificationPick) {
      return;
    }
    closePlayer();
    playSound("next");
    setQualificationPick(itemId);
    qualificationTimerRef.current = window.setTimeout(() => {
      setQualificationPick(null);
      qualificationTimerRef.current = null;
      onChange(confirmRankedQualifier(run, itemId));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 260);
  }

  function undo() {
    setMatchSummary(null);
    playSound("undo");
    onChange(undoRankedOrder(run));
  }

  return (
    <section
      className="ranked-game-view"
      onPointerDownCapture={unlockSound}
    >
      <FlowBack label="Back" onClick={onBack} />
      <RankedSoundControl
        volume={volume}
        onChange={setVolume}
        onPreview={() => playSound("move")}
      />
      <header className="ranked-game-header">
        <div>
          <h2>{t(isQualification ? "Save one. Cut the rest." : "Put them in their place")}</h2>
        </div>
        <div className="ranked-game-meta">
          <span>{pack.name}</span>
          <strong className="ranked-action-progress">
            {isQualification
              ? t("CUT {current} / {total}", {
                  current: Math.min(qualificationTotal, run.state.completedActions + 1),
                  total: qualificationTotal,
                })
              : rankedProgressLabel(run.state)}
          </strong>
        </div>
        <div className="ranked-game-actions">
          <button
            type="button"
            className="ranked-undo"
            disabled={Boolean(qualificationPick) || !run.state.undoStack.length}
            onClick={undo}
          >
            ↶ {t("Undo")}
          </button>
          <button type="button" className="ranked-cancel" onClick={onCancel}>
            {t("Cancel run")}
          </button>
        </div>
      </header>
      <progress className="ranked-progress" max={100} value={progress} />

      <div className={`ranked-workspace ${topOpen ? "top-open" : ""} ${activeGroupItem ? "has-active-player" : ""} ${isQualification ? "qualification" : "ranking"}`}>
        <div className={`ranked-order-panel ${matchSummary ? "match-settling" : ""}`}>
          <div className={`ranked-group-list group-size-${draftOrder.length}`}>
            {draftOrder.map((id, index) => {
              const item = itemMap.get(id);
              const movement = matchSummary?.[index];
              if (!item) {
                return null;
              }
              return (
                <div className="ranked-choice-slot" key={id}>
                  <span
                    className={`ranked-match-shift ${movement ? "visible" : ""} ${movement && movement.delta > 0 ? "up" : movement && movement.delta < 0 ? "down" : "same"}`}
                    aria-hidden="true"
                  >
                    {movement
                      ? movement.delta > 0
                        ? `↑${movement.delta}`
                        : movement.delta < 0
                          ? `↓${Math.abs(movement.delta)}`
                          : "—"
                      : ""}
                  </span>
                  <span className="ranked-place">{isQualification ? "?" : index + 1}</span>
                  <article
                    ref={(element) => {
                      if (element) {
                        rowRefs.current.set(id, element);
                      } else {
                        rowRefs.current.delete(id);
                      }
                    }}
                    className={`ranked-choice-row ${player?.itemId === id ? "active" : ""} ${dragged?.source === "group" && dragged.itemId === id ? "dragging" : ""} ${qualificationPick === id ? "qualifier-picked" : ""} ${qualificationPick && qualificationPick !== id ? "qualifier-cut" : ""}`}
                    role={isQualification ? "button" : undefined}
                    tabIndex={isQualification ? 0 : undefined}
                    onClick={(event) => {
                      if (isQualification && !(event.target as HTMLElement).closest("button")) {
                        chooseQualifier(id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (isQualification && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        chooseQualifier(id);
                      }
                    }}
                    onPointerDown={isQualification
                      ? undefined
                      : (event) => beginPointerDrag(event, id, "group")}
                  >
                    <RemoteImage
                      className="ranked-choice-art"
                      src={item.thumbnailUrl}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                    />
                    <div className="ranked-choice-copy">
                      <h3>{item.title}</h3>
                      <p>{item.channel}{item.duration ? ` · ${item.duration}` : ""}</p>
                    </div>
                    <button
                      type="button"
                      className="ranked-card-play"
                      aria-label={t(player?.itemId === id ? "Stop track" : "Play track")}
                      aria-pressed={player?.itemId === id}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleTrack(
                          id,
                          event.currentTarget.closest(
                            ".ranked-choice-row",
                          ) as HTMLElement,
                        );
                      }}
                    >
                      <span aria-hidden="true">
                        {player?.itemId === id ? "■" : "▶"}
                      </span>
                      <small>{t(player?.itemId === id ? "STOP" : "PLAY")}</small>
                    </button>
                    {isQualification ? (
                      <span className="ranked-keep-mark">{t("KEEP")}</span>
                    ) : (
                      <span className="ranked-drag-handle" title={t("Drag to reorder")}>⠿</span>
                    )}
                  </article>
                </div>
              );
            })}
          </div>
          <div className="ranked-order-controls">
            {isQualification ? (
              <div className="ranked-qualifier-prompt">
                <span>✦</span>
                <strong>{t("Tap one track to keep it")}</strong>
              </div>
            ) : (
              <button type="button" className="ranked-confirm" onClick={confirm}>
                <span>{t("NEXT")}</span>
              </button>
            )}
          </div>
        </div>

        <section
          ref={playerRef}
          className={`ranked-player-dock ${activeMedia ? "has-track" : ""} ${playerDragActive ? "drag-active" : ""} ${receiving ? "receiving" : ""}`}
        >
          {activeMedia ? (
            <RankedMedia
              key={`${activeMedia.id}-${player?.loadKey}`}
              item={activeMedia}
              sourceType={pack.sourceType}
              startSeconds={player?.startSeconds}
              playing
              onClose={closePlayer}
              showControl={false}
            />
          ) : (
            <div className="ranked-player-empty">
              <span aria-hidden="true">▶</span>
              <strong>{t("Drag a track here to listen")}</strong>
            </div>
          )}
          {playerDragActive && (
            <div className="ranked-player-drop-target">
              <span aria-hidden="true">↓</span>
              <strong>{t("Drop to play")}</strong>
            </div>
          )}
        </section>

        <aside className={`ranked-live-top ${topOpen ? "open" : "collapsed"}`}>
          <button
            type="button"
            className="ranked-live-toggle"
            aria-expanded={topOpen}
            onClick={() => {
              playSound("top");
              setTopOpen((open) => !open);
            }}
          >
            <b aria-hidden="true">{topOpen ? "→" : "←"}</b>
            <span>{t(isQualification
              ? topOpen ? "Hide saved tracks" : "View saved tracks"
              : topOpen ? "Hide current top" : "View current top")}</span>
          </button>
          <div className="ranked-live-content">
            <div className="ranked-live-head">
              <div><span>{t(isQualification ? "SAFE SO FAR" : "LIVE BOARD")}</span><h3>{t(isQualification ? "Saved for ranking" : "Your top right now")}</h3></div>
              <b>{boardEntries.length}</b>
            </div>
            <div className="ranked-live-list">
              {boardEntries.map((entry, index) => {
                const item = itemMap.get(entry.itemId);
                if (!item) {
                  return null;
                }
                return (
                  <div
                    className={`ranked-live-row ${player?.itemId === entry.itemId ? "active" : ""} ${dragged?.source === "leader" && dragged.itemId === entry.itemId ? "dragging" : ""}`}
                    key={entry.itemId}
                    onPointerDown={isQualification
                      ? undefined
                      : (event) => beginPointerDrag(event, entry.itemId, "leader")}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <RemoteImage src={item.thumbnailUrl} alt="" draggable={false} />
                    <p><b>{item.title}</b><small>{item.channel}</small></p>
                    <strong>{isQualification ? "✓" : formatPoints(entry.points)}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function formatPoints(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}
