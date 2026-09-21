import tobyg from '@tobyg74/tiktok-api-dl';
import instagramGetUrl from 'instagram-url-direct';

const { TiktokDL } = tobyg;

async function testSocial() {
  console.log('=== Testing TikTokDL ===');
  try {
    const ttRes = await TiktokDL('https://www.tiktok.com/@tiktok/video/7106594312292453678', {
      version: 'v1'
    });
    console.log('TikTok v1 status:', ttRes.status);
    if (ttRes.result) {
      console.log('TikTok v1 video:', ttRes.result.video);
    }
  } catch (e) {
    console.log('TikTokDL v1 err:', e.message);
  }

  try {
    const ttRes2 = await TiktokDL('https://www.tiktok.com/@tiktok/video/7106594312292453678', {
      version: 'v2'
    });
    console.log('TikTok v2 status:', ttRes2.status);
    if (ttRes2.result) {
      console.log('TikTok v2 video:', ttRes2.result.video);
    }
  } catch (e) {
    console.log('TikTokDL v2 err:', e.message);
  }

  console.log('\n=== Testing InstagramUrlDirect ===');
  try {
    const igRes = await instagramGetUrl('https://www.instagram.com/reel/C8qLd9iI2eS/');
    console.log('IG results:', igRes);
  } catch (e) {
    console.log('IG direct err:', e.message);
  }
}

testSocial();
