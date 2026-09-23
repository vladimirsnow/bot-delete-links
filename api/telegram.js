import { extractMediaUrl, resolveMedia } from "./downloader.js";
import { searchTrack } from "./music.js";

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, service: "telegram-media-and-music-bot" });
  }

  const token = process.env.BOT_TOKEN;
  const targetIds = (process.env.TARGET_USER_ID || "6056988812")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

  if (!token) {
    console.error("BOT_TOKEN is not configured");
    return res.status(500).json({ ok: false });
  }

  try {
    const update = req.body || {};
    const message = update.message || update.edited_message;

    if (!message || !message.from || !message.chat) {
      return res.status(200).json({ ok: true });
    }

    const senderId = message.from.id;
    const chatId = message.chat.id;
    const messageId = message.message_id;

    const text = (message.text || message.caption || "").trim();
    const entities = [
      ...(message.entities || []),
      ...(message.caption_entities || [])
    ];

    // ==============================================================
    // 1. УДАЛЕНИЕ ФОТО, ВИДЕО, ССЫЛОК ОТ ТАРГЕТА (TARGET_USER_ID)
    // ==============================================================
    const isTarget = targetIds.includes(String(senderId));

    if (isTarget) {
      // Проверка на ссылки: сущности Telegram, протоколы http/https, домены, t.me
      const hasEntityUrl = entities.some(
        e => e.type === "url" || e.type === "text_link"
      );
      const urlRegex =
        /(?:https?:\/\/|www\.)[^\s<>()]+|(?<![@\w])(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|ru|kz|by|ua|tv|cc|ly|co|app|dev|xyz|site|top|link|online|bot|info|biz|to|gg|so)(?:\/[^\s<>()]*)?|t\.me\/[a-zA-Z0-9_+/]+/i;

      const hasUrl = hasEntityUrl || urlRegex.test(text);

      // Проверка на фото: стандартные фото и документы-изображения
      const hasPhoto =
        (Array.isArray(message.photo) && message.photo.length > 0) ||
        Boolean(message.document?.mime_type?.startsWith("image/"));

      // Проверка на видео: видео, видеосообщения (кругляшки), анимации (GIF), документы-видео
      const hasVideo =
        Boolean(message.video) ||
        Boolean(message.video_note) ||
        Boolean(message.animation) ||
        Boolean(message.document?.mime_type?.startsWith("video/"));

      if (hasUrl || hasPhoto || hasVideo) {
        await deleteTelegramMessage(token, chatId, messageId);
        const reasons = [
          hasUrl ? "ссылка" : null,
          hasPhoto ? "фото" : null,
          hasVideo ? "видео" : null
        ].filter(Boolean).join("+");
        console.log(`[Moderation] Deleted [${reasons}] from target user ${senderId} (msg: ${messageId}) in chat ${chatId}`);
      }

      // Сообщения таргета никогда не обрабатываются для скачивания или поиска
      return res.status(200).json({ ok: true });
    }

    // ==============================================================
    // 2. ПОИСК МУЗЫКИ ПО КЛЮЧЕВОМУ СЛОВУ "найти"
    // ==============================================================
    const isJustFind = /^(?:@\w+\s+)?(?:\/|!)?найти(?:@\w+)?(?:\s*)$/i.test(text);
    const musicMatch =
      text.match(/^(?:@\w+\s+)?(?:\/|!)?найти(?:@\w+)?(?::|\s+)(.+)$/i) ||
      text.match(/(?:^|\s)найти\s+(.+)$/i);

    if (isJustFind) {
      await sendTelegramMessage(
        token,
        chatId,
        messageId,
        "🎵 *Поиск музыки*\nЧтобы найти трек, напишите:\n`найти <название песни или автор>`\n\n*Примеры:*\n• `найти нфс`\n• `найти раковая выхухоль`"
      );
      return res.status(200).json({ ok: true });
    }

    if (musicMatch) {
      const songQuery = (musicMatch[1] || "").trim();

      if (songQuery) {
        console.log(`[Telegram] Music request: "${songQuery}" in chat ${chatId}`);
        sendTelegramChatAction(token, chatId, "upload_voice").catch(() => {});

        const track = await searchTrack(songQuery);

        if (track && track.url) {
          // Гарантированно передаем в качестве названия то, что ввел пользователь!
          const sent = await sendTelegramAudio(token, chatId, messageId, track, songQuery);
          if (!sent) {
            await sendTelegramMessage(
              token,
              chatId,
              messageId,
              `❌ Не удалось отправить аудио для «${songQuery}». Попробуйте уточнить запрос.`
            );
          }
        } else {
          await sendTelegramMessage(
            token,
            chatId,
            messageId,
            `🔍 По запросу «${songQuery}» ничего не найдено.\nПопробуйте указать автора или другие слова из песни.`
          );
        }

        return res.status(200).json({ ok: true });
      }
    }

    // ==============================================================
    // 3. СКАЧИВАНИЕ И ОТПРАВКА TIKTOK, INSTAGRAM, YOUTUBE
    // ==============================================================
    const mediaUrl = extractMediaUrl(text, entities);

    if (mediaUrl) {
      console.log(`[Telegram] Detected media URL: ${mediaUrl} in chat ${chatId}`);
      sendTelegramChatAction(token, chatId, "upload_video").catch(() => {});

      const media = await resolveMedia(mediaUrl);

      if (media) {
        // Видео
        if (media.type === "video" && media.url) {
          await sendTelegramVideo(token, chatId, messageId, media.url);
        }
        // Фото-карусель / слайды
        else if (media.type === "photos" && Array.isArray(media.urls) && media.urls.length > 0) {
          await sendTelegramMediaGroup(token, chatId, messageId, media.urls);

          // Если пост содержит звук, отправляем звук аудиофайлом СРАЗУ ПОСЛЕ отправки фото!
          if (media.audioUrl) {
            sendTelegramChatAction(token, chatId, "upload_voice").catch(() => {});
            await sendTelegramAudio(
              token,
              chatId,
              messageId,
              {
                url: media.audioUrl,
                title: media.audioTitle || "Звук из публикации",
                performer: media.audioAuthor || "TikTok / Instagram",
                thumbnail: media.urls[0]
              },
              media.audioTitle || "Звук из публикации"
            );
          }
        }
        // Одиночное фото
        else if (media.type === "photo" && media.url) {
          await sendTelegramPhoto(token, chatId, messageId, media.url);

          // Если есть звук
          if (media.audioUrl) {
            sendTelegramChatAction(token, chatId, "upload_voice").catch(() => {});
            await sendTelegramAudio(
              token,
              chatId,
              messageId,
              {
                url: media.audioUrl,
                title: media.audioTitle || "Звук из публикации",
                performer: media.audioAuthor || "TikTok / Instagram",
                thumbnail: media.url
              },
              media.audioTitle || "Звук из публикации"
            );
          }
        }
      } else {
        console.log(`[Telegram] Could not resolve media for URL: ${mediaUrl}`);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(200).json({ ok: true });
  }
}

/**
 * Индикатор действия бота
 */
async function sendTelegramChatAction(token, chatId, action) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: action }),
      signal: controller.signal
    });
  } catch {
    // ignore
  }
}

/**
 * Отправка текстового сообщения
 */
async function sendTelegramMessage(token, chatId, replyToMessageId, text) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 4000);
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true,
        parse_mode: "Markdown"
      }),
      signal: controller.signal
    });
  } catch (err) {
    console.error("sendTelegramMessage error:", err.message);
  }
}

/**
 * Удаление сообщения
 */
async function deleteTelegramMessage(token, chatId, messageId) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 4000);
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      }),
      signal: controller.signal
    });
  } catch (err) {
    console.error("deleteTelegramMessage error:", err.message);
  }
}

/**
 * Отправка аудио ответом на сообщение с обложкой и гарантированным названием
 * @param {string} token Токен бота
 * @param {number|string} chatId ID чата
 * @param {number} replyToMessageId ID сообщения пользователя
 * @param {object} track Данные трека ({ url, title, performer, duration, thumbnail })
 * @param {string} [requestedTitle] Название, гарантированно указанное пользователем
 */
async function sendTelegramAudio(token, chatId, replyToMessageId, track, requestedTitle) {
  // Название гарантированно соответствует запросу пользователя
  const finalTitle = (requestedTitle || track.title || "audio").trim();
  const performer = (track.performer || "").trim();
  const duration = track.duration ? Number(track.duration) : undefined;

  // 1. Попытка отправить через прямой URL (если нет обложки или для быстрой отправки)
  if (!track.thumbnail) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          audio: track.url,
          title: finalTitle,
          performer: performer || undefined,
          duration: duration || undefined,
          reply_to_message_id: replyToMessageId,
          allow_sending_without_reply: true
        }),
        signal: controller.signal
      });

      clearTimeout(id);
      const data = await res.json();
      if (data.ok) return true;
    } catch (err) {
      console.warn("[Telegram] sendAudio direct URL skipped:", err.message);
    }
  }

  // 2. Скачивание аудиофайла и обложки в буфер и отправка через multipart
  try {
    const fetchController = new AbortController();
    const fetchId = setTimeout(() => fetchController.abort(), 18000);

    // Параллельно скачиваем аудио и обложку (если есть)
    const audioPromise = fetch(track.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": track.source?.includes("youtube") ? "https://www.youtube.com/" : "https://muzofond.fm/"
      },
      signal: fetchController.signal
    });

    let thumbPromise = Promise.resolve(null);
    if (track.thumbnail) {
      thumbPromise = fetch(track.thumbnail, {
        headers: {
          "User-Agent": "Mozilla/5.0"
        },
        signal: fetchController.signal
      }).catch(() => null);
    }

    const [audioRes, thumbRes] = await Promise.all([audioPromise, thumbPromise]);
    clearTimeout(fetchId);

    if (!audioRes || !audioRes.ok) {
      console.error("[Telegram] Failed to fetch audio stream, status:", audioRes?.status);
      return false;
    }

    const arrayBuf = await audioRes.arrayBuffer();
    const formData = new FormData();
    formData.append("chat_id", String(chatId));

    const cleanFilename = finalTitle.replace(/[\/\\?%*:|"<>]/g, "_");
    formData.append(
      "audio",
      new Blob([arrayBuf], { type: "audio/mpeg" }),
      `${cleanFilename}.mp3`
    );

    formData.append("title", finalTitle);
    if (performer) formData.append("performer", performer);
    if (duration) formData.append("duration", String(duration));
    if (replyToMessageId) formData.append("reply_to_message_id", String(replyToMessageId));
    formData.append("allow_sending_without_reply", "true");

    // Прикрепляем обложку (thumbnail)
    if (thumbRes && thumbRes.ok) {
      try {
        const thumbBuf = await thumbRes.arrayBuffer();
        if (thumbBuf.byteLength > 0 && thumbBuf.byteLength <= 200 * 1024) {
          formData.append(
            "thumbnail",
            new Blob([thumbBuf], { type: "image/jpeg" }),
            "cover.jpg"
          );
        }
      } catch (thumbErr) {
        console.warn("[Telegram] Cover attach error:", thumbErr.message);
      }
    }

    const uploadController = new AbortController();
    const uploadId = setTimeout(() => uploadController.abort(), 20000);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: "POST",
      body: formData,
      signal: uploadController.signal
    });

    clearTimeout(uploadId);
    const data = await res.json();
    if (!data.ok) {
      console.error("[Telegram] sendAudio multipart failed:", data);
    }
    return Boolean(data.ok);
  } catch (err) {
    console.error("[Telegram] sendAudio buffer upload error:", err.message);
    return false;
  }
}

/**
 * Отправка видео ответом на сообщение
 */
async function sendTelegramVideo(token, chatId, replyToMessageId, videoUrl) {
  const isInstagramCdn = videoUrl.includes("cdninstagram.com") || videoUrl.includes("fbcdn.net");

  // 1. Попытка отправить через прямую ссылку (только для сервисов без блокировки серверов Telegram)
  if (!isInstagramCdn) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          video: videoUrl,
          reply_to_message_id: replyToMessageId,
          allow_sending_without_reply: true,
          supports_streaming: true
        }),
        signal: controller.signal
      });

      clearTimeout(id);
      const data = await res.json();
      if (data.ok) return true;
    } catch (err) {
      console.warn("[Telegram] sendTelegramVideo direct URL skipped:", err.message);
    }
  }

  // 2. Скачивание и отправка через буфер
  try {
    const fetchController = new AbortController();
    const fetchId = setTimeout(() => fetchController.abort(), 15000);

    const videoRes = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      signal: fetchController.signal
    });

    clearTimeout(fetchId);
    if (!videoRes.ok) return false;

    const contentLength = Number(videoRes.headers.get("content-length") || "0");
    if (contentLength > 50 * 1024 * 1024) {
      console.error("[Telegram] Video file is larger than 50MB");
      return false;
    }

    const arrayBuf = await videoRes.arrayBuffer();
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "video",
      new Blob([arrayBuf], { type: "video/mp4" }),
      "video.mp4"
    );
    if (replyToMessageId) formData.append("reply_to_message_id", String(replyToMessageId));
    formData.append("allow_sending_without_reply", "true");
    formData.append("supports_streaming", "true");

    const uploadController = new AbortController();
    const uploadId = setTimeout(() => uploadController.abort(), 20000);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: "POST",
      body: formData,
      signal: uploadController.signal
    });

    clearTimeout(uploadId);
    const data = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error("[Telegram] sendTelegramVideo buffer upload error:", err.message);
    return false;
  }
}

/**
 * Отправка альбома фотографий (разбивается на порции до 10 штук) ответом на сообщение
 */
async function sendTelegramMediaGroup(token, chatId, replyToMessageId, imageUrls) {
  try {
    // Лимит Telegram - 10 фото в одной группе
    const chunks = [];
    for (let i = 0; i < imageUrls.length; i += 10) {
      chunks.push(imageUrls.slice(i, i + 10));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const media = chunk.map(url => ({
        type: "photo",
        media: url
      }));

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          media: media,
          reply_to_message_id: i === 0 ? replyToMessageId : undefined,
          allow_sending_without_reply: true
        }),
        signal: controller.signal
      });

      const data = await res.json();
      if (!data.ok) {
        console.error("[Telegram] sendTelegramMediaGroup failed:", data);
      }
    }
  } catch (err) {
    console.error("[Telegram] sendTelegramMediaGroup error:", err.message);
  }
}

/**
 * Отправка одного фото ответом на сообщение
 */
async function sendTelegramPhoto(token, chatId, replyToMessageId, photoUrl) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true
      }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("[Telegram] sendTelegramPhoto failed:", data);
    }
  } catch (err) {
    console.error("[Telegram] sendTelegramPhoto error:", err.message);
  }
}
