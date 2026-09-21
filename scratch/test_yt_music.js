import btch from 'btch-downloader';

async function testYouTubeMusicSearch(query) {
  console.log(`\n--- Searching YouTube for "${query}" ---`);
  // Simple YouTube search scraper (no key required)
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' audio')}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await res.text();
    const videoIds = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m => m[1]);
    const uniqueIds = [...new Set(videoIds)];
    console.log('Found video IDs from YouTube search:', uniqueIds.slice(0, 3));
    
    if (uniqueIds.length > 0) {
      const topVideoId = uniqueIds[0];
      const videoUrl = `https://www.youtube.com/watch?v=${topVideoId}`;
      console.log('Resolving top video audio with btch.youtube:', videoUrl);
      const ytData = await btch.youtube(videoUrl);
      console.log('btch youtube data:', ytData);
    }
  } catch (e) {
    console.log('YouTube music search err:', e.message);
  }
}

testYouTubeMusicSearch('Linkin Park Numb');
testYouTubeMusicSearch('Anna Asti Царица');
