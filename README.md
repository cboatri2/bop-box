# Bop Box 🎵

A tiny, private music box for kids. A grown-up picks the songs; the kid can only play what's been picked.

- **Kid mode:** big album-art cards, *Surprise me!*, favorites, a dancing music buddy, sleep timer, a "wish for a song" button.
- **Grown-up corner** (PIN-locked): search Spotify, paste Spotify links (song / album / your own playlists), remove songs, read wishes, hide explicit results, cap the volume.
- **Guard:** if anything not on the list starts playing through Bop Box, it's paused immediately. Playback loops the approved list so Spotify never wanders into autoplay.

No server and no database. The approved list is a private playlist in the signed-in Spotify account
(called *"<Name>'s Bop Box ✨"*), so a grown-up can also add songs from the normal Spotify app.

## How it works

| Piece | Where |
| --- | --- |
| Sign-in | Spotify Authorization Code + PKCE, in the browser (`src/lib/spotify.ts`) |
| Playback | Spotify Web Playback SDK in the page, or any Spotify Connect speaker (`src/lib/player.ts`) |
| Song list | A private playlist in the signed-in account, marked `[bopbox]` in its description |
| Settings (name, PIN hash, theme, favorites, wishes) | `localStorage` on the device |

## Requirements

- The Spotify account used for listening needs **Premium**, and so does the developer-app owner.
- Spotify *Development Mode* apps allow up to **5 users**. Add each listener's Spotify email under
  *Dashboard → your app → User Management*.

## Run locally

```bash
echo "VITE_SPOTIFY_CLIENT_ID=<your client id>" > .env.local
npm install
npm run dev          # http://127.0.0.1:5173/
```

Redirect URIs registered in the Spotify app:

- `http://127.0.0.1:5173/` (local)
- `https://<github-user>.github.io/bop-box/` (GitHub Pages)

## Deploy

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
The Client ID comes from the repository variable `SPOTIFY_CLIENT_ID`. It's a public identifier in a PKCE app, not a secret.
