---
name: read-media
description: Read and interpret websites, images, videos, and audio with the correct tool. Use when the user shares a URL, image, YouTube link, or local media path.
hooks: [on_user_message, on_plan]
tools: [read_url, web_search, read_image, youtube_summarize, local_video_summarize, consult_knowledge]
phase: gather
priority: 12
---

# Read media

1. `consult_knowledge` query `media-literacy`.
2. Pick the tool by modality:
   - Web page → `read_url` (after search if needed)
   - Image URL/path → `read_image`
   - YouTube → `youtube_summarize`
   - Local video/audio under allowlisted root → `local_video_summarize`
3. Separate **description** (what the tool returned) from **interpretation**.
4. If captions/vision/transcript missing, say so; do not invent dialogue or OCR text.
5. Done when the user can act on a grounded digest with citations or tool residuals.
