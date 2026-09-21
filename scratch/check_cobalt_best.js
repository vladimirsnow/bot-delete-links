async function checkCobaltBest() {
  try {
    const res = await fetch('https://instances.cobalt.best/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    console.log('instances.cobalt.best status:', res.status);
    const html = await res.text();
    console.log('HTML length:', html.length);
    const matches = [...html.matchAll(/https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?::\d+)?/g)].map(m => m[0]);
    const unique = [...new Set(matches)].filter(u => !u.includes('w3.org') && !u.includes('github') && !u.includes('cobalt.best'));
    console.log('Found urls:', unique);
  } catch (e) {
    console.log('err:', e.message);
  }
}
checkCobaltBest();
