# SoulSearch

Static site of **Islamic spirituality lectures** with **YouTube-embedded transcripts**, the same architecture as [askyq](https://github.com/abidlabs/askyq) (search, categories, article pages, synced audio dock) and a **reddish** visual theme.

## Develop

```bash
npm install
npm run build
npm run dev
```

Open the local URL printed by `sirv` (usually `http://localhost:3000`). The built site is written to `docs/` (GitHub Pages–friendly).

## Content

- `data/lectures.json` — short list for the homepage and search (include `tags` for good search).
- `api/lectures/<id>.json` — full record (`stanceSummary`, `transcriptFile`, etc.).
- `data/transcripts/<videoId>.md` — markdown transcript (2–4 `###` section headings with YouTube timestamp links; see `.claude/commands/add.md`); referenced by `transcriptFile` in the API JSON.

Set `SITE_URL` when building for production metadata:

```bash
SITE_URL=https://your.domain npm run build
```

## Add a lecture

1. Add a summary entry to `data/lectures.json`.
2. Add `api/lectures/<slug>.json` with `videoId`, `videoUrl`, `category`, `stanceSummary`, and either `transcript` or `transcriptFile`.
3. Run `npm run build`.

### Agent workflow (Hamza Yusuf & Omar Suleiman)

- **Claude Code**: `.claude/commands/add.md` — search Sandala + Yaqeen, transcribe, **clean transcripts** (sentence-level editing, Arabic terms, paragraphs—see `Transcript cleaning` in that file), write JSON/markdown, rebuild (same idea as askyq’s `/add`).
- **Cursor**: project skill `.cursor/skills/soulsearch-add/SKILL.md` — points agents at that workflow and summarizes the cleaning bar.

**YouTube API**: copy `.env.example` to `.env`, set `YOUTUBE_API_KEY`, then:

```bash
python3 scripts/yt.py search "purification of the heart" 10
python3 scripts/yt.py transcript VIDEO_ID
```

Requires `pip install youtube-transcript-api` and `yt-dlp` for fallback captions.
