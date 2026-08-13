"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Pack, RankedResult, RankedSessionState } from "../../../lib/types";
import { setManualRankedOrder } from "../../domain/ranked";
import { useI18n } from "../../i18n/I18nContext";
import { FlowBack } from "../shared/FlowBack";
import { RemoteImage } from "../shared/RemoteImage";
import { formatPoints } from "./RankedGameView";
import { RankedMedia } from "./RankedMedia";
import { RankedSoundControl } from "./RankedSoundControl";
import { useRankedPlayer } from "./useRankedPlayer";
import { useRankedResultOrder } from "./useRankedResultOrder";
import { useRankedSounds } from "./useRankedSounds";

export function RankedResultView({
  pack,
  state,
  completedAt,
  saving = false,
  onBack,
  onAgain,
  onDelete,
  onAdjust,
}: {
  pack: Pack;
  state: RankedSessionState;
  completedAt?: string;
  saving?: boolean;
  onBack: () => void;
  onAgain?: () => void;
  onDelete?: () => void;
  onAdjust?: (state: RankedSessionState) => void;
}) {
  const { t, language } = useI18n();
  const initialOrder = useMemo(
    () => (state.manualRanking.length ? state.manualRanking : state.finalRanking)
      .map((entry) => entry.itemId),
    [state.finalRanking, state.manualRanking],
  );
  const [order, setOrder] = useState(initialOrder);
  const { playSound, setVolume, unlockSound, volume } = useRankedSounds();
  const {
    closePlayer,
    playInPlayer,
    player,
    playerRef,
    receiving,
  } = useRankedPlayer(playSound);
  const autoPlayedRef = useRef(false);
  const itemMap = useMemo(
    () => new Map(pack.items.map((item) => [item.id, item])),
    [pack.items],
  );
  const points = useMemo(
    () => new Map(state.finalRanking.map((entry) => [entry.itemId, entry.points])),
    [state.finalRanking],
  );

  useEffect(() => {
    const first = initialOrder[0];
    if (first && !autoPlayedRef.current) {
      autoPlayedRef.current = true;
      playInPlayer(first);
    }
  }, [initialOrder, playInPlayer]);

  function applyOrder(next: string[]) {
    const adjusted = setManualRankedOrder(state, next);
    const accepted = adjusted === state
      ? initialOrder
      : adjusted.manualRanking.map((entry) => entry.itemId);
    setOrder(accepted);
    if (adjusted !== state) {
      onAdjust?.(adjusted);
    }
  }

  const {
    beginPointerDrag,
    draftOrder,
    draggedId,
    playerDragActive,
    rowRefs,
  } = useRankedResultOrder({
    canAdjust: Boolean(onAdjust) && !saving,
    onCommit: applyOrder,
    order,
    playerRef,
    playInPlayer,
    playSound,
    points,
  });
  const activeMedia = player ? itemMap.get(player.itemId) ?? null : null;
  const locale = language === "ru" ? "ru-RU" : language === "uk" ? "uk-UA" : "en-GB";

  return (
    <section
      className="ranked-result-screen"
      onPointerDownCapture={unlockSound}
    >
      <FlowBack label="Back" onClick={onBack} />
      <RankedSoundControl
        volume={volume}
        onChange={setVolume}
        onPreview={() => playSound("move")}
      />
      <header className="ranked-result-header">
        <div>
          <span>{t("RANKING COMPLETE")}</span>
          <h2>{t("Your final order")}</h2>
        </div>
        <div className="ranked-result-meta">
          <strong>{pack.name}</strong>
          {completedAt && (
            <small>{new Date(completedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</small>
          )}
          {saving && <small className="ranked-saving">{t("Saving result…")}</small>}
        </div>
        <div className="result-actions">
          {onAgain && <button className="button primary" onClick={onAgain}>{t("Run it back")}</button>}
          {onDelete && <button className="button danger" onClick={onDelete}>{t("Delete history")}</button>}
        </div>
      </header>

      <div className={`ranked-result-workspace ${activeMedia ? "has-active-player" : ""}`}>
        <section className="ranked-final-panel">
          <div className="ranked-final-head">
            <div><span>{t("FINAL TOP")}</span><strong>{draftOrder.length}</strong></div>
            <small>{t("Only equal scores can trade places")}</small>
          </div>
          <div className="ranked-final-list">
            {draftOrder.map((id, index) => {
              const item = itemMap.get(id);
              if (!item) {
                return null;
              }
              const pointValue = points.get(id) ?? 0;
              const tied = draftOrder.some(
                (candidate, candidateIndex) =>
                  candidateIndex !== index && points.get(candidate) === pointValue,
              );
              return (
                <div className="ranked-final-slot" key={id}>
                  <span className="ranked-final-place">{index + 1}</span>
                  <article
                    ref={(element) => {
                      if (element) {
                        rowRefs.current.set(id, element);
                      } else {
                        rowRefs.current.delete(id);
                      }
                    }}
                    className={`ranked-final-row ${player?.itemId === id ? "active" : ""} ${draggedId === id ? "dragging" : ""}`}
                    onPointerDown={(event) => beginPointerDrag(event, id)}
                  >
                    <RemoteImage
                      className="ranked-choice-art"
                      src={item.thumbnailUrl}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                    />
                    <div className="ranked-final-copy">
                      <b>{item.title}</b>
                      <small>{item.channel}{item.duration ? ` · ${item.duration}` : ""}</small>
                    </div>
                    <strong>{formatPoints(pointValue)} <small>{t("PTS")}</small></strong>
                    <span
                      className={`ranked-drag-handle ${tied ? "tie" : ""}`}
                      title={t(tied ? "Drag to reorder or play" : "Drag to player")}
                    >⠿</span>
                  </article>
                </div>
              );
            })}
          </div>
        </section>

        <section
          ref={playerRef}
          className={`ranked-result-player ranked-player-dock ${activeMedia ? "has-track" : ""} ${playerDragActive ? "drag-active" : ""} ${receiving ? "receiving" : ""}`}
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
      </div>
    </section>
  );
}

export function rankedResultFromRun(pack: Pack, runId: string, state: RankedSessionState): RankedResult {
  return { id: runId, packId: pack.id, state, pack, completedAt: state.updatedAt };
}
