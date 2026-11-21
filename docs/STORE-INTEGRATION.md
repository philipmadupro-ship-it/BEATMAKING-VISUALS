# U2C Studio × U2C Beatstore: integration plan

Status: **plan**. Nothing in the store repo is changed yet. This was read from `philipmadupro-ship-it/uche-beatstore-g-a` (main, Nov 2026).

## What the store has today

| Piece | What it is | Why it matters for the studio |
|---|---|---|
| Next.js 16 app (App Router), Vercel | Producer dashboard `(dashboard)/…` + public storefront `store/…` | The studio can live as a dashboard page: same origin, same login |
| Supabase Auth + Postgres + RLS | `requireProducer()` gates every producer route; buyers share the same auth | The studio's upload route must use `requireProducer`, not "logged in" |
| `public.tracks` | `id, user_id, title, type, audio_url, cover_url, bpm, key, scale, duration_seconds, …` | Everything the studio asks for on boot (beat, cover, title, BPM, key) is already on the row |
| `/api/audio?src=…` | Producer-only, same-origin audio proxy with Range support | The studio can decode the master through it (no CORS, no public master URL) |
| `/api/upload/{init,part,complete,abort,status}` | R2 multipart upload sessions; **audio extensions only** (`ALLOWED_EXT`) | The MP4 upload needs a video variant of this (or a presigned single PUT) |
| `/api/upload/image` | Producer-only image upload to the public bucket (MIME + byte-signature checks), then the client PATCHes `cover_url` | Covers chosen in the studio's Media bin can go through this unchanged |
| `/api/tracks/[id]` GET / PATCH | Owner-gated track read / update | Load a track into the studio; write the video URL back |
| Store editor `video` sections | `content-sections.ts` already renders `videoUrl` sections on the storefront | A finished visualizer can be shown on the storefront with no new UI |

## Target flow (one click from the library)

1. **Library → "Make video"** on a track opens `/(dashboard)/visualizer/[trackId]`, a page that hosts U2C Studio (the static `web-app/` folder, copied to `public/u2c-studio/` by a sync script, loaded in an iframe or mounted directly).
2. The page passes `{ trackId, title, bpm, key, coverUrl, audioSrc: '/api/audio?src=…' }` to the studio (`postMessage`, or a `?track=` query the studio fetches from `/api/tracks/[id]`). The studio skips its own upload screen, analyses the beat, and puts the track cover in **Media → slot 0**.
3. The producer edits everything (cue sheet, every word through **Review**, covers 1-4, video layer). The sheet autosaves per track (key = track id), so opening the same track again resumes the edit.
4. **Review → Export** renders the MP4 in the browser (same frames as the native renderer). Then **Upload to store** sends it to R2 and writes the row.
5. The storefront track page (and a store-editor `video` section) plays the visualizer.

## Store changes needed (next step, in the store repo)

1. **Migration** `202_track_visualizers.sql`:
   ```sql
   create table public.track_visualizers (
     id uuid primary key default gen_random_uuid(),
     track_id uuid not null references public.tracks(id) on delete cascade,
     user_id uuid not null references auth.users(id) on delete cascade,
     aspect text not null check (aspect in ('9:16','16:9')),
     length_s numeric not null, stage text, look text,
     video_url text not null, poster_url text,
     cue_sheet jsonb,                     -- the exact edit, so it can be re-rendered later
     created_at timestamptz not null default now()
   );
   alter table public.track_visualizers enable row level security;
   create policy "owner rw" on public.track_visualizers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   create policy "public read published" on public.track_visualizers for select using (true);  -- or join on the track's published flag
   ```
   (Follow `supabase/MIGRATIONS.md` for numbering; the last applied number was 201.)
2. **Upload route** `/api/tracks/[id]/visualizer`:
   - `POST {aspect, length_s, stage, look, size}` → `requireProducer` + `requireRowOwnership('tracks', id)`, then a presigned R2 PUT (or a multipart session reusing `lib/storage/multipart.ts` with a `video/mp4` content type and its own size cap, about 300 MB);
   - `PUT …/complete {key, poster, cue_sheet}` → inserts the `track_visualizers` row;
   - check the MP4 signature (`ftyp`) like `image-validation.ts` checks images.
3. **Dashboard page** `(dashboard)/visualizer/[trackId]/page.tsx`, plus a "Make video" action on `TrackCard` / the library row.
4. **Storefront**: the track detail page shows the 9:16 video (muted autoplay loop, poster = frame 0, which is the cover) when a row exists.

## Studio changes needed (this repo, small)

- `?track=<id>&api=<origin>` boot mode: fetch the track, load the audio through `/api/audio`, put `cover_url` in Media slot 0, set the title / BPM / key tags.
- An **Upload to store** button in Review (enabled only in store mode) that streams the export blob to the presigned URL and calls `complete`.
- A `tools/sync_store.mjs` that copies `web-app/` into the store's `public/u2c-studio/` (licensed fonts excluded; they load from the store's own font folder).

## Security notes (store rules apply)

- Producer-only, never "authenticated": buyers share Supabase auth (see the `/api/audio` comment in the store).
- Never expose master `r2://` keys to the browser outside `/api/audio`.
- The exported MP4 contains the full section audio: upload it to the **public** bucket only if that section is meant to be public (a preview). Otherwise keep it private and serve it signed.
- No secrets in the studio: it only talks to same-origin store routes.

## Order of work

1. Store: migration + upload route + tests (vitest, like `src/app/api/upload/*`).
2. Studio: `?track=` boot mode + Upload button (behind store mode).
3. Store: dashboard page + "Make video" action + storefront player.
4. Optional: render on a server with the native renderer (`tools/u2c.py batch`) for full-length HQ versions, triggered from the same page.

Pushing to the store repo needs push access for this session (it is attached read-only now).
