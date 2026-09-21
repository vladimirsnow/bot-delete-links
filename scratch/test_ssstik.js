async function testSSSTikHtml() {
  const url = 'https://www.tiktok.com/@tiktok/video/7106594312292453678';
  // SSSTik needs token or session from main page first
  const mainRes = await fetch('https://ssstik.io/en', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' }
  });
  const mainHtml = await mainRes.text();
  const ttMatch = mainHtml.match(/data-hx-vals='{"tt":"([^"]+)"/);
  const tt = ttMatch ? ttMatch[1] : '0';
  console.log('SSSTik tt token:', tt);

  const res = await fetch('https://ssstik.io/abc?url=dl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
      'HX-Request': 'true',
      'HX-Trigger': '_gcaptcha_pt',
      'HX-Target': 'target',
      'HX-Current-URL': 'https://ssstik.io/en',
      'Referer': 'https://ssstik.io/en'
    },
    body: new URLSearchParams({ id: url, locale: 'en', tt: tt, ts: '0' })
  });
  console.log('SSSTik post status:', res.status);
  const text = await res.text();
  console.log('SSSTik response slice:', text.slice(0, 300));
  const linkMatches = [...text.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  console.log('SSSTik links:', linkMatches);
}

testSSSTikHtml();
