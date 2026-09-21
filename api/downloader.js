// Модуль для извлечения медиа (видео/фото) из TikTok, Instagram, YouTube Shorts
import btch from "btch-downloader";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BOT_USER_AGENT = "TelegramBot (like TwitterBot)";

/**
 * Хелпер для fetch с таймаутом (устраняет задержки)
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
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
 * Извлекает первую ссылку на TikTok, Instagram или YouTube Shorts из текста/entities
 */
export function extractMediaUrl(text, entities = []) {
  if (!text) return null;

  for (const entity of entities) {
    if (entity.type === "text_link" && entity.url) {
      if (isSupportedMediaUrl(entity.url)) return entity.url;
    }
  }

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
    return await resolveTikTok(url);
  }

  // Instagram (Reels, Posts)
  if (/instagram\.com/i.test(url)) {
    return await resolveInstagram(url);
  }

  // YouTube Shorts / Video
  if (/youtube\.com|youtu\.be/i.test(url)) {
    return await resolveYouTube(url);
  }

  return null;
}

/**
 * Резолвер для TikTok с мульти-уровневым фоллбеком
 */
async function resolveTikTok(url) {
  // 1. TikWM API (< 1c)
  try {
    const res = await fetchWithTimeout(
      "https://www.tikwm.com/api/",
      {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": "https://www.tikwm.com/",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ url, count: "12", cursor: "0", web: "1", hd: "1" })
      },
      3000
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data.data) {
        if (Array.isArray(data.data.images) && data.data.images.length > 0) {
          return {
            type: "photos",
            urls: data.data.images
          };
        }

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
    console.warn("resolveTikTok TikWM error:", err.message);
  }

  // 2. Tiklydown API
  try {
    const res = await fetchWithTimeout(
      `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
      {},
      3000
    );
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
    console.warn("resolveTikTok Tiklydown error:", err.message);
  }

  // 3. btch.douyin fallback
  try {
    const data = await Promise.race([
      btch.douyin(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("btch timeout")), 3000))
    ]);
    if (data && data.status && data.result?.video) {
      return { type: "video", url: data.result.video };
    }
  } catch (err) {
    console.warn("resolveTikTok btch error:", err.message);
  }

  return null;
}

/**
 * Извлекает shortcode из Instagram URL
 */
function extractInstagramShortcode(url) {
  const match = url.match(/instagram\.com\/(?:reel|reels|p|share)\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
}

/**
 * Резолвер для Instagram (Reels / Posts / Photos)
 */
async function resolveInstagram(url) {
  const shortcode = extractInstagramShortcode(url);

  // 1. Попытка через официальный GraphQL Polaris API (если задан INSTAGRAM_COOKIE в .env, работает 100%)
  if (shortcode) {
    try {
      const gqlResult = await resolveInstagramGraphQL(shortcode);
      if (gqlResult) return gqlResult;
    } catch (err) {
      console.warn("resolveInstagram GraphQL error:", err.message);
    }
  }

  // 2. Попытка через Discord/Telegram прокси eeinstagram / ddinstagram / vxinstagram
  if (shortcode) {
    const proxyHosts = [
      `https://eeinstagram.com/reel/${shortcode}`,
      `https://ddinstagram.com/reel/${shortcode}`,
      `https://vxinstagram.com/reel/${shortcode}`,
      `https://instagramez.com/reel/${shortcode}`
    ];

    for (const pUrl of proxyHosts) {
      try {
        const res = await fetchWithTimeout(
          pUrl,
          { headers: { "User-Agent": BOT_USER_AGENT } },
          2500
        );
        if (res.ok) {
          const html = await res.text();
          const videoMatch =
            html.match(/<meta\s+(?:property|name)=["'](?:og:video(?::secure_url)?|twitter:player:stream)["']\s+content=["']([^"']+)["']/i) ||
            html.match(/content=["']([^"']+)["'][^>]+(?:og:video|twitter:player:stream)/i);
          if (videoMatch && videoMatch[1] && videoMatch[1].startsWith("http")) {
            return { type: "video", url: videoMatch[1] };
          }

          const photoMatch =
            html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
            html.match(/content=["']([^"']+)["'][^>]+og:image/i);
          if (photoMatch && photoMatch[1] && photoMatch[1].startsWith("http") && !photoMatch[1].includes("ddinstagram")) {
            return { type: "photo", url: photoMatch[1] };
          }
        }
      } catch {
        // переходим к следующему прокси
      }
    }
  }

  // 3. Попытка через btch.igdl (таймаут 3с)
  try {
    const data = await Promise.race([
      btch.igdl(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("btch.igdl timeout")), 3000))
    ]);
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
    console.warn("resolveInstagram btch error:", err.message);
  }

  // 4. Универсальный фоллбек через Cobalt (если задан COBALT_API_URL)
  if (process.env.COBALT_API_URL) {
    return await resolveViaCobalt(url);
  }

  return null;
}

/**
 * GraphQL резолвер для Instagram
 */
async function resolveInstagramGraphQL(shortcode) {
  const bodyParams = new URLSearchParams({
    av: "0",
    __d: "www",
    __user: "0",
    __a: "1",
    __req: "b",
    dpr: "3",
    __ccg: "GOOD",
    lsd: "AVrqPT0gJDo",
    jazoest: "2946",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "PolarisPostActionLoadPostQueryQuery",
    variables: JSON.stringify({
      shortcode: shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null
    }),
    server_timestamps: "true",
    doc_id: "8845758582119845"
  });

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/87.0.4280.141 Mobile Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-FB-Friendly-Name": "PolarisPostActionLoadPostQueryQuery",
    "X-CSRFToken": "uy8OpI1kndx4oUHjlHaUfu",
    "X-IG-App-ID": "1217981644879628",
    "X-FB-LSD": "AVrqPT0gJDo",
    "X-ASBD-ID": "359341",
    "Referer": `https://www.instagram.com/p/${shortcode}/`
  };

  const cookie = process.env.INSTAGRAM_COOKIE || process.env.INSTAGRAM_SESSION_ID;
  if (cookie) {
    headers["Cookie"] = cookie.includes("sessionid=") ? cookie : `sessionid=${cookie}`;
  }

  const res = await fetchWithTimeout(
    "https://www.instagram.com/graphql/query",
    {
      method: "POST",
      headers,
      body: bodyParams.toString()
    },
    3500
  );

  if (!res.ok) return null;

  const json = await res.json();
  const media = json.data?.xdt_shortcode_media;
  if (!media) return null;

  // Карусель фото/видео
  if (media.edge_sidecar_to_children?.edges?.length > 0) {
    const photos = media.edge_sidecar_to_children.edges
      .map(edge => edge.node?.display_url)
      .filter(Boolean);
    if (photos.length > 0) {
      return { type: "photos", urls: photos };
    }
  }

  // Видео
  if (media.is_video && media.video_url) {
    return { type: "video", url: media.video_url };
  }

  // Фото
  if (media.display_url) {
    return { type: "photo", url: media.display_url };
  }

  return null;
}

/**
 * Резолвер для YouTube Shorts / Video
 */
async function resolveYouTube(url) {
  try {
    const ytData = await Promise.race([
      btch.youtube(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("btch.youtube timeout")), 4000))
    ]);

    if (ytData && ytData.status && ytData.mp4) {
      return {
        type: "video",
        url: ytData.mp4
      };
    }
  } catch (err) {
    console.warn("resolveYouTube error:", err.message);
  }

  if (process.env.COBALT_API_URL) {
    return await resolveViaCobalt(url);
  }

  return null;
}

/**
 * Фоллбек через кастомный инстанс Cobalt
 */
async function resolveViaCobalt(url) {
  const customCobalt = process.env.COBALT_API_URL;
  if (!customCobalt) return null;

  try {
    const apiUrl = customCobalt.endsWith("/") ? customCobalt : `${customCobalt}/`;
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
          url: url,
          videoQuality: "720",
          downloadMode: "auto"
        })
      },
      3500
    );

    if (res.ok) {
      const data = await res.json();
      if (data) {
        if (data.url) return { type: "video", url: data.url };
        if (data.status === "picker" && Array.isArray(data.picker)) {
          const photos = data.picker
            .filter(item => item.type === "photo")
            .map(item => item.url);
          if (photos.length > 0) return { type: "photos", urls: photos };
          const video = data.picker.find(item => item.type === "video");
          if (video && video.url) return { type: "video", url: video.url };
        }
      }
    }
  } catch (err) {
    console.warn("resolveViaCobalt error:", err.message);
  }

  return null;
}
