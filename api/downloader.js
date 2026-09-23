// Модуль для извлечения медиа (видео/фото/аудио) из TikTok, Instagram, YouTube
import btch from "btch-downloader";
import { snapsave } from "snapsave-media-downloader";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BOT_USER_AGENT = "TelegramBot (like TwitterBot)";

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
 * Извлекает первую ссылку на TikTok, Instagram или YouTube из текста/entities
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
 * Получает прямое видео или массив фото (и аудио, если есть) по ссылке
 */
export async function resolveMedia(url) {
  if (!url) return null;

  // TikTok
  if (/tiktok\.com/i.test(url)) {
    return await resolveTikTok(url);
  }

  // Instagram (Reels, Posts, Carousels)
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
 * Параллельный высокоскоростной резолвер для TikTok
 */
async function resolveTikTok(url) {
  const methods = [];

  // Метод 1: TikWM API
  methods.push(
    (async () => {
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
        3500
      );
      if (!res.ok) throw new Error("TikWM not ok");
      const data = await res.json();
      if (!data?.data) throw new Error("TikWM no data");

      const audioUrl = data.data.music || data.data.music_info?.play;
      const fullAudioUrl = audioUrl
        ? (audioUrl.startsWith("http") ? audioUrl : `https://www.tikwm.com${audioUrl}`)
        : undefined;
      const audioTitle = data.data.music_info?.title || "TikTok Audio";
      const audioAuthor = data.data.music_info?.author || data.data.author?.nickname;

      if (Array.isArray(data.data.images) && data.data.images.length > 0) {
        return {
          type: "photos",
          urls: data.data.images,
          audioUrl: fullAudioUrl,
          audioTitle,
          audioAuthor
        };
      }

      const videoUrl = data.data.hdplay || data.data.play || data.data.wmplay;
      if (videoUrl) {
        const fullUrl = videoUrl.startsWith("http")
          ? videoUrl
          : `https://www.tikwm.com${videoUrl}`;
        return { type: "video", url: fullUrl };
      }
      throw new Error("TikWM no media");
    })()
  );

  // Метод 2: Snapsave
  methods.push(
    (async () => {
      const snapResult = await snapsave(url);
      if (snapResult?.success && snapResult.data?.media?.length > 0) {
        const mediaList = snapResult.data.media;
        const videos = mediaList.filter(m => m.type === "video");
        const photos = mediaList.filter(m => m.type === "photo" || m.type === "image");

        if (photos.length > 1) {
          return { type: "photos", urls: photos.map(p => p.url) };
        } else if (photos.length === 1 && videos.length === 0) {
          return { type: "photo", url: photos[0].url };
        } else if (videos.length > 0) {
          return { type: "video", url: videos[0].url };
        }
      }
      throw new Error("Snapsave failed");
    })()
  );

  // Метод 3: Tiklydown
  methods.push(
    (async () => {
      const res = await fetchWithTimeout(
        `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
        {},
        3500
      );
      if (!res.ok) throw new Error("Tiklydown not ok");
      const data = await res.json();
      const audioUrl = data.music?.play_url;
      const audioTitle = data.music?.title || "TikTok Audio";
      const audioAuthor = data.music?.author;

      if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        return {
          type: "photos",
          urls: data.images.map(img => img.url || img),
          audioUrl,
          audioTitle,
          audioAuthor
        };
      }
      const video = data.video?.noWatermark || data.video?.watermark || data.video?.url;
      if (video) return { type: "video", url: video };
      throw new Error("Tiklydown no media");
    })()
  );

  try {
    return await Promise.any(methods);
  } catch (err) {
    console.warn("[Downloader] All TikTok methods failed:", err.message);
  }

  // Резерв через btch
  try {
    const data = await btch.douyin(url);
    if (data?.status && data.result?.video) {
      return { type: "video", url: data.result.video };
    }
  } catch {
    // ignore
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
 * Высокоскоростной параллельный резолвер для Instagram (Reels / Posts)
 * Запускает пул прокси, Snapsave и GraphQL ОДНОВРЕМЕННО — время ответа 1.5 - 3 сек!
 */
async function resolveInstagram(url) {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) return null;

  const methods = [];

  // Метод 1: Параллельный опрос пула прокси (самый быстрый, 1-2 сек)
  methods.push(resolveInstagramViaProxies(shortcode));

  // Метод 2: Snapsave Media Downloader (3.5с)
  methods.push(
    (async () => {
      const snapResult = await snapsave(url);
      if (snapResult?.success && snapResult.data?.media?.length > 0) {
        const mediaList = snapResult.data.media;
        const videos = mediaList.filter(m => m.type === "video");
        const photos = mediaList.filter(m => m.type === "photo" || m.type === "image");

        if (photos.length > 1) {
          return { type: "photos", urls: photos.map(p => p.url) };
        } else if (photos.length === 1 && videos.length === 0) {
          return { type: "photo", url: photos[0].url };
        } else if (videos.length > 0) {
          return { type: "video", url: videos[0].url };
        }
      }
      throw new Error("Snapsave failed");
    })()
  );

  // Метод 3: GraphQL Polaris
  methods.push(
    (async () => {
      const gqlResult = await resolveInstagramGraphQL(shortcode);
      if (gqlResult) return gqlResult;
      throw new Error("GraphQL failed");
    })()
  );

  // Метод 4: Cobalt (если настроен)
  if (process.env.COBALT_API_URL) {
    methods.push(
      (async () => {
        const res = await resolveViaCobalt(url);
        if (res) return res;
        throw new Error("Cobalt failed");
      })()
    );
  }

  try {
    return await Promise.any(methods);
  } catch (err) {
    console.warn("[Downloader] All parallel Instagram methods failed:", err.message);
  }

  // Резервный btch.igdl
  try {
    const data = await btch.igdl(url);
    if (data?.status && Array.isArray(data.result)) {
      const validMedia = data.result.filter(item => item.url && item.url.startsWith("http"));
      if (validMedia.length > 1) {
        return { type: "photos", urls: validMedia.map(item => item.url) };
      } else if (validMedia.length === 1) {
        const item = validMedia[0];
        const isVideo = item.url.includes(".mp4") || item.type === "video";
        return { type: isVideo ? "video" : "photo", url: item.url };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Опрос пула прокси-серверов Instagram ПАРАЛЛЕЛЬНО
 * Тот, кто отвечает первым (< 1.5-2 сек), мгновенно отдает ссылку
 */
async function resolveInstagramViaProxies(shortcode) {
  const proxyHosts = [
    `https://ddinstagram.com/reel/${shortcode}`,
    `https://kkinstagram.com/reel/${shortcode}`,
    `https://eeinstagram.com/reel/${shortcode}`,
    `https://vxinstagram.com/reel/${shortcode}`,
    `https://instagramez.com/reel/${shortcode}`,
    `https://instafix.app/reel/${shortcode}`
  ];

  return await Promise.any(
    proxyHosts.map(async pUrl => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(pUrl, {
          headers: { "User-Agent": BOT_USER_AGENT },
          signal: controller.signal
        });
        clearTimeout(id);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

        if (photoMatch && photoMatch[1] && photoMatch[1].startsWith("http") && !photoMatch[1].includes("ddinstagram") && !photoMatch[1].includes("kkinstagram")) {
          return { type: "photo", url: photoMatch[1] };
        }

        throw new Error("No match");
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    })
  );
}

/**
 * GraphQL Polaris запрос
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
    4000
  );

  if (!res.ok) return null;

  const json = await res.json();
  const media = json.data?.xdt_shortcode_media;
  if (!media) return null;

  const audioUrl =
    media.clips_metadata?.audio_type_model?.audio_asset?.audio_asset_url ||
    media.audio_src ||
    undefined;

  if (media.edge_sidecar_to_children?.edges?.length > 0) {
    const photos = media.edge_sidecar_to_children.edges
      .map(edge => edge.node?.display_url)
      .filter(Boolean);
    if (photos.length > 0) {
      return { type: "photos", urls: photos, audioUrl };
    }
  }

  if (media.is_video && media.video_url) {
    return { type: "video", url: media.video_url };
  }

  if (media.display_url) {
    return { type: "photo", url: media.display_url, audioUrl };
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
      new Promise((_, reject) => setTimeout(() => reject(new Error("btch.youtube timeout")), 8000))
    ]);

    if (ytData?.status && ytData.mp4) {
      return { type: "video", url: ytData.mp4 };
    }
  } catch (err) {
    console.warn("[Downloader] resolveYouTube error:", err.message);
  }

  if (process.env.COBALT_API_URL) {
    return await resolveViaCobalt(url);
  }

  return null;
}

/**
 * Фоллбек через Cobalt
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
      4000
    );

    if (res.ok) {
      const data = await res.json();
      if (data) {
        if (data.url) return { type: "video", url: data.url };
        if (data.status === "picker" && Array.isArray(data.picker)) {
          const photos = data.picker
            .filter(item => item.type === "photo")
            .map(item => item.url);
          const audio = data.picker.find(item => item.type === "audio");
          if (photos.length > 0) {
            return {
              type: "photos",
              urls: photos,
              audioUrl: audio?.url
            };
          }
          const video = data.picker.find(item => item.type === "video");
          if (video && video.url) return { type: "video", url: video.url };
        }
      }
    }
  } catch (err) {
    console.warn("[Downloader] resolveViaCobalt error:", err.message);
  }

  return null;
}
