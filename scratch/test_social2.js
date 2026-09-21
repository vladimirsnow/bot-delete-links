import tobyg from '@tobyg74/tiktok-api-dl';
import igpkg from 'instagram-url-direct';

async function testSocial() {
  console.log('=== Testing TikTok tobyg.Downloader ===');
  try {
    const res1 = await tobyg.Downloader('https://www.tiktok.com/@tiktok/video/7106594312292453678', {
      version: 'v1'
    });
    console.log('TikTok v1:', res1.status, res1.result?.video || res1.result?.type);
  } catch (e) {
    console.log('TikTok v1 error:', e.message);
  }

  try {
    const res2 = await tobyg.Downloader('https://www.tiktok.com/@tiktok/video/7106594312292453678', {
      version: 'v2'
    });
    console.log('TikTok v2:', res2.status, res2.result?.video || res2.result?.type);
  } catch (e) {
    console.log('TikTok v2 error:', e.message);
  }

  try {
    const res3 = await tobyg.Downloader('https://www.tiktok.com/@tiktok/video/7106594312292453678', {
      version: 'v3'
    });
    console.log('TikTok v3:', res3.status, res3.result?.video || res3.result?.type);
  } catch (e) {
    console.log('TikTok v3 error:', e.message);
  }

  console.log('\n=== Testing Instagram igpkg.instagramGetUrl ===');
  try {
    const igRes = await igpkg.instagramGetUrl('https://www.instagram.com/reel/C8qLd9iI2eS/');
    console.log('Instagram result:', igRes);
  } catch (e) {
    console.log('Instagram error:', e.message);
  }
}

testSocial();
