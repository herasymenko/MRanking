"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Pack, RankedRun } from "../../../lib/types";
import {
  confirmRankedOrder,
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
import { useRankedPreviewQueue } from "./useRankedPreviewQueue";
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
    Array<{ delta: number; itemId: string; place: number; title: string }> | null
  >(null);
  const summaryTimerRef = useRef<number | null>(null);
  const { playSound, setVolume, unlockSound, volume } = useRankedSounds();
  const {
    closePlayer,
    playInPlayer,
    player,
    playerRef,
    receiving,
    toggleFromTile,
  } = useRankedPlayer(playSound);
  const {
    preview,
    start: startPreview,
    stop: stopPreview,
  } = useRankedPreviewQueue({
    closePlayer,
    playInPlayer,
    onStart: () => playSound("play"),
    sourceType: pack.sourceType,
  });
  function playManually(itemId: string) {
    stopPreview({ close: false });
    playInPlayer(itemId);
  }
  function toggleTrack(itemId: string, source: HTMLElement) {
    stopPreview({ close: false });
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
  const leaders = rankedLeaderboard(run.state.entries).slice(0, 100);
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
    },
    [],
  );

  function confirm() {
    stopPreview();
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
      const item = itemMap.get(itemId);
      const previousPlace = before.get(itemId);
      const nextPlace = after.get(itemId);
      return item && previousPlace !== undefined && nextPlace !== undefined
        ? [{
            delta: previousPlace - nextPlace,
            itemId,
            place: nextPlace + 1,
            title: item.title,
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

  function undo() {
    setMatchSummary(null);
    stopPreview();
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
          <h2>{t("Put them in their place")}</h2>
        </div>
        <div className="ranked-game-meta">
          <span>{pack.name}</span>
          <strong className="ranked-action-progress">
            {rankedProgressLabel(run.state)}
          </strong>
        </div>
        <div className="ranked-game-actions">
          <button
            type="button"
            className="ranked-undo"
            disabled={!run.state.undoStack.length}
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

      <div className={`ranked-workspace ${topOpen ? "top-open" : ""} ${activeGroupItem ? "has-active-player" : ""}`}>
        <div className={`ranked-order-panel ${matchSummary ? "match-settling" : ""}`}>
          <div className="ranked-group-list">
            {draftOrder.map((id, index) => {
              const item = itemMap.get(id);
              if (!item) {
                return null;
              }
              return (
                <div className="ranked-choice-slot" key={id}>
                  <span className="ranked-place">{index + 1}</span>
                  <article
                    ref={(element) => {
                      if (element) {
                        rowRefs.current.set(id, element);
                      } else {
                        rowRefs.current.delete(id);
                      }
                    }}
                    className={`ranked-choice-row ${player?.itemId === id ? "active" : ""} ${dragged?.source === "group" && dragged.itemId === id ? "dragging" : ""}`}
                    onPointerDown={(event) =>
                      beginPointerDrag(event, id, "group")
                    }
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
                      onClick={(event) =>
                        toggleTrack(
                          id,
                          event.currentTarget.closest(
                            ".ranked-choice-row",
                          ) as HTMLElement,
                        )
                      }
                    >
                      <span aria-hidden="true">
                        {player?.itemId === id ? "■" : "▶"}
                      </span>
                      <small>{t(player?.itemId === id ? "STOP" : "PLAY")}</small>
                    </button>
                    <span className="ranked-drag-handle" title={t("Drag to reorder")}>⠿</span>
                  </article>
                </div>
              );
            })}
          </div>
          <div className="ranked-order-controls">
            <button
              type="button"
              className={`ranked-preview-all ${preview ? "active" : ""}`}
              onClick={() => {
                if (preview) {
                  playSound("stop");
                  stopPreview();
                } else {
                  startPreview(
                    draftOrder.flatMap((itemId) => {
                      const item = itemMap.get(itemId);
                      return item
                        ? [{ itemId, duration: item.duration }]
                        : [];
                    }),
                  );
                }
              }}
            >
              <span aria-hidden="true">{preview ? "■" : "▶"}</span>
              <strong>
                {preview
                  ? t("STOP PREVIEW · {current}/{total}", {
                      current: preview.index + 1,
                      total: preview.total,
                    })
                  : t("PREVIEW ALL 4")}
              </strong>
            </button>
            <button type="button" className="ranked-confirm" onClick={confirm}>
              <span>{t("NEXT")}</span>
            </button>
          </div>
          {matchSummary && (
            <div className="ranked-match-ghosts" aria-hidden="true">
              {matchSummary.map((item) => (
                <div className="ranked-match-ghost" key={item.itemId}>
                  <b>{item.place}</b>
                  <span>{item.title}</span>
                  <strong
                    className={
                      item.delta > 0
                        ? "up"
                        : item.delta < 0
                          ? "down"
                          : "same"
                    }
                  >
                    {item.delta > 0
                      ? `↑${item.delta}`
                      : item.delta < 0
                        ? `↓${Math.abs(item.delta)}`
                        : "—"}
                  </strong>
                </div>
              ))}
            </div>
          )}
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
            <span>{t(topOpen ? "Hide current top" : "View current top")}</span>
          </button>
          <div className="ranked-live-content">
            <div className="ranked-live-head">
              <div><span>{t("LIVE BOARD")}</span><h3>{t("Your top right now")}</h3></div>
              <b>{leaders.length}</b>
            </div>
            <div className="ranked-live-list">
              {leaders.map((entry, index) => {
                const item = itemMap.get(entry.itemId);
                if (!item) {
                  return null;
                }
                return (
                  <div
                    className={`ranked-live-row ${player?.itemId === entry.itemId ? "active" : ""} ${dragged?.source === "leader" && dragged.itemId === entry.itemId ? "dragging" : ""}`}
                    key={entry.itemId}
                    onPointerDown={(event) =>
                      beginPointerDrag(event, entry.itemId, "leader")
                    }
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <RemoteImage src={item.thumbnailUrl} alt="" draggable={false} />
                    <p><b>{item.title}</b><small>{item.channel}</small></p>
                    <strong>{formatPoints(entry.points)}</strong>
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
