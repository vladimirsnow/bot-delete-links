async function inspectItem() {
  const url = `https://muzofond.fm/search/${encodeURIComponent('царица анна асти')}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' }
  });
  const html = await res.text();
  const item = html.match(/<li class="item"[\s\S]*?<\/li>/);
  if (item) {
    console.log(item[0]);
  }
}
inspectItem();
