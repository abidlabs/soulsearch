#!/usr/bin/env python3
"""YouTube helper for SoulSearch — search Sandala (Hamza Yusuf) and Yaqeen (Omar Suleiman), fetch transcripts."""

import glob
import html
import json
import os
import subprocess
import sys
import urllib.parse
from datetime import datetime, timezone

CHANNELS = (
    {
        "key": "sandala",
        "channelId": "UC361kz8bZYcYuF7k5j2kXdw",
        "label": "Sandala / Hamza Yusuf",
    },
    {
        "key": "yaqeen",
        "channelId": "UCLrUV5FkWV8lm9omd5vQApQ",
        "label": "Yaqeen Institute / Omar Suleiman",
    },
)


def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _api_key():
    _load_env()
    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        print("Error: YOUTUBE_API_KEY not set. Add it to .env or export it.", file=sys.stderr)
        sys.exit(1)
    return key


def _yt_get(endpoint, params):
    params["key"] = _api_key()
    url = f"https://www.googleapis.com/youtube/v3/{endpoint}?{urllib.parse.urlencode(params)}"
    result = subprocess.run(["curl", "-s", url], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: curl failed: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    return json.loads(result.stdout)


def _project_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _record_missing_english_transcript(video_id, error_message):
    root = _project_root()
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)
    path = os.path.join(data_dir, "transcript_unavailable.json")
    entries = []
    if os.path.exists(path):
        with open(path) as f:
            try:
                entries = json.load(f)
            except json.JSONDecodeError:
                entries = []
    now = datetime.now(timezone.utc).isoformat()
    updated = False
    for entry in entries:
        if entry.get("videoId") == video_id and entry.get("reason") == "missing_english_transcript":
            entry["lastCheckedAt"] = now
            entry["lastError"] = error_message
            updated = True
            break
    if not updated:
        entries.append(
            {
                "videoId": video_id,
                "reason": "missing_english_transcript",
                "firstCheckedAt": now,
                "lastCheckedAt": now,
                "lastError": error_message,
            }
        )
    with open(path, "w") as f:
        json.dump(entries, f, indent=2)
        f.write("\n")


def _save_transcript_outputs(video_id, snippets):
    text = " ".join(s["text"] for s in snippets)
    project_root = _project_root()
    tmp_dir = os.path.join(project_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    path = os.path.join(tmp_dir, f"transcript_{video_id}.txt")
    words = text.split()
    with open(path, "w") as f:
        for i in range(0, len(words), 150):
            f.write(" ".join(words[i : i + 150]) + "\n\n")
    ts_path = os.path.join(tmp_dir, f"transcript_{video_id}_ts.json")
    with open(ts_path, "w") as f:
        json.dump(snippets, f, indent=2)
    print(path)
    print(ts_path)


def _normalize_text(text):
    return " ".join(html.unescape(text).replace("\n", " ").split()).strip()


def _cookies_file():
    _load_env()
    explicit = os.environ.get("YT_COOKIES_FILE", "")
    if explicit and os.path.exists(explicit):
        return explicit
    default = os.path.expanduser("~/.yt-cookies.txt")
    if os.path.exists(default):
        return default
    return None


def _requests_session_with_cookies(cookies_path):
    try:
        import requests
    except ImportError:
        return None
    session = requests.Session()
    with open(cookies_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 7:
                continue
            domain, _, path, secure, _expires, name, value = parts[:7]
            session.cookies.set(name, value, domain=domain, path=path)
    return session


def _fetch_transcript_via_api(video_id):
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as exc:
        raise RuntimeError("youtube-transcript-api is not installed") from exc
    try:
        cookies_path = _cookies_file()
        if cookies_path:
            session = _requests_session_with_cookies(cookies_path)
            api = YouTubeTranscriptApi(http_client=session) if session else YouTubeTranscriptApi()
        else:
            api = YouTubeTranscriptApi()
        t = api.fetch(video_id, languages=["en"])
        return [{"text": _normalize_text(s.text), "start": s.start, "duration": s.duration} for s in t]
    except (TypeError, AttributeError):
        t = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
        return [{"text": _normalize_text(s["text"]), "start": s["start"], "duration": s["duration"]} for s in t]


def _fetch_transcript_via_ytdlp(video_id):
    output_base = os.path.join(_project_root(), "tmp", f"ytdlp_{video_id}")
    os.makedirs(output_base, exist_ok=True)
    output_template = os.path.join(output_base, f"{video_id}.%(ext)s")
    url = f"https://www.youtube.com/watch?v={video_id}"
    cookies_path = _cookies_file()
    cmd = [
        "yt-dlp",
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        "en.*",
        "--sub-format",
        "json3",
        "-o",
        output_template,
    ]
    if cookies_path:
        cmd += ["--cookies", cookies_path]
    cmd += [url]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        msg = (result.stderr or result.stdout or "yt-dlp failed").strip()
        raise RuntimeError(msg)
    subtitle_files = sorted(glob.glob(os.path.join(output_base, f"{video_id}*.json3")))
    if not subtitle_files:
        raise RuntimeError("yt-dlp completed but no English subtitle file was produced")
    with open(subtitle_files[0]) as f:
        data = json.load(f)
    snippets = []
    for event in data.get("events", []):
        segs = event.get("segs") or []
        text = _normalize_text("".join(seg.get("utf8", "") for seg in segs))
        if not text:
            continue
        start = (event.get("tStartMs") or 0) / 1000.0
        duration = (event.get("dDurationMs") or 0) / 1000.0
        snippets.append({"text": text, "start": start, "duration": duration})
    if not snippets:
        raise RuntimeError("yt-dlp subtitle file did not contain usable transcript events")
    return snippets


def _search_one_channel(channel_id, query, max_results, page_token=None):
    params = {
        "part": "snippet",
        "channelId": channel_id,
        "type": "video",
        "maxResults": max_results,
        "order": "date",
    }
    if query:
        params["q"] = query
    if page_token:
        params["pageToken"] = page_token
    return _yt_get("search", params)


def cmd_search(query="", max_per_channel=10, channel_filter=None):
    """Search configured spirituality channels. channel_filter: sandala, yaqeen, or None for all."""
    channels = CHANNELS
    if channel_filter:
        channels = [c for c in CHANNELS if c["key"] == channel_filter]
        if not channels:
            print(f"Error: unknown channel key {channel_filter}", file=sys.stderr)
            sys.exit(1)

    seen = set()
    merged = []
    for ch in channels:
        data = _search_one_channel(ch["channelId"], query, max_per_channel)
        for item in data.get("items", []):
            vid = item["id"].get("videoId")
            if not vid or vid in seen:
                continue
            seen.add(vid)
            merged.append(
                {
                    "videoId": vid,
                    "title": item["snippet"]["title"],
                    "description": item["snippet"]["description"],
                    "publishedAt": item["snippet"]["publishedAt"][:10],
                    "channelKey": ch["key"],
                    "channelLabel": ch["label"],
                }
            )

    out = {"results": merged}
    print(json.dumps(out, indent=2))


def cmd_snippet(video_id):
    data = _yt_get("videos", {"part": "snippet", "id": video_id})
    items = data.get("items") or []
    if not items:
        print(json.dumps({"error": "not_found", "videoId": video_id}))
        sys.exit(4)
    sn = items[0]["snippet"]
    print(
        json.dumps(
            {
                "title": sn["title"],
                "publishedAt": sn["publishedAt"][:10],
                "channelTitle": sn.get("channelTitle", ""),
            },
            indent=2,
        )
    )


def cmd_transcript(video_id):
    api_error = None
    try:
        snippets = _fetch_transcript_via_api(video_id)
    except Exception as exc:
        api_error = exc
        snippets = None

    if snippets is None:
        try:
            snippets = _fetch_transcript_via_ytdlp(video_id)
        except FileNotFoundError:
            snippets = None
            ytdlp_error = "yt-dlp is not installed"
        except Exception as exc:
            snippets = None
            ytdlp_error = str(exc)
        else:
            ytdlp_error = None
    else:
        ytdlp_error = None

    if snippets is None:
        api_error_msg = str(api_error) if api_error else "unknown error"
        if api_error and api_error.__class__.__name__ == "NoTranscriptFound" and "requested language codes: ['en']" in api_error_msg:
            _record_missing_english_transcript(video_id, api_error_msg)
            print(
                f"Error: no English transcript available for {video_id}. "
                "Recorded in data/transcript_unavailable.json.",
                file=sys.stderr,
            )
            sys.exit(2)
        if ytdlp_error:
            print(
                f"Error: transcript fetch failed for {video_id}. "
                f"youtube-transcript-api: {api_error_msg}. yt-dlp fallback: {ytdlp_error}",
                file=sys.stderr,
            )
        else:
            print(
                f"Error: transcript fetch failed for {video_id}. "
                f"youtube-transcript-api: {api_error_msg}.",
                file=sys.stderr,
            )
        sys.exit(3)

    _save_transcript_outputs(video_id, snippets)


def main():
    usage = (
        "Usage:\n"
        "  yt.py search [query] [max_per_channel] [channel_key]\n"
        "    channel_key: optional sandala | yaqeen (default: both)\n"
        "  yt.py transcript <video_id>\n"
        "  yt.py snippet <video_id>\n"
    )
    if len(sys.argv) < 2:
        print(usage)
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        max_per = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        ch_filter = sys.argv[4] if len(sys.argv) > 4 else None
        cmd_search(query, max_per, ch_filter)
    elif cmd == "transcript":
        if len(sys.argv) < 3:
            print("Error: video_id required", file=sys.stderr)
            sys.exit(1)
        cmd_transcript(sys.argv[2])
    elif cmd == "snippet":
        if len(sys.argv) < 3:
            print("Error: video_id required", file=sys.stderr)
            sys.exit(1)
        cmd_snippet(sys.argv[2])
    else:
        print(f"Unknown command: {cmd}\n{usage}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
