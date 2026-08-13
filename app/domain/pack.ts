import type { Pack, PackItem, SourceType } from "../../lib/types";
import type { EditablePack } from "../types";

export function packToEditable(pack: Pack): EditablePack {
  return {
    id: pack.id,
    name: pack.name,
    sourceType: pack.sourceType,
    sourceUrl: pack.sourceUrl,
    coverType: pack.coverType,
    coverValue: pack.coverValue,
    visibility: pack.visibility,
    skipped: 0,
    duplicates: 0,
    issues: [],
    selectedVideoIds: pack.items.map((item) => item.videoId),
    items: pack.items.map(
      ({ title, channel, videoId, thumbnailUrl, youtubeUrl, duration }) => ({
        title,
        channel,
        videoId,
        thumbnailUrl,
        youtubeUrl,
        duration,
      }),
    ),
  };
}

export function pickRandomVideoIds(
  items: EditablePack["items"],
  count: number,
) {
  const shuffled = items.map((item) => item.videoId);
  const randomBuffer = new Uint32Array(1);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    crypto.getRandomValues(randomBuffer);
    const swapIndex = randomBuffer[0] % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled.slice(0, count);
}

export function isYouTubeSource(sourceType: SourceType) {
  return sourceType === "youtube" || sourceType === "youtubeMusic";
}

export function sourceName(sourceType: SourceType) {
  if (sourceType === "youtubeMusic") {
    return "YouTube Music";
  }
  if (sourceType === "spotify") {
    return "Spotify";
  }
  if (sourceType === "yandexMusic") {
    return "Yandex Music";
  }
  if (sourceType === "appleMusic") {
    return "Apple Music";
  }
  return "YouTube";
}

export function sourceFamily(sourceType: SourceType) {
  return isYouTubeSource(sourceType) ? "youtube" : sourceType;
}

export function mediaEmbedUrl(
  sourceType: SourceType,
  item: PackItem,
  startSeconds = 0,
) {
  if (sourceType === "spotify") {
    return `https://open.spotify.com/embed/track/${encodeURIComponent(item.videoId)}?utm_source=generator`;
  }
  if (sourceType === "yandexMusic") {
    return `https://music.yandex.ru/iframe/track/${encodeURIComponent(item.videoId)}`;
  }
  if (sourceType === "appleMusic") {
    try {
      const url = new URL(item.youtubeUrl);
      if (url.hostname === "music.apple.com") {
        url.hostname = "embed.music.apple.com";
      }
      return url.hostname === "embed.music.apple.com"
        ? url.toString()
        : "https://embed.music.apple.com/";
    } catch {
      return "https://embed.music.apple.com/";
    }
  }
  const start = Math.max(0, Math.floor(startSeconds));
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}?autoplay=1&rel=0${start ? `&start=${start}` : ""}`;
}

export function exportPack(pack: Pack): void {
  const blob = new Blob([JSON.stringify(pack, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${pack.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "mranking-pack"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
