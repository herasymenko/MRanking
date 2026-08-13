"use client";

import type { PackItem, SourceType } from "../../../lib/types";
import { mediaEmbedUrl } from "../../domain/pack";
import { useI18n } from "../../i18n/I18nContext";
import { RemoteImage } from "../shared/RemoteImage";

export function RankedMedia({
  item,
  sourceType,
  playing,
  onClose,
  compact = false,
  showControl = true,
}: {
  item: PackItem;
  sourceType: SourceType;
  playing: boolean;
  onClose: () => void;
  compact?: boolean;
  showControl?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`ranked-media ${playing ? "playing" : ""} ${compact ? "compact" : ""}`}
      data-source={sourceType}
    >
      {playing ? (
        <iframe
          src={mediaEmbedUrl(sourceType, item)}
          title={item.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <RemoteImage src={item.thumbnailUrl} alt="" />
      )}
      {showControl && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t(playing ? "Close player" : "Play track")}
        >
          <span aria-hidden="true">{playing ? "×" : "▶"}</span>
        </button>
      )}
    </div>
  );
}
