// Модуль для извлечения медиа (видео/фото) из TikTok, Instagram, YouTube Shorts
import btch from "btch-downloader";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BOT_USER_AGENT = "TelegramBot (like TwitterBot)";

/**
 * Извлекает первую ссылку на TikTok, Instagram или YouTube Shorts из текста/entities
 */
export function extractMediaUrl(text, entities = []) {
  if (!text) return null;

  // 1. Проверяем entities (явные ссылки и гиперссылки)
  for (const entity of entities) {
    if (entity.type === "text_link" && entity.url) {
      if (isSupportedMediaUrl(entity.url)) return entity.url;
    }
  }

  // 2. Ищем регулярным выражением
  const regex =
    /https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:tiktok\.com|instagram\.com|youtube\.com|youtu\.be)\/[^\s<>()]+/i;
  const match = text.match(regex);
  if (match && isSupportedMediaUrl(match[0])) {
    return match[0];
  }

  return null;
}

export function isSupportedMediaUrl(url) {
  if (!url) return false;
  return (
    /(?:tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(url) ||
    /instagram\.com\/(?:reel|reels|p|share|stories)\//i.test(url) ||
    /(?:youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/watch)/i.test(url)
  );
}

/**
 * Получает прямое видео или массив фото по ссылке
 * Возвращает: { type: 'video', url } | { type: 'photos', urls: [] } | { type: 'photo', url } | null
 */
export async function resolveMedia(url) {
  if (!url) return null;

  // TikTok
  if (/tiktok\.com/i.test(url)) {
    const result = await resolveTikTok(url);
    if (result) return result;
  }

  // Instagram (Reels, Posts)
  if (/instagram\.com/i.test(url)) {
    const result = await resolveInstagram(url);
    if (result) return result;
  }

  // YouTube Shorts / Video
  if (/youtube\.com|youtu\.be/i.test(url)) {
    const result = await resolveYouTube(url);
    if (result) return result;
  }

  // Универсальный фоллбек через Cobalt (если задан кастомный инстанс)
  if (process.env.COBALT_API_URL) {
    return await resolveViaCobalt(url);
  }

  return null;
}

/**
 * Резолвер для TikTok с мульти-уровневым фоллбеком
 */
async function resolveTikTok(url) {
  // 1. TikWM API
  try {
    const res = await fetch("https://www.tikwm.com/api/", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://www.tikwm.com/",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ url, count: "12", cursor: "0", web: "1", hd: "1" })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.data) {
        // Слайд-шоу с фотографиями
        if (Array.isArray(data.data.images) && data.data.images.length > 0) {
          return {
            type: "photos",
            urls: data.data.images
          };
        }

        // Видео
        const videoUrl = data.data.hdplay || data.data.play || data.data.wmplay;
        if (videoUrl) {
          const fullUrl = videoUrl.startsWith("http")
            ? videoUrl
            : `https://www.tikwm.com${videoUrl}`;
          return {
            type: "video",
            url: fullUrl
          };
        }
      }
    }
  } catch (err) {
    console.error("resolveTikTok TikWM error:", err.message);
  }

  // 2. Tiklydown API
  try {
    const res = await fetch(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        return {
          type: "photos",
          urls: data.images.map(img => img.url || img)
        };
      }
      const video = data.video?.noWatermark || data.video?.watermark || data.video?.url;
      if (video) {
        return { type: "video", url: video };
      }
    }
  } catch (err) {
    console.error("resolveTikTok Tiklydown error:", err.message);
  }

  // 3. btch.douyin / ttdl fallback
  try {
    const data = await btch.douyin(url);
    if (data && data.status && data.result?.video) {
      return { type: "video", url: data.result.video };
    }
  } catch (err) {
    console.error("resolveTikTok btch error:", err.message);
  }

  return null;
}

/**
 * Резолвер для Instagram (Reels / Posts / Photos)
 */
async function resolveInstagram(url) {
  // 1. Попытка через btch.igdl
  try {
    const data = await btch.igdl(url);
    if (data && data.status && Array.isArray(data.result)) {
      const validMedia = data.result.filter(item => item.url && item.url.startsWith("http"));
      if (validMedia.length > 1) {
        return {
          type: "photos",
          urls: validMedia.map(item => item.url)
        };
      } else if (validMedia.length === 1) {
        const item = validMedia[0];
        const isVideo = item.url.includes(".mp4") || item.type === "video";
        return {
          type: isVideo ? "video" : "photo",
          url: item.url
        };
      }
    }
  } catch (err) {
    console.error("resolveInstagram btch error:", err.message);
  }

  // 2. Попытка через OpenGraph / embed
  try {
    const cleanUrl = url.split("?")[0].replace(/\/+$/, "");
    const embedUrl = `${cleanUrl}/embed/captioned/`;
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (res.ok) {
      const html = await res.text();
      const videoMatch = html.match(/"video_url":"([^"]+)"/);
      if (videoMatch && videoMatch[1]) {
        const videoUrl = JSON.parse(`"${videoMatch[1]}"`);
        return { type: "video", url: videoUrl };
      }

      const imgMatch = html.match(/"display_url":"([^"]+)"/);
      if (imgMatch && imgMatch[1]) {
        const photoUrl = JSON.parse(`"${imgMatch[1]}"`);
        return { type: "photo", url: photoUrl };
      }
    }
  } catch (err) {
    console.error("resolveInstagram embed error:", err.message);
  }

  // 3. Попытка через ddinstagram / vxinstagram
  try {
    const ddUrl = url.replace(/(?:www\.)?instagram\.com/i, "ddinstagram.com");
    const res = await fetch(ddUrl, {
      headers: { "User-Agent": BOT_USER_AGENT }
    });
    if (res.ok) {
      const html = await res.text();
      const videoMatch =
        html.match(/<meta\s+property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<meta\s+name=["']twitter:player:stream["']\s+content=["']([^"']+)["']/i);
      if (videoMatch && videoMatch[1]) {
        return { type: "video", url: videoMatch[1] };
      }

      const photoMatch = html.match(
        /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
      );
      if (photoMatch && photoMatch[1]) {
        return { type: "photo", url: photoMatch[1] };
      }
    }
  } catch (err) {
    console.error("resolveInstagram ddinstagram error:", err.message);
  }

  return null;
}

/**
 * Резолвер для YouTube Shorts / Video
 */
async function resolveYouTube(url) {
  // 1. Попытка через btch.youtube (возвращает прямые mp4 потоки)
  try {
    const ytData = await btch.youtube(url);
    if (ytData && ytData.status && ytData.mp4) {
      return {
        type: "video",
        url: ytData.mp4
      };
    }
  } catch (err) {
    console.error("resolveYouTube btch error:", err.message);
  }

  // 2. Универсальный фоллбек через Cobalt (если сконфигурирован кастомный инстанс)
  if (process.env.COBALT_API_URL) {
    const cobaltRes = await resolveViaCobalt(url);
    if (cobaltRes) return cobaltRes;
  }

  return null;
}

/**
 * Универсальный резолвер через Cobalt API (если указан в COBALT_API_URL)
 */
async function resolveViaCobalt(url) {
  const customCobalt = process.env.COBALT_API_URL;
  if (!customCobalt) return null;

  try {
    const apiUrl = customCobalt.endsWith("/") ? customCobalt : `${customCobalt}/`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT
      },
      body: JSON.stringify({
        url: url,
        videoQuality: "720",
        downloadMode: "auto"
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data) {
        if (data.url) {
          return { type: "video", url: data.url };
        }
        if (data.status === "picker" && Array.isArray(data.picker)) {
          const photos = data.picker
            .filter(item => item.type === "photo")
            .map(item => item.url);
          if (photos.length > 0) {
            return { type: "photos", urls: photos };
          }
          const video = data.picker.find(item => item.type === "video");
          if (video && video.url) {
            return { type: "video", url: video.url };
          }
        }
      }
    }
  } catch (err) {
    console.error("resolveViaCobalt error:", err.message);
  }

  return null;
}
