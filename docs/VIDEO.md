# Reels: the editing pipeline

Phase two. Carousels are fully handled in the app; reels are still a manual edit, and this is the plan for narrowing that down to a review.

## What already exists

- Every reel post carries a **script** — hook, timed beats with on-screen text and voiceover, the footage it needs, and the caption.
- The app renders the **cover frame** at 1080 × 1920 with the words held inside the top 1440 px, so the profile grid never crops them. Download it from the post's export pack.

That already removes the two slowest parts of an edit: deciding what goes on screen, and designing the cover.

## What the pipeline adds

Drop your clips in a folder, connect that folder to a Claude session, and ask for a rough cut. With `ffmpeg` on your machine, Claude can:

| Step | What it does |
|---|---|
| **Cut** | Assemble the beats in order, trimming each clip to its beat's duration from the script. |
| **Captions** | Burn the on-screen text in Manrope, sized and placed by the same rules as the slides. |
| **Colour** | A consistent grade across clips so a reel does not look like four different cameras. |
| **Audio** | Level the voiceover, duck the music under it, and strip wind noise where it can. |
| **Cover** | Attach the cover frame this app renders. |
| **Overlays** | The handle, and the end card. |

What it cannot do: pick trending audio. That has to happen in the Instagram app, and it matters enough that the final export is worth doing there — add the track, confirm the cover, post.

## The loop

1. Shoot. Name clips after the beat if you can (`03-paddle.mp4`); it makes the assembly obvious.
2. Put them in one folder per post: `content/media/<post-id>/`.
3. Ask Claude for a rough cut against that post's script.
4. Watch it, say what is wrong ("hold the second clip longer", "captions too low"), get another pass.
5. Export, open in Instagram, add audio, post.

## Settings that matter

- **1080 × 1920, 30 fps.** Shoot vertical; cropping landscape to vertical throws away half your frame.
- **Under 30 seconds** for these formats. The scripts are written to that.
- **Captions always.** Most people watch muted.
- **The first three seconds carry the post.** If the hook is not on screen by 0.5 s, the rest does not get watched.

## Before this can run

Claude needs the folder with your clips connected to the session — the app cannot reach your disk by itself, and that is on purpose. Everything else is already here.
