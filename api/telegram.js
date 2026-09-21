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
  const targetId = Number(process.env.TARGET_USER_ID || "6056988812");

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

    // ==========================================
    // 1. ИСКЛЮЧЕНИЕ: ЦЕЛЕВОЙ ПОЛЬЗОВАТЕЛЬ (TARGET_USER_ID)
    // ==========================================
    if (senderId === targetId) {
      const hasEntityUrl = entities.some(
        e => e.type === "url" || e.type === "text_link"
      );
      const urlRegex =
        /(?:https?:\/\/|www\.)[^\s<>()]+|(?<![@\w])(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|ru|kz|tv|cc|ly|co)(?:\/[^\s<>()]*)?/i;

      const hasUrl = hasEntityUrl || urlRegex.test(text);
      const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
      const hasVideo = Boolean(message.video);

      if (hasUrl || hasPhoto || hasVideo) {
        await deleteTelegramMessage(token, chatId, messageId);
        const reason = hasUrl
          ? "link"
          : hasPhoto
          ? "photo"
          : "video";
        console.log(`Deleted ${reason} message from target user ${targetId}`);
      }

      return res.status(200).json({ ok: true });
    }

    // ==========================================
    // 2. ПОИСК МУЗЫКИ ПО КЛЮЧЕВОМУ СЛОВУ "найти"
    // ==========================================
    const musicMatch = text.match(/^\s*(?:\/)?найти(?:[:\s]+(.+))?$/i);
    if (musicMatch) {
      const songQuery = (musicMatch[1] || "").trim();

      if (!songQuery) {
        await sendTelegramMessage(
          token,
          chatId,
          messageId,
          "🎵 Чтобы найти музыку, напишите:\n`найти <название трека или слова из песни>`"
        );
        return res.status(200).json({ ok: true });
      }

      console.log(`[Telegram] Music request: "${songQuery}" in chat ${chatId}`);
      sendTelegramChatAction(token, chatId, "upload_voice").catch(() => {});

      const track = await searchTrack(songQuery);

      if (track && track.url) {
        const sent = await sendTelegramAudio(token, chatId, messageId, track);
        if (!sent) {
          await sendTelegramMessage(
            token,
            chatId,
            messageId,
            `❌ Не удалось загрузить аудио для "${track.title}". Попробуйте другой запрос.`
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

    // ==========================================
    // 3. СКАЧИВАНИЕ И ОТПРАВКА TIKTOK, INSTAGRAM, YOUTUBE SHORTS
    // ==========================================
    const mediaUrl = extractMediaUrl(text, entities);

    if (mediaUrl) {
      console.log(`Detected media URL: ${mediaUrl} in chat ${chatId}`);
      sendTelegramChatAction(token, chatId, "upload_video").catch(() => {});

      const media = await resolveMedia(mediaUrl);

      if (media) {
        if (media.type === "video" && media.url) {
          await sendTelegramVideo(token, chatId, messageId, media.url);
        } else if (media.type === "photos" && Array.isArray(media.urls) && media.urls.length > 0) {
          await sendTelegramMediaGroup(token, chatId, messageId, media.urls);
        } else if (media.type === "photo" && media.url) {
          await sendTelegramPhoto(token, chatId, messageId, media.url);
        }
      } else {
        console.log(`Could not resolve media for URL: ${mediaUrl}`);
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
    setTimeout(() => controller.abort(), 3000);
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
 * Отправка аудио ответом на сообщение с защитой от задержек
 */
async function sendTelegramAudio(token, chatId, replyToMessageId, track) {
  // 1. Попытка отправить через прямой URL (быстрый таймаут 3.5с)
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        audio: track.url,
        title: track.title,
        performer: track.performer,
        duration: track.duration,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true
      }),
      signal: controller.signal
    });

    clearTimeout(id);
    const data = await res.json();
    if (data.ok) return true;
  } catch (err) {
    console.warn("sendAudio direct URL skipped:", err.message);
  }

  // 2. Фоллбек: быстро скачиваем в буфер и отправляем через multipart
  try {
    const fetchController = new AbortController();
    const fetchId = setTimeout(() => fetchController.abort(), 6000);

    const audioRes = await fetch(track.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": track.source === "muzofond" ? "https://muzofond.fm/" : "https://www.youtube.com/"
      },
      signal: fetchController.signal
    });

    clearTimeout(fetchId);
    if (!audioRes.ok) return false;

    const arrayBuf = await audioRes.arrayBuffer();
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "audio",
      new Blob([arrayBuf], { type: "audio/mpeg" }),
      `${(track.title || "audio").replace(/[\/\\?%*:|"<>]/g, "_")}.mp3`
    );
    if (track.title) formData.append("title", track.title);
    if (track.performer) formData.append("performer", track.performer);
    if (track.duration) formData.append("duration", String(track.duration));
    if (replyToMessageId) formData.append("reply_to_message_id", String(replyToMessageId));
    formData.append("allow_sending_without_reply", "true");

    const uploadController = new AbortController();
    const uploadId = setTimeout(() => uploadController.abort(), 10000);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: "POST",
      body: formData,
      signal: uploadController.signal
    });

    clearTimeout(uploadId);
    const data = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error("sendAudio buffer upload error:", err.message);
    return false;
  }
}

/**
 * Отправка видео ответом на сообщение с защитой от задержек
 */
async function sendTelegramVideo(token, chatId, replyToMessageId, videoUrl) {
  // 1. Попытка отправить через прямую ссылку (таймаут 4с)
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);

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
    console.warn("sendTelegramVideo direct URL skipped:", err.message);
  }

  // 2. Фоллбек: быстрое скачивание и отправка через буфер
  try {
    const fetchController = new AbortController();
    const fetchId = setTimeout(() => fetchController.abort(), 8000);

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
      console.error("Video file is larger than 50MB");
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
    const uploadId = setTimeout(() => uploadController.abort(), 12000);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: "POST",
      body: formData,
      signal: uploadController.signal
    });

    clearTimeout(uploadId);
    const data = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error("sendTelegramVideo buffer upload error:", err.message);
    return false;
  }
}

/**
 * Отправка альбома фотографий ответом на сообщение
 */
async function sendTelegramMediaGroup(token, chatId, replyToMessageId, imageUrls) {
  try {
    const media = imageUrls.slice(0, 10).map(url => ({
      type: "photo",
      media: url
    }));

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        media: media,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true
      }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("sendTelegramMediaGroup failed:", data);
    }
  } catch (err) {
    console.error("sendTelegramMediaGroup error:", err.message);
  }
}

/**
 * Отправка одного фото ответом на сообщение
 */
async function sendTelegramPhoto(token, chatId, replyToMessageId, photoUrl) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 4000);

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
      console.error("sendTelegramPhoto failed:", data);
    }
  } catch (err) {
    console.error("sendTelegramPhoto error:", err.message);
  }
}
