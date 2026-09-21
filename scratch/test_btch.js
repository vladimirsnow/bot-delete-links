import btch from 'btch-downloader';

async function testBtch() {
  console.log('Available btch methods:', Object.keys(btch));
  
  // Test TikTok
  try {
    const ttRes = await btch.tiktok('https://www.tiktok.com/@tiktok/video/7106594312292453678');
    console.log('btch tiktok:', ttRes);
  } catch (e) {
    console.log('btch tiktok error:', e.message);
  }

  // Test Instagram
  try {
    const igRes = await btch.igdl('https://www.instagram.com/reel/C8qLd9iI2eS/');
    console.log('btch igdl:', igRes);
  } catch (e) {
    console.log('btch igdl error:', e.message);
  }

  // Test YouTube
  try {
    const ytRes = await btch.youtube('https://www.youtube.com/shorts/kJQP7kiw5Fk');
    console.log('btch youtube:', ytRes);
  } catch (e) {
    console.log('btch youtube error:', e.message);
  }

  // Test SoundCloud / music
  if (btch.soundcloud) {
    try {
      const scRes = await btch.soundcloud('https://soundcloud.com/octobersveryown/drake-gods-plan');
      console.log('btch soundcloud:', scRes);
    } catch (e) {
      console.log('btch sc error:', e.message);
    }
  }
}

testBtch();
