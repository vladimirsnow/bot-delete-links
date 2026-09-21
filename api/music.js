import btch from "btch-downloader";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Ищет музыкальный трек по названию или куску текста во всех доступных источниках.
 * Возвращает: { title: string, performer: string, duration?: number, url: string, source: string } | null
 */
export async function searchTrack(query) {
  if (!query || typeof query !== "string") return null;
  const cleanQuery = query.trim();
  if (!cleanQuery) return null;

  console.log(`[Music] Searching for track: "${cleanQuery}"`);

  // 1. Поиск в базе Muzofond (полные MP3 треки, огромная база русскоязычной и мировой музыки)
  try {
    const muzofondResult = await searchMuzofond(cleanQuery);
    if (muzofondResult && muzofondResult.url) {
      console.log(`[Music] Found on Muzofond: "${muzofondResult.performer} - ${muzofondResult.title}"`);
      return muzofondResult;
    }
  } catch (err) {
    console.error("[Music] Muzofond error:", err.message);
  }

  // 2. Поиск через YouTube + получение MP3 аудио-потока
  try {
    const ytResult = await searchYouTubeMusic(cleanQuery);
    if (ytResult && ytResult.url) {
      console.log(`[Music] Found on YouTube: "${ytResult.performer} - ${ytResult.title}"`);
      return ytResult;
    }
  } catch (err) {
    console.error("[Music] YouTube Music search error:", err.message);
  }

  // 3. Поиск через Deezer
  try {
    const deezerResult = await searchDeezer(cleanQuery);
    if (deezerResult && deezerResult.url) {
      console.log(`[Music] Found on Deezer: "${deezerResult.performer} - ${deezerResult.title}"`);
      return deezerResult;
    }
  } catch (err) {
    console.error("[Music] Deezer search error:", err.message);
  }

  // 4. Поиск через iTunes
  try {
    const itunesResult = await searchITunes(cleanQuery);
    if (itunesResult && itunesResult.url) {
      console.log(`[Music] Found on iTunes: "${itunesResult.performer} - ${itunesResult.title}"`);
      return itunesResult;
    }
  } catch (err) {
    console.error("[Music] iTunes search error:", err.message);
  }

  return null;
}

/**
 * Парсер поиска Muzofond
 */
async function searchMuzofond(query) {
  const url = `https://muzofond.fm/search/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });

  if (!res.ok) return null;

  const html = await res.text();

  // Ищем первый трек с кнопкой play и data-url
  const playMatch =
    html.match(/<li[^>]*class="play"[^>]*data-url="([^"]+)"/i) ||
    html.match(/data-url="(https:\/\/[^"]*muzofond\.fm\/[^"]+)"/i) ||
    html.match(/data-url="([^"]+)"/i);

  if (!playMatch) return null;

  let directUrl = playMatch[1];
  // Расшифровываем base64 ссылку, если есть
  if (directUrl.includes("/")) {
    const parts = directUrl.split("/");
    const b64 = parts[parts.length - 1];
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      if (decoded.startsWith("http")) {
        directUrl = decoded;
      }
    } catch {
      // Использовать исходный URL
    }
  }

  // Извлекаем исполнителя, название и длительность
  const artistMatch = html.match(/<span class="artist">([^<]+)<\/span>/i);
  const trackMatch = html.match(/<span class="track">([^<]+)<\/span>/i);
  const durationMatch = html.match(/data-duration="(\d+)"/i);

  const performer = artistMatch ? artistMatch[1].trim() : "";
  const title = trackMatch ? trackMatch[1].trim() : query;
  const duration = durationMatch ? parseInt(durationMatch[1], 10) : undefined;

  return {
    title,
    performer,
    duration,
    url: directUrl,
    source: "muzofond"
  };
}

/**
 * Поиск музыки на YouTube + извлечение аудио потока
 */
async function searchYouTubeMusic(query) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    query + " audio"
  )}`;
  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });

  if (!res.ok) return null;

  const html = await res.text();
  const videoIds = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(
    m => m[1]
  );
  const uniqueIds = [...new Set(videoIds)];
  if (uniqueIds.length === 0) return null;

  const videoId = uniqueIds[0];
  const ytData = await btch.youtube(`https://www.youtube.com/watch?v=${videoId}`);

  if (ytData && ytData.status && (ytData.mp3 || ytData.mp4)) {
    let title = ytData.title || query;
    let performer = ytData.author || "";

    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      performer = parts[0].trim();
      title = parts
        .slice(1)
        .join(" - ")
        .replace(/\(Official.*?\)/gi, "")
        .replace(/\(Audio.*?\)/gi, "")
        .replace(/\[Official.*?\]/gi, "")
        .replace(/\[Audio.*?\]/gi, "")
        .trim();
    }

    return {
      title,
      performer,
      url: ytData.mp3 || ytData.mp4,
      source: "youtube"
    };
  }

  return null;
}

/**
 * Поиск через Deezer API
 */
async function searchDeezer(query) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.data && data.data.length > 0) {
    const s = data.data[0];
    return {
      title: s.title,
      performer: s.artist?.name || "",
      duration: s.duration,
      url: s.preview,
      source: "deezer"
    };
  }

  return null;
}

/**
 * Поиск через iTunes API
 */
async function searchITunes(query) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    query
  )}&media=music&entity=song&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.resultCount > 0 && data.results[0]) {
    const s = data.results[0];
    return {
      title: s.trackName,
      performer: s.artistName,
      duration: Math.round(s.trackTimeMillis / 1000),
      url: s.previewUrl,
      source: "itunes"
    };
  }

  return null;
}
