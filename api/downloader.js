// Вспомогательный модуль для извлечения медиа (видео/фото) из TikTok, Instagram, YouTube Shorts

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BOT_USER_AGENT = "TelegramBot (like TwitterBot)";

const COBALT_INSTANCES = [
  "https://cobalt-api.kwiatekm.tokyo",
  "https://api.cobalt.tools",
  "https://cobalt.canine.tools",
  "https://cobalt.streamioplus.online"
];

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
    /instagram\.com\/(?:reel|reels|p|share)\//i.test(url) ||
    /(?:youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/watch)/i.test(url)
  );
}

/**
 * Получает прямое видео или массив фото по ссылке
 * Возвращает: { type: 'video', url } | { type: 'photos', urls: [] } | { type: 'photo', url } | null
 */
export async function resolveMedia(url) {
  if (!url) return null;

  const cleanUrl = url.split("?")[0] || url;

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

  // YouTube Shorts
  if (/youtube\.com|youtu\.be/i.test(url)) {
    const result = await resolveYouTube(url);
    if (result) return result;
  }

  // Универсальный фоллбек через Cobalt
  return await resolveViaCobalt(url);
}

/**
 * Резолвер для TikTok через TikWM API
 */
async function resolveTikTok(url) {
  try {
    const res = await fetch("https://www.tikwm.com/api/", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ url, count: "12", cursor: "0", web: "1", hd: "1" })
    });

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
  } catch (err) {
    console.error("resolveTikTok error:", err.message);
  }

  return null;
}

/**
 * Резолвер для Instagram (Reels / Posts)
 */
async function resolveInstagram(url) {
  // 1. Попытка через DDInstagram / VXInstagram OpenGraph
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

  // 2. Попытка через Cobalt
  return await resolveViaCobalt(url);
}

/**
 * Резолвер для YouTube Shorts / Video
 */
async function resolveYouTube(url) {
  return await resolveViaCobalt(url);
}

/**
 * Универсальный резолвер через Cobalt API
 */
async function resolveViaCobalt(url) {
  const customCobalt = process.env.COBALT_API_URL;
  const instances = customCobalt
    ? [customCobalt, ...COBALT_INSTANCES]
    : COBALT_INSTANCES;

  for (const endpoint of instances) {
    try {
      const apiUrl = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
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
          vQuality: "720",
          downloadMode: "auto"
        })
      });

      if (!res.ok) continue;

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
    } catch (err) {
      // Переходим к следующему инстансу
      continue;
    }
  }

  return null;
}
