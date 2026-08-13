"use client";

import { useState } from "react";
import { useI18n } from "../../i18n/I18nContext";

export function RankedSoundControl({
  volume,
  onChange,
  onPreview,
}: {
  volume: number;
  onChange: (volume: number) => void;
  onPreview: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const percent = Math.round(volume * 100);

  return (
    <div
      className={`ranked-sound-control ${open ? "open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.currentTarget.querySelector<HTMLElement>("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        className="ranked-sound-trigger"
        aria-label={t("Interface sound volume")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={`ranked-speaker-icon ${volume === 0 ? "muted" : ""}`}
          aria-hidden="true"
        ><i /></span>
      </button>
      <div className="ranked-sound-panel">
        <span>{t("UI sounds")}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          aria-label={t("Interface sound volume")}
          onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
          onPointerUp={onPreview}
          onKeyUp={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              onPreview();
            }
          }}
        />
        <output>{percent}%</output>
      </div>
    </div>
  );
}
