---
name: media-literacy
topics: [website, image, picture, video, audio, media, transcript, captions, vision]
---

# Media literacy

## Websites

1. Search → open 1–2 primary pages with `read_url` (not titles alone).
2. Separate: claims, evidence, author/date, conflicts of interest.
3. Prefer official docs, primary reporting, peer-reviewed summaries over affiliate SEO.
4. Login walls and soft-404 marketing pages are non-evidence — skip.

## Pictures / images

1. `read_image` on URL or allowed local path.
2. Report what is visible (objects, text in frame, chart axes) separately from interpretation.
3. Label uncertainty: “appears to”, “text in image reads…”.
4. Do not invent faces, numbers, or logos that vision did not return.

## Video

1. YouTube: `youtube_summarize` (captions only; never download the file).
2. Local file under allowlisted media root: `local_video_summarize`.
3. If no captions/transcript: ask the user to paste one; do not fabricate dialogue.
4. Structure notes: thesis → key segments with timestamps if available → caveats.

## Audio

1. Same path as local video when the pipeline can extract audio (ffmpeg + whisper if installed).
2. Without a transcript tool result, refuse to invent quotes.
3. Summarize speech content; mark music/noise as non-content unless relevant.

## Cross-media discipline

- Quote only from tool observations.
- One medium does not prove another (thumbnail ≠ video claim).
- When modalities conflict, report the conflict; do not silently pick one.
