---
name: soulsearch-add
description: >-
  Finds Hamza Yusuf (Sandala) and Omar Suleiman (Yaqeen) talks on Islamic
  spirituality, purification of the heart, tazkiyah, and dhikr; fetches English
  transcripts; cleans transcripts sentence-by-sentence (spelling, Arabic terms,
  paragraphs, honorifics; no sloppy global replace); writes SoulSearch lecture
  JSON and markdown; runs npm run build. Use when adding lectures to soulsearch,
  transcribing or cleaning spirituality videos, /add workflow, Sandala, Yaqeen,
  or purification of the heart content.
---

# SoulSearch: add spirituality lectures

Follow the repo’s **Claude Code command** at `.claude/commands/add.md` end-to-end. This skill is the Cursor-facing summary; the command file is canonical.

## What to use

- **Search & transcripts**: `scripts/yt.py` (requires `YOUTUBE_API_KEY` in `.env`).
  - `python3 scripts/yt.py search "<query>" <max_per_channel> [sandala|yaqeen]`
  - `python3 scripts/yt.py snippet <videoId>`
  - `python3 scripts/yt.py transcript <videoId>`
- **Python deps**: `youtube-transcript-api`, `yt-dlp` (see command doc).
- **Output**: `data/lectures.json`, `api/lectures/<slug>.json`, `data/transcripts/<videoId>.md`, then `npm run build`.

## Scholar names

- **`sandala`** → `Shaykh Hamza Yusuf`
- **`yaqeen`** → `Omar Suleiman`

## Topic focus

Prefer titles about: purification of the heart, tazkiyah, spiritual diseases, dhikr, ihsan, sincerity, adab, distraction from Allah, trials of the soul—not generic fiqh unless the video is clearly heart/spirituality themed.

## Transcript cleaning (mandatory)

Full rules live in **`.claude/commands/add.md`** under **Transcript cleaning (required)**. Always read that section before writing `data/transcripts/<videoId>.md`.

**In short:** edit **sentence by sentence**—spelling, grammar, capitalization, and paragraph breaks at natural points. **No** careless global find/replace across the file. Stay faithful to the speaker; fix ASR errors (*leu* → *lahw*, etc.); remove stutters and junk stage directions; use consistent honorifics and scholar names.

**Section headings (required):** Include **2–4 `###` headings** that divide the talk into major themes. **Each `###` must** end with a timestamp link to the video: `[M:SS](https://www.youtube.com/watch?v=VIDEO_ID&t=SECONDS)` (same pattern as askyq). Derive `seconds` from `tmp/transcript_<videoId>_ts.json` by matching the first words of the section to caption `text` entries—see `.claude/commands/add.md` → **Section headings with video timestamps**. Example file: `data/transcripts/jSxFQSvFdwU.md`.

**Quality example** (raw ASR vs cleaned):

Before:

```text
Now the word in Arabic for distraction is ilha which means to pull somebody into leu to bring them into entertainment which in the dictionary is the

pleasurable occupation of the mind
```

After:

```markdown
Now the word in Arabic for distraction is *ilhaa'*, which means to pull somebody into *lahw*—to bring them into entertainment—which in the dictionary is the "pleasurable occupation of the mind."
```

## After editing content

Always run `npm run build` so `docs/` reflects new pages.
