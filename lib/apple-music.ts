import type { JsonObject, JsonValue } from "./json-value";
import type { PlaylistPreview } from "./types";

const APPLE_MUSIC_HOST = "music.apple.com";
const MAX_PAGE_SIZE = 12 * 1024 * 1024;
const APPLE_PAGE_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
};

type ScriptJson = {
  present: boolean;
  unreadable: boolean;
  value: JsonValue;
};

export async function parseAppleMusicPlaylist(
  input: string,
  signal?: AbortSignal,
): Promise<PlaylistPreview> {
  const submitted = parseUrl(input);
  if (!playlistId(submitted)) {
    throw new Error("This link does not contain an Apple Music playlist");
  }

  const { response, finalUrl } = await fetchAppleMusicPage(submitted, signal);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("The Apple Music playlist was not found");
    }
    throw new Error("Apple Music did not return this playlist");
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_PAGE_SIZE) {
    throw new Error("Apple Music did not return this playlist");
  }
  const html = await response.text();
  if (html.length > MAX_PAGE_SIZE) {
    throw new Error("Apple Music did not return this playlist");
  }
  return parseAppleMusicDocument(html, finalUrl.toString());
}

export function parseAppleMusicDocument(
  html: string,
  sourceUrl: string,
): PlaylistPreview {
  const serialized = readScriptJson(html, "serialized-server-data");
  const schema = readScriptJson(html, "schema:music-playlist");
  if (!serialized.present && !schema.present) {
    throw new Error("Apple Music did not return playlist tracks");
  }
  if (
    (serialized.present || schema.present) &&
    !isObject(serialized.value) &&
    !isObject(schema.value)
  ) {
    throw new Error("Apple Music returned an unreadable playlist");
  }

  const page = applePage(serialized.value);
  const sections = Array.isArray(page.sections)
    ? page.sections.filter(isObject)
    : [];
  const headerSection = sections.find(
    (section) => stringValue(section.itemKind) === "containerDetailHeaderLockup",
  );
  const header = firstObject(headerSection?.items);
  const trackSection = sections.find(
    (section) => stringValue(section.itemKind) === "trackLockup",
  );
  const serializedTracks = Array.isArray(trackSection?.items)
    ? trackSection.items.filter(isObject)
    : [];
  const schemaPlaylist = isMusicPlaylist(schema.value) ? schema.value : {};
  const schemaTracks = Array.isArray(schemaPlaylist.track)
    ? schemaPlaylist.track.filter(isObject)
    : [];
  const rawTracks = serializedTracks.length ? serializedTracks : schemaTracks;

  const seen = new Set<string>();
  const items: PlaylistPreview["items"] = [];
  const issues: PlaylistPreview["issues"] = [];
  let skipped = 0;
  let duplicates = 0;

  for (const track of rawTracks) {
    const fromSerialized = serializedTracks.length > 0;
    const descriptor = fromSerialized
      ? objectValue(track.contentDescriptor)
      : {};
    const externalUrl =
      stringValue(descriptor.url) ||
      stringValue(track.url) ||
      stringValue(objectValue(objectValue(track.audio).potentialAction).target);
    const id =
      stringish(objectValue(descriptor.identifiers).storeAdamID) ||
      trackId(externalUrl);
    const title = stringValue(track.title) || stringValue(track.name);
    const channel =
      stringValue(track.artistName) ||
      linkTitles(track.subtitleLinks) ||
      artistName(track.byArtist) ||
      "Apple Music";
    const unavailable = fromSerialized && track.isDisabled === true;

    if (!id || !title || !externalUrl || unavailable) {
      skipped += 1;
      issues.push({
        title: title || "Unavailable track",
        channel,
        reason: "skipped",
        count: 1,
      });
      continue;
    }
    if (seen.has(id)) {
      duplicates += 1;
      issues.push({
        title,
        channel,
        reason: "duplicate",
        count: 1,
      });
      continue;
    }
    seen.add(id);

    const schemaAudio = objectValue(track.audio);
    items.push({
      title,
      channel,
      videoId: id,
      thumbnailUrl:
        artworkUrl(track.artwork) ||
        stringValue(schemaAudio.thumbnailUrl) ||
        "https://music.apple.com/favicon.ico",
      youtubeUrl: externalUrl,
      duration: fromSerialized
        ? formatMilliseconds(numberValue(track.duration))
        : formatIsoDuration(
            stringValue(track.duration) || stringValue(schemaAudio.duration),
          ),
    });
  }

  const declared =
    numberValue(header.trackCount) ||
    numberValue(schemaPlaylist.numTracks) ||
    numberValue(trackSection?.totalCount);
  const accountedFor = items.length + skipped + duplicates;
  if (declared > accountedFor) {
    const hiddenCount = declared - accountedFor;
    skipped += hiddenCount;
    issues.push({
      title: "Unavailable tracks",
      channel: "Apple Music",
      reason: "skipped",
      count: hiddenCount,
    });
  }
  if (items.length === 0) {
    throw new Error(
      "The Apple Music playlist is private, unavailable or contains no playable tracks",
    );
  }

  const canonicalUrl =
    stringValue(objectValue(header.contentDescriptor).url) ||
    stringValue(page.canonicalURL) ||
    stringValue(schemaPlaylist.url) ||
    sourceUrl;
  const cover = artworkUrl(header.artwork) || items[0].thumbnailUrl;

  return {
    title:
      stringValue(header.title) ||
      stringValue(schemaPlaylist.name) ||
      "Apple Music playlist",
    sourceUrl: normalizeSourceUrl(canonicalUrl, sourceUrl),
    sourceType: "appleMusic",
    cover,
    skipped,
    duplicates,
    issues,
    items,
  };
}

function parseUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Paste a valid Apple Music playlist URL");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== APPLE_MUSIC_HOST) {
    throw new Error("Only Apple Music links are supported here");
  }
  return url;
}

async function fetchAppleMusicPage(url: URL, signal?: AbortSignal) {
  let current = url;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const response = await fetch(current, {
      signal,
      redirect: "manual",
      headers: APPLE_PAGE_HEADERS,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current };
    }
    const location = response.headers.get("location");
    const next = location ? appleMusicUrl(new URL(location, current).toString()) : null;
    if (!next || !playlistId(next)) {
      throw new Error("Apple Music did not return this playlist");
    }
    current = next;
  }
  throw new Error("Apple Music did not return this playlist");
}

function appleMusicUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname.toLowerCase() === APPLE_MUSIC_HOST
      ? url
      : null;
  } catch {
    return null;
  }
}

function playlistId(url: URL) {
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map(safeDecodeURIComponent);
  const playlistIndex = parts.indexOf("playlist");
  if (playlistIndex < 0) {
    return "";
  }
  const id = parts.find((part, index) => index > playlistIndex && part.startsWith("pl."));
  return id && /^pl\.[a-zA-Z0-9._-]{3,200}$/.test(id) ? id : "";
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readScriptJson(html: string, id: string): ScriptJson {
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html))) {
    const attributeId = scriptId(match[1]);
    if (attributeId !== id) {
      continue;
    }
    try {
      return { present: true, unreadable: false, value: JSON.parse(match[2]) };
    } catch {
      return { present: true, unreadable: true, value: null };
    }
  }
  return { present: false, unreadable: false, value: null };
}

function scriptId(attributes: string) {
  const match = attributes.match(
    /\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i,
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function applePage(value: JsonValue) {
  if (!isObject(value) || !Array.isArray(value.data)) {
    return {};
  }
  const entries = value.data.filter(isObject);
  const entry =
    entries.find((candidate) => {
      const data = objectValue(candidate.data);
      return (
        Array.isArray(data.sections) &&
        data.sections
          .filter(isObject)
          .some(
            (section) => stringValue(section.itemKind) === "trackLockup",
          )
      );
    }) ?? entries[0];
  return objectValue(entry?.data);
}

function isMusicPlaylist(value: JsonValue): value is JsonObject {
  return isObject(value) && stringValue(value["@type"]) === "MusicPlaylist";
}

function firstObject(value: JsonValue | undefined) {
  return Array.isArray(value) ? value.find(isObject) ?? {} : {};
}

function objectValue(value: JsonValue | undefined): JsonObject {
  return isObject(value) ? value : {};
}

function artworkUrl(value: JsonValue | undefined) {
  const artwork = objectValue(value);
  const dictionary = objectValue(artwork.dictionary);
  return stringValue(dictionary.url)
    .replaceAll("{w}", "600")
    .replaceAll("{h}", "600")
    .replaceAll("{f}", "jpg");
}

function linkTitles(value: JsonValue | undefined) {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .filter(isObject)
    .map((link) => stringValue(link.title))
    .filter(Boolean)
    .join(", ");
}

function artistName(value: JsonValue | undefined) {
  if (Array.isArray(value)) {
    return value
      .filter(isObject)
      .map((artist) => stringValue(artist.name))
      .filter(Boolean)
      .join(", ");
  }
  return stringValue(objectValue(value).name);
}

function trackId(value: string) {
  try {
    const url = new URL(value);
    const queryId = url.searchParams.get("i") ?? "";
    if (/^[a-zA-Z0-9]+$/.test(queryId)) {
      return queryId;
    }
    const tail = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return /^[a-zA-Z0-9]+$/.test(tail) ? tail : "";
  } catch {
    return "";
  }
}

function formatMilliseconds(milliseconds: number) {
  if (!milliseconds) {
    return null;
  }
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatIsoDuration(value: string) {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) {
    return null;
  }
  const seconds =
    Number(match[1] || 0) * 3_600 +
    Number(match[2] || 0) * 60 +
    Math.round(Number(match[3] || 0));
  return seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : null;
}

function normalizeSourceUrl(value: string, fallback: string) {
  const url = appleMusicUrl(value) ?? appleMusicUrl(fallback);
  if (!url) {
    return fallback;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" ? value : "";
}

function stringish(value: JsonValue | undefined) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function numberValue(value: JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
