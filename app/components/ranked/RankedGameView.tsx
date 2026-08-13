"use client";

import { useMemo, useState } from "react";
import type { Pack, RankedRun } from "../../../lib/types";
import {
  confirmRankedOrder,
  moveRankedItem,
  rankedLeaderboard,
  rankedProgressLabel,
  setRankedGroupOrder,
  undoRankedOrder,
} from "../../domain/ranked";
import { useI18n } from "../../i18n/I18nContext";
import { FlowBack } from "../shared/FlowBack";
import { RemoteImage } from "../shared/RemoteImage";
import { RankedMedia } from "./RankedMedia";

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
  const [playing, setPlaying] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const itemMap = useMemo(
    () => new Map(pack.items.map((item) => [item.id, item])),
    [pack.items],
  );
  const activeMedia = playing ? itemMap.get(playing) ?? null : null;
  const playerPlaceholder = itemMap.get(run.state.orderedGroup[0]);
  const leaders = rankedLeaderboard(run.state.entries).slice(0, 100);
  const progress = Math.min(
    100,
    ((run.state.completedActions + 1) / Math.max(1, run.state.totalActions)) * 100,
  );

  function reorder(fromIndex: number, toIndex: number) {
    const ordered = moveRankedItem(run.state.orderedGroup, fromIndex, toIndex);
    onChange(setRankedGroupOrder(run, ordered));
  }

  function confirm() {
    setPlaying(null);
    onChange(confirmRankedOrder(run));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function undo() {
    setPlaying(null);
    onChange(undoRankedOrder(run));
  }

  return (
    <section className="ranked-game-view">
      <FlowBack label="Back" onClick={onBack} />
      <header className="ranked-game-header">
        <div>
          <span className="ranked-phase">
            {t(run.state.phase === "qualification" ? "Qualification" : "Top 100 ranking")}
          </span>
          <h2>{t("Put them in their place")}</h2>
        </div>
        <div className="ranked-game-meta">
          <span>{pack.name}</span>
          <strong>{rankedProgressLabel(run.state)}</strong>
        </div>
        <div className="ranked-game-actions">
          <button
            type="button"
            className="ranked-undo"
            disabled={!run.state.undoStack.length}
            onClick={undo}
          >↶ {t("Undo")}</button>
          <button type="button" className="ranked-cancel" onClick={onCancel}>
            {t("Leave the ranking")}
          </button>
        </div>
      </header>
      <progress className="ranked-progress" max={100} value={progress} />

      <div className="ranked-workspace">
        <div className="ranked-order-panel">
          <div className="ranked-instruction">
            <span>{t("BEST")}</span>
            <p>{t("Drag the contenders into your order. Best at the top. No ties.")}</p>
            <span>{t("WORST")}</span>
          </div>
          <div className="ranked-group-list">
            {run.state.orderedGroup.map((id, index) => {
              const item = itemMap.get(id);
              if (!item) {
                return null;
              }
              return (
                <article
                  key={id}
                  className={`ranked-choice-row ${playing === id ? "active" : ""} ${draggedId === id ? "dragging" : ""}`}
                  draggable
                  onDragStart={(event) => {
                    setDraggedId(id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", id);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!draggedId || draggedId === id) {
                      return;
                    }
                    const fromIndex = run.state.orderedGroup.indexOf(draggedId);
                    if (fromIndex >= 0) {
                      reorder(fromIndex, index);
                    }
                  }}
                >
                  <button
                    type="button"
                    className="ranked-tile-preview"
                    aria-label={t("Play track")}
                    aria-pressed={playing === id}
                    onClick={() => setPlaying(id)}
                  >
                    <RemoteImage src={item.thumbnailUrl} alt="" />
                    <span className="ranked-tile-play" aria-hidden="true">▶</span>
                    <small>{t(playing === id ? "IN PLAYER" : "PLAY")}</small>
                  </button>
                  <span className="ranked-place">{index + 1}</span>
                  <div className="ranked-choice-copy">
                    <h3>{item.title}</h3>
                    <p>{item.channel}{item.duration ? ` · ${item.duration}` : ""}</p>
                  </div>
                  <div className="ranked-move-controls">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => reorder(index, index - 1)}
                      aria-label={t("Move up")}
                    >↑</button>
                    <span title={t("Drag to reorder")}>⠿</span>
                    <button
                      type="button"
                      disabled={index === run.state.orderedGroup.length - 1}
                      onClick={() => reorder(index, index + 1)}
                      aria-label={t("Move down")}
                    >↓</button>
                  </div>
                </article>
              );
            })}
          </div>
          <button type="button" className="ranked-confirm" onClick={confirm}>
            <span>{t("Lock this order")}</span><b>↗</b>
          </button>
        </div>

        <section className={`ranked-player-dock ${activeMedia ? "has-track" : ""}`}>
          <header className="ranked-player-head">
            <div>
              <span>{t("PLAYER")}</span>
              <h3>{activeMedia ? activeMedia.title : t("Choose a track")}</h3>
              <p>
                {activeMedia
                  ? activeMedia.channel
                  : t("Press play on any tile. Your next choice replaces it here.")}
              </p>
            </div>
            <b aria-hidden="true">{activeMedia ? "ON" : "▶"}</b>
          </header>
          {activeMedia ? (
            <RankedMedia
              key={activeMedia.id}
              item={activeMedia}
              sourceType={pack.sourceType}
              playing
              onPlay={() => setPlaying(null)}
            />
          ) : (
            <div className="ranked-player-empty">
              {playerPlaceholder ? (
                <RemoteImage src={playerPlaceholder.thumbnailUrl} alt="" />
              ) : null}
              <span aria-hidden="true">▶</span>
              <strong>{t("Choose a track")}</strong>
            </div>
          )}
        </section>

        <aside className="ranked-live-top">
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
                <div className="ranked-live-row" key={entry.itemId}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <RemoteImage src={item.thumbnailUrl} alt="" />
                  <p><b>{item.title}</b><small>{item.channel}</small></p>
                  <strong>{formatPoints(entry.points)}</strong>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function formatPoints(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}
