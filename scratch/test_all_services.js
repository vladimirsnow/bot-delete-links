async function testAll() {
  console.log('--- 1. Testing Invidious Instances list ---');
  try {
    const res = await fetch('https://api.invidious.io/instances.json?sort_by=type,health');
    if (res.ok) {
      const list = await res.json();
      const httpsInstances = list
        .filter(item => item[1].type === 'https' && item[1].api === true && item[1].health > 90)
        .map(item => item[0]);
      console.log('Healthy Invidious instances:', httpsInstances.slice(0, 10));

      for (const inst of httpsInstances.slice(0, 5)) {
        try {
          const testRes = await fetch(`${inst}/api/v1/videos/kJQP7kiw5Fk`);
          if (testRes.ok) {
            const data = await testRes.json();
            console.log(`Success on ${inst}: Title: ${data.title}`);
            const audioFormats = data.adaptiveFormats?.filter(f => f.type?.includes('audio')) || [];
            console.log(`Audio formats count on ${inst}:`, audioFormats.length);
            break;
          }
        } catch (e) {
          console.log(`Failed ${inst}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.log('Failed to fetch invidious list:', e.message);
  }

  console.log('\n--- 2. Testing YouTube InnerTube API ---');
  try {
    const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip'
      },
      body: JSON.stringify({
        videoId: 'kJQP7kiw5Fk',
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.29.37',
            androidSdkVersion: 30
          }
        }
      })
    });
    console.log('InnerTube status:', playerRes.status);
    const data = await playerRes.json();
    const formats = data.streamingData?.formats || [];
    const adaptiveFormats = data.streamingData?.adaptiveFormats || [];
    console.log('Video title:', data.videoDetails?.title);
    console.log('Formats count:', formats.length, 'Adaptive formats:', adaptiveFormats.length);
    if (formats[0]?.url) {
      console.log('Direct video stream URL found! Length:', formats[0].url.length);
    }
    const audioFmt = adaptiveFormats.find(f => f.mimeType?.includes('audio/mp4') || f.mimeType?.includes('audio/webm'));
    if (audioFmt?.url) {
      console.log('Direct audio stream URL found! Length:', audioFmt.url.length);
    }
  } catch (e) {
    console.log('InnerTube error:', e.message);
  }

  console.log('\n--- 3. Testing YouTube Search via InnerTube ---');
  try {
    const searchRes = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip'
      },
      body: JSON.stringify({
        query: 'царица анна асти',
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.29.37',
            androidSdkVersion: 30
          }
        }
      })
    });
    console.log('Search status:', searchRes.status);
    const sData = await searchRes.json();
    const contents = sData.contents?.sectionListRenderer?.contents || [];
    console.log('Search contents count:', contents.length);
    
    // Extract video items
    const rawItems = JSON.stringify(sData);
    const videoMatches = [...rawItems.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m => m[1]);
    const uniqueIds = [...new Set(videoMatches)];
    console.log('Found video IDs from search:', uniqueIds.slice(0, 5));
  } catch (e) {
    console.log('Search error:', e.message);
  }

  console.log('\n--- 4. Testing TikTok TikWM with Referer ---');
  try {
    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.tikwm.com/',
        'Origin': 'https://www.tikwm.com',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: new URLSearchParams({
        url: 'https://www.tiktok.com/@tiktok/video/7106594312292453678',
        count: '12',
        cursor: '0',
        web: '1',
        hd: '1'
      })
    });
    console.log('TikWM with referer status:', res.status);
    const d = await res.json();
    console.log('TikWM data:', d.code, d.msg, d.data?.play ? 'Found video: ' + d.data.play : 'No video');
  } catch (e) {
    console.log('TikWM error:', e.message);
  }

  console.log('\n--- 5. Testing Lovetik for TikTok ---');
  try {
    const res = await fetch('https://lovetik.com/api/ajax/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      body: new URLSearchParams({ query: 'https://www.tiktok.com/@tiktok/video/7106594312292453678' })
    });
    console.log('Lovetik status:', res.status);
    const d = await res.json();
    console.log('Lovetik video:', d.links?.[0]?.a);
  } catch (e) {
    console.log('Lovetik error:', e.message);
  }
}

testAll();
