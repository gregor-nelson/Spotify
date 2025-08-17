// === CONFIG ===
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || "f4078cfbffc04336869dbcee75c9f991"; // fallback for dev
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || "http://127.0.0.1:5173/";
const SCOPES = ["user-top-read", "user-library-read"]; // Phase 3: added library access

// === STATE ===
const app = {
  token: null,
  market: "GB",
  settings: { 
    popularityBias: 35, // 0..100 — lower favors obscure
    freshnessDays: 30   // days for new releases
  },
  cache: {
    topArtists: null,         // { at, items }
    topArtistIds: new Set(),
    topTracks: null,          // { at, items }
    savedTracks: null,        // { at, items }
    audio: null,
  },
  taste: null,                // { features: {...}, genres: [...] }
  lastResults: [],
  lastResultsWithObscurity: null, // cached results with obscurity scores
  originalResults: [],        // backup for sort toggle
  time: {
    years: [],          // [{ year: 2017, count: 42 }, ...] histogram from saved tracks
    selectedYear: null, // chosen year for Then → Now
    lastPairs: []       // [{ thenTrack, nowTracks: [..] }, ...]
  },
  obscurity: {
    weights: { pop: 0.7, followers: 0.3 },
    minScore: 0,        // UI slider threshold (0..100)
  },
};

// === COMPONENTS ===
let moodDiscovery; // MoodDiscovery component instance

// Import mobile components
import { mobileCarousel, mobileResults, isMobileDevice } from './mobile.js';

// === BOOT ===
document.addEventListener("DOMContentLoaded", () => {
  // Table-driven UI element acquisition
  const UI_ELEMENTS = {
    loginBtn: "loginBtn",
    logoutBtn: "logoutBtn", 
    authStatus: "authStatus",
    checkBtn: "checkBtn",
    popBias: "popBias",
    popBiasVal: "popBiasValue",
    popBiasLbl: "popBiasLabel",
    freshnessDays: "freshnessDays",
    freshnessDaysVal: "freshnessDaysValue",
    runGenre: "runGenre",
    runGap: "runGap", 
    runGraph: "runGraph",
    runFreshness: "runFreshness",
    seedArtist: "seedArtist",
    marketSel: "market",
    buildDNA: "buildDNA",
    rebuildDNA: "rebuildDNA",
    sortByDNA: "sortByDNA",
    moodEnergetic: "moodEnergetic",
    moodChill: "moodChill",
    moodMelancholic: "moodMelancholic",
    moodEuphoric: "moodEuphoric",
    moodContemplative: "moodContemplative",
    moodAggressive: "moodAggressive",
    moodRomantic: "moodRomantic",
    moodFocus: "moodFocus",
    moodNostalgic: "moodNostalgic",
    moodParty: "moodParty",
    moodPeaceful: "moodPeaceful",
    moodDramatic: "moodDramatic",
    runTimeMachine: "runTimeMachine",
    yearSelect: "yearSelect",
    obscuritySlider: "obscuritySlider",
    obscurityValue: "obscurityValue"
  };

  const ui = {};
  for (const [key, id] of Object.entries(UI_ELEMENTS)) {
    ui[key] = document.getElementById(id);
  }

  try {
    const saved = JSON.parse(localStorage.getItem("pd.settings") || "{}");
    Object.assign(app.settings, saved);
    ui.popBias.value = app.settings.popularityBias;
    ui.popBiasVal.textContent = String(app.settings.popularityBias);
    ui.freshnessDays.value = app.settings.freshnessDays;
    ui.freshnessDaysVal.textContent = String(app.settings.freshnessDays);
    ui.obscuritySlider.value = app.obscurity.minScore;
    ui.obscurityValue.textContent = String(app.obscurity.minScore);
    updatePopLabel();
  } catch {}

  ui.marketSel.value = app.market;

  // Table-driven event handler registration
  const UI_HANDLERS = {
    marketSel: { event: "change", handler: () => app.market = ui.marketSel.value },
    popBias: { 
      event: "input", 
      handler: () => Settings.updatePopBias(ui.popBias.value, { valueElement: 'popBiasValue' })
    },
    freshnessDays: {
      event: "input",
      handler: () => Settings.updateFreshnessDays(ui.freshnessDays.value, { valueElement: 'freshnessDaysValue' })
    },
    loginBtn: { event: "click", handler: loginWithPKCE },
    logoutBtn: { 
      event: "click", 
      handler: () => {
        sessionStorage.removeItem("pd.token");
        location.href = REDIRECT_URI;
      }
    },
    checkBtn: { event: "click", handler: handleCheckAPI },
    runGenre: { event: "click", handler: handleRunGenreDiscovery },
    runGap: { event: "click", handler: handleRunGap },
    runGraph: { event: "click", handler: handleRunGraphExplorer },
    runFreshness: { event: "click", handler: handleRunFreshness },
    buildDNA: { event: "click", handler: handleBuildTasteDNA },
    rebuildDNA: { 
      event: "click", 
      handler: () => {
        app.taste = null;
        handleBuildTasteDNA();
      }
    },
    sortByDNA: { event: "change", handler: handleDNASortToggle },
    moodEnergetic: { event: "click", handler: () => handleMoodDiscovery("energetic") },
    moodChill: { event: "click", handler: () => handleMoodDiscovery("chill") },
    moodMelancholic: { event: "click", handler: () => handleMoodDiscovery("melancholic") },
    moodEuphoric: { event: "click", handler: () => handleMoodDiscovery("euphoric") },
    moodContemplative: { event: "click", handler: () => handleMoodDiscovery("contemplative") },
    moodAggressive: { event: "click", handler: () => handleMoodDiscovery("aggressive") },
    moodRomantic: { event: "click", handler: () => handleMoodDiscovery("romantic") },
    moodFocus: { event: "click", handler: () => handleMoodDiscovery("focus") },
    moodNostalgic: { event: "click", handler: () => handleMoodDiscovery("nostalgic") },
    moodParty: { event: "click", handler: () => handleMoodDiscovery("party") },
    moodPeaceful: { event: "click", handler: () => handleMoodDiscovery("peaceful") },
    moodDramatic: { event: "click", handler: () => handleMoodDiscovery("dramatic") },
    runTimeMachine: { event: "click", handler: handleRunTimeMachine },
    obscuritySlider: { event: "input", handler: handleObscurityFilter }
  };

  for (const [elementKey, config] of Object.entries(UI_HANDLERS)) {
    if (ui[elementKey]) {
      ui[elementKey].addEventListener(config.event, config.handler);
    }
  }

  // Initialize MoodDiscovery component
  moodDiscovery = new MoodDiscovery({
    app,
    api,
    getPaged,
    ensureTopArtists,
    setNewResults,
    renderTracks,
    skeleton
  });

  completeAuthIfReturning().then(async () => {
    app.token = sessionStorage.getItem("pd.token");
    updateAuthUI();
    if (app.token) {
      try { 
        await ensureTopArtists(); 
        populateArtistDropdown();
        await loadSavedTracksAndPopulateYears();
      } catch (e) { toast(e.message); }
    }
  });

  function updatePopLabel() {
    const v = app.settings.popularityBias;
    const label = v <= 25 ? "Obscure" : v <= 60 ? "Balanced" : "Popular";
    Status.updateElement("popBiasLabel", label);
  }
  function updateAuthUI() {
    const has = !!app.token;
    document.getElementById("loginBtn").classList.toggle("hidden", has);
    document.getElementById("logoutBtn").classList.toggle("hidden", !has);
    document.getElementById("authStatus").textContent = has ? "Connected" : "Not connected";
  }

  // Make functions globally accessible
  window.updateAuthUI = updateAuthUI;
  window.updatePopLabel = updatePopLabel;
});

// === AUTH (PKCE minimal) ===
async function loginWithPKCE() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = await pkceChallengeFromVerifier(verifier);
  sessionStorage.setItem("pd.pkce_verifier", verifier);

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("show_dialog", "false");
  location.href = url.toString();
}

async function completeAuthIfReturning() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return;
  const verifier = sessionStorage.getItem("pd.pkce_verifier");
  if (!verifier) return;

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.error("Token exchange failed", await res.text());
    return;
  }
  const json = await res.json();
  sessionStorage.setItem("pd.token", json.access_token);
  history.replaceState({}, "", REDIRECT_URI);
}

async function pkceChallengeFromVerifier(v) {
  const input = new TextEncoder().encode(v);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return base64UrlEncode(new Uint8Array(digest));
}
function base64UrlEncode(uint8Arr) {
  let s = btoa(String.fromCharCode(...uint8Arr));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// === API WRAPPER ===
async function api(path, params = {}) {
  if (!app.token) throw new Error("Not authenticated");
  const url = new URL(`https://api.spotify.com/v1${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  
  const doFetch = () => fetch(url, { headers: { Authorization: `Bearer ${app.token}` } });
  let res = await doFetch();
  
  // Handle rate limiting (429)
  if (res.status === 429) {
    const ra = Number(res.headers.get("Retry-After") || "1");
    await new Promise(r => setTimeout(r, (ra + 0.1) * 1000));
    res = await doFetch();
  }
  
  // Handle token expiry (401)
  if (res.status === 401) {
    sessionStorage.removeItem("pd.token");
    app.token = null;
    window.updateAuthUI();
    throw new Error("Session expired. Please reconnect to Spotify.");
  }
  
  // Handle server errors (5xx) with exponential backoff
  if (res.status >= 500 && res.status < 600) {
    let retryAttempts = 0;
    const maxRetries = 2;
    
    while (retryAttempts < maxRetries) {
      const backoffMs = Math.min(1000 * Math.pow(2, retryAttempts), 5000); // cap at 5s
      await new Promise(r => setTimeout(r, backoffMs));
      
      res = await doFetch();
      retryAttempts++;
      
      if (res.status < 500 || res.status >= 600) {
        break; // Success or non-5xx error, stop retrying
      }
    }
  }
  
  if (!res.ok) {
    let body = "";
    try { 
      const clonedRes = res.clone();
      body = JSON.stringify(await clonedRes.json()); 
    } catch { 
      body = await res.text(); 
    }
    throw new Error(`${res.status} on ${url.pathname}: ${body}`);
  }
  return res.json();
}

async function getPaged(firstPage) {
  const all = Array.isArray(firstPage.items) ? [...firstPage.items] : [];
  let next = firstPage.next;
  while (next) {
    try {
      // Use resilient api() wrapper but need to construct relative path from full URL
      const url = new URL(next);
      const relativePath = url.pathname + url.search;
      const json = await api(relativePath.replace('/v1', ''));
      if (Array.isArray(json.items)) all.push(...json.items);
      next = json.next;
    } catch (e) {
      console.warn("Pagination failed:", e.message);
      break; // Stop pagination on error
    }
  }
  return all;
}

// === CHECK ===
async function handleCheckAPI() {
  try {
    const me = await api("/me");
    toast(`Hello ${me.display_name || me.id}`);
    const top = await api("/me/top/artists", { limit: 10, time_range: "medium_term" });
    toast(`Top artists returned: ${(top.items || []).length}`);
    // NOTE: /recommendations and related-artists are intentionally not called here (restricted for new apps).
  } catch (e) {
    toast(e.message);
    console.error(e);
  }
}

// === CORE DATA ===
async function ensureTopArtists() {
  if (app.cache.topArtists) {
    // Ensure topArtistIds is populated even if topArtists cache exists
    if (!app.cache.topArtistIds || app.cache.topArtistIds.size === 0) {
      app.cache.topArtistIds = new Set(app.cache.topArtists.items.map(a => a.id));
    }
    return app.cache.topArtists.items;
  }
  
  const page = await api("/me/top/artists", { limit: 50, time_range: "medium_term" });
  const items = await getPaged(page);
  app.cache.topArtists = { at: Date.now(), items };
  app.cache.topArtistIds = new Set(items.map(a => a.id));
  return items;
}

async function ensureTopTracks() {
  if (app.cache.topTracks) return app.cache.topTracks.items;
  const page = await api("/me/top/tracks", { limit: 50, time_range: "long_term" });
  const items = await getPaged(page);
  app.cache.topTracks = { at: Date.now(), items };
  return items;
}

// === SAVED TRACKS & YEAR HISTOGRAM ===
const USE_RECS = false; // Toggle between Standard vs Restricted-friendly mode

async function loadSavedTracks() {
  if (app.cache.savedTracks) return app.cache.savedTracks.items;
  
  try {
    const page = await api("/me/tracks", { limit: 50 });
    const items = await getPaged(page);
    
    // Store minimal fields: track id, artists[], album.release_date, added_at
    const minimal = items.map(item => ({
      track: {
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists,
        album: {
          release_date: item.track.album.release_date,
          name: item.track.album.name
        },
        popularity: item.track.popularity
      },
      added_at: item.added_at
    })).filter(item => item.track.id); // filter out null tracks
    
    app.cache.savedTracks = { at: Date.now(), items: minimal };
    return minimal;
  } catch (e) {
    console.warn("Could not load saved tracks:", e.message);
    return [];
  }
}

function buildYearBuckets(savedTracks) {
  const yearCounts = new Map();
  
  for (const item of savedTracks) {
    // Try album release_date first, fallback to added_at year
    let year = null;
    if (item.track.album?.release_date) {
      year = parseInt(item.track.album.release_date.substring(0, 4));
    } else if (item.added_at) {
      year = new Date(item.added_at).getFullYear();
    }
    
    if (year && year > 1900 && year <= new Date().getFullYear()) {
      yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
    }
  }
  
  return [...yearCounts.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.count - a.count); // most dense years first
}

async function loadSavedTracksAndPopulateYears() {
  try {
    const savedTracks = await loadSavedTracks();
    if (!savedTracks.length) return;
    
    app.time.years = buildYearBuckets(savedTracks);
    populateYearDropdown();
  } catch (e) {
    console.warn("Error loading saved tracks:", e.message);
  }
}

function populateYearDropdown() {
  const yearSelect = document.getElementById("yearSelect");
  if (!yearSelect || !app.time.years.length) return;
  
  yearSelect.innerHTML = '<option value="">Select a year...</option>';
  
  // Show top 12 most dense years
  for (const { year, count } of app.time.years.slice(0, 12)) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = `${year} (${count} tracks)`;
    yearSelect.appendChild(option);
  }
  
  // Auto-select most dense year
  if (app.time.years.length > 0) {
    app.time.selectedYear = app.time.years[0].year;
    yearSelect.value = app.time.selectedYear;
  }
}

// === PHASE 3: TIME-MACHINE PAIRS ("Then → Now") ===
async function handleRunTimeMachine() {
  const resultsEl = document.getElementById("results");
  const statsEl = document.getElementById("timeMachineStats");
  const yearSelect = document.getElementById("yearSelect");
  
  try {
    const selectedYear = parseInt(yearSelect.value);
    if (!selectedYear) {
      toast("Please select a year first");
      return;
    }
    
    resultsEl.innerHTML = skeleton("Building Then → Now pairs...");
    statsEl.textContent = "";
    
    const savedTracks = await loadSavedTracks();
    if (!savedTracks.length) {
      throw new Error("Add 'Saved Songs' to use Time-Machine");
    }
    
    // Filter tracks from the selected year (or neighboring years if too few)
    let thenTracks = savedTracks.filter(item => {
      if (!item.track.album?.release_date) return false;
      const year = parseInt(item.track.album.release_date.substring(0, 4));
      return year === selectedYear;
    });
    
    // If <3 tracks, widen to neighboring years ±1
    if (thenTracks.length < 3) {
      thenTracks = savedTracks.filter(item => {
        if (!item.track.album?.release_date) return false;
        const year = parseInt(item.track.album.release_date.substring(0, 4));
        return Math.abs(year - selectedYear) <= 1;
      });
    }
    
    if (thenTracks.length < 3) {
      throw new Error(`Not enough tracks from ${selectedYear}. Try a different year.`);
    }
    
    // Pick 3 "then" tracks (random for MVP)
    const shuffled = [...thenTracks].sort(() => Math.random() - 0.5);
    const pickedThenTracks = shuffled.slice(0, 3).map(item => item.track);
    
    resultsEl.innerHTML = skeleton("Finding modern analogs...");
    
    // For each "then" track, find "now" analogs using metadata
    const pairs = [];
    for (const thenTrack of pickedThenTracks) {
      const nowTracks = await findNowAnalogs(thenTrack);
      if (nowTracks.length > 0) {
        pairs.push({ thenTrack, nowTracks });
      }
    }
    
    app.time.lastPairs = pairs;
    renderTimeMachinePairs(pairs);
    
    statsEl.textContent = `${pairs.length} Then → Now pairs from ${selectedYear}`;
    
  } catch (e) {
    toast(e.message);
    console.error(e);
    resultsEl.innerHTML = "";
  }
}

function isReleaseDateAfter(releaseDate, releaseDatePrecision, cutoffStr) {
  if (!releaseDate) return false;
  
  // Handle different precisions
  const precision = releaseDatePrecision || 'day';
  const cutoffDate = new Date(cutoffStr);
  
  if (precision === 'year') {
    const releaseYear = parseInt(releaseDate);
    const cutoffYear = cutoffDate.getFullYear();
    return releaseYear >= cutoffYear;
  } else if (precision === 'month') {
    const releaseYearMonth = releaseDate + '-01'; // pad to full date
    return new Date(releaseYearMonth) >= cutoffDate;
  } else {
    // day precision or fallback
    return new Date(releaseDate) >= cutoffDate;
  }
}

async function findNowAnalogs(thenTrack) {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 24); // default 24 months
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  
  let candidates = [];
  
  if (USE_RECS) {
    // Standard mode: use recommendations
    try {
      const res = await api("/recommendations", {
        seed_tracks: thenTrack.id,
        limit: "30",
        market: app.market
      });
      
      // Filter to recent albums
      candidates = (res.tracks || []).filter(track => {
        return isReleaseDateAfter(track.album?.release_date, track.album?.release_date_precision, cutoffStr);
      });
    } catch (e) {
      console.warn("Recommendations failed, falling back to search:", e.message);
      candidates = await findNowAnalogsViaSearch(thenTrack, cutoffStr);
    }
  } else {
    // Restricted-friendly mode: use search
    candidates = await findNowAnalogsViaSearch(thenTrack, cutoffStr);
  }
  
  if (candidates.length === 0) {
    // Relax window to 36 months total (additional 12 months beyond the original 24)
    const relaxedCutoffDate = new Date();
    relaxedCutoffDate.setMonth(relaxedCutoffDate.getMonth() - 36); // 36 months total
    const relaxedCutoffStr = relaxedCutoffDate.toISOString().split('T')[0];
    
    if (USE_RECS) {
      try {
        const res = await api("/recommendations", {
          seed_tracks: thenTrack.id,
          limit: "30",
          market: app.market
        });
        candidates = (res.tracks || []).filter(track => {
          return track.album?.release_date >= relaxedCutoffStr;
        });
      } catch (e) {
        candidates = await findNowAnalogsViaSearch(thenTrack, relaxedCutoffStr);
      }
    } else {
      candidates = await findNowAnalogsViaSearch(thenTrack, relaxedCutoffStr);
    }
  }
  
  if (candidates.length === 0) {
    return [];
  }
  
  // Rank candidates by metadata similarity (batch fetch artist data first)
  const candidateSlice = candidates.slice(0, 30);
  const artistIds = new Set();
  
  // Collect all unique artist IDs
  const thenArtistId = thenTrack.artists?.[0]?.id;
  if (thenArtistId) artistIds.add(thenArtistId);
  
  for (const candidate of candidateSlice) {
    const nowArtistId = candidate.artists?.[0]?.id;
    if (nowArtistId) artistIds.add(nowArtistId);
  }
  
  // Batch fetch artist data using unified helper
  const artistData = await batchFetchArtistsByIds(artistIds);
  
  // Calculate similarity using cached data
  const scoredCandidates = candidateSlice.map(candidate => {
    const similarity = calculateMetadataSimilarityWithCache(thenTrack, candidate, artistData);
    return { track: candidate, similarity };
  });
  
  // Return top 2 matches
  return scoredCandidates
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 2)
    .map(item => item.track);
}

async function findNowAnalogsViaSearch(thenTrack, cutoffStr) {
  // Get main artist's genres
  const mainArtist = thenTrack.artists?.[0];
  if (!mainArtist?.id) return [];
  
  try {
    const artistRes = await api(`/artists/${mainArtist.id}`);
    const genres = artistRes.genres || [];
    
    if (!genres.length) return [];
    
    // Use the first genre for search
    const genre = genres[0];
    const currentYear = new Date().getFullYear();
    const startYear = new Date(cutoffStr).getFullYear();
    
    const searchRes = await api("/search", {
      q: `genre:"${genre.replace(/"/g, '\\"')}" year:${startYear}-${currentYear}`,
      type: "track",
      limit: "50",
      market: app.market
    });
    
    return searchRes.tracks?.items || [];
    
  } catch (e) {
    console.warn("Search for analogs failed:", e.message);
    return [];
  }
}

function calculateMetadataSimilarityWithCache(thenTrack, nowTrack, artistData) {
  let similarity = 0;
  
  // Get artist genres for both tracks from cache
  const thenArtistId = thenTrack.artists?.[0]?.id;
  const nowArtistId = nowTrack.artists?.[0]?.id;
  
  let thenGenres = [];
  let nowGenres = [];
  
  if (thenArtistId && artistData.has(thenArtistId)) {
    thenGenres = artistData.get(thenArtistId).genres || [];
  }
  if (nowArtistId && artistData.has(nowArtistId)) {
    nowGenres = artistData.get(nowArtistId).genres || [];
  }
  
  // Genre overlap score (0-1)
  const genreOverlap = thenGenres.length > 0 && nowGenres.length > 0 ? 
    thenGenres.filter(g => nowGenres.includes(g)).length / Math.max(thenGenres.length, nowGenres.length) : 0;
  
  // Popularity proximity score (0-1, closer = higher)
  const thenPop = thenTrack.popularity || 50;
  const nowPop = nowTrack.popularity || 50;
  const popProximity = 1 - Math.abs(thenPop - nowPop) / 100;
  
  // Release year distance (prefer not too recent, not too old)
  const thenYear = thenTrack.album?.release_date ? parseInt(thenTrack.album.release_date.substring(0, 4)) : 2010;
  const nowYear = nowTrack.album?.release_date ? parseInt(nowTrack.album.release_date.substring(0, 4)) : new Date().getFullYear();
  const yearGap = Math.abs(nowYear - thenYear);
  const yearScore = yearGap > 2 ? Math.max(0, 1 - (yearGap - 2) / 20) : 0.8; // prefer some time gap
  
  // Weighted combination
  similarity = (genreOverlap * 0.6) + (popProximity * 0.2) + (yearScore * 0.2);
  
  return similarity;
}

// Removed: calculateMetadataSimilarity - duplicate of calculateMetadataSimilarityWithCache
// The cached version is more efficient and should be used instead

function renderTimeMachinePairs(pairs) {
  const el = document.getElementById("results");
  el.innerHTML = "";
  
  if (!pairs.length) {
    el.innerHTML = skeleton("No Then → Now pairs found");
    return;
  }
  
  ensureAudio();
  
  pairs.forEach((pair, pairIndex) => {
    const pairDiv = document.createElement("div");
    pairDiv.className = "border-b border-zinc-800 last:border-b-0";
    
    // Then track
    const thenDiv = document.createElement("div");
    thenDiv.className = "p-3 bg-zinc-900/30";
    thenDiv.innerHTML = `
      <div class="text-sm font-medium text-orange-400 mb-2">Then (${pair.thenTrack.album?.release_date?.substring(0, 4) || 'Unknown'}):</div>
    `;
    
    const thenTrackDiv = createTrackRow(pair.thenTrack, `${pairIndex}-then`);
    thenDiv.appendChild(thenTrackDiv);
    
    // Now tracks
    const nowDiv = document.createElement("div");
    nowDiv.className = "p-3";
    nowDiv.innerHTML = `<div class="text-sm font-medium text-emerald-400 mb-2">Now:</div>`;
    
    pair.nowTracks.forEach((nowTrack, nowIndex) => {
      const nowTrackDiv = createTrackRow(nowTrack, `${pairIndex}-now-${nowIndex}`);
      nowDiv.appendChild(nowTrackDiv);
    });
    
    pairDiv.append(thenDiv, nowDiv);
    el.appendChild(pairDiv);
  });
}

function createTrackRow(track, id, index = null) {
  const row = document.createElement("div");
  row.className = index !== null ? 
    "grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center py-2" : 
    "grid grid-cols-[auto_1fr_auto] gap-3 items-center py-2";
  
  const artwork = document.createElement("div");
  artwork.className = "w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0";
  const albumImage = track.album?.images?.[2] || track.album?.images?.[1] || track.album?.images?.[0];
  if (albumImage) {
    artwork.innerHTML = `<img src="${albumImage.url}" alt="Album art" class="w-full h-full object-cover" loading="lazy">`;
  } else {
    artwork.innerHTML = `<div class="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs">♪</div>`;
  }
  
  const main = document.createElement("div");
  const artistNames = (track.artists || []).map(a => a.name).join(", ");
  main.innerHTML = `
    <div class="font-medium truncate text-sm">${escapeHtml(track.name)} — <span class="text-zinc-400">${escapeHtml(artistNames)}</span></div>
    <div class="text-xs text-zinc-500 mt-0.5">
      <span class="px-1.5 py-0.5 rounded bg-zinc-800/70">pop ${track.popularity ?? 0}</span>
    </div>
  `;
  
  const actions = document.createElement("div");
  actions.className = "flex items-center gap-1";
  
  const previewBtn = document.createElement("button");
  previewBtn.className = "px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs disabled:opacity-50";
  previewBtn.textContent = track.preview_url ? "Preview" : "No preview";
  previewBtn.disabled = !track.preview_url;
  previewBtn.addEventListener("click", () => playPreview(track.preview_url, previewBtn));
  
  const openBtn = document.createElement("a");
  openBtn.className = "px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs";
  openBtn.href = track.external_urls?.spotify || "#";
  openBtn.target = "_blank";
  openBtn.rel = "noopener";
  openBtn.textContent = "Open";
  
  actions.append(previewBtn, openBtn);
  
  // Add elements based on whether index is provided
  if (index !== null) {
    const idx = document.createElement("div");
    idx.className = "text-zinc-500 text-sm w-6 text-right";
    idx.textContent = String(index);
    row.append(idx, artwork, main, actions);
  } else {
    row.append(artwork, main, actions);
  }
  
  return row;
}

// === PHASE 3: OBSCURITY BADGES & FILTER ===
async function handleObscurityFilter() {
  const slider = document.getElementById("obscuritySlider");
  const statsSpan = document.getElementById("obscurityStats");
  
  Settings.updateObscurity(slider.value, { valueElement: 'obscurityValue' });
  
  if (!app.lastResults.length) {
    Status.updateElement(statsSpan, "No results to filter");
    return;
  }
  
  // Apply filter to current results
  await applyObscurityFilter();
}

async function applyObscurityFilter() {
  if (!app.lastResults.length) return;
  
  const statsSpan = document.getElementById("obscurityStats");
  
  try {
    // Use cached obscurity scores if available, otherwise calculate
    let tracksWithObscurity = app.lastResultsWithObscurity;
    if (!tracksWithObscurity) {
      tracksWithObscurity = await calculateObscurityScores(app.lastResults);
      app.lastResultsWithObscurity = tracksWithObscurity;
    }
    
    // Filter by minimum obscurity threshold
    const filtered = tracksWithObscurity.filter(item => 
      item.obscurityScore >= app.obscurity.minScore
    );
    
    // Update stats
    statsSpan.textContent = filtered.length ? 
      `${filtered.length}/${app.lastResults.length} tracks (min obscurity ${app.obscurity.minScore})` :
      "No tracks at this threshold";
    
    // Render filtered results with obscurity badges
    renderTracksWithObscurity(filtered);
    
  } catch (e) {
    console.warn("Error applying obscurity filter:", e.message);
    statsSpan.textContent = "Error calculating obscurity";
  }
}

async function calculateObscurityScores(tracks) {
  if (!tracks.length) return [];
  
  // Build unique set of artist IDs
  const artistIds = new Set();
  for (const track of tracks) {
    for (const artist of track.artists || []) {
      if (artist.id) artistIds.add(artist.id);
    }
  }
  
  // Fetch artist data using unified batching helper
  const artistData = await batchFetchArtistsByIds(artistIds);
  
  // Calculate min/max followers for normalization
  const followerCounts = [...artistData.values()]
    .map(a => a.followers?.total || 0)
    .filter(f => f > 0);
  
  const minFollowers = followerCounts.length ? Math.min(...followerCounts) : 0;
  const maxFollowers = followerCounts.length ? Math.max(...followerCounts) : 1;
  
  // Calculate obscurity for each track
  return tracks.map(track => {
    const trackPop = track.popularity ?? 50; // default if missing
    let followerScore = 0;
    
    // Get main artist followers (use first artist)
    const mainArtist = track.artists?.[0];
    if (mainArtist?.id && artistData.has(mainArtist.id)) {
      const artist = artistData.get(mainArtist.id);
      const followers = artist.followers?.total || 0;
      
      if (maxFollowers > minFollowers) {
        // Normalize followers (0 to 1, then invert so fewer followers = higher score)
        const normalized = (followers - minFollowers) / (maxFollowers - minFollowers);
        followerScore = (1 - normalized) * 100;
      } else {
        followerScore = 50; // fallback if no range
      }
    } else {
      followerScore = 50; // fallback if no artist data
    }
    
    // Calculate final obscurity score
    const weights = app.obscurity.weights;
    const obscurityScore = Math.round(
      weights.pop * (100 - trackPop) + 
      weights.followers * followerScore
    );
    
    return {
      ...track,
      obscurityScore,
      followerScore: Math.round(followerScore),
      hasFollowerData: mainArtist?.id && artistData.has(mainArtist.id)
    };
  });
}

function renderTracksWithObscurity(tracksWithObscurity) {
  const el = document.getElementById("results");
  el.innerHTML = "";
  
  if (!tracksWithObscurity.length) {
    el.innerHTML = skeleton("No tracks match the obscurity threshold");
    return;
  }
  
  ensureAudio();
  
  tracksWithObscurity.forEach((track, i) => {
    const row = document.createElement("div");
    row.className = "p-3 hover:bg-zinc-900/50 grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center";

    const idx = document.createElement("div");
    idx.className = "text-zinc-500 text-sm w-6 text-right";
    idx.textContent = String(i + 1);

    const artwork = document.createElement("div");
    artwork.className = "w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0";
    const albumImage = track.album?.images?.[2] || track.album?.images?.[1] || track.album?.images?.[0];
    if (albumImage) {
      artwork.innerHTML = `<img src="${albumImage.url}" alt="Album art" class="w-full h-full object-cover" loading="lazy">`;
    } else {
      artwork.innerHTML = `<div class="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs">♪</div>`;
    }

    const main = document.createElement("div");
    const artistNames = (track.artists || []).map(a => a.name).join(", ");
    
    // Create obscurity badge with tooltip
    const obscurityBadge = track.hasFollowerData ? 
      `<span class="px-1.5 py-0.5 rounded bg-red-900/70 text-red-200" title="Obscurity score based on popularity + follower count">obscurity ${track.obscurityScore}</span>` :
      `<span class="px-1.5 py-0.5 rounded bg-red-900/50 text-red-300" title="Obscurity score (pop-only, follower data unavailable)">obscurity ${track.obscurityScore}</span>`;
    
    main.innerHTML = `
      <div class="font-medium truncate">${escapeHtml(track.name)} — <span class="text-zinc-400">${escapeHtml(artistNames)}</span></div>
      <div class="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
        <span class="px-1.5 py-0.5 rounded bg-zinc-800/70">pop ${track.popularity ?? 0}</span>
        ${obscurityBadge}
        ${track.album?.release_date ? `<span class="px-1.5 py-0.5 rounded bg-zinc-800/70">${track.album.release_date}</span>` : ""}
        ${track.album?.name ? `<span class="px-1.5 py-0.5 rounded bg-zinc-800/70 truncate max-w-32">${escapeHtml(track.album.name)}</span>` : ""}
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2";
    const previewBtn = document.createElement("button");
    previewBtn.className = "px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm disabled:opacity-50";
    previewBtn.textContent = track.preview_url ? "Preview" : "No preview";
    previewBtn.disabled = !track.preview_url;
    previewBtn.addEventListener("click", () => playPreview(track.preview_url, previewBtn));

    const openBtn = document.createElement("a");
    openBtn.className = "px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm";
    openBtn.href = track.external_urls?.spotify || "#";
    openBtn.target = "_blank";
    openBtn.rel = "noopener";
    openBtn.textContent = "Open";

    actions.append(previewBtn, openBtn);
    row.append(idx, artwork, main, actions);
    el.appendChild(row);
  });

  // Update mobile results if on mobile
  if (isMobileDevice() && mobileResults) {
    mobileResults.scrollToTop();
  }
}

// === FEATURE A: GENRE-DRIVEN DISCOVERY (no /recommendations) ===
async function handleRunGenreDiscovery() {
  const resultsEl = document.getElementById("results");
  const statsEl = document.getElementById("genreStats");
  try {
    resultsEl.innerHTML = skeleton("Mining your top genres…");

    const top = await ensureTopArtists();
    if (!top.length) throw new Error("No top artists returned by Spotify.");

    // Build genre frequency map from your top artists
    const freq = new Map();
    for (const a of top) for (const g of a.genres || []) freq.set(g, (freq.get(g) || 0) + 1);

    const sortedGenres = [...freq.entries()].sort((a,b)=>b[1]-a[1]).map(([g])=>g);
    const core = sortedGenres.slice(0, 4); // up to 4 core genres
    if (!core.length) throw new Error("Your top artists have no genre tags.");

    // For each genre, search artists in that genre (avoid your top artists), gather candidates
    const maxPerGenre = 15;
    const candidates = new Map(); // id -> artist
    for (const g of core) {
      // offset randomization for variety
      const offset = Math.floor(Math.random() * 30);
      // q=genre:"xxx" is documented for Search
      const res = await api("/search", {
        q: `genre:"${g.replace(/"/g, '\\"')}"`,
        type: "artist",
        limit: String(maxPerGenre),
        offset: String(offset),
        market: app.market
      });
      const artists = res.artists?.items || [];
      for (const ar of artists) {
        if (app.cache.topArtistIds.has(ar.id)) continue; // skip already-top
        candidates.set(ar.id, ar);
      }
    }

    // Popularity bias: lower slider → favor lower popularity
    const bias = app.settings.popularityBias | 0; // 0..100
    const target = 100 - bias; // we want artists with popularity <= target
    const pool = [...candidates.values()]
      .sort((a,b)=>a.popularity - b.popularity) // low to high
      .filter(a => a.popularity <= target)
      .slice(0, 40);

    // For each artist, fetch one top track to preview/open
    resultsEl.innerHTML = skeleton("Fetching top tracks…");
    const tracks = [];
    for (const ar of pool) {
      try {
        const data = await api(`/artists/${ar.id}/top-tracks`, { market: app.market });
        const t = (data.tracks || [])[0];
        if (t) tracks.push(t);
        if (tracks.length >= 30) break;
      } catch (e) {
        // ignore per-artist errors
        console.warn("top-tracks error", ar.id, e.message);
      }
    }

    setNewResults(tracks);
    renderTracks(tracks);

    const median = Math.round(medianOf(tracks.map(t => t.popularity || 0)));
    statsEl.textContent = `Genres: ${core.slice(0,3).join(", ")} · Median pop: ${median}`;
  } catch (e) {
    toast(e.message);
    console.error(e);
    resultsEl.innerHTML = "";
  }
}

// === FEATURE B: GAP ANALYSIS (genre-overlap, no related-artists) ===
async function handleRunGap() {
  const gapList = document.getElementById("gapList");
  const gapStats = document.getElementById("gapStats");
  try {
    gapList.innerHTML = skeleton("Scanning genres for overlaps…");
    gapStats.textContent = "";

    const top = await ensureTopArtists();
    if (!top.length) {
      gapStats.textContent = "No top artists found for this account.";
      gapList.innerHTML = "";
      return;
    }

    // Build your genre set and frequency
    const yourGenres = new Map();
    for (const a of top) for (const g of a.genres || []) yourGenres.set(g, (yourGenres.get(g) || 0) + 1);

    const topGenres = [...yourGenres.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([g])=>g);

    // Search per genre, collect candidates and count how many of your top genres they share
    const bucket = new Map(); // id -> { artist, score }
    for (const g of topGenres) {
      // Add some randomization to get variety in results
      const offset = Math.floor(Math.random() * 20);
      const res = await api("/search", {
        q: `genre:"${g.replace(/"/g, '\\"')}"`,
        type: "artist",
        limit: "30",
        offset: String(offset),
        market: app.market
      });
      const artists = res.artists?.items || [];
      for (const ar of artists) {
        if (app.cache.topArtistIds.has(ar.id)) continue; // skip artists you already play
        
        // Calculate more sophisticated scoring
        const genreOverlap = (ar.genres || []).filter(x => yourGenres.has(x)).length;
        const genreWeight = yourGenres.get(g) || 1; // weight by how often you listen to this genre
        
        const entry = bucket.get(ar.id) || { artist: ar, score: 0, genres: ar.genres || [], overlap: 0 };
        entry.score += genreWeight * (genreOverlap + 1); // boost by genre frequency
        entry.overlap = genreOverlap;
        bucket.set(ar.id, entry);
      }
    }

    // Apply popularity bias and filter
    const bias = app.settings.popularityBias;
    const popTarget = 100 - bias;
    
    const ranked = [...bucket.values()]
      .filter(({ artist, overlap }) => overlap >= 2 && artist.popularity <= popTarget) // minimum 2 genre overlap + popularity filter
      .sort((a,b)=> (b.score - a.score) || (a.artist.popularity - b.artist.popularity)) // prefer overlap, then lower pop
      .slice(0, 24);

    gapStats.textContent = ranked.length ? `Found ${ranked.length} candidates` : "No candidates found";
    gapList.innerHTML = "";

    for (const { artist, score, overlap } of ranked) {
      const card = document.createElement("button");
      card.className = "text-left p-3 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/40";
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="font-medium truncate">${escapeHtml(artist.name)}</div>
          <div class="text-right">
            <span class="text-xs text-zinc-400">overlap ${overlap}</span>
            <div class="text-xs text-zinc-500">pop ${artist.popularity || 0}</div>
          </div>
        </div>
        <div class="mt-1 text-xs text-zinc-500 truncate">${(artist.genres || []).slice(0,3).join(", ")}</div>
      `;
      card.addEventListener("click", async () => {
        document.getElementById("results").innerHTML = skeleton("Fetching top track…");
        try {
          const data = await api(`/artists/${artist.id}/top-tracks`, { market: app.market });
          const t = (data.tracks || []);
          setNewResults(t.slice(0, 10));
          renderTracks(app.lastResults);
          scrollIntoViewSmooth(document.querySelector("#results"));
        } catch (e) {
          toast(e.message);
          document.getElementById("results").innerHTML = "";
        }
      });
      gapList.appendChild(card);
    }
  } catch (e) {
    toast(e.message);
    console.error(e);
    gapList.innerHTML = "";
  }
}

// === FEATURE C: ARTIST GRAPH EXPLORER (via genre search instead of related-artists) ===
async function handleRunGraphExplorer() {
  const resultsEl = document.getElementById("results");
  const statsEl = document.getElementById("graphStats");
  const seedSelect = document.getElementById("seedArtist");
  
  try {
    const seedId = seedSelect.value;
    if (!seedId) {
      toast("Please select an artist first");
      return;
    }

    resultsEl.innerHTML = skeleton("Exploring artist connections…");
    statsEl.textContent = "";

    const seedArtist = app.cache.topArtists.items.find(a => a.id === seedId);
    if (!seedArtist) throw new Error("Selected artist not found");

    // Use seed artist's genres to find related artists
    const seedGenres = seedArtist.genres || [];
    if (!seedGenres.length) throw new Error("Selected artist has no genre tags");

    const relatedCandidates = new Map();
    
    // Search for artists in each of the seed artist's genres
    for (const genre of seedGenres.slice(0, 3)) { // limit to top 3 genres
      const res = await api("/search", {
        q: `genre:"${genre.replace(/"/g, '\\"')}"`,
        type: "artist",
        limit: "30",
        market: app.market
      });
      
      const artists = res.artists?.items || [];
      for (const ar of artists) {
        if (ar.id === seedId || app.cache.topArtistIds.has(ar.id)) continue;
        
        // Score by genre overlap with seed artist
        const overlap = (ar.genres || []).filter(g => seedGenres.includes(g)).length;
        if (overlap > 0) {
          const existing = relatedCandidates.get(ar.id);
          if (!existing || existing.score < overlap) {
            relatedCandidates.set(ar.id, { artist: ar, score: overlap });
          }
        }
      }
    }

    // Sort by overlap score and popularity bias
    const bias = app.settings.popularityBias;
    const target = 100 - bias;
    const related = [...relatedCandidates.values()]
      .filter(({ artist }) => artist.popularity <= target)
      .sort((a, b) => (b.score - a.score) || (a.artist.popularity - b.artist.popularity))
      .slice(0, 20);

    if (!related.length) {
      resultsEl.innerHTML = skeleton("No related artists found with current settings");
      return;
    }

    // Get top tracks from related artists
    resultsEl.innerHTML = skeleton("Fetching tracks from related artists…");
    const tracks = [];
    for (const { artist } of related) {
      try {
        const data = await api(`/artists/${artist.id}/top-tracks`, { market: app.market });
        const topTrack = (data.tracks || [])[0];
        if (topTrack) tracks.push(topTrack);
        if (tracks.length >= 15) break;
      } catch (e) {
        console.warn("top-tracks error", artist.id, e.message);
      }
    }

    setNewResults(tracks);
    renderTracks(tracks);

    const avgOverlap = related.reduce((sum, r) => sum + r.score, 0) / related.length;
    statsEl.textContent = `From "${seedArtist.name}" · Avg overlap: ${avgOverlap.toFixed(1)}`;
  } catch (e) {
    toast(e.message);
    console.error(e);
    resultsEl.innerHTML = "";
  }
}

// === FEATURE D: FRESHNESS FOCUS (new releases) ===
async function handleRunFreshness() {
  const resultsEl = document.getElementById("results");
  const statsEl = document.getElementById("freshnessStats");
  
  try {
    resultsEl.innerHTML = skeleton("Scanning for new releases…");
    statsEl.textContent = "";

    const top = await ensureTopArtists();
    if (!top.length) throw new Error("No top artists found");

    const days = app.settings.freshnessDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const newTracks = [];
    let checkedArtists = 0;
    
    // Check each top artist for new releases with concurrency limiting
    const artistResults = await asyncConcurrencyLimit(
      top.slice(0, 20), // limit to top 20 artists
      async (artist, index) => {
        try {
          // Get recent albums/singles
          const albumsRes = await api(`/artists/${artist.id}/albums`, {
            include_groups: "album,single",
            market: app.market,
            limit: "10"
          });
          
          const recentAlbums = (albumsRes.items || [])
            .filter(album => isReleaseDateAfter(album.release_date, album.release_date_precision, cutoffStr))
            .slice(0, 3); // max 3 recent releases per artist

          // Get tracks from recent albums with concurrency limiting
          const albumResults = await asyncConcurrencyLimit(
            recentAlbums,
            async (album) => {
              try {
                const tracksRes = await api(`/albums/${album.id}/tracks`, {
                  market: app.market,
                  limit: "5"
                });
                
                const tracks = (tracksRes.items || []).slice(0, 2); // max 2 tracks per album
                return tracks.map(track => {
                  // Enrich with album data for display
                  track.album = {
                    name: album.name,
                    release_date: album.release_date,
                    id: album.id
                  };
                  return track;
                });
              } catch (e) {
                console.warn(`Error fetching tracks for album ${album.name}:`, e.message);
                return [];
              }
            },
            3 // Limit album track fetching to 3 concurrent requests
          );

          checkedArtists++;
          return albumResults.flat();
        } catch (e) {
          console.warn("albums error", artist.id, e.message);
          return [];
        }
      },
      3 // Limit artist processing to 3 concurrent requests
    );

    // Flatten results
    newTracks.push(...artistResults.flat());

    // Sort by release date (newest first)
    newTracks.sort((a, b) => (b.album?.release_date || "").localeCompare(a.album?.release_date || ""));

    setNewResults(newTracks.slice(0, 25));
    renderTracks(app.lastResults);

    statsEl.textContent = `${newTracks.length} new tracks · ${checkedArtists} artists checked`;
  } catch (e) {
    toast(e.message);
    console.error(e);
    resultsEl.innerHTML = "";
  }
}

// === PHASE 2: TASTE DNA ===
async function handleBuildTasteDNA() {
  const statusEl = document.getElementById("dnaStatus");
  const featuresEl = document.getElementById("dnaFeatures");
  
  try {
    // Check authentication first
    if (!app.token) {
      throw new Error("Please connect to Spotify first");
    }
    
    // Check if already built recently (cache for 1 hour)
    if (app.taste && app.taste.builtAt && (Date.now() - app.taste.builtAt) < 3600000) {
      displayTasteDNA();
      statusEl.textContent = "Built";
      featuresEl.classList.remove("hidden");
      document.getElementById("sortByDNA").disabled = false;
      document.getElementById("rebuildDNA").classList.remove("hidden");
      toast("Using cached Taste DNA (rebuild in 1 hour to refresh)");
      return;
    }
    
    statusEl.textContent = "Building...";
    
    // Fast fetch - just first page is enough for taste profiling
    statusEl.textContent = "Fetching your top music...";
    const [topTracksPage, topArtistsPage] = await Promise.all([
      api("/me/top/tracks", { limit: 50, time_range: "long_term" }),
      api("/me/top/artists", { limit: 50, time_range: "medium_term" })
    ]);
    
    const topTracks = topTracksPage.items || [];
    const topArtists = topArtistsPage.items || [];
    
    if (!topTracks.length) throw new Error("No top tracks found - try listening to more music on Spotify");
    
    statusEl.textContent = "Analyzing your taste...";
    
    // Build taste profile from metadata (no audio features needed)
    const genreFreq = new Map();
    const popularityScores = [];
    const releaseYears = [];
    
    // Extract genres and patterns from top artists
    for (const artist of topArtists) {
      for (const genre of artist.genres || []) {
        genreFreq.set(genre, (genreFreq.get(genre) || 0) + 1);
      }
    }
    
    // Extract patterns from top tracks
    for (const track of topTracks) {
      if (track.popularity) popularityScores.push(track.popularity);
      if (track.album?.release_date) {
        const year = parseInt(track.album.release_date.substring(0, 4));
        if (year > 1900) releaseYears.push(year);
      }
    }
    
    const topGenres = [...genreFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre]) => genre);
    
    // Calculate taste preferences
    const preferences = {
      avgPopularity: medianOf(popularityScores),
      obscurityPreference: 100 - medianOf(popularityScores), // inverse of popularity
      recentnessPreference: releaseYears.length ? (medianOf(releaseYears) - 1980) / (new Date().getFullYear() - 1980) : 0.5,
      genreDiversity: genreFreq.size,
      topGenreStrength: genreFreq.size > 0 ? Math.max(...genreFreq.values()) / topArtists.length : 0
    };
    
    // Store taste DNA with timestamp
    app.taste = {
      preferences,
      genres: topGenres,
      builtAt: Date.now()
    };
    
    // Update UI
    displayTasteDNA();
    statusEl.textContent = "Built";
    featuresEl.classList.remove("hidden");
    document.getElementById("sortByDNA").disabled = false;
    document.getElementById("rebuildDNA").classList.remove("hidden");
    
    toast("Taste DNA built successfully!");
    
  } catch (e) {
    toast(e.message);
    console.error(e);
    statusEl.textContent = "Error";
  }
}

function displayTasteDNA() {
  if (!app.taste) return;
  
  const { preferences, genres } = app.taste;
  
  // Update feature displays with taste preferences
  document.getElementById("dnaFeatureDanceability").textContent = (preferences.genreDiversity || 0).toFixed(0);
  document.getElementById("dnaFeatureEnergy").textContent = (preferences.topGenreStrength * 100 || 0).toFixed(0) + "%";
  document.getElementById("dnaFeatureAcousticness").textContent = (preferences.obscurityPreference || 0).toFixed(0);
  document.getElementById("dnaFeatureValence").textContent = (preferences.recentnessPreference * 100 || 0).toFixed(0) + "%";
  document.getElementById("dnaFeatureTempo").textContent = Math.round(preferences.avgPopularity || 0);
  
  // Update labels to match new data
  const labels = document.querySelectorAll('#dnaFeatures .grid > div span:first-child');
  if (labels[0]) labels[0].textContent = "Genre diversity:";
  if (labels[1]) labels[1].textContent = "Focus strength:";
  if (labels[2]) labels[2].textContent = "Obscurity pref:";
  if (labels[3]) labels[3].textContent = "Recency pref:";
  if (labels[4]) labels[4].textContent = "Avg popularity:";
  
  // Update genres display
  const genresEl = document.getElementById("dnaGenres");
  genresEl.innerHTML = "";
  for (const genre of genres.slice(0, 5)) {
    const chip = document.createElement("span");
    chip.className = "px-2 py-1 text-xs bg-zinc-800 rounded-full text-zinc-300";
    chip.textContent = genre;
    genresEl.appendChild(chip);
  }
}

function handleDNASortToggle() {
  const isEnabled = document.getElementById("sortByDNA").checked;
  
  if (isEnabled && app.lastResults.length && app.taste) {
    // Save original order before sorting
    if (!app.originalResults.length) {
      app.originalResults = [...app.lastResults];
    }
    sortResultsByDNASimilarity();
  } else if (!isEnabled && app.originalResults.length) {
    // Restore original order
    app.lastResults = [...app.originalResults];
    // Note: Keep cached obscurity scores since we're using the same tracks, just reordered
    renderTracks(app.lastResults);
    toast("Restored original order");
  }
}

async function sortResultsByDNASimilarity() {
  if (!app.taste || !app.lastResults.length) return;
  
  try {
    const resultsEl = document.getElementById("results");
    resultsEl.innerHTML = skeleton("Sorting by DNA similarity...");
    
    // Batch fetch all unique artist data first
    const artistIds = new Set();
    for (const track of app.lastResults) {
      const artistId = track.artists?.[0]?.id;
      if (artistId) artistIds.add(artistId);
    }
    
    // Batch fetch artist data using unified helper
    const artistData = await batchFetchArtistsByIds(artistIds);
    
    // Calculate similarity scores using cached artist data
    const scoredTracks = app.lastResults.map((track) => {
      const similarity = calculateTasteSimilarityWithCache(track, artistData);
      return { track, score: similarity };
    });
    
    scoredTracks.sort((a, b) => b.score - a.score);
    app.lastResults = scoredTracks.map(({ track }) => track); // Keep sorted results
    // Note: Keep cached obscurity scores since we're using the same tracks, just reordered
    
    renderTracks(app.lastResults);
    
    // Show similarity stats
    const avgSimilarity = scoredTracks.reduce((sum, t) => sum + t.score, 0) / scoredTracks.length;
    const maxSimilarity = Math.max(...scoredTracks.map(t => t.score));
    toast(`Sorted by taste similarity (avg: ${(avgSimilarity * 100).toFixed(0)}%, max: ${(maxSimilarity * 100).toFixed(0)}%)`);
    
  } catch (e) {
    toast("Error sorting by taste: " + e.message);
    console.error(e);
    renderTracks(app.lastResults); // fallback to original order
  }
}

function calculateTasteSimilarityWithCache(track, artistData) {
  const prefs = app.taste.preferences;
  const tasteGenres = app.taste.genres;
  let similarity = 0;
  
  // Popularity alignment
  const trackPop = track.popularity || 50;
  const popAlignment = 1 - Math.abs(trackPop - prefs.avgPopularity) / 100;
  similarity += popAlignment * 0.3;
  
  // Genre alignment using cached artist data
  const trackArtistId = track.artists?.[0]?.id;
  if (trackArtistId && artistData.has(trackArtistId)) {
    const artist = artistData.get(trackArtistId);
    const trackGenres = artist.genres || [];
    const genreOverlap = trackGenres.filter(g => tasteGenres.includes(g)).length;
    const genreAlignment = tasteGenres.length > 0 ? genreOverlap / tasteGenres.length : 0;
    similarity += genreAlignment * 0.5;
  }
  
  // Release year alignment (if recency preference exists)
  if (track.album?.release_date) {
    const trackYear = parseInt(track.album.release_date.substring(0, 4));
    const currentYear = new Date().getFullYear();
    const trackRecency = (trackYear - 1980) / (currentYear - 1980);
    const recencyAlignment = 1 - Math.abs(trackRecency - prefs.recentnessPreference);
    similarity += recencyAlignment * 0.2;
  }
  
  return similarity;
}

// Removed: calculateTasteSimilarity - duplicate of calculateTasteSimilarityWithCache  
// The cached version is more efficient and should be used instead


// === PHASE 2: MOOD DISCOVERY ===
// Mood discovery moved to mood-discovery.js component
async function handleMoodDiscovery(mood) {
  if (!moodDiscovery) {
    console.error("MoodDiscovery component not initialized");
    return;
  }
  return moodDiscovery.handleMoodDiscovery(mood);
}

// === MOOD DISCOVERY FUNCTIONS ===
// Mood discovery functions have been moved to mood-discovery.js component

// === HELPER: POPULATE ARTIST DROPDOWN ===
async function populateArtistDropdown() {
  const seedSelect = document.getElementById("seedArtist");
  if (!seedSelect || !app.cache.topArtists) return;
  
  seedSelect.innerHTML = '<option value="">Select an artist...</option>';
  
  for (const artist of app.cache.topArtists.items.slice(0, 20)) {
    const option = document.createElement("option");
    option.value = artist.id;
    option.textContent = artist.name;
    seedSelect.appendChild(option);
  }
}

// === RENDERING ===
function renderTracks(tracks) {
  const el = document.getElementById("results");
  el.innerHTML = "";
  if (!tracks || !tracks.length) {
    const noResultsHtml = `<div class="p-6 text-sm text-zinc-400">No results.</div>`;
    el.innerHTML = noResultsHtml;
    
    // Update mobile results if on mobile
    if (isMobileDevice() && mobileResults) {
      mobileResults.updateResults(noResultsHtml);
    }
    return;
  }
  
  // Store results and calculate obscurity scores once
  app.lastResults = tracks;
  calculateObscurityScores(tracks).then(tracksWithObscurity => {
    // Cache the results with obscurity scores
    app.lastResultsWithObscurity = tracksWithObscurity;
    
    // Filter by minimum obscurity threshold if > 0
    const filtered = app.obscurity.minScore > 0 ? 
      tracksWithObscurity.filter(item => item.obscurityScore >= app.obscurity.minScore) :
      tracksWithObscurity;
    
    // Update obscurity stats
    const statsSpan = document.getElementById("obscurityStats");
    if (statsSpan) {
      if (app.obscurity.minScore > 0) {
        statsSpan.textContent = filtered.length ? 
          `${filtered.length}/${tracks.length} tracks (min obscurity ${app.obscurity.minScore})` :
          "No tracks at this threshold";
      } else {
        statsSpan.textContent = `Obscurity calculated for ${tracks.length} tracks`;
      }
    }
    
    renderTracksWithObscurity(filtered);
  }).catch(e => {
    console.warn("Error calculating obscurity:", e.message);
    // Fallback to original render
    renderTracksOriginal(tracks);
  });
}

function renderTracksOriginal(tracks) {
  const el = document.getElementById("results");
  ensureAudio();

  tracks.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "p-3 hover:bg-zinc-900/50 grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center";

    const idx = document.createElement("div");
    idx.className = "text-zinc-500 text-sm w-6 text-right";
    idx.textContent = String(i + 1);

    const artwork = document.createElement("div");
    artwork.className = "w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0";
    const albumImage = t.album?.images?.[2] || t.album?.images?.[1] || t.album?.images?.[0]; // get smallest available image
    if (albumImage) {
      artwork.innerHTML = `<img src="${albumImage.url}" alt="Album art" class="w-full h-full object-cover" loading="lazy">`;
    } else {
      artwork.innerHTML = `<div class="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs">♪</div>`;
    }

    const main = document.createElement("div");
    const artistNames = (t.artists || []).map(a => a.name).join(", ");
    main.innerHTML = `
      <div class="font-medium truncate">${escapeHtml(t.name)} — <span class="text-zinc-400">${escapeHtml(artistNames)}</span></div>
      <div class="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
        <span class="px-1.5 py-0.5 rounded bg-zinc-800/70">pop ${t.popularity ?? 0}</span>
        ${t.album?.release_date ? `<span class="px-1.5 py-0.5 rounded bg-zinc-800/70">${t.album.release_date}</span>` : ""}
        ${t.album?.name ? `<span class="px-1.5 py-0.5 rounded bg-zinc-800/70 truncate max-w-32">${escapeHtml(t.album.name)}</span>` : ""}
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2";
    const previewBtn = document.createElement("button");
    previewBtn.className = "px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm disabled:opacity-50";
    previewBtn.textContent = t.preview_url ? "Preview" : "No preview";
    previewBtn.disabled = !t.preview_url;
    previewBtn.addEventListener("click", () => playPreview(t.preview_url, previewBtn));

    const openBtn = document.createElement("a");
    openBtn.className = "px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm";
    openBtn.href = t.external_urls?.spotify || "#";
    openBtn.target = "_blank";
    openBtn.rel = "noopener";
    openBtn.textContent = "Open";

    actions.append(previewBtn, openBtn);
    row.append(idx, artwork, main, actions);
    el.appendChild(row);
  });

  // Update mobile results if on mobile
  if (isMobileDevice() && mobileResults) {
    mobileResults.scrollToTop();
  }
}

// === UNIFIED STATUS/SKELETON/TOAST API ===
const Status = {
  skeleton(text) {
    return `<div class="p-4 text-sm text-zinc-400">${escapeHtml(text)}</div>`;
  },

  toast(msg, duration = 2600) {
    const el = document.createElement("div");
    el.className = "fixed bottom-4 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-sm px-3 py-2 rounded-lg shadow";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  },

  updateElement(elementOrId, content, isHTML = false) {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el) return;
    
    if (isHTML) {
      el.innerHTML = content;
    } else {
      el.textContent = content;
    }
  },

  showSkeleton(elementOrId, text) {
    this.updateElement(elementOrId, this.skeleton(text), true);
  },

  clear(elementOrId) {
    this.updateElement(elementOrId, "", true);
  }
};

// === UNIFIED SETTINGS MANAGEMENT ===
const Settings = {
  updateSetting(key, value, options = {}) {
    const { ui: uiElements, callback, localStorageKey = "pd.settings" } = options;
    
    // Handle different setting types
    if (key.startsWith('obscurity.')) {
      const obscurityKey = key.split('.')[1];
      app.obscurity[obscurityKey] = value;
    } else {
      app.settings[key] = value;
      localStorage.setItem(localStorageKey, JSON.stringify(app.settings));
    }
    
    // Update UI elements if provided
    if (uiElements) {
      for (const [elementKey, elementValue] of Object.entries(uiElements)) {
        Status.updateElement(elementKey, elementValue);
      }
    }
    
    // Run callback if provided
    if (callback) {
      callback();
    }
  },

  // Convenience methods for common settings
  updatePopBias(value, ui) {
    this.updateSetting('popularityBias', Number(value), {
      ui: {
        [ui.valueElement]: String(value)
      },
      callback: () => window.updatePopLabel && window.updatePopLabel()
    });
  },

  updateFreshnessDays(value, ui) {
    this.updateSetting('freshnessDays', Number(value), {
      ui: {
        [ui.valueElement]: String(value)
      }
    });
  },

  updateObscurity(value, ui) {
    this.updateSetting('obscurity.minScore', parseInt(value), {
      ui: {
        [ui.valueElement]: String(value)
      }
    });
  }
};

// Legacy function wrappers for existing code
function skeleton(text) {
  return Status.skeleton(text);
}
function ensureAudio() {
  if (!app.cache.audio) {
    app.cache.audio = new Audio();
    window.addEventListener("beforeunload", () => { try { app.cache.audio.pause(); } catch {} });
  }
}
function playPreview(url, btn) {
  ensureAudio();
  const a = app.cache.audio;
  try { a.pause(); } catch {}
  a.src = url;
  a.currentTime = 0;
  a.play().catch(() => toast("Autoplay blocked—tap Preview again."));
  btn.textContent = "Playing…";
  a.onended = () => { btn.textContent = "Preview"; };
}

// === RESULTS HELPER ===
function setNewResults(results) {
  app.lastResults = results;
  app.lastResultsWithObscurity = null; // Clear cache for new results
  app.originalResults = []; // Clear backup since we have new results
  // Reset DNA sort checkbox
  const sortCheckbox = document.getElementById("sortByDNA");
  if (sortCheckbox) sortCheckbox.checked = false;
}

// === CONCURRENCY LIMITER ===
async function asyncConcurrencyLimit(items, asyncFn, concurrency = 5) {
  const results = [];
  const inProgress = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Start the async operation
    const promise = asyncFn(item, i).then(result => {
      // Remove from in-progress when done
      const index = inProgress.indexOf(promise);
      if (index > -1) inProgress.splice(index, 1);
      return result;
    });
    
    inProgress.push(promise);
    
    // If we've hit the concurrency limit, wait for one to complete
    if (inProgress.length >= concurrency) {
      const result = await Promise.race(inProgress);
      results.push(result);
    }
  }
  
  // Wait for remaining operations to complete
  const remaining = await Promise.all(inProgress);
  results.push(...remaining);
  
  return results;
}

// === CENTRALIZED ARTIST CACHE ===
const ARTIST_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedArtist(id) {
  if (!app.cache.artist) app.cache.artist = new Map();
  const cached = app.cache.artist.get(id);
  if (cached && Date.now() - cached.timestamp < ARTIST_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedArtist(id, data) {
  if (!app.cache.artist) app.cache.artist = new Map();
  app.cache.artist.set(id, { data, timestamp: Date.now() });
}

function getCachedArtists(ids) {
  const cached = new Map();
  const missing = [];
  
  for (const id of ids) {
    const artist = getCachedArtist(id);
    if (artist) {
      cached.set(id, artist);
    } else {
      missing.push(id);
    }
  }
  
  return { cached, missing };
}

// === BATCHING HELPER ===
async function batchFetchArtistsByIds(ids) {
  const idsSet = new Set(Array.isArray(ids) ? ids : [...ids]);
  const artistIdArray = [...idsSet].filter(id => id); // Remove falsy values
  
  // Check cache first
  const { cached, missing } = getCachedArtists(artistIdArray);
  const artistData = new Map(cached);
  
  // Fetch missing artists
  if (missing.length > 0) {
    for (let i = 0; i < missing.length; i += 50) {
      const batch = missing.slice(i, i + 50);
      try {
        const res = await api("/artists", { ids: batch.join(",") });
        for (const artist of res.artists || []) {
          if (artist && artist.id) {
            setCachedArtist(artist.id, artist);
            artistData.set(artist.id, artist);
          }
        }
      } catch (e) {
        console.warn("Error fetching artist batch:", e.message);
      }
    }
  }
  
  return artistData;
}

// === UTILS ===
function medianOf(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a,b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg, duration) {
  return Status.toast(msg, duration);
}
function scrollIntoViewSmooth(node) {
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "start" });
}
