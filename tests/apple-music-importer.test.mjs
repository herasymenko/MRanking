import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/apple-music.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const appleMusic = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

const playlistUrl =
  "https://music.apple.com/us/playlist/test-list/pl.u-test123?l=en-US";

function script(id, value, quoted = true) {
  const attribute = quoted ? `id="${id}"` : `id=${id}`;
  return `<script type="application/json" ${attribute}>${JSON.stringify(value)}</script>`;
}

function serializedPlaylist() {
  const artwork = (name) => ({
    dictionary: {
      url: `https://is1-ssl.mzstatic.com/image/${name}/{w}x{h}bb.{f}`,
    },
  });
  const track = (id, title, artist, options = {}) => ({
    title,
    artistName: artist,
    duration: 185_000,
    isDisabled: options.disabled ?? false,
    contentDescriptor: {
      kind: "song",
      identifiers: { storeAdamID: id },
      url: options.url ?? `https://music.apple.com/us/song/${title}/${id}`,
    },
    artwork: artwork(`track-${id}`),
  });
  return {
    data: [
      {
        data: {
          canonicalURL:
            "https://music.apple.com/us/playlist/test-list/pl.u-test123",
          sections: [
            {
              itemKind: "containerDetailHeaderLockup",
              items: [
                {
                  title: "Test List",
                  trackCount: 4,
                  artwork: artwork("playlist"),
                  contentDescriptor: {
                    kind: "playlist",
                    url: "https://music.apple.com/us/playlist/test-list/pl.u-test123",
                  },
                },
              ],
            },
            {
              itemKind: "trackLockup",
              items: [
                track("101", "First", "Artist One"),
                track("101", "First duplicate", "Artist One", {
                  url: "https://music.apple.com/us/album/first/900?i=101",
                }),
                track("202", "Unavailable", "Artist Two", { disabled: true }),
                track("303", "Last", "Artist Three"),
              ],
            },
          ],
        },
      },
    ],
  };
}

test("parses Apple's serialized playlist data and accounts for duplicates", () => {
  const serialized = serializedPlaylist();
  serialized.data.unshift({ data: { sections: [{ itemKind: "consent" }] } });
  const html = script("serialized-server-data", serialized, false);
  const result = appleMusic.parseAppleMusicDocument(html, playlistUrl);

  assert.equal(result.title, "Test List");
  assert.equal(result.sourceType, "appleMusic");
  assert.equal(
    result.sourceUrl,
    "https://music.apple.com/us/playlist/test-list/pl.u-test123",
  );
  assert.equal(result.cover, "https://is1-ssl.mzstatic.com/image/playlist/600x600bb.jpg");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].channel, "Artist One");
  assert.equal(result.items[0].duration, "3:05");
  assert.equal(result.items[0].videoId, "101");
  assert.equal(result.duplicates, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(
    result.issues.map((issue) => issue.reason),
    ["duplicate", "skipped"],
  );
});

test("falls back to Apple Music JSON-LD when serialized data is unavailable", () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "MusicPlaylist",
    name: "Schema List",
    numTracks: 2,
    url: "https://music.apple.com/gb/playlist/schema/pl.schema123",
    track: [
      {
        "@type": "MusicRecording",
        name: "Schema One",
        url: "https://music.apple.com/gb/song/schema-one/401",
        duration: "PT4M2S",
        audio: { thumbnailUrl: "https://example.com/401.jpg" },
      },
      {
        "@type": "MusicRecording",
        name: "Schema Two",
        url: "https://music.apple.com/gb/album/schema-two/800?i=402",
        duration: "PT59S",
        audio: { thumbnailUrl: "https://example.com/402.jpg" },
      },
    ],
  };
  const result = appleMusic.parseAppleMusicDocument(
    script("schema:music-playlist", schema),
    schema.url,
  );

  assert.equal(result.title, "Schema List");
  assert.deepEqual(
    result.items.map((item) => [item.videoId, item.duration]),
    [
      ["401", "4:02"],
      ["402", "0:59"],
    ],
  );
});

test("rejects non-playlist links and unreadable Apple data", async () => {
  await assert.rejects(
    appleMusic.parseAppleMusicPlaylist("https://example.com/playlist/pl.test"),
    /Only Apple Music links/,
  );
  await assert.rejects(
    appleMusic.parseAppleMusicPlaylist("https://music.apple.com/us/album/test/123"),
    /does not contain an Apple Music playlist/,
  );
  assert.throws(
    () =>
      appleMusic.parseAppleMusicDocument(
        '<script id="serialized-server-data">{broken}</script>',
        playlistUrl,
      ),
    /unreadable playlist/,
  );
});
