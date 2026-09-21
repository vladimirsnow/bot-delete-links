import fs from 'fs';

async function testAll() {
  console.log('=== 1. Testing Instagram Services ===');
  const igCode = 'C8qLd9iI2eS'; // or general reel
  
  // Instagram embed captioned
  try {
    const res = await fetch(`https://www.instagram.com/reel/${igCode}/embed/captioned/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    console.log('IG embed status:', res.status);
    const html = await res.text();
    const vMatch = html.match(/"video_url":"([^"]+)"/);
    if (vMatch) {
      const vUrl = vMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      console.log('IG embed video found! length:', vUrl.length);
    } else {
      console.log('IG embed: no direct video_url in HTML');
    }
  } catch (e) {
    console.log('IG embed error:', e.message);
  }

  // Instafix / ddinstagram / vxinstagram / kksave
  const igServices = [
    `https://ddinstagram.com/reel/${igCode}`,
    `https://vxinstagram.com/reel/${igCode}`,
    `https://www.instagram.com/reel/${igCode}/?__a=1&__d=dis`
  ];
  for (const sUrl of igServices) {
    try {
      const res = await fetch(sUrl, {
        headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' }
      });
      console.log(sUrl, 'status:', res.status);
      const text = await res.text();
      const ogVideo = text.match(/<meta\s+(?:property|name)=["'](?:og:video(?::secure_url)?|twitter:player:stream)["']\s+content=["']([^"']+)["']/i);
      if (ogVideo) {
        console.log('Found video in', sUrl, ogVideo[1].slice(0, 80));
      }
    } catch (e) {
      console.log(sUrl, 'error:', e.message);
    }
  }

  console.log('\n=== 2. Testing TikTok Services ===');
  const ttUrl = 'https://www.tiktok.com/@tiktok/video/7106594312292453678';
  try {
    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ url: ttUrl, web: '1', hd: '1' })
    });
    console.log('TikWM status:', res.status);
    const d = await res.json();
    console.log('TikWM data:', d.code, d.msg, d.data?.play ? 'Found video' : 'No video');
  } catch(e) {
    console.log('TikWM err:', e.message);
  }

  console.log('\n=== 3. Testing YouTube and Music APIs ===');
  // Music search APIs:
  // Test YouTube Music & Search via Invidious / Piped / YT / Free APIs
  const query = 'queen bohemian rhapsody';
  
  // Saavn public instances
  const saavnEndpoints = [
    `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}`,
    `https://jiosaavn-api-privateindexer.vercel.app/search?query=${encodeURIComponent(query)}`,
    `https://saavn.me/search/songs?query=${encodeURIComponent(query)}`
  ];
  for (const ep of saavnEndpoints) {
    try {
      const res = await fetch(ep);
      console.log(ep, 'status:', res.status);
      if (res.ok) {
        const d = await res.json();
        const songs = d.data?.results || d.results || d.data;
        if (Array.isArray(songs) && songs.length > 0) {
          console.log('Saavn found songs:', songs[0].name || songs[0].title);
        }
      }
    } catch (e) {
      console.log(ep, 'error:', e.message);
    }
  }
}

testAll();
