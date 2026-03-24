Find new **Islamic spirituality / purification of the heart** talks on YouTube from **Hamza Yusuf** (Sandala) and **Omar Suleiman** (Yaqeen Institute) that are not yet indexed in this repo, fetch transcripts, and create structured lecture articles for SoulSearch.

**Optional argument**: The user may provide a YouTube video URL (e.g. `https://www.youtube.com/watch?v=VIDEO_ID`). If provided, skip Steps 1–4 and go to Step 5 using that video. Extract the `videoId` from the URL. Fetch title and publish date:

```bash
python3 scripts/yt.py snippet VIDEO_ID
```

If the `videoId` is already in the indexed set, tell the user and stop.

If the `videoId` is in `data/transcript_unavailable.json` with reason `missing_english_transcript`, tell the user and stop.

If the `videoId` is in `data/video_skip_list.json`, tell the user and stop.

$ARGUMENTS

## Step 1: Prerequisites

1. Verify `youtube-transcript-api` is installed. If not, run `pip install youtube-transcript-api`.
2. Verify `yt-dlp` is installed for transcript fallback. If not, run `pip install yt-dlp`.
3. Copy `.env.example` to `.env` and set `YOUTUBE_API_KEY`.
4. Verify the API key works:

```bash
python3 scripts/yt.py search "heart" 3
```

## Step 2: Load Existing Data

Read `data/lectures.json` and collect all `videoId` values into a set of already-indexed IDs.

Read `data/transcript_unavailable.json` and collect all `videoId` values whose `reason` is `missing_english_transcript` into a skip set.

Read `data/video_skip_list.json` and collect all `videoId` values into a user-skip set.

## Step 3: Search for New Videos

Prioritize **spiritual** and **heart / purification / character / dhikr / tazkiyah / ihsan / mindfulness (Islamic)** content. The helper searches **Sandala (Hamza Yusuf)** and **Yaqeen (Omar Suleiman)** only.

Run several searches in parallel (adjust `max` per channel as needed):

```bash
python3 scripts/yt.py search "purification of the heart" 12
python3 scripts/yt.py search "tazkiyah" 12
python3 scripts/yt.py search "spiritual heart" 12
python3 scripts/yt.py search "dhikr" 10
python3 scripts/yt.py search "ihsan" 10
python3 scripts/yt.py search "character adab" 10
python3 scripts/yt.py search "sincerity ikhlas" 10
```

Deduplicate by `videoId`. Remove any ID already indexed, in the missing-English skip set, or in the user-skip set.

**Filter out** content that is clearly not about spirituality/heart (e.g. pure fiqh Q&A, politics-only, fundraising, unrelated interviews), using title and description.

**Filter out Shorts** by default: exclude if title or description suggests `#shorts`, `shorts`, or similar.

**Scholar field**: Use `Shaykh Hamza Yusuf` for Sandala videos and `Omar Suleiman` for Yaqeen videos (match `channelKey` from search results: `sandala` vs `yaqeen`).

## Step 4: Present Candidates

Show a numbered list: title, date, channel, `videoId`. Ask which to process (numbers, range, or `all`).

If the user picks only a subset, append every non-selected candidate from that list to `data/video_skip_list.json`:

```json
{
  "videoId": "<videoId>",
  "reason": "not_selected",
  "note": "Auto-skipped because user did not select this candidate",
  "createdAt": "<ISO timestamp>"
}
```

If an entry for that `videoId` already exists, update `note` and set `updatedAt`.

## Step 5: Process Each Selected Video

For each video:

### 5a. Fetch transcript

```bash
python3 scripts/yt.py transcript <videoId>
```

This writes:

- `tmp/transcript_<videoId>.txt`
- `tmp/transcript_<videoId>_ts.json` (timestamped segments for deep links)

If transcript fetch fails, skip and inform the user. If failure is missing English captions, append/update `data/transcript_unavailable.json` like AskQadi (same shape as in `askyq` add command).

### 5b. Analyze the transcript

Identify themes: one video usually becomes **one lecture article** unless the user explicitly wants multiple entries (default: **one lecture per video**).

### 5c. Generate lecture files

**1. API JSON** at `api/lectures/<id>.json`:

```json
{
  "id": "<slug>",
  "title": "<descriptive title from video>",
  "scholar": "Shaykh Hamza Yusuf" | "Omar Suleiman",
  "videoId": "<videoId>",
  "videoUrl": "https://www.youtube.com/watch?v=<videoId>",
  "datePublished": "<YYYY-MM-DD>",
  "tags": ["<spirituality>", "<long-tail>", "<phrases>"],
  "category": "<see categories below>",
  "stanceSummary": "<2–4 sentences: core message for readers>",
  "alternateQuestions": ["<3–5 search-style questions>"],
  "transcriptFile": "<videoId>.md"
}
```

**2. Transcript markdown** at `data/transcripts/<videoId>.md` — cleaned from raw captions using **Transcript cleaning** below (mandatory; do not paste raw ASR as-is).

**3. Summary row** in `data/lectures.json` (same `id`, `title`, `summary`, `scholar`, `videoId`, `videoUrl`, `datePublished`, `tags`, `category`).

### Categories (pick best fit)

- Heart & Presence
- Purification of the Heart (tazkiyah)
- Dhikr & Remembrance
- Character & Adab
- Trials & the Soul
- Prayer & Ihsan
- Other

### SEO: tags and alternate questions

- Tags: Islamic terms **and** long-tail phrases people search (e.g. `how to soften heart islam`, `distraction from allah`).
- `alternateQuestions`: natural language questions, as in AskQadi.

### ID / slug

- Lowercase kebab-case, descriptive: `mastering-attention-distraction-game-of-mind-hamza-yusuf`.

### Transcript cleaning (required)

Clean the transcript **thoughtfully, sentence by sentence**—as you would edit an article. **Do not** run broad global find/replace across the whole file to “fix” words (that creates new errors). **Do** read in order, fix spelling and grammar, merge or split lines so sentences and paragraphs **start and stop at meaningful points**, and correct Arabic/Islamic terms from context.

#### Faithfulness

- Reflect what the speaker actually said: do not invent rulings, hadith, or quotations.
- Do **not** replace the lecture with a short summary; the page is the cleaned **full** transcript (plus optional short `##` intro if you use one).
- If a stretch of ASR is unintelligible, do your best from context; do not fabricate theological detail. Mark rare uncertainty with a light editorial note only if necessary.

#### Mechanics

- **Spelling and capitalization**: standard English; capitalize proper names (Nietzsche, Seneca, Popper, Qur’an, *Sahih Muslim*, House of Lords, etc.).
- **Filler**: remove stutters and repeated phrases when they are clearly accidental (“who’s who’s”, “it’s it’s”, duplicate sentences).
- **Stage directions**: remove bracketed noise like `[snorts]`, `[clears throat]`, or stray `uh` unless needed for tone (usually omit).
- **Paragraphs**: break where topics shift; avoid one-line fragments that belong with the previous or next sentence.
- **Arabic and Islamic terms**: use consistent transliteration (*ilhaa'*, *lahw*, *tasawwuf*, *dhikr*). Italicize non-English words when helpful. Fix obvious ASR mangling (*leu* → *lahw*, *ilha* → *ilhaa'* when that is what was meant).
- **Honorifics**: use a consistent form, e.g. “The Prophet (peace and blessings upon him)” and “Imam Ali (may God be pleased with him)” or established equivalents—pick one style for the file.
- **Names**: fix mis-hearings when identifiable (e.g. *Imam al-Qushayri*, *Imam al-Ghazali*, *Ibn ‘Arabi*, *Imam al-Shafi’i*).

#### Example (quality bar)

Raw ASR is often broken across lines and wrong on key words. **Target** readable prose like this—not a word-for-word stenograph:

**Before (unacceptable):**

```markdown
Now the word in Arabic for distraction is ilha which means to pull somebody into leu to bring them into entertainment which in the dictionary is the

pleasurable occupation of the mind
```

**After (acceptable):**

```markdown
Now the word in Arabic for distraction is *ilhaa'*, which means to pull somebody into *lahw*—to bring them into entertainment—which in the dictionary is the "pleasurable occupation of the mind."
```

#### Section headings with video timestamps (required)

Same idea as **askyq**: every lecture transcript should include **2–4 `###` section headings**, each with a **clickable timestamp** into the video (not just a bare time).

- Put a **title `##`** at the top for the whole talk (optional but recommended).
- Add **2–4 `###` headings** that split the lecture into **major themes** (e.g. opening definition, shift to time/death, scholar/text discussion, closing).
- **Every `###` line MUST** include a markdown link in this form:

```markdown
### Short title in Title Case — [M:SS](https://www.youtube.com/watch?v=VIDEO_ID&t=SECONDS)
```

Use `HH:MM:SS` only if the video is over an hour. `SECONDS` must be an integer (e.g. `t=231` for 3:51).

**How to pick the `t=` value:** After `python3 scripts/yt.py transcript <videoId>`, open `tmp/transcript_<videoId>_ts.json`. Each entry has `text` and `start` (seconds). For each section, search the **first sentence or distinctive phrase** of that section in the caption snippets and use the **`start`** of the segment where it first appears. If a phrase is not exact (ASR variance), use the closest matching snippet at the start of that theme. **Do not** invent timestamps—anchor to the JSON.

**Example (one line):**

```markdown
### The clock, eternity, and remembering death — [3:51](https://www.youtube.com/watch?v=jSxFQSvFdwU&t=231)
```

Reference in-repo: `data/transcripts/jSxFQSvFdwU.md`.

#### After saving

Run `npm run build` so the static site picks up `data/transcripts/<videoId>.md`.

## Step 6: Rebuild

```bash
npm run build
```

## Step 7: Summary for the user

- How many new lectures were added
- Title, `id`, category for each
- Remind: captions are cleaned, not proofread; verify against audio
