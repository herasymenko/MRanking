"use client";

import { useMemo, useState } from "react";
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
import { useRankedPlayer } from "./useRankedPlayer";
import { useRankedPointerOrder } from "./useRankedPointerOrder";

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
  const {
    closePlayer,
    playFromTile,
    playInPlayer,
    player,
    playerRef,
    receiving,
  } = useRankedPlayer();
  const {
    beginPointerDrag,
    draftOrder,
    dragged,
    playerDragActive,
    rowRefs,
  } = useRankedPointerOrder({ run, onChange, playerRef, playInPlayer });
  const itemMap = useMemo(
    () => new Map(pack.items.map((item) => [item.id, item])),
    [pack.items],
  );
  const activeMedia = player ? itemMap.get(player.itemId) ?? null : null;
  const leaders = rankedLeaderboard(run.state.entries).slice(0, 100);
  const progress = Math.min(
    100,
    ((run.state.completedActions + 1) / Math.max(1, run.state.totalActions)) *
      100,
  );

  function confirm() {
    closePlayer();
    onChange(confirmRankedOrder(run));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function undo() {
    closePlayer();
    onChange(undoRankedOrder(run));
  }

  return (
    <section className="ranked-game-view">
      <FlowBack label="Back" onClick={onBack} />
      <header className="ranked-game-header">
        <div>
          <h2>{t("Put them in their place")}</h2>
        </div>
        <div className="ranked-game-meta">
          <span>{pack.name}</span>
          <div className="ranked-round-progress">
            <strong>
              {t("Round {current} / {total}", {
                current: run.state.round,
                total: run.state.targetRounds,
              })}
            </strong>
            <b>{rankedProgressLabel(run.state)}</b>
          </div>
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

      <div className={`ranked-workspace ${topOpen ? "top-open" : ""}`}>
        <div className="ranked-order-panel">
          <div className="ranked-group-list">
            {draftOrder.map((id, index) => {
              const item = itemMap.get(id);
              if (!item) {
                return null;
              }
              return (
                <article
                  key={id}
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
                  <span className="ranked-place">{index + 1}</span>
                  <div className="ranked-choice-copy">
                    <h3>{item.title}</h3>
                    <p>{item.channel}{item.duration ? ` · ${item.duration}` : ""}</p>
                  </div>
                  <button
                    type="button"
                    className="ranked-card-play"
                    aria-label={t("Play track")}
                    aria-pressed={player?.itemId === id}
                    onClick={(event) =>
                      playFromTile(
                        id,
                        event.currentTarget.closest(
                          ".ranked-choice-row",
                        ) as HTMLElement,
                      )
                    }
                  >
                    <span aria-hidden="true">▶</span>
                    <small>{t(player?.itemId === id ? "IN PLAYER" : "PLAY")}</small>
                  </button>
                  <span className="ranked-drag-handle" title={t("Drag to reorder")}>⠿</span>
                </article>
              );
            })}
          </div>
          <button type="button" className="ranked-confirm" onClick={confirm}>
            <span>{t("Lock this order")}</span><b>↗</b>
          </button>
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
              playing
              onClose={closePlayer}
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
            onClick={() => setTopOpen((open) => !open)}
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
