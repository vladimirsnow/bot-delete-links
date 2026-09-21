import btch from 'btch-downloader';

async function testMoreBtch() {
  console.log('=== Test TikTok ttdl ===');
  try {
    const res = await btch.ttdl('https://www.tiktok.com/@tiktok/video/7106594312292453678');
    console.log('ttdl:', res);
  } catch (e) {
    console.log('ttdl err:', e.message);
  }

  console.log('\n=== Test YouTube Search yts ===');
  try {
    const res = await btch.yts('царица анна асти');
    console.log('yts results count:', res?.all?.length || res?.length);
    console.log('first item:', (res?.all || res)?.[0]);
  } catch (e) {
    console.log('yts err:', e.message);
  }

  console.log('\n=== Test Spotify / Music ===');
  try {
    const res = await btch.spotify('царица анна асти');
    console.log('spotify:', res);
  } catch (e) {
    console.log('spotify err:', e.message);
  }
}

testMoreBtch();
