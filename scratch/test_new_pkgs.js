import igdl from '@mrnima/instagram-downloader';
import tt from '@faouzkk/tiktok-dl';

async function testNewPkgs() {
  console.log('=== Test Instagram @mrnima/instagram-downloader ===');
  try {
    const igResult = await igdl('https://www.instagram.com/reel/C8qLd9iI2eS/');
    console.log('igdl result:', igResult);
  } catch (e) {
    console.log('igdl error:', e.message);
  }

  console.log('\n=== Test TikTok @faouzkk/tiktok-dl ===');
  try {
    const ttResult = await tt('https://www.tiktok.com/@tiktok/video/7106594312292453678');
    console.log('tiktok-dl result:', ttResult);
  } catch (e) {
    console.log('tiktok-dl error:', e.message);
  }
}

testNewPkgs();
