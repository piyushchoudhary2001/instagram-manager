# Reels: cutting from the script

The script in a post — timed beats, the words on screen, the voiceover — is also an edit list. `npm run reel` turns it into a cut.

```bash
npm run reel -- 2026-10-22-kayaking-beginner-mistakes
```

Needs `ffmpeg` on your machine: `brew install ffmpeg` on macOS, `sudo apt install ffmpeg` on Ubuntu.

## Where the clips go

```
content/media/<post-id>/
  01-river.mp4        → beat 1
  02-briefing.mp4     → beat 2
  05-drybag.jpg       → beat 5 (stills get a slow push so they don't read as a freeze)
  music.mp3           → the bed
  voiceover.wav       → your narration over the whole thing
  vo-03.wav           → or one file per beat, if you record them separately
```

A file that starts with a beat number is pinned to that beat. Everything else fills the remaining beats in order, so you can also just drop six clips in and let it assign them. A beat can also name its clip explicitly with `"clip": "sunset.mp4"` in the post JSON.

Nothing for a beat? It gets a near-black card with the words on it, so the cut still plays and the gap is obvious. A clip shorter than its beat loops rather than freezing.

## What it does

| | |
|---|---|
| **Cuts** | Each beat trimmed to its time from the script. |
| **Frames** | Scaled and centre-cropped to 1080 × 1920, 30 fps, whatever the source was. |
| **Grades** | A consistent pass across every clip so a reel doesn't look like four cameras. `--grade warm` (default), `neutral`, or `none`. |
| **Captions** | The on-screen text burned in, in Manrope ExtraBold, auto-fitted and stacked as boxed lines. The hook sits mid-frame; the rest in the lower third, above Instagram's own buttons. `--no-captions` to skip. |
| **Audio** | Voiceover levelled, music ducked under it, the whole thing normalised to −14 LUFS, 48 kHz stereo. No audio at all gets a silent track, because a reel with no audio stream can be rejected. |
| **Cover** | The cover frame this app designs, rendered to `cover.jpg` at 1080 × 1920. |

Output lands in `exports/<post-id>/`: `reel.mp4`, `cover.jpg`, `captions.srt`.

## Options

```bash
npm run reel -- <post-id> --plan                 # show the mapping, build nothing
npm run reel -- <post-id> --grade none           # skip the colour pass
npm run reel -- <post-id> --no-captions          # no burned-in text
npm run reel -- <post-id> --clips ~/Desktop/kayak --music ~/Desktop/track.mp3
npm run reel -- <post-id> --keep-work            # leave the per-beat files for inspection
```

The post's **Script** tab shows the same mapping in the app, and plays the cut once it exists.

## The loop

1. Shoot vertical. Cropping landscape to 9:16 throws away half the frame.
2. Name clips after their beat where you can.
3. `npm run reel -- <post-id>`, watch it.
4. Say what is wrong — "hold the second clip longer", "captions too low" — and Claude edits the script or the settings; re-run.
5. Open Instagram, add a trending track, post.

That last step stays manual on purpose: trending audio cannot be attached through the API, and on a new account the track is doing real work for reach. Publishing a reel from the app is possible (see `docs/INSTAGRAM.md`) but it keeps whatever audio is in the file.

## Settings that matter

- **Under 30 seconds.** The scripts are written to that.
- **Captions always** — most people watch muted.
- **The first three seconds carry the post.** The hook is on screen from frame one.
