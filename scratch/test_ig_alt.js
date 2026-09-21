async function testInstagramAlternatives() {
  const shortcode = 'C8qLd9iI2eS';
  const url = `https://www.instagram.com/reel/${shortcode}/`;

  // 1. Test fastdl / snapinsta / snapany / publer
  const services = [
    {
      name: 'kkinstagram',
      fn: async () => {
        const res = await fetch(`https://kkinstagram.com/reel/${shortcode}/`, {
          headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' }
        });
        const text = await res.text();
        const m = text.match(/<meta\s+(?:property|name)=["'](?:og:video(?::secure_url)?|twitter:player:stream)["']\s+content=["']([^"']+)["']/i);
        return m ? m[1] : null;
      }
    },
    {
      name: 'instagramez',
      fn: async () => {
        const res = await fetch(`https://instagramez.com/reel/${shortcode}/`, {
          headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' }
        });
        const text = await res.text();
        const m = text.match(/<meta\s+(?:property|name)=["'](?:og:video(?::secure_url)?|twitter:player:stream)["']\s+content=["']([^"']+)["']/i);
        return m ? m[1] : null;
      }
    },
    {
      name: 'snapany / snapinsta api',
      fn: async () => {
        const res = await fetch('https://snapany.com/api/v1/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (res.ok) {
          const d = await res.json();
          return d.video_url || d.media?.[0]?.url;
        }
        return null;
      }
    },
    {
      name: 'vkrdown',
      fn: async () => {
        const res = await fetch(`https://api.vkrdown.com/vkrdown.php?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const d = await res.json();
          return d.data?.downloadUrl || d.data?.videos?.[0]?.url;
        }
        return null;
      }
    },
    {
      name: 'fdownloader',
      fn: async () => {
        const res = await fetch('https://v3.fdownloader.net/api/ajaxSearch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0'
          },
          body: new URLSearchParams({ k_exp: '', k_token: '', q: url })
        });
        if (res.ok) {
          const d = await res.json();
          return d.data;
        }
        return null;
      }
    }
  ];

  for (const s of services) {
    try {
      const result = await s.fn();
      console.log(`Service ${s.name}:`, result ? (typeof result === 'string' ? result.slice(0, 80) : 'Found object') : 'No result');
    } catch (e) {
      console.log(`Service ${s.name} error:`, e.message);
    }
  }
}

testInstagramAlternatives();
