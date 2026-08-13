# MRanking

A ranking app that turns playlists and collections into private tournaments, tier lists and other comparison modes.

## Start

From PowerShell in this folder:

```powershell
.\start-local.ps1
```

Open [http://localhost:3000](http://localhost:3000). The first launch can take a few seconds while the local database starts.

Create an account from the sign-in window using any available nickname and a password of at least 6 characters. Registration signs you in immediately. Passwords are stored as PBKDF2 hashes, never as plain text.

## Current flow

1. Create an account or sign in.
2. Open **Upload pack** and choose YouTube, YouTube Music, Spotify, Yandex Music or Apple Music.
3. Paste a public playlist link. YouTube profiles support selecting and combining multiple playlists.
4. Review the imported tracks, add more playlists from the same service if needed, edit the pack name or cover, and select the items that should stay.
5. Save a private pack and start **King of the Hill**.

At least 16 playable items are required. Duplicate, private, deleted and unavailable entries are skipped during import. Imported packs, in-progress games and final results persist in local SQLite storage.

Tier List, Blind Ranking and the other rating formats are visual placeholders for later development.

## Sites deployment

The project already uses the Sites-compatible Vinext layout. The build emits the worker bundle, D1 migrations and [`.openai/hosting.json`](.openai/hosting.json) with the `DB` and `AVATARS` bindings.

Run `npm test` before publishing. The generated `/dist` directory and local Wrangler state are intentionally ignored by Git.
