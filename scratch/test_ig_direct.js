import igpkg from 'instagram-url-direct';

async function testIG() {
  console.log('Testing instagramGetUrl...');
  try {
    const res = await igpkg.instagramGetUrl('https://www.instagram.com/reel/C8qLd9iI2eS/');
    console.log('IG result:', JSON.stringify(res, null, 2));
  } catch (e) {
    console.log('IG error:', e.message);
  }
}
testIG();
