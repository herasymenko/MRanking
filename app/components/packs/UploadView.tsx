"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  PlaylistPreview,
  ProfilePlaylistPreview,
  SourceType,
  YouTubeImportResult,
  YouTubeProfilePreview,
} from "../../../lib/types";
import { mergePlaylistPreviews } from "../../domain/packImport";
import { useI18n } from "../../i18n/I18nContext";
import { api } from "../../lib/api";
import type { EditablePack } from "../../types";
import { FlowBack } from "../shared/FlowBack";
import type { MusicSource } from "./constants";
import { MusicSourceChooser } from "./MusicSourceChooser";
import { PackEditor } from "./PackEditor";
import { ProfilePlaylistPicker } from "./ProfilePlaylistPicker";

function musicSourceFor(sourceType: SourceType): MusicSource {
  if (sourceType === "spotify") {
    return "spotify";
  }
  if (sourceType === "yandexMusic") {
    return "yandex";
  }
  if (sourceType === "appleMusic") {
    return "apple";
  }
  return "youtube";
}

function endpointFor(source: MusicSource | null) {
  if (source === "spotify") {
    return "/api/spotify";
  }
  if (source === "yandex") {
    return "/api/yandex-music";
  }
  if (source === "apple") {
    return "/api/apple-music";
  }
  return "/api/youtube";
}

export function UploadView({
  editable,
  onEditable,
  onSave,
  onBack,
}: {
  editable: EditablePack | null;
  onEditable: (value: EditablePack | null) => void;
  onSave: (value: EditablePack) => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [category, setCategory] = useState<"music" | null>(
    editable ? "music" : null,
  );
  const [source, setSource] = useState<MusicSource | null>(
    editable ? musicSourceFor(editable.sourceType) : null,
  );
  const [url, setUrl] = useState(editable?.sourceUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<YouTubeProfilePreview | null>(null);
  const [addingToPack, setAddingToPack] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const isEditing = editable !== null && !addingToPack;
  const hasProfile = profile !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [addingToPack, category, hasProfile, isEditing, source]);

  async function loadMusicUrls(
    nextUrls: string[],
    options: { append?: boolean; suggestedName?: string } = {},
  ) {
    if (nextUrls.length === 0) {
      setError("Choose at least one playlist");
      return;
    }

    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    setLoading(true);
    setError("");
    setImportProgress({ current: 0, total: nextUrls.length });

    try {
      const playlists: PlaylistPreview[] = [];
      for (let index = 0; index < nextUrls.length; index += 1) {
        setImportProgress({ current: index + 1, total: nextUrls.length });
        const data = await api<YouTubeImportResult>(endpointFor(source), {
          method: "POST",
          body: JSON.stringify({ url: nextUrls[index] }),
          signal: requestController.signal,
        });
        if (!mounted.current || controller.current !== requestController) {
          return;
        }
        if (data.kind === "profile") {
          if (nextUrls.length > 1) {
            throw new Error("Choose playlists instead of profile links");
          }
          setProfile(data.profile);
          return;
        }
        playlists.push(data.playlist);
      }

      const base = options.append ? editable : null;
      onEditable(
        mergePlaylistPreviews(playlists, base, options.suggestedName ?? ""),
      );
      setProfile(null);
      setAddingToPack(false);
      setUrl("");
    } catch (nextError) {
      if (
        mounted.current &&
        controller.current === requestController &&
        (nextError as Error).name !== "AbortError"
      ) {
        setError((nextError as Error).message);
      }
    } finally {
      if (mounted.current && controller.current === requestController) {
        controller.current = null;
        setLoading(false);
        setImportProgress({ current: 0, total: 0 });
      }
    }
  }

  async function readPlaylist(event: FormEvent) {
    event.preventDefault();
    await loadMusicUrls([url], { append: addingToPack });
  }

  function importProfilePlaylists(playlists: ProfilePlaylistPreview[]) {
    void loadMusicUrls(
      playlists.map((playlist) => playlist.url),
      {
        append: addingToPack,
        suggestedName: profile?.title ?? "",
      },
    );
  }

  function closeAddFlow() {
    controller.current?.abort();
    setAddingToPack(false);
    setProfile(null);
    setUrl("");
    setError("");
  }

  const serviceTitle =
    source === "spotify"
      ? "Spotify"
      : source === "yandex"
        ? "Yandex Music"
        : source === "apple"
          ? "Apple Music"
          : "YouTube / YouTube Music";
  const serviceIcon =
    source === "spotify"
      ? "●"
      : source === "yandex"
        ? "Я"
        : source === "apple"
          ? "♪"
          : "▶";
  const servicePrompt =
    source === "youtube"
      ? "Paste playlist or profile link"
      : "Paste playlist link";
  const serviceCopy = addingToPack
    ? "Only links from the same music service can be combined."
    : source === "spotify"
      ? "Use a public Spotify playlist."
      : source === "yandex"
        ? "Use a public Yandex Music playlist."
        : source === "apple"
          ? "Use a public Apple Music playlist."
          : "Use a public playlist or profile from YouTube or YouTube Music.";
  const servicePlaceholder =
    source === "spotify"
      ? "https://open.spotify.com/playlist/..."
      : source === "yandex"
        ? "https://music.yandex.ru/users/.../playlists/..."
        : source === "apple"
          ? "https://music.apple.com/us/playlist/.../pl...."
          : "https://youtube.com/@profile or https://music.youtube.com/@profile";

  if (editable && !addingToPack) {
    return (
      <PackEditor
        value={editable}
        onChange={onEditable}
        onBack={() => {
          const editingExistingPack = Boolean(editable.id);
          onEditable(null);
          setError("");
          setUrl("");
          if (editingExistingPack) {
            setCategory(null);
            setSource(null);
            setProfile(null);
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onAddPlaylist={() => {
          setCategory("music");
          setSource(musicSourceFor(editable.sourceType));
          setAddingToPack(true);
          setProfile(null);
          setUrl("");
          setError("");
        }}
        onSave={async () => {
          setSaving(true);
          try {
            const editingExistingPack = Boolean(editable.id);
            const selected = new Set(editable.selectedVideoIds);
            const selectedItems = editable.items.filter((item) =>
              selected.has(item.videoId),
            );
            await onSave({
              ...editable,
              selectedVideoIds: selectedItems.map((item) => item.videoId),
              items: selectedItems,
            });
            if (!editingExistingPack) {
              setCategory(null);
              setSource(null);
              setUrl("");
              setProfile(null);
            }
          } catch (nextError) {
            setError((nextError as Error).message);
          } finally {
            setSaving(false);
          }
        }}
        saving={saving}
        error={error}
      />
    );
  }

  return (
    <section className={`page-wrap upload-view ${addingToPack ? "add-to-pack-view" : ""}`}>
      {!category && <FlowBack label="Back" onClick={onBack} />}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span>●</span>
            {addingToPack ? t("SAME SERVICE") : t("BUILD THE PACK")}
          </div>
          <h2>{t(addingToPack ? "Add more fuel" : "What are we ranking?")}</h2>
          <p className="page-intro">
            {t(addingToPack
              ? "Stack more playlists from the same service into this pack."
              : "Start with music today. Images, lists and more are coming next.")}
          </p>
        </div>
      </div>

      {!addingToPack && (
        <MusicSourceChooser
          category={category}
          source={source}
          onChooseCategory={() => setCategory("music")}
          onChooseSource={setSource}
          onBack={() => {
            setCategory(null);
            setSource(null);
            setUrl("");
            setProfile(null);
            setError("");
          }}
        />
      )}

      {source && !loading && !profile && (
        <form className="playlist-form" onSubmit={readPlaylist}>
          <FlowBack
            label="Back"
            onClick={() => {
              if (addingToPack) {
                closeAddFlow();
                return;
              }
              setSource(null);
              setUrl("");
              setProfile(null);
              setError("");
            }}
          />
          <div className="playlist-form-icon">{serviceIcon}</div>
          <span className="modal-kicker">{t(serviceTitle)}</span>
          <h3>{t(addingToPack ? "Drop another playlist" : servicePrompt)}</h3>
          <p>{t(serviceCopy)}</p>
          <div className="url-entry">
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={servicePlaceholder}
              autoComplete="off"
              required
            />
            <button className="button primary" type="submit">
              {t(addingToPack ? "Add to the pack" : "Pull the playlist")}
              <span>↗</span>
            </button>
          </div>
          {error && <div className="form-error">{t(error)}</div>}
        </form>
      )}

      {profile && !loading && (
        <>
          <ProfilePlaylistPicker
            key={profile.sourceUrl}
            profile={profile}
            onBack={() => {
              setProfile(null);
              setUrl("");
              setError("");
            }}
            onRetry={() =>
              void loadMusicUrls([profile.sourceUrl], {
                append: addingToPack,
              })
            }
            onChooseMany={importProfilePlaylists}
            importing={loading}
          />
          {error && (
            <div className="form-error profile-import-error">{t(error)}</div>
          )}
        </>
      )}

      {loading && (
        <div className="import-loader">
          <div className="loader-orbit">
            <span>{serviceIcon}</span>
            <i />
            <i />
            <i />
          </div>
          <div>
            <span className="modal-kicker">{t("IMPORTING")}</span>
            <h3>{t("Building your pack")}</h3>
            <p>
              {importProgress.total > 1
                ? `${t("Playlist")} ${importProgress.current}/${importProgress.total}`
                : t("Looking for a playlist or public profile.")}
            </p>
            <div className="loading-bar">
              <i />
            </div>
            <FlowBack
              label="Back"
              onClick={() => {
                controller.current?.abort();
                setUrl("");
                setError("");
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
