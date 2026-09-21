async function testTikTokServices() {
  const url = 'https://www.tiktok.com/@tiktok/video/7106594312292453678';
  
  // 1. TikTok oEmbed
  try {
    const oembed = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    console.log('TikTok oembed status:', oembed.status);
    if (oembed.ok) {
      const data = await oembed.json();
      console.log('TikTok title:', data.title, 'Author:', data.author_name, 'Thumb:', data.thumbnail_url);
    }
  } catch (e) {
    console.log('TikTok oembed err:', e.message);
  }

  // 2. TikSave
  try {
    const res = await fetch('https://tiksave.io/api/ajaxSearch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://tiksave.io/'
      },
      body: new URLSearchParams({ q: url })
    });
    console.log('Tiksave status:', res.status);
    if (res.ok) {
      const d = await res.json();
      console.log('Tiksave data has result:', Boolean(d.data));
      if (d.data) {
        const vMatch = d.data.match(/href="([^"]+)"/);
        console.log('Tiksave href:', vMatch ? vMatch[1].slice(0, 80) : 'none');
      }
    }
  } catch (e) {
    console.log('Tiksave err:', e.message);
  }

  // 3. SSSTik
  try {
    const sss = await fetch('https://ssstik.io/abc?url=dl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://ssstik.io/en'
      },
      body: new URLSearchParams({ id: url, locale: 'en', tt: '0', ts: '0' })
    });
    console.log('SSSTik status:', sss.status);
    if (sss.ok) {
      const text = await sss.text();
      const match = text.match(/href="([^"]+)"/);
      console.log('SSSTik match:', match ? match[1].slice(0, 80) : 'none');
    }
  } catch (e) {
    console.log('SSSTik err:', e.message);
  }
}

testTikTokServices();
