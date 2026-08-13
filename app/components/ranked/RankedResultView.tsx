"use client";

import { useMemo, useState } from "react";
import type { Pack, RankedResult, RankedSessionState } from "../../../lib/types";
import { moveRankedItem, setManualRankedOrder } from "../../domain/ranked";
import { useI18n } from "../../i18n/I18nContext";
import { FlowBack } from "../shared/FlowBack";
import { RemoteImage } from "../shared/RemoteImage";
import { formatPoints } from "./RankedGameView";
import { RankedMedia } from "./RankedMedia";

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
  const [order, setOrder] = useState(() => state.manualRanking.map((entry) => entry.itemId));
  const [playing, setPlaying] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const itemMap = useMemo(() => new Map(pack.items.map((item) => [item.id, item])), [pack.items]);
  const points = useMemo(
    () => new Map(state.finalRanking.map((entry) => [entry.itemId, entry.points])),
    [state.finalRanking],
  );

  function applyOrder(next: string[]) {
    setOrder(next);
    onAdjust?.(setManualRankedOrder(state, next));
  }

  function move(from: number, to: number) {
    applyOrder(moveRankedItem(order, from, to));
  }

  const topThree = order.slice(0, 3);
  const locale = language === "ru" ? "ru-RU" : language === "uk" ? "uk-UA" : "en-GB";

  return (
    <section className="page-wrap ranked-result-view">
      <FlowBack label="Back" onClick={onBack} />
      <div className="ranked-result-hero">
        <div>
          <div className="eyebrow"><span>●</span>{t("THE VERDICT IS IN")}</div>
          <h2>{t("Your ranking just landed.")}</h2>
          <p>{t("The algorithm built the order. Now drag anything you want to make it unmistakably yours.")}</p>
          {completedAt && (
            <small>{new Date(completedAt).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" })}</small>
          )}
          <div className="result-actions">
            {onAgain && <button className="button primary" onClick={onAgain}>{t("Run it back")}</button>}
            {onDelete && <button className="button danger" onClick={onDelete}>{t("Delete history")}</button>}
          </div>
          {saving && <span className="ranked-saving">{t("Saving result…")}</span>}
        </div>
        <div className="ranked-podium">
          {topThree.map((id, index) => {
            const item = itemMap.get(id);
            return item ? (
              <article key={id} className={`ranked-podium-card place-${index + 1}`}>
                <span>{index + 1}</span>
                <RemoteImage src={item.thumbnailUrl} alt="" />
                <div><b>{item.title}</b><small>{item.channel}</small></div>
                <strong>{formatPoints(points.get(id) ?? 0)} {t("PTS")}</strong>
              </article>
            ) : null;
          })}
        </div>
      </div>

      <div className="ranked-result-toolbar">
        <div><span>{t("YOUR FINAL SAY")}</span><h3>{t("The final order")}</h3></div>
        <button
          type="button"
          disabled={!onAdjust || saving}
          onClick={() => applyOrder(state.finalRanking.map((entry) => entry.itemId))}
        >{t("Reset to automatic")}</button>
      </div>

      <div className="ranked-final-list">
        {order.map((id, index) => {
          const item = itemMap.get(id);
          if (!item) {
            return null;
          }
          return (
            <article
              key={id}
              className={`ranked-final-row ${index < 3 ? "podium" : ""} ${draggedId === id ? "dragging" : ""}`}
              draggable={Boolean(onAdjust) && !saving}
              onDragStart={(event) => {
                setDraggedId(id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggedId || draggedId === id) {
                  return;
                }
                const from = order.indexOf(draggedId);
                if (from >= 0) {
                  move(from, index);
                }
                setDraggedId(null);
              }}
            >
              <span className="ranked-final-place">{String(index + 1).padStart(2, "0")}</span>
              <RankedMedia
                compact
                item={item}
                sourceType={pack.sourceType}
                playing={playing === id}
                onClose={() => setPlaying(playing === id ? null : id)}
              />
              <div className="ranked-final-copy"><b>{item.title}</b><small>{item.channel}</small></div>
              <strong>{formatPoints(points.get(id) ?? 0)} <small>{t("PTS")}</small></strong>
              {onAdjust && !saving && (
                <div className="ranked-final-controls">
                  <button disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={t("Move up")}>↑</button>
                  <span title={t("Drag to reorder")}>⠿</span>
                  <button disabled={index === order.length - 1} onClick={() => move(index, index + 1)} aria-label={t("Move down")}>↓</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function rankedResultFromRun(pack: Pack, runId: string, state: RankedSessionState): RankedResult {
  return { id: runId, packId: pack.id, state, pack, completedAt: state.updatedAt };
}
