import btch from "btch-downloader";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Хелпер для fetch с таймаутом
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Полноценный поиск музыкального трека
 * Возвращает полную версию трека (НЕ 30-секундное превью!), длительность и обложку
 * @param {string} query Запрос пользователя
 * @returns {Promise<{ title: string, performer: string, duration?: number, url: string, thumbnail?: string, source: string } | null>}
 */
export async function searchTrack(query) {
  if (!query || typeof query !== "string") return null;
  const cleanQuery = query.trim();
  if (!cleanQuery) return null;

  console.log(`[Music] Searching for full track: "${cleanQuery}"`);

  // 1. Полноценный поиск через YouTube (yts) + аудио поток (btch.youtube)
  try {
    const ytResult = await searchAndDownloadYouTube(cleanQuery);
    if (ytResult && ytResult.url) {
      console.log(`[Music] Found full track on YouTube: "${ytResult.performer} - ${ytResult.title}" (${ytResult.duration}s)`);
      return ytResult;
    }
  } catch (err) {
    console.warn("[Music] YouTube track search error:", err.message);
  }

  // 2. Резервный поиск через Cobalt (если настроен инстанс)
  if (process.env.COBALT_API_URL) {
    try {
      const cobaltResult = await searchViaCobalt(cleanQuery);
      if (cobaltResult && cobaltResult.url) {
        console.log(`[Music] Found on Cobalt: "${cobaltResult.performer} - ${cobaltResult.title}"`);
        return cobaltResult;
      }
    } catch (err) {
      console.warn("[Music] Cobalt search error:", err.message);
    }
  }

  // 3. Резервный поиск через Muzofond (полный MP3)
  try {
    const muzofondResult = await searchMuzofond(cleanQuery);
    if (muzofondResult && muzofondResult.url) {
      console.log(`[Music] Found on Muzofond: "${muzofondResult.performer} - ${muzofondResult.title}"`);
      return muzofondResult;
    }
  } catch (err) {
    console.warn("[Music] Muzofond error:", err.message);
  }

  return null;
}

/**
 * Поиск трека на YouTube и извлечение полного аудиофайла
 */
async function searchAndDownloadYouTube(query) {
  // 1. Поиск видео через yts
  let searchRes;
  try {
    searchRes = await Promise.race([
      btch.yts(query),
      new Promise((_, reject) => setTimeout(() => reject(new Error("yts timeout")), 6000))
    ]);
  } catch (err) {
    console.warn("[Music] yts search timeout/error:", err.message);
    return null;
  }

  const videos = searchRes?.result?.videos || searchRes?.result?.all?.filter(item => item.type === "video") || [];
  if (videos.length === 0) {
    return null;
  }

  // Выбираем наиболее подходящее видео (обычно первое)
  const video = videos[0];
  const videoUrl = video.url || `https://youtube.com/watch?v=${video.videoId}`;
  const durationSec = video.duration?.seconds || video.seconds || 0;
  const coverUrl = video.image || video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

  console.log(`[Music] Selected YouTube candidate: "${video.title}" by ${video.author?.name || "Unknown"} [${videoUrl}]`);

  // 2. Скачивание аудиопотока через btch.youtube (таймаут 15с)
  let ytData;
  try {
    ytData = await Promise.race([
      btch.youtube(videoUrl),
      new Promise((_, reject) => setTimeout(() => reject(new Error("btch.youtube timeout")), 15000))
    ]);
  } catch (err) {
    console.warn("[Music] btch.youtube error:", err.message);
  }

  const directAudioUrl = ytData?.mp3 || ytData?.mp4;

  if (ytData && ytData.status && directAudioUrl) {
    // Парсим автора и название из заголовка видео
    let rawTitle = ytData.title || video.title || query;
    let performer = (video.author?.name || ytData.author || "").replace(/ - Topic$/i, "").trim();
    let title = rawTitle;

    if (rawTitle.includes(" - ")) {
      const parts = rawTitle.split(" - ");
      if (!performer || performer.toLowerCase().includes("topic")) {
        performer = parts[0].trim();
      }
      title = parts
        .slice(1)
        .join(" - ")
        .replace(/\(Official.*?\)/gi, "")
        .replace(/\(Audio.*?\)/gi, "")
        .replace(/\(Lyric.*?\)/gi, "")
        .replace(/\[Official.*?\]/gi, "")
        .replace(/\[Audio.*?\]/gi, "")
        .replace(/\[Lyric.*?\]/gi, "")
        .trim();
    }

    return {
      title: title || query,
      performer: performer || "",
      duration: durationSec || undefined,
      url: directAudioUrl,
      thumbnail: coverUrl,
      source: "youtube"
    };
  }

  // Если btch.youtube не отдал прямой URL, но у нас есть инстанс Cobalt
  if (process.env.COBALT_API_URL) {
    const cobaltAudio = await downloadAudioViaCobalt(videoUrl);
    if (cobaltAudio) {
      return {
        title: video.title || query,
        performer: (video.author?.name || "").replace(/ - Topic$/i, "").trim(),
        duration: durationSec || undefined,
        url: cobaltAudio,
        thumbnail: coverUrl,
        source: "youtube+cobalt"
      };
    }
  }

  return null;
}

/**
 * Извлечение аудио через Cobalt API
 */
async function downloadAudioViaCobalt(videoUrl) {
  const cobalt = process.env.COBALT_API_URL;
  if (!cobalt) return null;

  try {
    const apiUrl = cobalt.endsWith("/") ? cobalt : `${cobalt}/`;
    const res = await fetchWithTimeout(
      apiUrl,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT
        },
        body: JSON.stringify({
          url: videoUrl,
          downloadMode: "audio",
          audioFormat: "mp3"
        })
      },
      8000
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data.url) return data.url;
    }
  } catch (err) {
    console.warn("[Music] downloadAudioViaCobalt error:", err.message);
  }

  return null;
}

/**
 * Поиск через Cobalt
 */
async function searchViaCobalt(query) {
  // Находим видео на YouTube и скачиваем через Cobalt
  try {
    const searchRes = await btch.yts(query);
    const video = searchRes?.result?.videos?.[0];
    if (!video) return null;

    const videoUrl = video.url || `https://youtube.com/watch?v=${video.videoId}`;
    const audioUrl = await downloadAudioViaCobalt(videoUrl);
    if (audioUrl) {
      return {
        title: video.title || query,
        performer: (video.author?.name || "").replace(/ - Topic$/i, "").trim(),
        duration: video.duration?.seconds || video.seconds,
        url: audioUrl,
        thumbnail: video.image || video.thumbnail,
        source: "cobalt"
      };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Парсер поиска Muzofond (полный MP3 файл)
 */
async function searchMuzofond(query) {
  const url = `https://muzofond.fm/search/${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    },
    5000
  );

  if (!res.ok) return null;

  const html = await res.text();

  const playMatch =
    html.match(/<li[^>]*class="play"[^>]*data-url="([^"]+)"/i) ||
    html.match(/data-url="(https:\/\/[^"]*muzofond\.fm\/[^"]+)"/i) ||
    html.match(/data-url="([^"]+)"/i);

  if (!playMatch) return null;

  let directUrl = playMatch[1];
  if (directUrl.includes("/")) {
    const parts = directUrl.split("/");
    const b64 = parts[parts.length - 1];
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      if (decoded.startsWith("http")) {
        directUrl = decoded;
      }
    } catch {
      // ignore
    }
  }

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
