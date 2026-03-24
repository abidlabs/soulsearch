#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const SITE_URL = (process.env.SITE_URL || "https://example.org").replace(
  /\/$/,
  ""
);
const SITE_NAME = "SoulSearch";
const SITE_LOGO_MARKUP = "Soul<em>Search</em>";
const SITE_DESC =
  "Transcribed Islamic spirituality lectures with synced YouTube playback — attention, heart, and living faith.";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs");
const TRANSCRIPTS = path.join(ROOT, "data", "transcripts");

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function toRfc2822(iso) {
  return new Date(iso).toUTCString();
}

function markdownToHtml(md) {
  let html = md;
  html = html.replace(/^>\s*(.+)$/gm, "<blockquote><p>$1</p></blockquote>");
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, "\n");
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  html = html.replace(/^(\s*)-\s+(.+)$/gm, (_, _indent, content) => {
    return `<li>${content}</li>`;
  });
  html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, "<ul>$1</ul>");
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  const lines = html.split("\n");
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push("");
      continue;
    }
    if (
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("<ol") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("</") ||
      trimmed.startsWith("<hr") ||
      trimmed.startsWith("<blockquote") ||
      trimmed.startsWith("<p")
    ) {
      result.push(trimmed);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }
  return result.join("\n");
}

function loadTranscriptBody(lecture) {
  if (lecture.transcript && String(lecture.transcript).trim()) {
    return lecture.transcript;
  }
  if (lecture.transcriptFile) {
    const p = path.join(TRANSCRIPTS, lecture.transcriptFile);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf-8");
    }
  }
  return "";
}

function loadAllLectures() {
  const listPath = path.join(ROOT, "data", "lectures.json");
  const summaryMap = {};
  JSON.parse(fs.readFileSync(listPath, "utf-8")).forEach((f) => {
    summaryMap[f.id] = f.summary;
  });
  const dir = path.join(ROOT, "api", "lectures");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const lectures = files.map((file) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    data.summary = summaryMap[data.id] || data.stanceSummary || "";
    if (!data.transcript) {
      data.transcript = loadTranscriptBody(data);
    }
    return data;
  });
  lectures.sort((a, b) => new Date(b.datePublished) - new Date(a.datePublished));
  return lectures;
}

function getRelatedLectures(lecture, all, maxCount = 4) {
  const candidates = all.filter((f) => f.id !== lecture.id);
  const tagSet = new Set((lecture.tags || []).map((t) => t.toLowerCase()));
  const scored = candidates.map((c) => {
    let score = 0;
    if (c.category === lecture.category) score += 3;
    (c.tags || []).forEach((t) => {
      if (tagSet.has(t.toLowerCase())) score += 1;
    });
    return { lecture: c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map((s) => s.lecture);
}

function footerHtml(statValue, statSubvalue, cssExtra) {
  const cls = cssExtra ? `site-footer ${cssExtra}` : "site-footer";
  return `<footer class="${cls}" id="siteFooter">
        <button class="footer-close" id="footerClose" aria-label="Dismiss">&times;</button>
        <div class="footer-stat">
          <span class="stat-value" id="lectureCount">${statValue}</span>
          <span class="stat-subvalue">${statSubvalue}</span>
        </div>
        <div class="footer-disclaimer">
          <p>Transcripts are derived from auto-captions and lightly cleaned; they may contain errors. Listen to the original video to verify.</p>
          <p>Beneficial knowledge is a trust — consult qualified teachers for guidance on your situation.</p>
        </div>
      </footer>
      <button class="footer-toggle" id="footerToggle" aria-label="Show footer">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9.5L7 5.5L11 9.5"/></svg>
      </button>
      <script>
      (function(){
        var f=document.getElementById('siteFooter');
        var t=document.getElementById('footerToggle');
        var btn=document.getElementById('footerClose');
        if(!f||!t) return;
        function hide(){f.hidden=true;t.classList.add('visible');localStorage.setItem('footerDismissed','1');}
        function show(){f.hidden=false;t.classList.remove('visible');localStorage.removeItem('footerDismissed');}
        if(localStorage.getItem('footerDismissed')==='1') hide();
        if(btn) btn.addEventListener('click',hide);
        t.addEventListener('click',show);
      })();
      </script>`;
}

function lectureVideoFooterHtml(lecture) {
  const vid = escapeHtml(lecture.videoId);
  const vurl = escapeHtml(lecture.videoUrl);
  const thumb = `https://img.youtube.com/vi/${lecture.videoId}/hqdefault.jpg`;
  return `<footer class="lecture-video-dock" id="lectureVideoDock" data-video-id="${vid}" data-video-url="${vurl}">
      <button type="button" class="footer-close" id="lectureFooterClose" aria-label="Dismiss">&times;</button>
      <div class="lecture-video-dock__inner">
        <a class="lecture-video-thumb" href="${vurl}" target="_blank" rel="noopener noreferrer" aria-label="Open video on YouTube">
          <img src="${thumb}" alt="" width="120" height="68" loading="lazy" decoding="async" />
        </a>
        <div class="lecture-video-dock__center">
          <div class="lecture-video-scrub" aria-hidden="true">
            <div class="lecture-video-scrub__track">
              <div class="lecture-video-scrub__fill" id="lectureVideoScrubFill"></div>
            </div>
          </div>
          <div class="lecture-video-meta">
            <span class="lecture-video-times" aria-live="polite">
              <span id="lectureTimeCurrent">0:00</span><span class="lecture-video-times__sep"> / </span><span id="lectureTimeDuration">--:--</span>
            </span>
            <p class="lecture-video-disclaimer">Playback syncs with scroll and timestamp links in the transcript when available.</p>
          </div>
        </div>
        <div class="lecture-video-playcol">
          <button type="button" class="lecture-video-playbtn" id="lecturePlayBtn" aria-label="Play or pause video">
            <svg class="lecture-video-playbtn__icon-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            <svg class="lecture-video-playbtn__icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <div class="lecture-video-speed" role="group" aria-label="Playback speed">
            <button type="button" class="lecture-video-speed__btn" data-rate="0.5">0.5×</button>
            <button type="button" class="lecture-video-speed__btn is-active" data-rate="1">1×</button>
            <button type="button" class="lecture-video-speed__btn" data-rate="1.5">1.5×</button>
          </div>
        </div>
      </div>
      <div class="lecture-yt-host" id="lectureYtPlayerHost" aria-hidden="true"></div>
    </footer>
    <button type="button" class="footer-toggle" id="lectureFooterToggle" aria-label="Show video bar">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9.5L7 5.5L11 9.5"/></svg>
      </button>
    <script>
      (function(){
        var f=document.getElementById("lectureVideoDock");
        var t=document.getElementById("lectureFooterToggle");
        var btn=document.getElementById("lectureFooterClose");
        if(!f||!t) return;
        var key="lectureVideoDockDismissed";
        function hide(){f.hidden=true;t.classList.add("visible");try{localStorage.setItem(key,"1");}catch(e){}}
        function show(){f.hidden=false;t.classList.remove("visible");try{localStorage.removeItem(key);}catch(e){}}
        try{if(localStorage.getItem(key)==="1") hide();}catch(e){}
        if(btn) btn.addEventListener("click",hide);
        t.addEventListener("click",show);
      })();
    </script>
    <script type="module" src="../../assets/js/lecture-player.js"></script>`;
}

function lectureCardHtml(lecture, basePath) {
  const href = `${basePath}lecture/${lecture.id}/`;
  const dateStr = formatDate(lecture.datePublished);
  return `<a class="lecture-card" href="${href}">
  <span class="lecture-card-category">${escapeHtml(lecture.category)}</span>
  <p class="lecture-card-title">${escapeHtml(lecture.title)}</p>
  <p class="lecture-card-summary">${escapeHtml(lecture.summary)}</p>
  <div class="lecture-card-footer">
    <span class="lecture-card-scholar">${escapeHtml(lecture.scholar)}</span>
    <span class="lecture-card-date">&bull; ${dateStr}</span>
  </div>
</a>`;
}

function buildLecturePage(lecture, allLectures) {
  const catSlug = slugify(lecture.category);
  const canonicalUrl = `${SITE_URL}/lecture/${lecture.id}/`;
  const desc = lecture.stanceSummary || lecture.summary;
  const dateStr = formatDate(lecture.datePublished);
  const tagsHtml = (lecture.tags || [])
    .slice(0, 5)
    .map((t) => `<span class="lecture-tag">${escapeHtml(t)}</span>`)
    .join("");
  let transcript = lecture.transcript || loadTranscriptBody(lecture);
  const fullTranscriptMarker = "## Full Lecture Transcript";
  const ftIdx = transcript.indexOf(fullTranscriptMarker);
  if (ftIdx > 0) {
    transcript = transcript.substring(ftIdx);
  }
  const bodyHtml = markdownToHtml(transcript);
  const related = getRelatedLectures(lecture, allLectures);
  const relatedHtml = related.length
    ? `<section class="related-section">
        <h2 class="related-heading">Related lectures</h2>
        <div class="recent-grid">${related.map((r) => lectureCardHtml(r, "../../")).join("\n")}</div>
      </section>`
    : "";
  const altQuestions = lecture.alternateQuestions || [];
  const articleJsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: lecture.title,
      description: desc,
      datePublished: lecture.datePublished,
      author: { "@type": "Person", name: lecture.scholar },
      publisher: { "@type": "Organization", name: SITE_NAME },
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
      video: {
        "@type": "VideoObject",
        name: lecture.title,
        url: lecture.videoUrl,
        embedUrl: `https://www.youtube.com/embed/${lecture.videoId}`,
      },
    },
    null,
    2
  );
  const faqEntries = [
    {
      "@type": "Question",
      name: lecture.title,
      acceptedAnswer: { "@type": "Answer", text: desc },
    },
    ...altQuestions.map((q) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: desc },
    })),
  ];
  const faqJsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqEntries,
    },
    null,
    2
  );
  const breadcrumbJsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: lecture.category,
          item: `${SITE_URL}/category/${catSlug}/`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: lecture.title,
        },
      ],
    },
    null,
    2
  );
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(lecture.title)} | ${SITE_NAME}</title>
    <meta name="description" content="${escapeHtml(desc)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtml(lecture.title)} | ${SITE_NAME}" />
    <meta property="og:description" content="${escapeHtml(desc)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:image" content="https://img.youtube.com/vi/${escapeHtml(lecture.videoId)}/hqdefault.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://img.youtube.com/vi/${escapeHtml(lecture.videoId)}/hqdefault.jpg" />
    <meta name="twitter:title" content="${escapeHtml(lecture.title)}" />
    <meta name="twitter:description" content="${escapeHtml(desc)}" />
    <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} RSS Feed" href="${SITE_URL}/feed.xml" />
    <script type="application/ld+json">${articleJsonLd}</script>
    <script type="application/ld+json">${faqJsonLd}</script>
    <script type="application/ld+json">${breadcrumbJsonLd}</script>
    <link rel="stylesheet" href="../../assets/css/main.css" />
  </head>
  <body class="has-lecture-video">
    <div class="pattern-bg" aria-hidden="true"></div>

    <main class="page page-lecture">
      <nav class="top-nav">
        <a href="../../" class="nav-link">Home</a>
        <a href="../../api/index.html" class="nav-link">API</a>
        <a href="../../feed.xml" class="nav-link">RSS</a>
      </nav>

      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="../../">Home</a>
        <span class="breadcrumb-sep" aria-hidden="true">&rsaquo;</span>
        <a href="../../category/${catSlug}/">${escapeHtml(lecture.category)}</a>
        <span class="breadcrumb-sep" aria-hidden="true">&rsaquo;</span>
        <span>${escapeHtml(lecture.title)}</span>
      </nav>

      <div class="lecture-header">
        <p class="lecture-header-category">${escapeHtml(lecture.category)}</p>
        <h1 class="lecture-header-title">${escapeHtml(lecture.title)}</h1>
        <div class="lecture-header-meta">
          <span>${escapeHtml(lecture.scholar)}</span>
          <span style="opacity:0.4">&#8226;</span>
          <span>${dateStr}</span>
          <span style="opacity:0.4">&#8226;</span>
          <a href="${lecture.videoUrl}" target="_blank" rel="noopener">Watch on YouTube</a>
        </div>
        <div class="lecture-tags">${tagsHtml}</div>
      </div>

      <div class="quick-answer">
        <p class="quick-answer-heading">At a glance</p>
        <p>${escapeHtml(desc)}</p>
      </div>

      <article class="lecture-body">
        ${bodyHtml}
      </article>

      ${relatedHtml}

      ${lectureVideoFooterHtml(lecture)}
    </main>
  </body>
</html>`;
}

function buildCategoryPage(category, catLectures, allCategories) {
  const slug = slugify(category);
  const canonicalUrl = `${SITE_URL}/category/${slug}/`;
  const desc = `Spirituality and adab — ${category.toLowerCase()} — ${catLectures.length} lecture${catLectures.length !== 1 ? "s" : ""} with transcripts.`;
  const cardsHtml = catLectures.map((f) => lectureCardHtml(f, "../../")).join("\n");
  const otherCats = allCategories
    .filter((c) => c !== category)
    .map((c) => {
      const s = slugify(c);
      return `<a class="category-link" href="../${s}/">${escapeHtml(c)}</a>`;
    })
    .join("\n");
  const breadcrumbJsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: category,
        },
      ],
    },
    null,
    2
  );
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(category)} | ${SITE_NAME}</title>
    <meta name="description" content="${escapeHtml(desc)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtml(category)} | ${SITE_NAME}" />
    <meta property="og:description" content="${escapeHtml(desc)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} RSS Feed" href="${SITE_URL}/feed.xml" />
    <script type="application/ld+json">${breadcrumbJsonLd}</script>
    <link rel="stylesheet" href="../../assets/css/main.css" />
  </head>
  <body>
    <div class="pattern-bg" aria-hidden="true"></div>

    <main class="page page-wide">
      <nav class="top-nav">
        <a href="../../" class="nav-link">Home</a>
        <a href="../../api/index.html" class="nav-link">API</a>
        <a href="../../feed.xml" class="nav-link">RSS</a>
      </nav>

      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="../../">Home</a>
        <span class="breadcrumb-sep" aria-hidden="true">&rsaquo;</span>
        <span>${escapeHtml(category)}</span>
      </nav>

      <header class="category-header">
        <p class="eyebrow">Category</p>
        <h1 class="category-title">${escapeHtml(category)}</h1>
        <p class="category-count">${catLectures.length} lecture${catLectures.length !== 1 ? "s" : ""}</p>
      </header>

      <div class="recent-grid category-grid">
        ${cardsHtml}
      </div>

      <section class="other-categories">
        <h2 class="other-categories-heading">Browse other categories</h2>
        <div class="category-links">
          ${otherCats}
        </div>
      </section>

      ${footerHtml(SITE_NAME, "Islamic spirituality lectures", "page-footer")}
    </main>
  </body>
</html>`;
}

function buildHomepage(lectures, categories) {
  const canonicalUrl = `${SITE_URL}/`;
  const categoryNames = categories.map((c) => c.toLowerCase()).join(", ");
  const metaDesc = `Read and listen to ${lectures.length} transcribed lectures on ${categoryNames}. Scroll-synced YouTube playback.`;
  const recentCardsHtml = lectures.slice(0, 6).map((f) => lectureCardHtml(f, "./")).join("\n");
  const catChips = categories
    .map((cat) => {
      const catSlug = slugify(cat);
      const count = lectures.filter((f) => f.category === cat).length;
      return `<a href="./category/${catSlug}/" class="category-chip">${escapeHtml(cat)} <span class="chip-count">${count}</span></a>`;
    })
    .join("\n");
  const websiteJsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESC,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    null,
    2
  );
  const faqJsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: lectures.map((f) => ({
        "@type": "Question",
        name: f.title,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.summary || f.stanceSummary || "",
        },
      })),
    },
    null,
    2
  );
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${SITE_NAME} — Islamic spirituality lectures (transcripts)</title>
    <meta name="description" content="${escapeHtml(metaDesc)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${SITE_NAME}" />
    <meta property="og:description" content="${escapeHtml(SITE_DESC)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} RSS Feed" href="${SITE_URL}/feed.xml" />
    <script type="application/ld+json">${websiteJsonLd}</script>
    <script type="application/ld+json">${faqJsonLd}</script>
    <link rel="stylesheet" href="./assets/css/main.css" />
  </head>
  <body>
    <div class="pattern-bg" aria-hidden="true" id="patternBg"></div>

    <main class="landing">
      <nav class="top-nav">
        <a href="./" class="nav-link">Home</a>
        <a href="./api/index.html" class="nav-link">API</a>
        <a href="./feed.xml" class="nav-link">RSS</a>
      </nav>

      <section class="hero">
        <div class="bismillah" aria-hidden="true">&#1576;&#1587;&#1605; &#1575;&#1604;&#1604;&#1607; &#1575;&#1604;&#1585;&#1581;&#1605;&#1606; &#1575;&#1604;&#1585;&#1581;&#1610;&#1605;</div>
        <p class="eyebrow">Lectures &amp; transcripts</p>
        <h1 class="site-title">${SITE_LOGO_MARKUP}</h1>
        <p class="site-tagline">
          ${escapeHtml(SITE_DESC)}
        </p>

        <div class="search-wrap">
          <div class="search-box">
            <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <circle cx="9" cy="9" r="5.5"/>
              <path d="M14 14L17.5 17.5"/>
            </svg>
            <label for="lectureSearch" class="sr-only">Search lectures</label>
            <input
              id="lectureSearch"
              type="text"
              placeholder="Search attention, heart, dhikr, adab…"
              autocomplete="off"
              spellcheck="false"
              aria-controls="searchResults"
              aria-expanded="false"
            />
          </div>
          <div id="searchResults" class="results" role="listbox"></div>
        </div>
      </section>

      <section class="recent-section" id="recentSection">
        <p class="ornament" aria-hidden="true">&#10022; &#10022; &#10022;</p>
        <p class="recent-label">Featured</p>
        <div class="marquee-wrap">
          <div class="marquee-track" id="recentGrid">
            ${recentCardsHtml}
            ${recentCardsHtml}
          </div>
        </div>
      </section>

      <section class="browse-section" id="browseSection">
        <p class="ornament" aria-hidden="true">&#10022; &#10022; &#10022;</p>
        <p class="recent-label">Browse by category</p>
        <div class="category-chips">
          ${catChips}
        </div>
      </section>

      ${footerHtml(`${lectures.length} lectures`, "Transcripts paired with YouTube playback")}
    </main>

    <script type="module" src="./assets/js/search.js"></script>
  </body>
</html>`;
}

function buildSitemap(lectures, categories) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <priority>1.0</priority>
    <changefreq>weekly</changefreq>
  </url>`;
  for (const lecture of lectures) {
    xml += `
  <url>
    <loc>${SITE_URL}/lecture/${lecture.id}/</loc>
    <lastmod>${lecture.datePublished}</lastmod>
    <priority>0.8</priority>
  </url>`;
  }
  for (const cat of categories) {
    xml += `
  <url>
    <loc>${SITE_URL}/category/${slugify(cat)}/</loc>
    <priority>0.6</priority>
    <changefreq>weekly</changefreq>
  </url>`;
  }
  xml += `
  <url>
    <loc>${SITE_URL}/api/index.html</loc>
    <priority>0.3</priority>
  </url>
</urlset>
`;
  return xml;
}

function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function buildFeed(lectures) {
  const items = lectures
    .slice(0, 50)
    .map(
      (f) => `    <item>
      <title>${escapeHtml(f.title)}</title>
      <link>${SITE_URL}/lecture/${f.id}/</link>
      <guid isPermaLink="true">${SITE_URL}/lecture/${f.id}/</guid>
      <description>${escapeHtml(f.stanceSummary || f.summary)}</description>
      <pubDate>${toRfc2822(f.datePublished)}</pubDate>
      <category>${escapeHtml(f.category)}</category>
    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} — Islamic spirituality lectures</title>
    <link>${SITE_URL}/</link>
    <description>${escapeHtml(SITE_DESC)}</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanDocs() {
  const preserve = new Set([".gitkeep"]);
  if (fs.existsSync(OUT)) {
    for (const entry of fs.readdirSync(OUT)) {
      if (preserve.has(entry)) continue;
      fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(OUT, { recursive: true });
  }
}

function buildApiIndex(lectures) {
  const payload = {
    service: "SoulSearch static API",
    version: "v1",
    routes: {
      apiIndex: "/api/index.json",
      lectureList: "/data/lectures.json",
      lectureByIdTemplate: "/api/lectures/{id}.json",
    },
    lectureCount: lectures.length,
  };
  fs.mkdirSync(path.join(OUT, "api"), { recursive: true });
  fs.writeFileSync(
    path.join(OUT, "api", "index.json"),
    JSON.stringify(payload, null, 2)
  );
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${SITE_NAME} API</title>
  <link rel="stylesheet" href="../assets/css/main.css" />
</head>
<body>
  <div class="pattern-bg" aria-hidden="true"></div>
  <main class="page page-wide" style="padding: 32px 28px 80px;">
    <nav class="top-nav">
      <a href="../" class="nav-link">Home</a>
    </nav>
    <h1 class="category-title" style="margin-top: 12px;">Static JSON API</h1>
    <p class="category-count">Lecture list: <a href="../data/lectures.json"><code>data/lectures.json</code></a></p>
    <p class="category-count">Per lecture: <code>api/lectures/&lt;id&gt;.json</code></p>
    <pre style="background: var(--card); padding: 16px; border-radius: 12px; overflow: auto;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
  </main>
</body>
</html>`;
  fs.writeFileSync(path.join(OUT, "api", "index.html"), html);
}

function main() {
  const lectures = loadAllLectures();
  const categories = [...new Set(lectures.map((f) => f.category))].sort();

  cleanDocs();
  copyDir(path.join(ROOT, "assets"), path.join(OUT, "assets"));
  fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, "data", "lectures.json"),
    path.join(OUT, "data", "lectures.json")
  );
  fs.mkdirSync(path.join(OUT, "api", "lectures"), { recursive: true });
  for (const file of fs.readdirSync(path.join(ROOT, "api", "lectures"))) {
    if (!file.endsWith(".json")) continue;
    fs.copyFileSync(
      path.join(ROOT, "api", "lectures", file),
      path.join(OUT, "api", "lectures", file)
    );
  }

  for (const lecture of lectures) {
    const dir = path.join(OUT, "lecture", lecture.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "index.html"),
      buildLecturePage(lecture, lectures)
    );
  }
  console.log(`  ${lectures.length} lecture pages`);

  for (const cat of categories) {
    const slug = slugify(cat);
    const dir = path.join(OUT, "category", slug);
    fs.mkdirSync(dir, { recursive: true });
    const catLectures = lectures.filter((f) => f.category === cat);
    fs.writeFileSync(
      path.join(dir, "index.html"),
      buildCategoryPage(cat, catLectures, categories)
    );
  }
  console.log(`  ${categories.length} category pages`);

  fs.writeFileSync(path.join(OUT, "index.html"), buildHomepage(lectures, categories));
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), buildSitemap(lectures, categories));
  fs.writeFileSync(path.join(OUT, "robots.txt"), buildRobots());
  fs.writeFileSync(path.join(OUT, "feed.xml"), buildFeed(lectures));
  buildApiIndex(lectures);

  const cnameHost = process.env.CNAME_HOST || new URL(`${SITE_URL}/`).hostname;
  if (cnameHost && cnameHost !== "example.org") {
    fs.writeFileSync(path.join(OUT, "CNAME"), `${cnameHost}\n`);
  }

  console.log("  docs/ (site output)");
  console.log("\nDone.");
}

main();
