const searchInput = document.getElementById("lectureSearch");
const resultsRoot = document.getElementById("searchResults");
const recentGrid = document.getElementById("recentGrid");
const lectureCountEl = document.getElementById("lectureCount");

let lectures = [];
let visibleResults = [];
let activeIndex = -1;

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function tokenize(str) {
  if (!str) return [];
  return normalize(str)
    .split(/\s+/)
    .filter(Boolean);
}

function foldToken(token) {
  return token.replace(/(.)\1+/g, "$1");
}

function tokenSkeleton(token) {
  const folded = foldToken(token);
  return folded.replace(/[aeiou]/g, "");
}

function boundedDistance(a, b, maxDistance) {
  const aLen = a.length;
  const bLen = b.length;
  if (!aLen) return bLen;
  if (!bLen) return aLen;
  if (Math.abs(aLen - bLen) > maxDistance) return maxDistance + 1;

  let prev = new Array(bLen + 1);
  let curr = new Array(bLen + 1);
  for (let j = 0; j <= bLen; j++) prev[j] = j;

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    let minInRow = curr[0];
    const aChar = a.charCodeAt(i - 1);

    for (let j = 1; j <= bLen; j++) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      const deletion = prev[j] + 1;
      const insertion = curr[j - 1] + 1;
      const substitution = prev[j - 1] + cost;
      const value = Math.min(deletion, insertion, substitution);
      curr[j] = value;
      if (value < minInRow) minInRow = value;
    }

    if (minInRow > maxDistance) return maxDistance + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[bLen];
}

function buildSearchIndex(lecture) {
  const titleTokens = [...new Set(tokenize(lecture.title))];
  const tagTokens = [...new Set(tokenize((lecture.tags || []).join(" ")))];
  const titleFolded = titleTokens.map(foldToken);
  const tagFolded = tagTokens.map(foldToken);
  const titleSkeleton = titleTokens.map(tokenSkeleton);
  const tagSkeleton = tagTokens.map(tokenSkeleton);

  return {
    titleTokens,
    tagTokens,
    titleSet: new Set(titleTokens),
    tagSet: new Set(tagTokens),
    titleFolded,
    tagFolded,
    titleSkeleton,
    tagSkeleton,
    titleFoldedSet: new Set(titleFolded),
    tagFoldedSet: new Set(tagFolded),
    titleSkeletonSet: new Set(titleSkeleton),
    tagSkeletonSet: new Set(tagSkeleton),
  };
}

function fuzzyFieldScore(queryToken, foldedQueryToken, tokens, foldedTokens) {
  const maxDistance = queryToken.length >= 8 ? 2 : 1;
  let best = 0;

  for (let i = 0; i < tokens.length; i++) {
    const candidate = tokens[i];
    const foldedCandidate = foldedTokens[i];
    if (Math.abs(candidate.length - queryToken.length) > maxDistance) continue;

    const direct = boundedDistance(queryToken, candidate, maxDistance);
    if (direct <= maxDistance) {
      const score = maxDistance === 1 ? 5 : 4;
      if (score > best) best = score;
      continue;
    }

    const folded = boundedDistance(foldedQueryToken, foldedCandidate, maxDistance);
    if (folded <= maxDistance) {
      const score = maxDistance === 1 ? 5 : 4;
      if (score > best) best = score;
    }
  }

  return best;
}

function scoreWord(queryToken, index) {
  const folded = foldToken(queryToken);
  const skeleton = tokenSkeleton(queryToken);

  if (index.titleSet.has(queryToken) || index.titleFoldedSet.has(folded)) return 20;
  if (index.tagSet.has(queryToken) || index.tagFoldedSet.has(folded)) return 16;
  if (skeleton.length >= 3 && index.titleSkeletonSet.has(skeleton)) return 13;
  if (skeleton.length >= 3 && index.tagSkeletonSet.has(skeleton)) return 10;

  let prefixHit = false;
  for (const token of index.titleTokens) {
    if (token.startsWith(queryToken) || queryToken.startsWith(token)) {
      prefixHit = true;
      break;
    }
  }
  if (prefixHit) return 14;

  for (const token of index.tagTokens) {
    if (token.startsWith(queryToken) || queryToken.startsWith(token)) return 11;
  }

  const titleFuzzy = fuzzyFieldScore(
    queryToken,
    folded,
    index.titleTokens,
    index.titleFolded
  );
  if (titleFuzzy) return titleFuzzy;

  const tagFuzzy = fuzzyFieldScore(
    queryToken,
    folded,
    index.tagTokens,
    index.tagFolded
  );
  return tagFuzzy ? Math.max(1, tagFuzzy - 1) : 0;
}

function resultRowTemplate(lecture, isActive) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `result-row${isActive ? " active" : ""}`;
  button.setAttribute("role", "option");
  button.dataset.id = lecture.id;

  const icon = document.createElement("div");
  icon.className = "result-icon";
  icon.textContent = "\u{1F4D6}";

  const copy = document.createElement("div");
  copy.className = "result-copy";

  const name = document.createElement("p");
  name.className = "result-name";
  name.textContent = lecture.title;

  const meta = document.createElement("p");
  meta.className = "result-meta";
  meta.textContent = `${lecture.scholar} \u2022 ${lecture.category}`;

  copy.appendChild(name);
  copy.appendChild(meta);

  const badge = document.createElement("span");
  badge.className = "result-badge";
  badge.textContent = lecture.category;

  button.appendChild(icon);
  button.appendChild(copy);
  button.appendChild(badge);
  button.addEventListener("click", () => goToLecture(lecture.id));
  return button;
}

function openResults() {
  resultsRoot.classList.add("open");
  searchInput.setAttribute("aria-expanded", "true");
}

function closeResults() {
  resultsRoot.classList.remove("open");
  searchInput.setAttribute("aria-expanded", "false");
  activeIndex = -1;
}

function renderResults() {
  resultsRoot.innerHTML = "";
  if (!visibleResults.length) {
    closeResults();
    return;
  }
  visibleResults.forEach((lecture, i) => {
    resultsRoot.appendChild(resultRowTemplate(lecture, i === activeIndex));
  });
  openResults();
}

function runSearch(query) {
  const queryTokens = [...new Set(tokenize(query))].slice(0, 6);
  if (!queryTokens.length) {
    closeResults();
    return;
  }

  const scored = [];
  for (const lecture of lectures) {
    const index = lecture._searchIndex;
    let matchedWords = 0;
    let wordScore = 0;

    for (const token of queryTokens) {
      const score = scoreWord(token, index);
      if (score > 0) {
        matchedWords += 1;
        wordScore += score;
      }
    }

    if (!matchedWords) continue;
    const finalScore = matchedWords * 1000 + wordScore;
    scored.push({ lecture, finalScore });
  }

  scored.sort((a, b) => b.finalScore - a.finalScore);
  visibleResults = scored.slice(0, 12).map((entry) => entry.lecture);
  activeIndex = -1;
  renderResults();
}

function goToLecture(id) {
  window.location.href = `./lecture/${encodeURIComponent(id)}/`;
}

function makeRecentCard(lecture) {
  const card = document.createElement("a");
  card.className = "lecture-card";
  card.href = `./lecture/${encodeURIComponent(lecture.id)}/`;

  const cat = document.createElement("span");
  cat.className = "lecture-card-category";
  cat.textContent = lecture.category;

  const title = document.createElement("p");
  title.className = "lecture-card-title";
  title.textContent = lecture.title;

  const summary = document.createElement("p");
  summary.className = "lecture-card-summary";
  summary.textContent = lecture.summary;

  const cardFooter = document.createElement("div");
  cardFooter.className = "lecture-card-footer";

  const scholar = document.createElement("span");
  scholar.className = "lecture-card-scholar";
  scholar.textContent = lecture.scholar;

  const date = document.createElement("span");
  date.className = "lecture-card-date";
  date.textContent = `\u2022 ${new Date(lecture.datePublished).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`;

  cardFooter.appendChild(scholar);
  cardFooter.appendChild(date);

  card.appendChild(cat);
  card.appendChild(title);
  card.appendChild(summary);
  card.appendChild(cardFooter);
  return card;
}

function renderRecentCards(list) {
  if (!recentGrid) return;
  recentGrid.innerHTML = "";
  const isTouchOrMobile = window.matchMedia("(pointer: coarse), (max-width: 768px)").matches;
  list.forEach((lecture) => recentGrid.appendChild(makeRecentCard(lecture)));
  if (!isTouchOrMobile) {
    list.forEach((lecture) => recentGrid.appendChild(makeRecentCard(lecture)));
  }
}

function spawnStars() {
  const container = document.getElementById("patternBg");
  if (!container) return;
  const glyphs = ["\u2726", "\u2727", "\u00B7", "\u2726", "\u00B7"];
  for (let i = 0; i < 20; i++) {
    const s = document.createElement("span");
    s.className = "star";
    s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    s.style.left = `${(Math.random() * 96 + 2).toFixed(1)}%`;
    s.style.top = `${(Math.random() * 96 + 2).toFixed(1)}%`;
    s.style.opacity = `${(0.06 + Math.random() * 0.12).toFixed(2)}`;
    s.style.fontSize = `${10 + Math.floor(Math.random() * 10)}px`;
    container.appendChild(s);
  }
}

spawnStars();

searchInput.addEventListener("input", (e) => runSearch(e.target.value));

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (visibleResults.length) {
      activeIndex = Math.min(activeIndex + 1, visibleResults.length - 1);
      renderResults();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (visibleResults.length) {
      activeIndex = Math.max(activeIndex - 1, 0);
      renderResults();
    }
  } else if (e.key === "Enter" && activeIndex >= 0) {
    e.preventDefault();
    goToLecture(visibleResults[activeIndex].id);
  } else if (e.key === "Escape") {
    closeResults();
  }
});

document.addEventListener("click", (e) => {
  if (!resultsRoot.contains(e.target) && e.target !== searchInput) {
    closeResults();
  }
});

async function init() {
  try {
    const res = await fetch("./data/lectures.json");
    lectures = (await res.json()).map((lecture) => ({
      ...lecture,
      _searchIndex: buildSearchIndex(lecture),
    }));
    if (lectureCountEl) {
      lectureCountEl.textContent = `${lectures.length} lecture${lectures.length !== 1 ? "s" : ""} in database`;
    }
    renderRecentCards(lectures.slice(0, 6));
  } catch (err) {
    console.error("Failed to load lectures:", err);
    if (lectureCountEl) lectureCountEl.textContent = "Failed to load.";
  }
}

init();
