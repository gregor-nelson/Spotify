/**
 * Mood Discovery Component
 * Handles mood-based music discovery with enhanced scoring algorithm
 */

class MoodDiscovery {
  constructor(dependencies) {
    this.app = dependencies.app;
    this.api = dependencies.api;
    this.getPaged = dependencies.getPaged;
    this.ensureTopArtists = dependencies.ensureTopArtists;
    this.setNewResults = dependencies.setNewResults;
    this.renderTracks = dependencies.renderTracks;
    this.skeleton = dependencies.skeleton;
  }

  async handleMoodDiscovery(mood) {
    const resultsEl = document.getElementById("results");
    const statsEl = document.getElementById("moodStats");
    
    try {
      resultsEl.innerHTML = this.skeleton(`Generating ${mood} mood tracks...`);
      statsEl.textContent = "";
      
      const topArtists = await this.ensureTopArtists();
      if (!topArtists.length) throw new Error("No top artists found");
      
      const moodTracks = await this.findMoodTracks(mood, topArtists);
      
      this.setNewResults(moodTracks);
      this.renderTracks(moodTracks);
      
      const description = this.getMoodDescription(mood);
      statsEl.textContent = `${moodTracks.length} ${mood} tracks · ${description}`;
    } catch (error) {
      console.error(`Error in mood discovery (${mood}):`, error);
      resultsEl.innerHTML = `<p>Error generating ${mood} tracks: ${error.message}</p>`;
      statsEl.textContent = "";
    }
  }

  async findMoodTracks(mood, topArtists) {
    console.log(`Finding ${mood} tracks using clean parallel approach...`);
    
    // Three parallel searches - the essentials
    const [artistTracks, yearTracks, genreTracks] = await Promise.all([
      this.searchArtists(mood),
      this.searchYears(mood), 
      this.searchGenres(mood)
    ]);
    
    console.log(`Artists: ${artistTracks.length}, Years: ${yearTracks.length}, Genres: ${genreTracks.length}`);
    
    // Combine and dedupe
    const allTracks = [...artistTracks, ...yearTracks, ...genreTracks];
    const uniqueTracks = this.dedupe(allTracks);
    
    console.log(`Total ${mood} tracks found: ${uniqueTracks.length}`);
    return uniqueTracks.slice(0, 50);
  }

  getMoodGenres(mood) {
    const genreMoodMap = this.getEnhancedGenreMap();
    const moodGenres = genreMoodMap[mood];
    return [...(moodGenres.primary || []), ...(moodGenres.secondary || [])].slice(0, 8);
  }

  getAudioFeatureTargets() {
    return {
      energetic: { energy: [0.7, 1.0], danceability: [0.6, 1.0], valence: [0.5, 1.0] },
      chill: { energy: [0.0, 0.4], valence: [0.4, 0.8], acousticness: [0.3, 1.0] },
      melancholic: { valence: [0.0, 0.4], energy: [0.2, 0.6], acousticness: [0.2, 0.8] },
      euphoric: { valence: [0.7, 1.0], energy: [0.6, 1.0], danceability: [0.5, 1.0] },
      contemplative: { energy: [0.0, 0.4], instrumentalness: [0.3, 1.0], acousticness: [0.4, 1.0] },
      aggressive: { energy: [0.7, 1.0], valence: [0.0, 0.5], loudness: [-10, 0] },
      romantic: { valence: [0.4, 0.8], energy: [0.2, 0.7], instrumentalness: [0.0, 0.3] },
      focus: { instrumentalness: [0.5, 1.0], energy: [0.3, 0.7], speechiness: [0.0, 0.2] },
      nostalgic: { valence: [0.3, 0.7], acousticness: [0.3, 0.9], energy: [0.2, 0.6] },
      party: { danceability: [0.7, 1.0], energy: [0.6, 1.0], valence: [0.6, 1.0] },
      peaceful: { energy: [0.0, 0.3], acousticness: [0.5, 1.0], valence: [0.4, 0.8] },
      dramatic: { energy: [0.4, 0.9], instrumentalness: [0.2, 0.8], loudness: [-15, -2] }
    };
  }

  getEnhancedGenreMap() {
    return {
      energetic: {
        primary: ['rock', 'metal', 'punk', 'hardcore', 'speed-metal'],
        secondary: ['hard-rock', 'alternative-rock', 'grunge', 'ska', 'garage-rock'],
        indicators: ['energy', 'power', 'loud', 'fast', 'intense', 'driving']
      },
      chill: {
        primary: ['ambient', 'chillout', 'lo-fi', 'downtempo', 'trip-hop'],
        secondary: ['chill-hop', 'chillwave', 'ambient-techno', 'dub-techno', 'minimal'],
        indicators: ['chill', 'relax', 'calm', 'mellow', 'smooth', 'laid-back']
      },
      melancholic: {
        primary: ['indie', 'alternative', 'slowcore', 'sadcore', 'emo'],
        secondary: ['indie-rock', 'post-rock', 'shoegaze', 'dream-pop', 'gothic'],
        indicators: ['sad', 'melancholy', 'blue', 'tears', 'rain', 'lonely']
      },
      euphoric: {
        primary: ['trance', 'progressive-house', 'uplifting-trance', 'eurodance', 'happy-hardcore'],
        secondary: ['vocal-trance', 'progressive-trance', 'tech-trance', 'psytrance'],
        indicators: ['euphoria', 'uplifting', 'soaring', 'ecstatic', 'bliss', 'high']
      },
      contemplative: {
        primary: ['classical', 'jazz', 'indie', 'folk', 'alternative'],
        secondary: ['post-rock', 'neo-classical', 'instrumental', 'indie-folk', 'art-rock'],
        indicators: ['contemplative', 'thoughtful', 'deep', 'introspective', 'reflective']
      },
      aggressive: {
        primary: ['metal', 'hardcore', 'punk', 'thrash', 'death-metal'],
        secondary: ['black-metal', 'grindcore', 'metalcore', 'nu-metal', 'industrial'],
        indicators: ['aggressive', 'brutal', 'intense', 'rage', 'anger', 'violent']
      },
      romantic: {
        primary: ['soul', 'r&b', 'jazz', 'bossa-nova', 'romantic'],
        secondary: ['neo-soul', 'contemporary-r&b', 'smooth-jazz', 'love-songs'],
        indicators: ['love', 'romance', 'heart', 'valentine', 'tender', 'intimate']
      },
      focus: {
        primary: ['instrumental', 'classical', 'electronic', 'post-rock', 'jazz'],
        secondary: ['lo-fi', 'downtempo', 'film-score', 'neo-classical', 'ambient'],
        indicators: ['instrumental', 'study', 'focus', 'concentration', 'work', 'background']
      },
      nostalgic: {
        primary: ['vintage', 'oldies', 'classic-rock', 'retro', '80s'],
        secondary: ['synthwave', 'new-wave', 'post-punk', 'indie-pop', 'jangle-pop'],
        indicators: ['nostalgic', 'vintage', 'retro', 'memories', 'old', 'classic']
      },
      party: {
        primary: ['house', 'techno', 'dance', 'disco', 'funk'],
        secondary: ['dance-pop', 'electro', 'big-room', 'progressive-house', 'tribal'],
        indicators: ['party', 'club', 'dance', 'celebration', 'festival', 'rave']
      },
      peaceful: {
        primary: ['jazz', 'folk', 'acoustic', 'classical', 'indie'],
        secondary: ['singer-songwriter', 'soft-rock', 'indie-folk', 'neo-soul', 'bossa-nova'],
        indicators: ['peaceful', 'soft', 'quiet', 'gentle', 'calm', 'mellow']
      },
      dramatic: {
        primary: ['classical', 'film-score', 'symphonic', 'orchestral', 'opera'],
        secondary: ['soundtrack', 'epic', 'cinematic', 'baroque', 'romantic-classical'],
        indicators: ['dramatic', 'epic', 'cinematic', 'powerful', 'intense', 'theatrical']
      }
    };
  }

  getMoodKeywords(mood) {
    const keywordMap = {
      energetic: ['energy', 'power', 'intense', 'driving', 'explosive', 'electric', 'charged', 'dynamic'],
      chill: ['chill', 'relax', 'calm', 'mellow', 'smooth', 'laid-back', 'easy', 'cool'],
      melancholic: ['sad', 'melancholy', 'blue', 'tears', 'rain', 'lonely', 'somber', 'wistful'],
      euphoric: ['euphoria', 'uplifting', 'soaring', 'ecstatic', 'bliss', 'high', 'elevated', 'transcendent'],
      contemplative: ['contemplative', 'meditative', 'thoughtful', 'introspective', 'reflective', 'deep', 'philosophical'],
      aggressive: ['aggressive', 'brutal', 'intense', 'rage', 'anger', 'violent', 'fierce', 'savage'],
      romantic: ['love', 'romance', 'heart', 'valentine', 'tender', 'intimate', 'passion', 'desire'],
      focus: ['focus', 'concentration', 'study', 'work', 'productive', 'clear', 'mindful', 'sharp'],
      nostalgic: ['nostalgic', 'vintage', 'retro', 'memories', 'old', 'classic', 'reminiscent', 'bygone'],
      party: ['party', 'club', 'dance', 'celebration', 'festival', 'rave', 'groove', 'beat'],
      peaceful: ['peaceful', 'serene', 'tranquil', 'zen', 'harmony', 'balance', 'stillness', 'quiet'],
      dramatic: ['dramatic', 'epic', 'cinematic', 'powerful', 'intense', 'theatrical', 'grand', 'monumental']
    };
    return keywordMap[mood] || [];
  }

  matchesMoodByMetadata(track, mood) {
    const score = this.calculateEnhancedMoodScore(track, mood);
    return score >= 0.05; // Very lenient threshold to maximize track discovery
  }

  calculateEnhancedMoodScore(track, mood) {
    const weights = {
      genre: 0.40,      // Genre match (primary factor)
      popularity: 0.25, // Popularity patterns for mood
      semantic: 0.20,   // Text analysis of names
      era: 0.10,        // Musical era patterns
      album: 0.05       // Album context
    };
    
    const genreScore = this.analyzeGenreMatch(track, mood);
    const popularityScore = this.analyzePopularityContext(track, mood);
    const semanticScore = this.analyzeSemanticText(track, mood);
    const eraScore = this.analyzeEraPatterns(track, mood);
    const albumScore = this.analyzeAlbumContext(track, mood);
    
    const totalScore = 
      (genreScore * weights.genre) +
      (popularityScore * weights.popularity) +
      (semanticScore * weights.semantic) +
      (eraScore * weights.era) +
      (albumScore * weights.album);
    
    return Math.min(totalScore, 1.0);
  }

  analyzeGenreMatch(track, mood) {
    const genreMap = this.getEnhancedGenreMap()[mood];
    const artistGenres = track.artists?.[0]?.genres || [];
    
    let maxScore = 0;
    
    for (const genre of artistGenres) {
      const genreLower = genre.toLowerCase();
      
      // Primary genre matches (high score)
      for (const primary of genreMap.primary || []) {
        if (genreLower.includes(primary)) {
          maxScore = Math.max(maxScore, 1.0);
        }
      }
      
      // Secondary genre matches (medium score)
      for (const secondary of genreMap.secondary || []) {
        if (genreLower.includes(secondary)) {
          maxScore = Math.max(maxScore, 0.7);
        }
      }
      
      // Semantic indicator matches (low score)
      for (const indicator of genreMap.indicators || []) {
        if (genreLower.includes(indicator)) {
          maxScore = Math.max(maxScore, 0.4);
        }
      }
    }
    
    return maxScore;
  }

  analyzePopularityContext(track, mood) {
    const popularity = track.popularity || 0;
    
    // Different moods have different popularity sweet spots
    const popularityProfiles = {
      dance: { optimal: [60, 85], acceptable: [40, 95] },  // Mainstream dance hits
      dark: { optimal: [20, 60], acceptable: [0, 80] },    // Underground/niche appeal
      bright: { optimal: [50, 90], acceptable: [30, 100] }, // Popular upbeat tracks
      mellow: { optimal: [30, 70], acceptable: [0, 85] }   // Varies widely
    };
    
    const profile = popularityProfiles[mood];
    if (!profile) return 0.5;
    
    // Optimal range gets full score
    if (popularity >= profile.optimal[0] && popularity <= profile.optimal[1]) {
      return 1.0;
    }
    
    // Acceptable range gets partial score
    if (popularity >= profile.acceptable[0] && popularity <= profile.acceptable[1]) {
      return 0.6;
    }
    
    // Outside acceptable range
    return 0.2;
  }

  analyzeSemanticText(track, mood) {
    const keywords = this.getMoodKeywords(mood);
    const genreMap = this.getEnhancedGenreMap()[mood];
    
    const textSources = [
      track.name?.toLowerCase() || '',
      track.album?.name?.toLowerCase() || '',
      track.artists?.[0]?.name?.toLowerCase() || ''
    ].join(' ');
    
    let matchCount = 0;
    const totalPatterns = keywords.length + (genreMap.indicators?.length || 0);
    
    // Check mood keywords
    for (const keyword of keywords) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      if (pattern.test(textSources)) {
        matchCount++;
      }
    }
    
    // Check genre indicators
    for (const indicator of genreMap.indicators || []) {
      const pattern = new RegExp(`\\b${indicator}\\b`, 'i');
      if (pattern.test(textSources)) {
        matchCount++;
      }
    }
    
    return totalPatterns > 0 ? matchCount / totalPatterns : 0;
  }

  analyzeEraPatterns(track, mood) {
    const releaseDate = track.album?.release_date;
    if (!releaseDate) return 0.5;
    
    const year = parseInt(releaseDate.split('-')[0]);
    if (isNaN(year)) return 0.5;
    
    // Different moods peaked in different eras
    const eraProfiles = {
      dance: { peak: [1995, 2010], secondary: [1980, 1994, 2011, 2024] },
      dark: { peak: [1980, 1995], secondary: [1970, 1979, 1996, 2010] },
      bright: { peak: [1960, 1980, 2000, 2020], secondary: [1950, 1999] },
      mellow: { peak: [1970, 1990, 2000, 2020], secondary: [1960, 1999] }
    };
    
    const profile = eraProfiles[mood];
    if (!profile) return 0.5;
    
    // Check peak eras
    for (let i = 0; i < profile.peak.length; i += 2) {
      if (year >= profile.peak[i] && year <= profile.peak[i + 1]) {
        return 1.0;
      }
    }
    
    // Check secondary eras
    for (let i = 0; i < profile.secondary.length; i += 2) {
      if (year >= profile.secondary[i] && year <= profile.secondary[i + 1]) {
        return 0.7;
      }
    }
    
    return 0.3;
  }

  analyzeAlbumContext(track, mood) {
    const albumName = track.album?.name?.toLowerCase() || '';
    const albumType = track.album?.album_type || '';
    
    let score = 0.5; // Neutral baseline
    
    // Album type preferences by mood
    const typePreferences = {
      dance: { single: 0.8, compilation: 0.9, album: 0.6 },
      dark: { album: 0.9, single: 0.6, compilation: 0.5 },
      bright: { single: 0.8, album: 0.7, compilation: 0.7 },
      mellow: { album: 0.9, single: 0.6, compilation: 0.5 }
    };
    
    const preferences = typePreferences[mood];
    if (preferences && preferences[albumType]) {
      score = preferences[albumType];
    }
    
    // Semantic analysis of album names
    const genreMap = this.getEnhancedGenreMap()[mood];
    const indicators = genreMap.indicators || [];
    
    for (const indicator of indicators) {
      if (albumName.includes(indicator)) {
        score = Math.min(score + 0.2, 1.0);
      }
    }
    
    return score;
  }

  calculateGenreRelevanceToMood(genre, mood, genreMap) {
    const genreLower = genre.toLowerCase();
    
    // Primary genres get highest relevance
    for (const primary of genreMap.primary || []) {
      if (genreLower.includes(primary)) {
        return 1.0;
      }
    }
    
    // Secondary genres get medium relevance
    for (const secondary of genreMap.secondary || []) {
      if (genreLower.includes(secondary)) {
        return 0.7;
      }
    }
    
    // Indicators get low relevance
    for (const indicator of genreMap.indicators || []) {
      if (genreLower.includes(indicator)) {
        return 0.4;
      }
    }
    
    return 0.1; // Minimal relevance for unmatched genres
  }

  getMoodDescription(mood) {
    const descriptions = {
      energetic: "High-energy & intense",
      chill: "Relaxed & laid-back",
      melancholic: "Sad & introspective", 
      euphoric: "Uplifting & ecstatic",
      contemplative: "Thoughtful & meditative",
      aggressive: "Intense & powerful",
      romantic: "Love & intimacy",
      focus: "Concentration & productivity",
      nostalgic: "Memories & vintage vibes",
      party: "Dance & celebration",
      peaceful: "Calm & tranquil",
      dramatic: "Epic & cinematic"
    };
    return descriptions[mood] || "Mood-based discovery";
  }

  // === CLEAN SEARCH METHODS ===
  
  async searchArtists(mood) {
    const artists = this.getMoodArtists(mood).slice(0, 3);
    const tracks = [];
    
    for (const artist of artists) {
      try {
        const res = await this.api("/search", {
          q: `artist:${artist}`,
          type: "track",
          limit: "15",
          market: this.app.market
        });
        tracks.push(...(res.tracks?.items || []));
      } catch (error) {
        console.warn(`Artist search failed for ${artist}:`, error.message);
      }
    }
    
    return tracks;
  }

  async searchYears(mood) {
    const years = this.getMoodYears(mood).slice(0, 2);
    const tracks = [];
    
    for (const yearRange of years) {
      try {
        const res = await this.api("/search", {
          q: `year:${yearRange}`,
          type: "track", 
          limit: "20",
          market: this.app.market
        });
        tracks.push(...(res.tracks?.items || []));
      } catch (error) {
        console.warn(`Year search failed for ${yearRange}:`, error.message);
      }
    }
    
    return tracks;
  }

  async searchGenres(mood) {
    const genres = this.getWorkingGenresForMood(mood).slice(0, 2);
    const tracks = [];
    
    for (const genre of genres) {
      try {
        const res = await this.api("/search", {
          q: `genre:${genre}`,
          type: "track",
          limit: "20", 
          market: this.app.market
        });
        tracks.push(...(res.tracks?.items || []));
      } catch (error) {
        console.warn(`Genre search failed for ${genre}:`, error.message);
      }
    }
    
    return tracks;
  }

  dedupe(tracks) {
    const seen = new Set();
    return tracks.filter(track => {
      if (!track?.id || seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }

  // === LEGACY METHODS (UNUSED) ===
  
  async getTracksByEnhancedGenreSearch(mood, topArtists) {
    const genreMap = this.getEnhancedGenreMap()[mood];
    if (!genreMap) return [];
    
    const tracks = [];
    const searchStrategies = this.buildSearchStrategies(mood, genreMap);
    
    // Try multiple search strategies for better coverage
    for (const strategy of searchStrategies) {
      if (tracks.length >= 100) break; // Collect up to 100 tracks before filtering
      
      try {
        const strategyTracks = await this.executeSearchStrategy(strategy);
        const filteredTracks = strategyTracks.filter(track => 
          this.matchesMoodByMetadata(track, mood) && 
          !this.isFromTopArtist(track, topArtists)
        );
        tracks.push(...filteredTracks);
        console.log(`Strategy "${strategy.name}": Found ${filteredTracks.length} tracks`);
      } catch (error) {
        console.warn(`Search strategy "${strategy.name}" failed:`, error.message);
      }
    }
    
    return tracks;
  }

  buildSearchStrategies(mood, genreMap) {
    const strategies = [];
    
    // Strategy 1: Artist-based discovery (most reliable)
    const moodArtists = this.getMoodArtists(mood);
    for (const artist of moodArtists.slice(0, 4)) {
      strategies.push({
        name: `Artist-${artist}`,
        query: `artist:${artist}`,
        limit: 20
      });
    }
    
    // Strategy 2: Fixed genre searches (proper syntax)
    const workingGenres = this.getWorkingGenresForMood(mood);
    for (const genre of workingGenres.slice(0, 4)) {
      strategies.push({
        name: `Genre-${genre}`,
        query: `genre:${genre}`,
        limit: 25
      });
    }
    
    // Strategy 3: Year-based searches for mood-appropriate eras
    const years = this.getMoodYears(mood);
    for (const yearRange of years.slice(0, 3)) {
      strategies.push({
        name: `Year-${yearRange}`,
        query: `year:${yearRange}`,
        limit: 30
      });
    }
    
    // Strategy 4: Broader keyword searches
    const keywords = this.getMoodKeywords(mood);
    for (const keyword of keywords.slice(0, 3)) {
      strategies.push({
        name: `Keyword-${keyword}`,
        query: `${keyword}`,
        limit: 25
      });
    }
    
    // Strategy 5: Tag-based discovery
    strategies.push({
      name: 'Tag-hipster',
      query: 'tag:hipster',
      limit: 20
    });
    
    // Strategy 6: Combined searches for maximum results
    strategies.push({
      name: 'Combined-broad',
      query: this.buildBroadMoodQuery(mood),
      limit: 35
    });
    
    return strategies;
  }

  getPopularGenresForMood(mood) {
    const popularGenres = {
      energetic: ['rock', 'pop', 'electronic'],
      chill: ['indie', 'alternative', 'pop'],
      melancholic: ['indie', 'alternative', 'folk'],
      euphoric: ['pop', 'electronic', 'dance'],
      contemplative: ['indie', 'folk', 'alternative'],
      aggressive: ['rock', 'metal', 'punk'],
      romantic: ['pop', 'r&b', 'soul'],
      focus: ['electronic', 'classical', 'instrumental'],
      nostalgic: ['pop', 'rock', 'indie'],
      party: ['pop', 'hip-hop', 'electronic'],
      peaceful: ['folk', 'indie', 'jazz'],
      dramatic: ['classical', 'rock', 'electronic']
    };
    
    return popularGenres[mood] || ['pop', 'indie', 'alternative'];
  }
  
  buildBroadMoodQuery(mood) {
    const broadQueries = {
      energetic: 'genre:rock OR genre:pop OR genre:electronic',
      chill: 'genre:indie OR genre:folk OR genre:alternative',
      melancholic: 'genre:indie OR genre:alternative OR genre:folk',
      euphoric: 'genre:pop OR genre:electronic OR genre:dance',
      contemplative: 'genre:indie OR genre:folk OR genre:classical',
      aggressive: 'genre:rock OR genre:metal OR genre:punk',
      romantic: 'genre:pop OR genre:soul OR jazz',
      focus: 'genre:electronic OR genre:classical OR ambient',
      nostalgic: 'genre:indie OR genre:pop OR genre:folk',
      party: 'genre:pop OR genre:dance OR genre:electronic',
      peaceful: 'genre:folk OR genre:indie OR genre:jazz',
      dramatic: 'genre:classical OR genre:rock OR genre:electronic'
    };
    
    return broadQueries[mood] || 'genre:pop OR genre:indie';
  }

  getMoodArtists(mood) {
    const artistMap = {
      energetic: ['Linkin Park', 'The Killers', 'Foo Fighters', 'Arctic Monkeys', 'Green Day'],
      chill: ['Bon Iver', 'Lana Del Rey', 'The National', 'Cigarettes After Sex', 'Mac DeMarco'],
      melancholic: ['Radiohead', 'The Cure', 'Joy Division', 'Elliott Smith', 'Phoebe Bridgers'],
      euphoric: ['Daft Punk', 'Calvin Harris', 'Avicii', 'Swedish House Mafia', 'Deadmau5'],
      contemplative: ['Sigur Rós', 'Ólafur Arnalds', 'Max Richter', 'Nils Frahm', 'Kiasmos'],
      aggressive: ['Metallica', 'Slipknot', 'Rage Against The Machine', 'Tool', 'System Of A Down'],
      romantic: ['John Legend', 'Alicia Keys', 'Sade', 'D\'Angelo', 'Frank Ocean'],
      focus: ['Ludovico Einaudi', 'GoGo Penguin', 'Emancipator', 'Bonobo', 'Tycho'],
      nostalgic: ['Fleetwood Mac', 'The Beatles', 'Pink Floyd', 'Led Zeppelin', 'David Bowie'],
      party: ['Dua Lipa', 'The Chainsmokers', 'Disclosure', 'Mark Ronson', 'Diplo'],
      peaceful: ['Norah Jones', 'Iron & Wine', 'Kings of Convenience', 'Zero 7', 'Thievery Corporation'],
      dramatic: ['Hans Zimmer', 'Two Steps From Hell', 'Clint Mansell', 'Trent Reznor', 'Jonny Greenwood']
    };
    return artistMap[mood] || ['The Beatles', 'Radiohead', 'Pink Floyd'];
  }

  getWorkingGenresForMood(mood) {
    const genreMap = {
      energetic: ['rock', 'metal', 'punk', 'electronic', 'hard-rock'],
      chill: ['indie', 'alternative', 'folk', 'ambient', 'downtempo'],
      melancholic: ['indie', 'alternative', 'post-rock', 'slowcore', 'folk'],
      euphoric: ['electronic', 'dance', 'house', 'trance', 'pop'],
      contemplative: ['classical', 'ambient', 'post-rock', 'instrumental', 'jazz'],
      aggressive: ['metal', 'hardcore', 'punk', 'industrial', 'grunge'],
      romantic: ['soul', 'jazz', 'pop', 'r-n-b', 'bossa-nova'],
      focus: ['ambient', 'classical', 'instrumental', 'electronic', 'post-rock'],
      nostalgic: ['classic-rock', 'oldies', 'indie', 'folk', 'pop'],
      party: ['dance', 'house', 'pop', 'electronic', 'disco'],
      peaceful: ['jazz', 'folk', 'classical', 'ambient', 'acoustic'],
      dramatic: ['classical', 'soundtrack', 'post-rock', 'symphonic', 'cinematic']
    };
    return genreMap[mood] || ['pop', 'indie', 'alternative'];
  }

  getMoodYears(mood) {
    const yearMap = {
      energetic: ['2010-2024', '2000-2010', '1990-2000'],
      chill: ['2010-2024', '2000-2015', '1990-2005'],
      melancholic: ['1990-2005', '2000-2015', '1980-1995'],
      euphoric: ['2008-2018', '1995-2005', '2018-2024'],
      contemplative: ['2000-2024', '1970-1990', '1990-2010'],
      aggressive: ['1990-2005', '2000-2015', '1980-1995'],
      romantic: ['1990-2010', '2000-2020', '1970-1990'],
      focus: ['2010-2024', '2000-2015', '1990-2010'],
      nostalgic: ['1960-1980', '1980-1995', '1970-1990'],
      party: ['2008-2020', '1995-2005', '2015-2024'],
      peaceful: ['2000-2020', '1990-2010', '1970-1990'],
      dramatic: ['2000-2024', '1990-2010', '1980-2000']
    };
    return yearMap[mood] || ['2000-2020', '1990-2010', '2010-2024'];
  }

  async executeSearchStrategy(strategy) {
    const res = await this.api("/search", {
      q: strategy.query,
      type: "track",
      limit: strategy.limit.toString(),
      market: this.app.market
    });
    
    const tracks = res.tracks?.items || [];
    
    // For popular strategies, prioritize tracks with reasonable popularity
    if (strategy.sortByPopularity) {
      return tracks.filter(track => (track.popularity || 0) > 20).slice(0, strategy.limit);
    }
    
    return tracks;
  }

  isFromTopArtist(track, topArtists) {
    const artistId = track.artists?.[0]?.id;
    return artistId && this.app.cache.topArtistIds && this.app.cache.topArtistIds.has(artistId);
  }

  // === TIER 2: SEMANTIC SEARCH ===
  
  async getTracksBySemanticSearch(mood) {
    const tracks = [];
    const keywords = this.getMoodKeywords(mood);
    const searchTerms = this.buildSemanticSearchTerms(mood, keywords);
    
    for (const searchTerm of searchTerms.slice(0, 6)) {
      if (tracks.length >= 40) break;
      
      try {
        const res = await this.api("/search", {
          q: searchTerm.query,
          type: "track",
          limit: "12",
          market: this.app.market
        });
        
        const searchTracks = res.tracks?.items || [];
        const filteredTracks = searchTracks.filter(track => 
          this.matchesMoodByMetadata(track, mood)
        );
        
        tracks.push(...filteredTracks);
        console.log(`Semantic search "${searchTerm.name}": Found ${filteredTracks.length} tracks`);
      } catch (error) {
        console.warn(`Semantic search failed for "${searchTerm.name}":`, error.message);
      }
    }
    
    return tracks;
  }

  buildSemanticSearchTerms(mood, keywords) {
    const terms = [];
    
    // Search by track names containing mood keywords
    for (const keyword of keywords.slice(0, 4)) {
      terms.push({
        name: `Track-${keyword}`,
        query: `track:${keyword}`
      });
    }
    
    // Search by album names containing mood keywords  
    for (const keyword of keywords.slice(0, 3)) {
      terms.push({
        name: `Album-${keyword}`,
        query: `album:${keyword}`
      });
    }
    
    // Search by artist names containing mood keywords
    for (const keyword of keywords.slice(0, 2)) {
      terms.push({
        name: `Artist-${keyword}`,
        query: `artist:${keyword}`
      });
    }
    
    // Broad searches without field filters
    for (const keyword of keywords.slice(0, 3)) {
      terms.push({
        name: `Broad-${keyword}`,
        query: keyword
      });
    }
    
    return terms;
  }

  // === TIER 3: USER LIBRARY ANALYSIS ===
  
  async getTracksFromUserLibrary(mood) {
    try {
      // Try to get user's saved tracks if available
      const savedTracks = await this.getUserSavedTracks();
      if (!savedTracks.length) return [];
      
      const matchingTracks = [];
      
      for (const track of savedTracks.slice(0, 50)) {
        if (this.matchesMoodByMetadata(track, mood)) {
          matchingTracks.push(track);
        }
      }
      
      return matchingTracks.slice(0, 10);
    } catch (error) {
      console.warn('User library analysis failed:', error.message);
      return [];
    }
  }

  async getUserSavedTracks() {
    try {
      const res = await this.api("/me/tracks", { limit: "50" });
      return res.items?.map(item => item.track) || [];
    } catch (error) {
      return [];
    }
  }

  // === UTILITY METHODS ===
  
  removeDuplicatesAndFilter(tracks, mood) {
    // Remove duplicates by track ID
    const uniqueTracks = tracks.filter((track, index, self) => 
      index === self.findIndex(t => t.id === track.id)
    );
    
    // Apply final mood filtering and scoring
    const scoredTracks = uniqueTracks.map(track => {
      track.finalMoodScore = this.calculateEnhancedMoodScore(track, mood);
      return track;
    });
    
    // Sort by final mood score - very lenient final filtering
    return scoredTracks
      .filter(track => track.finalMoodScore > 0.05)
      .sort((a, b) => (b.finalMoodScore || 0) - (a.finalMoodScore || 0));
  }
}

// Export for use in main.js
window.MoodDiscovery = MoodDiscovery;