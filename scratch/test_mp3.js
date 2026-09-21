async function testMp3Scrapers() {
  const query = 'царица анна асти';
  console.log('Query:', query);

  // 1. Hitmo
  try {
    const url = `https://rus.hitmotop.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    console.log('Hitmo status:', res.status);
    if (res.ok) {
      const html = await res.text();
      // look for tracks: <a class="track__download-btn" href="..."> or data-musurl
      const matches = [...html.matchAll(/data-musurl="([^"]+)"/g)];
      const titleMatches = [...html.matchAll(/<div class="track__title">([^<]+)<\/div>/g)];
      const artistMatches = [...html.matchAll(/<div class="track__desc">([^<]+)<\/div>/g)];
      console.log('Hitmo tracks found:', matches.length);
      if (matches.length > 0) {
        console.log('Track 1 URL:', matches[0][1]);
        console.log('Track 1 Title:', titleMatches[0]?.[1]?.trim());
        console.log('Track 1 Artist:', artistMatches[0]?.[1]?.trim());
      }
    }
  } catch (e) {
    console.log('Hitmo err:', e.message);
  }

  // 2. Muzofond
  try {
    const url = `https://muzofond.fm/search/${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    console.log('Muzofond status:', res.status);
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/data-url="([^"]+)"/g)];
      console.log('Muzofond tracks found:', matches.length);
      if (matches.length > 0) {
        console.log('Muzofond Track 1 URL:', matches[0][1]);
      }
    }
  } catch (e) {
    console.log('Muzofond err:', e.message);
  }

  // 3. Test English track query: "Queen Bohemian Rhapsody"
  const enQuery = 'Queen Bohemian Rhapsody';
  try {
    const url = `https://rus.hitmotop.com/search?q=${encodeURIComponent(enQuery)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/data-musurl="([^"]+)"/g)];
      console.log('Hitmo EN tracks found:', matches.length);
      if (matches.length > 0) {
        console.log('Hitmo EN Track 1 URL:', matches[0][1]);
      }
    }
  } catch (e) {
    console.log('Hitmo EN err:', e.message);
  }

  // 4. Test lyrics snippet search: "я сделаю так чтобы каждый узнал"
  const lyricsQuery = 'я сделаю так чтобы каждый узнал';
  try {
    const url = `https://rus.hitmotop.com/search?q=${encodeURIComponent(lyricsQuery)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/data-musurl="([^"]+)"/g)];
      const titleMatches = [...html.matchAll(/<div class="track__title">([^<]+)<\/div>/g)];
      const artistMatches = [...html.matchAll(/<div class="track__desc">([^<]+)<\/div>/g)];
      console.log('Hitmo Lyrics search tracks found:', matches.length);
      if (matches.length > 0) {
        console.log('Lyrics search Track 1 URL:', matches[0][1]);
        console.log('Lyrics search Title:', titleMatches[0]?.[1]?.trim());
        console.log('Lyrics search Artist:', artistMatches[0]?.[1]?.trim());
      }
    }
  } catch (e) {
    console.log('Hitmo lyrics err:', e.message);
  }
}

testMp3Scrapers();
