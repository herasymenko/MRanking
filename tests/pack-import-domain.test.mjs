import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
};
const packSource = await readFile(
  new URL("../app/domain/pack.ts", import.meta.url),
  "utf8",
);
const packJavascript = ts.transpileModule(packSource, { compilerOptions }).outputText;
const packUrl = `data:text/javascript;base64,${Buffer.from(packJavascript).toString("base64")}`;
const importSource = await readFile(
  new URL("../app/domain/packImport.ts", import.meta.url),
  "utf8",
);
const importJavascript = ts
  .transpileModule(importSource, { compilerOptions })
  .outputText.replaceAll("./pack", packUrl);
const packImport = await import(
  `data:text/javascript;base64,${Buffer.from(importJavascript).toString("base64")}`
);

function item(id, title = `Track ${id}`) {
  return {
    title,
    channel: "Artist",
    videoId: id,
    thumbnailUrl: `https://example.com/${id}.jpg`,
    youtubeUrl: `https://example.com/${id}`,
    duration: "3:00",
  };
}

function playlist(sourceType, sourceUrl, ids, options = {}) {
  return {
    title: options.title ?? "Playlist",
    sourceType,
    sourceUrl,
    cover: "https://example.com/cover.jpg",
    skipped: options.skipped ?? 0,
    duplicates: options.duplicates ?? 0,
    issues: options.issues ?? [],
    items: ids.map((id) => item(id)),
  };
}

test("combines same-service playlists and removes cross-playlist duplicates", () => {
  const result = packImport.mergePlaylistPreviews(
    [
      playlist("spotify", "https://open.spotify.com/playlist/one", ["1", "2"]),
      playlist(
        "spotify",
        "https://open.spotify.com/playlist/two",
        ["2", "3"],
        { duplicates: 1 },
      ),
    ],
    null,
    "Profile Mix",
  );

  assert.equal(result.name, "Profile Mix");
  assert.deepEqual(result.items.map((entry) => entry.videoId), ["1", "2", "3"]);
  assert.deepEqual(result.selectedVideoIds, ["1", "2", "3"]);
  assert.equal(result.duplicates, 2);
  assert.equal(
    result.sourceUrl,
    "https://open.spotify.com/playlist/one",
  );
});

test("appends without changing an edited pack name or previous selection", () => {
  const base = {
    name: "My edited pack",
    sourceType: "youtubeMusic",
    sourceUrl: "https://music.youtube.com/playlist?list=one",
    coverType: "thumbnail",
    coverValue: "https://example.com/old-cover.jpg",
    visibility: "private",
    skipped: 0,
    duplicates: 0,
    issues: [],
    selectedVideoIds: ["1"],
    items: [item("1"), item("2")],
  };
  const result = packImport.mergePlaylistPreviews(
    [playlist("youtube", "https://youtube.com/playlist?list=two", ["2", "3"])],
    base,
  );

  assert.equal(result.name, "My edited pack");
  assert.deepEqual(result.selectedVideoIds, ["1", "3"]);
  assert.equal(result.duplicates, 1);
  assert.equal(result.items.length, 3);
});

test("rejects playlists from a different music service", () => {
  assert.throws(
    () =>
      packImport.mergePlaylistPreviews([
        playlist("spotify", "https://open.spotify.com/playlist/one", ["1"]),
        playlist("appleMusic", "https://music.apple.com/us/playlist/x/pl.x", ["2"]),
      ]),
    /same music service/,
  );
});
