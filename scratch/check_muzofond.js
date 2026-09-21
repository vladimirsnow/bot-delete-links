async function checkMuzofond() {
  const query = 'царица анна асти';
  const url = `https://muzofond.fm/search/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  console.log('HTML slice around data-url:');
  const items = [...html.matchAll(/<li class="item[^"]*"[\s\S]*?<\/li>/g)];
  console.log('Found item elements:', items.length);
  if (items.length > 0) {
    console.log('First item HTML:');
    console.log(items[0][0]);
  }
}

checkMuzofond();
