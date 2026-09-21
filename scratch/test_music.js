async function testMusicSources() {
  const query = 'Anna Asti Царица';

  console.log('=== 1. iTunes API ===');
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`);
    const data = await res.json();
    console.log('iTunes count:', data.resultCount);
    if (data.results?.[0]) {
      const s = data.results[0];
      console.log('iTunes track:', s.artistName, '-', s.trackName, 'Preview:', s.previewUrl);
    }
  } catch (e) {
    console.log('iTunes err:', e.message);
  }

  console.log('\n=== 2. Deezer API ===');
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json();
    console.log('Deezer total:', data.total);
    if (data.data?.[0]) {
      const s = data.data[0];
      console.log('Deezer track:', s.artist?.name, '-', s.title, 'Duration:', s.duration, 'Preview:', s.preview);
    }
  } catch (e) {
    console.log('Deezer err:', e.message);
  }

  console.log('\n=== 3. Hitmo / Seev.cc / Musify / Russian MP3 sources ===');
  try {
    // Test free mp3 search
    const res = await fetch(`https://music.youtube.com/search?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    console.log('YT Music status:', res.status);
  } catch (e) {
    console.log('YT Music err:', e.message);
  }

  console.log('\n=== 4. YouTube search via invidious / piped ===');
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacydev.net',
    'https://piped-api.lunar.icu',
    'https://api.piped.projectsegfau.lt'
  ];
  for (const p of pipedInstances) {
    try {
      const res = await fetch(`${p}/search?q=${encodeURIComponent(query)}&filter=videos`);
      console.log(p, 'status:', res.status);
      if (res.ok) {
        const d = await res.json();
        console.log(p, 'items:', d.items?.length, 'first:', d.items?.[0]?.title, d.items?.[0]?.url);
        break;
      }
    } catch (e) {
      console.log(p, 'err:', e.message);
    }
  }
}

testMusicSources();
