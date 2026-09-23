import btch from "btch-downloader";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Хелпер для fetch с таймаутом
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
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
 * Полноценный высокоскоростной поиск музыкального трека по множеству независимых баз
 * Опрашивает базы ПАРАЛЛЕЛЬНО — побеждает самый быстрый качественный источник (время ответа < 1-2 сек)
 * @param {string} query Запрос пользователя
 * @returns {Promise<{ title: string, performer: string, duration?: number, url: string, thumbnail?: string, source: string } | null>}
 */
export async function searchTrack(query) {
  if (!query || typeof query !== "string") return null;
  const cleanQuery = query.trim();
  if (!cleanQuery) return null;

  console.log(`[Music] Parallel searching for: "${cleanQuery}"`);

  // Запускаем поиск обложки в iTunes параллельно
  const coverPromise = fetchITunesCover(cleanQuery).catch(() => null);

  // Список параллельных провайдеров музыки
  const providers = [
    // База 1: DriveMusic (огромный каталог, мгновенный ответ 500-900 мс)
    searchDriveMusic(cleanQuery),
    // База 2: YouTube Search + Fast MP3
    searchYouTube(cleanQuery),
    // База 3: Hitmo
    searchHitmo(cleanQuery),
    // База 4: Mp3Party
    searchMp3Party(cleanQuery),
    // База 5: Muzofond
    searchMuzofond(cleanQuery)
  ];

  if (process.env.COBALT_API_URL) {
    providers.push(searchViaCobalt(cleanQuery));
  }

  // Запускаем гонку всех баз данных одновременно!
  let track = null;
  try {
    track = await Promise.any(
      providers.map(p =>
        p.then(res => {
          if (!res || !res.url) throw new Error("No track");
          return res;
        })
      )
    );
  } catch {
    console.warn(`[Music] All parallel providers failed for "${cleanQuery}"`);
  }

  if (track) {
    // Если обложка отсутствует в источнике, подставляем параллельно найденную обложку из iTunes
    if (!track.thumbnail) {
      const itunesCover = await coverPromise;
      if (itunesCover) {
        track.thumbnail = itunesCover;
      }
    }
    console.log(
      `[Music] Found "${track.performer} - ${track.title}" from source: [${track.source}]`
    );
    return track;
  }

  return null;
}

/**
 * База 1: DriveMusic (прямой MP3, время ответа ~500-900мс)
 */
async function searchDriveMusic(query) {
  try {
    const res = await fetchWithTimeout(
      `https://drivemusic.me/?do=search&subaction=search&story=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"
        }
      },
      3500
    );
    if (!res.ok) return null;
    const html = await res.text();
    const urlMatch = html.match(/data-url="([^"]+)"/i);
    if (!urlMatch || !urlMatch[1]) return null;

    const nameMatch = html.match(/class="popular-play-name">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const artistMatch = html.match(/class="popular-play-author">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);

    return {
      title: nameMatch?.[1]?.trim() || query,
      performer: artistMatch?.[1]?.trim() || "",
      url: urlMatch[1],
      source: "drivemusic"
    };
  } catch {
    return null;
  }
}

/**
 * База 2: YouTube Search + Audio поток
 */
async function searchYouTube(query) {
  try {
    const searchRes = await Promise.race([
      btch.yts(query),
      new Promise((_, reject) => setTimeout(() => reject(new Error("yts timeout")), 9000))
    ]);

    const video = searchRes?.result?.videos?.[0];
    if (!video) return null;

    const videoUrl = video.url || `https://youtube.com/watch?v=${video.videoId}`;
    const coverUrl = video.image || video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
    const durationSec = video.duration?.seconds || video.seconds;

    const ytData = await Promise.race([
      btch.youtube(videoUrl),
      new Promise((_, reject) => setTimeout(() => reject(new Error("btch.youtube timeout")), 12000))
    ]);

    const directAudioUrl = ytData?.mp3 || ytData?.mp4;
    if (ytData && ytData.status && directAudioUrl) {
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
  } catch {
    return null;
  }
  return null;
}

/**
 * База 3: Hitmo (rus.hitmotop.com / hitmo.me)
 */
async function searchHitmo(query) {
  const hosts = [
    `https://rus.hitmotop.com/search?q=${encodeURIComponent(query)}`,
    `https://hitmo.me/search?q=${encodeURIComponent(query)}`
  ];

  for (const h of hosts) {
    try {
      const res = await fetchWithTimeout(
        h,
        {
          headers: {
            "User-Agent": USER_AGENT,
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"
          }
        },
        3000
      );
      if (!res.ok) continue;
      const html = await res.text();

      const urlMatch =
        html.match(/href="([^"]+\.mp3[^"]*)"/i) ||
        html.match(/data-musurl="([^"]+)"/i) ||
        html.match(/class="track__download-btn"[^>]*href="([^"]+)"/i);

      if (urlMatch && urlMatch[1]) {
        const artistMatch = html.match(/class="track__desc">([^<]+)<\/div>/i);
        const titleMatch = html.match(/class="track__title">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);

        return {
          title: titleMatch?.[1]?.trim() || query,
          performer: artistMatch?.[1]?.trim() || "",
          url: urlMatch[1],
          source: "hitmo"
        };
      }
    } catch {
      // try next host
    }
  }
  return null;
}

/**
 * База 4: Mp3Party (mp3party.net)
 */
async function searchMp3Party(query) {
  try {
    const res = await fetchWithTimeout(
      `https://mp3party.net/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"
        }
      },
      3000
    );
    if (!res.ok) return null;
    const html = await res.text();

    const playMatch =
      html.match(/data-url="([^"]+\.mp3[^"]*)"/i) ||
      html.match(/href="([^"]*\/download\/[^"]+)"/i);

    if (playMatch && playMatch[1]) {
      const fullUrl = playMatch[1].startsWith("http")
        ? playMatch[1]
        : `https://mp3party.net${playMatch[1]}`;

      const artistMatch = html.match(/class="artist">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      const titleMatch = html.match(/class="song-name">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);

      return {
        title: titleMatch?.[1]?.trim() || query,
        performer: artistMatch?.[1]?.trim() || "",
        url: fullUrl,
        source: "mp3party"
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * База 5: Muzofond (muzofond.fm)
 */
async function searchMuzofond(query) {
  try {
    const res = await fetchWithTimeout(
      `https://muzofond.fm/search/${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"
        }
      },
      3000
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

    return {
      title: trackMatch?.[1]?.trim() || query,
      performer: artistMatch?.[1]?.trim() || "",
      duration: durationMatch ? parseInt(durationMatch[1], 10) : undefined,
      url: directUrl,
      source: "muzofond"
    };
  } catch {
    return null;
  }
}

/**
 * Извлечение через Cobalt API
 */
async function searchViaCobalt(query) {
  const cobalt = process.env.COBALT_API_URL;
  if (!cobalt) return null;

  try {
    const searchRes = await btch.yts(query);
    const video = searchRes?.result?.videos?.[0];
    if (!video) return null;

    const videoUrl = video.url || `https://youtube.com/watch?v=${video.videoId}`;
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
      5000
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data.url) {
        return {
          title: video.title || query,
          performer: (video.author?.name || "").replace(/ - Topic$/i, "").trim(),
          duration: video.duration?.seconds || video.seconds,
          url: data.url,
          thumbnail: video.image || video.thumbnail,
          source: "cobalt"
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Быстрое параллельное получение официальной HD-обложки из iTunes (200-400мс)
 */
async function fetchITunesCover(query) {
  try {
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`,
      {},
      2000
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.results?.[0];
    if (item && item.artworkUrl100) {
      // Подставляем максимальное качество 600x600
      return item.artworkUrl100.replace("100x100bb", "600x600bb");
    }
  } catch {
    // ignore
  }
  return null;
}
