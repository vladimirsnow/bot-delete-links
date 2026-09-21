async function testMuzofondPlayUrl() {
  const query = 'царица анна асти';
  const url = `https://muzofond.fm/search/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const playMatch = html.match(/<li[^>]*class="play"[^>]*data-url="([^"]+)"/i) ||
                    html.match(/data-url="(https:\/\/[^"]*muzofond\.fm\/[^"]+)"/i);
  console.log('Play match:', playMatch ? playMatch[1] : 'null');
}
testMuzofondPlayUrl();
