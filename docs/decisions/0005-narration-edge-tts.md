# 0005 — Pre-generated narration with edge-tts

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decided by:** user (high-quality AI voice, fully free) + planner (edge-tts)

## Context
Browser speech synthesis sounds robotic and Vietnamese voices vary by device. Paid TTS is not allowed.

## Decision
- Generate MP3 narration ahead of time with the Python package `edge-tts` (Microsoft Edge neural voices): Vietnamese `vi-VN-HoaiMyNeural`, English `en-US-GuyNeural`, rate `-5%`.
- Files: `public/audio/<lang>/<species>.<section>.mp3`; regeneration skips unchanged text (hash cache).
- Narration is generated only after the species content passed `docs/rubrics/content.md`.
- Playback starts on the user's click (autoplay rules), can be muted, mute persists.

## Consequences
`edge-tts` is an unofficial service; generated files remain usable if it disappears. Text changes require regenerating audio in the same PR.
