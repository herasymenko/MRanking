import type { PlaylistPreview, PlaylistImportIssue } from "../../lib/types";
import type { EditablePack } from "../types";
import { sourceFamily } from "./pack";

export function mergePlaylistPreviews(
  playlists: PlaylistPreview[],
  base: EditablePack | null = null,
  suggestedName = "",
): EditablePack {
  if (playlists.length === 0) {
    throw new Error("Choose at least one playlist");
  }

  const sourceType = base?.sourceType ?? playlists[0].sourceType;
  if (
    playlists.some(
      (playlist) => sourceFamily(playlist.sourceType) !== sourceFamily(sourceType),
    )
  ) {
    throw new Error("Only playlists from the same music service can be combined");
  }

  const items = base ? [...base.items] : [];
  const selectedVideoIds = new Set(base?.selectedVideoIds ?? []);
  const seen = new Set(items.map((item) => item.videoId));
  const issues: PlaylistImportIssue[] = base ? [...base.issues] : [];
  let skipped = base?.skipped ?? 0;
  let duplicates = base?.duplicates ?? 0;

  for (const playlist of playlists) {
    skipped += playlist.skipped;
    duplicates += playlist.duplicates;
    issues.push(...(playlist.issues ?? []));

    for (const item of playlist.items) {
      if (seen.has(item.videoId)) {
        duplicates += 1;
        issues.push({
          title: item.title,
          channel: item.channel,
          reason: "duplicate",
          count: 1,
        });
        continue;
      }
      seen.add(item.videoId);
      items.push(item);
      selectedVideoIds.add(item.videoId);
    }
  }

  const first = playlists[0];
  const combinedName =
    playlists.length > 1
      ? suggestedName.trim() || `${first.title} + ${playlists.length - 1}`
      : first.title;

  return {
    ...(base?.id ? { id: base.id } : {}),
    name: base?.name ?? combinedName,
    sourceType,
    sourceUrl: base?.sourceUrl ?? first.sourceUrl,
    coverType: base?.coverType ?? "thumbnail",
    coverValue: base?.coverValue ?? first.cover,
    visibility: base?.visibility ?? "private",
    skipped,
    duplicates,
    issues,
    selectedVideoIds: [...selectedVideoIds],
    items,
  };
}
