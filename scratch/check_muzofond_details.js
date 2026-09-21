async function checkMuzofondDetails() {
  const query = 'царица анна асти';
  const url = `https://muzofond.fm/search/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const items = [...html.matchAll(/<li class="item"[\s\S]*?<\/li>/g)];
  console.log('Items found:', items.length);
  for (let i = 0; i < Math.min(3, items.length); i++) {
    const it = items[i][0];
    const playUrlMatch = it.match(/data-url="([^"]+)"/);
    const durationMatch = it.match(/data-duration="([^"]+)"/);
    const artistMatch = it.match(/<span class="artist">([^<]+)<\/span>/);
    const titleMatch = it.match(/<span class="track">([^<]+)<\/span>/);
    
    const playUrl = playUrlMatch ? playUrlMatch[1] : null;
    let directUrl = playUrl;
    if (playUrl && playUrl.includes('/')) {
      const parts = playUrl.split('/');
      const b64 = parts[parts.length - 1];
      try {
        directUrl = Buffer.from(b64, 'base64').toString('utf-8');
      } catch (e) {}
    }

    console.log(`\n--- Song #${i + 1} ---`);
    console.log('Artist:', artistMatch ? artistMatch[1].trim() : 'Unknown');
    console.log('Title:', titleMatch ? titleMatch[1].trim() : 'Unknown');
    console.log('Duration:', durationMatch ? durationMatch[1] : '0');
    console.log('Play URL:', playUrl);
    console.log('Direct Decoded URL:', directUrl);

    // Test fetching head or range of the audio stream
    if (playUrl) {
      try {
        const audioRes = await fetch(playUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://muzofond.fm/'
          }
        });
        console.log('Play URL fetch status:', audioRes.status, 'Content-Type:', audioRes.headers.get('content-type'), 'Content-Length:', audioRes.headers.get('content-length'));
      } catch (e) {
        console.log('Play URL fetch error:', e.message);
      }
    }
  }
}

checkMuzofondDetails();
