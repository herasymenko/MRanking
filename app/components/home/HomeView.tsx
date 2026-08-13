"use client";

import { useI18n } from "../../i18n/I18nContext";

export function HomeView({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  return (
    <section className="new-home">
      <div className="home-copy">
        <div className="eyebrow">
          <span>●</span>
          {t("THE RANKING PLAYGROUND")}
        </div>
        <h1>
          {t("Bring the pack.")}
          <br />
          {t("Make the call.")}
          <br />
          <em>{t("Own the order.")}</em>
        </h1>
        <p className="home-deck">
          {t("Turn any playlist into a game, a winner and a ranking worth arguing about.")}
        </p>
        <button className="button primary jumbo" onClick={onStart}>
          {t("Enter the arena")}
          <span>↗</span>
        </button>
      </div>
      <ChoicePreview />
      <div className="home-flow">
        <span>01 {t("LOAD A PACK")}</span>
        <i>→</i>
        <span>02 {t("PICK THE RULES")}</span>
        <i>→</i>
        <span>03 {t("MAKE THE CALLS")}</span>
        <i>→</i>
        <span>04 {t("OWN THE RANKING")}</span>
      </div>
    </section>
  );
}

function ChoicePreview() {
  const { t } = useI18n();
  return (
    <div
      className="choice-preview"
      aria-label={t("Choose the one that stays")}
    >
      <header className="preview-head">
        <span>{t("LIVE DECISION")}</span>
        <b>05 / 32</b>
      </header>
      <div className="preview-duel">
        {["one", "two"].map((variant, index) => (
          <article className={`preview-option preview-option-${variant}`} key={variant}>
            <div className="preview-art" aria-hidden="true">
              <span>0{index + 1}</span>
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="preview-track-lines" aria-hidden="true">
              <b />
              <i />
            </div>
            <div className="preview-pick">
              <span>{t("Send it through")}</span>
              <b>↗</b>
            </div>
          </article>
        ))}
        <div className="preview-vs" aria-hidden="true">VS</div>
      </div>
      <div className="preview-ranking">
        <header>
          <span>{t("THE BOARD")}</span>
          <b>{t("UPDATING LIVE")}</b>
        </header>
        {[96, 84, 71].map((score, index) => (
          <div className={`preview-rank-row preview-rank-${index + 1}`} key={score}>
            <strong>0{index + 1}</strong>
            <i aria-hidden="true" />
            <span aria-hidden="true">
              <b />
              <small />
            </span>
            <em>{score}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
