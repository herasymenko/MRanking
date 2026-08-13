"use client";

import { useState } from "react";
import type {
  ProfilePlaylistPreview,
  YouTubeProfilePreview,
} from "../../../lib/types";
import { useI18n } from "../../i18n/I18nContext";
import { FlowBack } from "../shared/FlowBack";
import { RemoteImage } from "../shared/RemoteImage";

export function ProfilePlaylistPicker({
  profile,
  onBack,
  onRetry,
  onChooseMany,
  importing = false,
}: {
  profile: YouTubeProfilePreview;
  onBack: () => void;
  onRetry: () => void;
  onChooseMany: (playlists: ProfilePlaylistPreview[]) => void;
  importing?: boolean;
}) {
  const { t } = useI18n();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = new Set(selectedIds);

  function togglePlaylist(playlistId: string) {
    setSelectedIds((current) =>
      current.includes(playlistId)
        ? current.filter((id) => id !== playlistId)
        : [...current, playlistId],
    );
  }

  const selectedPlaylists = profile.playlists.filter((playlist) =>
    selected.has(playlist.playlistId),
  );

  return (
    <div className="profile-playlist-picker">
      <FlowBack label="Back" onClick={onBack} />
      <div className="profile-import-head">
        <div className="profile-import-avatar">
          <span className="profile-avatar-placeholder" aria-hidden="true" />
          {profile.avatarUrl && (
            <RemoteImage
              src={profile.avatarUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          )}
        </div>
        <div className="profile-import-copy">
          <span className="modal-kicker">{t("PUBLIC PROFILE")}</span>
          <h3>{profile.title}</h3>
          <p>
            {profile.playlists.length} {t("public playlists")}
          </p>
        </div>
        {profile.playlists.length > 0 && (
          <div className="profile-selection-actions">
            <button
              type="button"
              onClick={() =>
                setSelectedIds(
                  profile.playlists.map((playlist) => playlist.playlistId),
                )
              }
            >
              {t("Select all")}
            </button>
            <button type="button" onClick={() => setSelectedIds([])}>
              {t("Clear")}
            </button>
          </div>
        )}
      </div>
      {profile.playlists.length === 0 ? (
        <div className="profile-playlist-empty">
          <span>∅</span>
          <h4>{t("No public playlists found")}</h4>
          <p>{t("Only public playlists can be imported.")}</p>
          <button className="button ghost" onClick={onRetry}>
            {t("Try again")}
          </button>
        </div>
      ) : (
        <>
          <div className="profile-playlist-grid">
            {profile.playlists.map((playlist) => {
              const checked = selected.has(playlist.playlistId);
              return (
                <button
                  key={playlist.playlistId}
                  type="button"
                  className={checked ? "selected" : ""}
                  aria-pressed={checked}
                  onClick={() => togglePlaylist(playlist.playlistId)}
                >
                  <span className="profile-playlist-art">
                    {playlist.thumbnailUrl ? (
                      <RemoteImage
                        src={playlist.thumbnailUrl}
                        alt=""
                        onLoad={(event) => {
                          const image = event.currentTarget;
                          const ratio = image.naturalHeight
                            ? image.naturalWidth / image.naturalHeight
                            : 1;
                          image.dataset.artShape =
                            Math.abs(ratio - 1) <= 0.08 ? "square" : "wide";
                        }}
                      />
                    ) : (
                      <i>♫</i>
                    )}
                    <b className="profile-playlist-check" aria-hidden="true">
                      {checked ? "✓" : "+"}
                    </b>
                  </span>
                  <span className="profile-playlist-copy">
                    <strong>{playlist.title}</strong>
                    <small>
                      {playlist.itemCount === null
                        ? t("Playlist")
                        : `${playlist.itemCount} ${t("videos")}`}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="profile-import-selection">
            <p>
              <strong>{selectedPlaylists.length}</strong>
              <span>{t("playlists selected")}</span>
            </p>
            <button
              type="button"
              className="button primary"
              disabled={selectedPlaylists.length === 0 || importing}
              onClick={() => onChooseMany(selectedPlaylists)}
            >
              {importing ? "…" : t("Import selected")}
              <span>↗</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
