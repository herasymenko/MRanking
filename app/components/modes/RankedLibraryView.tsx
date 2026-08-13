"use client";

import type { Pack, RankedResult, RankedRun } from "../../../lib/types";
import { isYouTubeSource, sourceName } from "../../domain/pack";
import { useI18n } from "../../i18n/I18nContext";
import { PackCover, PackTypeBadge } from "../packs/PackCard";
import { FlowBack } from "../shared/FlowBack";
import { RemoteImage } from "../shared/RemoteImage";

export function RankedLibraryView({
  packs,
  runs,
  results,
  onBack,
  onUpload,
  onStart,
  onContinue,
  onCancelRun,
  onOpenResult,
  onDeleteResult,
}: {
  packs: Pack[];
  runs: Record<string, RankedRun>;
  results: RankedResult[];
  onBack: () => void;
  onUpload: () => void;
  onStart: (pack: Pack) => void;
  onContinue: (pack: Pack) => void;
  onCancelRun: (pack: Pack) => void;
  onOpenResult: (result: RankedResult) => void;
  onDeleteResult: (result: RankedResult) => void;
}) {
  const { t, language } = useI18n();
  const locale = language === "ru" ? "ru-RU" : language === "uk" ? "uk-UA" : "en-GB";

  return (
    <section className="page-wrap library-view ranked-library-view">
      <FlowBack label="Back" onClick={onBack} />
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span>●</span>{t("RANKED 100 / PACK SELECT")}</div>
          <h2>{t("Choose your field")}</h2>
          <p className="page-intro">{t("Pick a pack and turn quick group decisions into one balanced top.")}</p>
        </div>
      </div>

      <div className="pack-grid mode-pack-grid">
        <button className="pack-tile add-pack-tile" onClick={onUpload}>
          <span className="add-pack-plus" aria-hidden="true">+</span>
          <strong>{t("Build a new pack")}</strong>
          <small>{t("Bring playlists together and make them playable.")}</small>
          <b aria-hidden="true">↗</b>
        </button>
        {packs.map((pack) => {
          const run = runs[pack.id];
          const open = () => (run ? onContinue(pack) : onStart(pack));
          return (
            <article className={`pack-tile ${run ? "has-ranked-run" : ""}`} key={pack.id}>
              <button className="pack-art" onClick={open}>
                <PackCover pack={pack} />
                <PackTypeBadge />
                {run && <span className="ranked-resume-badge">{t("IN PROGRESS")}</span>}
                <div className="pack-play-overlay">
                  <span>{t(run ? "Continue the ranking" : "BUILD THE TOP")}</span><b>↗</b>
                </div>
              </button>
              <div className="pack-tile-body">
                <div className="pack-meta">
                  <span>{t(sourceName(pack.sourceType))}</span>
                  <span>{pack.itemCount} {t(isYouTubeSource(pack.sourceType) ? "videos" : "tracks")}</span>
                </div>
                <h3>{pack.name}</h3>
                <div className="pack-owner">
                  <span>by {pack.ownerNickname}</span>
                  <b>{new Date(pack.updatedAt).toLocaleDateString(locale)}</b>
                </div>
                <div className="pack-actions mode-pack-actions">
                  <button className={run ? "continue" : undefined} onClick={open}>
                    {t(run ? "Continue" : "Play")}
                  </button>
                  {run && (
                    <button className="danger" onClick={() => onCancelRun(pack)}>
                      {t("Cancel run")}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {packs.length === 0 && (
        <div className="empty-library">
          <h3>{t("No packs yet")}</h3>
          <p>{t("Upload a pack before starting a mode.")}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="result-history ranked-result-history">
          <div className="section-line">
            <div>
              <h3>{t("Ranking history")}</h3>
              <p>{t("Open any saved top and adjust it whenever you want.")}</p>
            </div>
            <span>{results.length}</span>
          </div>
          <div className="result-history-grid">
            {results.map((result) => {
              const winnerId = result.state.manualRanking[0]?.itemId;
              const winner = result.pack.items.find((item) => item.id === winnerId);
              return (
                <article className="result-history-card" key={result.id}>
                  <button
                    className="result-history-open"
                    onClick={() => onOpenResult(result)}
                    aria-label={`${t("View ranking")}: ${result.pack.name}`}
                  >
                    <span className="result-history-art">
                      {winner && <RemoteImage src={winner.thumbnailUrl} alt="" />}
                      <i>01</i>
                    </span>
                    <span className="result-history-copy">
                      <small>{new Date(result.completedAt).toLocaleDateString(locale)}</small>
                      <strong>{result.pack.name}</strong>
                      <span>{winner?.title ?? t("Deleted track")}</span>
                      <b>{t("View ranking")} ↗</b>
                    </span>
                  </button>
                  <button
                    className="result-history-delete"
                    onClick={() => onDeleteResult(result)}
                    aria-label={`${t("Delete history")}: ${result.pack.name}`}
                  >×</button>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
