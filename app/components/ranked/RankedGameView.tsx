"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Pack, RankedRun } from "../../../lib/types";
import {
  confirmRankedQualifiers,
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
  const [qualificationSelection, setQualificationSelection] = useState<string[]>([]);
  const [advancing, setAdvancing] = useState(false);
  const [stageTransition, setStageTransition] = useState<"ranking" | "result" | null>(null);
  const actionTimerRef = useRef<number | null>(null);
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
      if (actionTimerRef.current !== null) {
        window.clearTimeout(actionTimerRef.current);
      }
    },
    [],
  );

  function confirm() {
    if (advancing || stageTransition) {
      return;
    }
    playSound("next");
    closePlayer();
    const nextRun = isQualification
      ? confirmRankedQualifiers(run, qualificationSelection)
      : confirmRankedOrder(run);
    const transition = nextRun.state.status === "complete"
      ? "result"
      : nextRun.state.phase !== run.state.phase
        ? "ranking"
        : null;
    if (transition) {
      setStageTransition(transition);
      actionTimerRef.current = window.setTimeout(() => {
        actionTimerRef.current = null;
        setStageTransition(null);
        onChange(nextRun);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 2_000);
      return;
    }
    setAdvancing(true);
    actionTimerRef.current = window.setTimeout(() => {
      actionTimerRef.current = null;
      setAdvancing(false);
      setQualificationSelection([]);
      onChange(nextRun);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 280);
  }

  function undo() {
    if (advancing || stageTransition) {
      return;
    }
    playSound("undo");
    const restored = undoRankedOrder(run);
    if (restored.state.phase === "qualification") {
      const before = new Set(restored.state.qualifiedIds);
      setQualificationSelection(
        run.state.qualifiedIds.filter((itemId) => !before.has(itemId)),
      );
    } else {
      setQualificationSelection([]);
    }
    onChange(restored);
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
          <h2>{t(isQualification ? "Clear the noise." : "Put them in their place")}</h2>
        </div>
        <div className="ranked-game-meta">
          <span>{pack.name}</span>
          <strong className="ranked-action-progress">
            {isQualification
              ? t("BATCH {current} / {total}", {
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
            disabled={advancing || Boolean(stageTransition) || !run.state.undoStack.length}
            onClick={undo}
          >
            ↶ {t("Undo")}
          </button>
          <button type="button" className="ranked-cancel" disabled={advancing || Boolean(stageTransition)} onClick={onCancel}>
            {t("Cancel run")}
          </button>
        </div>
      </header>
      <progress className="ranked-progress" max={100} value={progress} />

      <div className={`ranked-workspace ${topOpen ? "top-open" : ""} ${activeGroupItem ? "has-active-player" : ""} ${isQualification ? "qualification" : "ranking"} ${advancing ? "advancing" : ""}`}>
        <div className="ranked-order-panel">
          <div className={`ranked-group-list group-size-${draftOrder.length}`}>
            {draftOrder.map((id, index) => {
              const item = itemMap.get(id);
              if (!item) {
                return null;
              }
              return (
                <div className="ranked-choice-slot" key={id}>
                  {!isQualification && <span className="ranked-place">{index + 1}</span>}
                  <article
                    ref={(element) => {
                      if (element) {
                        rowRefs.current.set(id, element);
                      } else {
                        rowRefs.current.delete(id);
                      }
                    }}
                    className={`ranked-choice-row ${player?.itemId === id ? "active" : ""} ${dragged?.source === "group" && dragged.itemId === id ? "dragging" : ""} ${qualificationSelection.includes(id) ? "qualifier-selected" : ""}`}
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
                      <button
                        type="button"
                        className="ranked-keep-toggle"
                        aria-pressed={qualificationSelection.includes(id)}
                        aria-label={t("Keep {name}", { name: item.title })}
                        onClick={() => setQualificationSelection((current) =>
                          current.includes(id)
                            ? current.filter((candidate) => candidate !== id)
                            : [...current, id],
                        )}
                      >
                        <span aria-hidden="true">✓</span>
                        <small>{t(qualificationSelection.includes(id) ? "KEPT" : "KEEP")}</small>
                      </button>
                    ) : (
                      <span className="ranked-drag-handle" title={t("Drag to reorder")}>⠿</span>
                    )}
                  </article>
                </div>
              );
            })}
          </div>
          <div className="ranked-order-controls">
            <button type="button" className="ranked-confirm" disabled={advancing || Boolean(stageTransition)} onClick={confirm}>
              <span>{isQualification
                ? t("NEXT · {selected} SAVED", { selected: qualificationSelection.length })
                : t("NEXT")}</span>
            </button>
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
                    onPointerDown={(event) => beginPointerDrag(event, entry.itemId, "leader")}
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
      {stageTransition && (
        <div className={`ranked-stage-transition ${stageTransition}`} role="status">
          <span>{t(stageTransition === "ranking" ? "STAGE 2" : "FINAL")}</span>
          <strong>{t(stageTransition === "ranking" ? "THE REAL RANKING BEGINS" : "YOUR FINAL ORDER IS READY")}</strong>
          <i aria-hidden="true" />
        </div>
      )}
    </section>
  );
}

export function formatPoints(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}
