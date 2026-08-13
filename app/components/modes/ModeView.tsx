"use client";

import type { Pack } from "../../../lib/types";
import { useI18n } from "../../i18n/I18nContext";
import { PackCover } from "../packs/PackCard";
import { FlowBack } from "../shared/FlowBack";

const MODES = [
  {
    id: "king",
    title: "King of the Hill",
    icon: "♛",
    copy: "Head to head. One survives. Repeat until a champion stands.",
    live: true,
  },
  {
    id: "wheel",
    title: "Chance Wheel",
    icon: "◉",
    copy: "Set the odds. Spin the tension. Let chance make the call.",
    live: true,
  },
  {
    id: "ranked",
    title: "Ranked 100",
    icon: "≋",
    copy: "Order small groups and build one balanced top from best to worst.",
    live: true,
  },
  {
    id: "tier",
    title: "Tier List",
    icon: "▤",
    copy: "Build your tiers. Defend every placement.",
    live: false,
  },
  {
    id: "blind",
    title: "Blind Ranking",
    icon: "?",
    copy: "Commit to a spot before you know what comes next.",
    live: false,
  },
  {
    id: "score",
    title: "Score Everything",
    icon: "★",
    copy: "Score every entry. Let the numbers settle it.",
    live: false,
  },
  {
    id: "drop",
    title: "Keep or Drop",
    icon: "±",
    copy: "One ruthless keep-or-cut decision at a time.",
    live: false,
  },
  {
    id: "bracket",
    title: "Single Elimination",
    icon: "⌘",
    copy: "A clean bracket. No second chances.",
    live: false,
  },
];

export function ModeView({
  selectedPack,
  onBack,
  onKing,
  onOpenWheel,
  onOpenRanked,
}: {
  selectedPack: Pack | null;
  onBack: () => void;
  onKing: () => void;
  onOpenWheel: () => void;
  onOpenRanked: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="page-wrap mode-view">
      <FlowBack label="Back" onClick={onBack} />
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span>●</span>{t("PICK YOUR GAME")}
          </div>
          <h2>{t("Choose the rules")}</h2>
          <p className="page-intro">{t("One pack. Three completely different ways to settle the ranking.")}</p>
        </div>
      </div>
      {selectedPack && (
        <div className="selected-pack-strip">
          <PackCover pack={selectedPack} />
          <div>
            <span>{t("SELECTED PACK")}</span>
            <b>{selectedPack.name}</b>
            <small>{selectedPack.itemCount} {t("ITEMS")}</small>
          </div>
        </div>
      )}
      <div className="mode-grid">
        {MODES.map((mode, index) => (
          <button
            key={mode.id}
            className={`mode-tile ${mode.live ? "live" : "locked"}`}
            disabled={!mode.live}
            onClick={
              mode.id === "king"
                ? onKing
                : mode.id === "wheel"
                  ? onOpenWheel
                  : mode.id === "ranked"
                    ? onOpenRanked
                  : undefined
            }
          >
            <span className="mode-number">0{index + 1}</span>
            <i>{mode.icon}</i>
            <div>
              <h3>{t(mode.title)}</h3>
              <p>{t(mode.copy)}</p>
            </div>
            <b>{t(mode.live ? "LAUNCH MODE" : "IN THE LAB")}</b>
          </button>
        ))}
      </div>
    </section>
  );
}
