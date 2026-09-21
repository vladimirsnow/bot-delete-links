import btch from 'btch-downloader';

/**
 * Searches for music across multiple sources (Muzofond, YouTube, iTunes, Deezer)
 * Returns { title, performer, duration, url, source } or null
 */
export async function searchTrack(query) {
  if (!query || !query.trim()) return null;
  const cleanQuery = query.trim();

  // 1. Try Muzofond (Direct full MP3 with artist/title)
  try {
    const muzofondResult = await searchMuzofond(cleanQuery);
    if (muzofondResult) {
      console.log('Found track via Muzofond:', muzofondResult.title);
      return muzofondResult;
    }
  } catch (e) {
    console.error('Muzofond search error:', e.message);
  }

  // 2. Try YouTube search + btch mp3 resolver
  try {
    const ytResult = await searchYouTubeMusic(cleanQuery);
    if (ytResult) {
      console.log('Found track via YouTube:', ytResult.title);
      return ytResult;
    }
  } catch (e) {
    console.error('YouTube music search error:', e.message);
  }

  // 3. Try iTunes search
  try {
    const itunesResult = await searchITunes(cleanQuery);
    if (itunesResult) {
      console.log('Found track via iTunes:', itunesResult.title);
      return itunesResult;
    }
  } catch (e) {
    console.error('iTunes search error:', e.message);
  }

  // 4. Try Deezer search
  try {
    const deezerResult = await searchDeezer(cleanQuery);
    if (deezerResult) {
      console.log('Found track via Deezer:', deezerResult.title);
      return deezerResult;
    }
  } catch (e) {
    console.error('Deezer search error:', e.message);
  }

  return null;
}

async function searchMuzofond(query) {
  const url = `https://muzofond.fm/search/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) return null;

  const html = await res.text();
  const itemMatch = html.match(/<li class="item"[\s\S]*?<\/li>\s*<\/ul>/) || html.match(/<li class="item"[\s\S]*?<div class="endItem"/);
  
  // Find play url
  const playMatch = html.match(/data-url="([^"]+)"/);
  if (!playMatch) return null;

  let directUrl = playMatch[1];
  if (directUrl.includes('/')) {
    const parts = directUrl.split('/');
    const b64 = parts[parts.length - 1];
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf-8');
      if (decoded.startsWith('http')) {
        directUrl = decoded;
      }
    } catch (e) {}
  }

  // Extract artist and title
  const artistMatch = html.match(/<span class="artist">([^<]+)<\/span>/);
  const trackMatch = html.match(/<span class="track">([^<]+)<\/span>/);
  const durationMatch = html.match(/data-duration="(\d+)"/);

  const performer = artistMatch ? artistMatch[1].trim() : '';
  const title = trackMatch ? trackMatch[1].trim() : query;
  const duration = durationMatch ? parseInt(durationMatch[1], 10) : undefined;

  return {
    title,
    performer,
    duration,
    url: directUrl,
    source: 'muzofond'
  };
}

async function searchYouTubeMusic(query) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' audio')}`;
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  if (!res.ok) return null;

  const html = await res.text();
  const videoIds = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m => m[1]);
  const uniqueIds = [...new Set(videoIds)];
  if (uniqueIds.length === 0) return null;

  const videoId = uniqueIds[0];
  const ytData = await btch.youtube(`https://www.youtube.com/watch?v=${videoId}`);
  if (ytData && ytData.status && (ytData.mp3 || ytData.mp4)) {
    let title = ytData.title || query;
    let performer = ytData.author || '';
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      performer = parts[0].trim();
      title = parts.slice(1).join(' - ').replace(/\(Official.*?\)/i, '').replace(/\(Audio.*?\)/i, '').trim();
    }
    return {
      title,
      performer,
      url: ytData.mp3 || ytData.mp4,
      source: 'youtube'
    };
  }
  return null;
}

async function searchITunes(query) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.resultCount > 0 && data.results[0]) {
    const s = data.results[0];
    return {
      title: s.trackName,
      performer: s.artistName,
      duration: Math.round(s.trackTimeMillis / 1000),
      url: s.previewUrl,
      source: 'itunes'
    };
  }
  return null;
}

async function searchDeezer(query) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.data && data.data.length > 0) {
    const s = data.data[0];
    return {
      title: s.title,
      performer: s.artist?.name || '',
      duration: s.duration,
      url: s.preview,
      source: 'deezer'
    };
  }
  return null;
}

// Test runner
async function runTest() {
  console.log('=== Test 1: By song name ===');
  const t1 = await searchTrack('царица анна асти');
  console.log('Result 1:', t1);

  console.log('\n=== Test 2: By lyrics snippet ===');
  const t2 = await searchTrack('я сделаю так чтобы каждый узнал');
  console.log('Result 2:', t2);

  console.log('\n=== Test 3: Foreign song ===');
  const t3 = await searchTrack('queen bohemian rhapsody');
  console.log('Result 3:', t3);
}

runTest();
