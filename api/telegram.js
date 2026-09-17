import { extractMediaUrl, resolveMedia } from "./downloader.js";

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, service: "telegram-media-and-moderation-bot" });
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

    const text = message.text || message.caption || "";
    const entities = [
      ...(message.entities || []),
      ...(message.caption_entities || [])
    ];

    // ==========================================
    // 1. ИСКЛЮЧЕНИЕ: ЦЕЛЕВОЙ ПОЛЬЗОВАТЕЛЬ (TARGET_USER_ID)
    // Удаляем любые сообщения со ссылками без скачивания видео
    // ==========================================
    if (senderId === targetId) {
      const hasEntityUrl = entities.some(
        e => e.type === "url" || e.type === "text_link"
      );
      const urlRegex =
        /(?:https?:\/\/|www\.)[^\s<>()]+|(?<![@\w])(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|ru|kz|tv|cc|ly|co)(?:\/[^\s<>()]*)?/i;

      const hasUrl = hasEntityUrl || urlRegex.test(text);

      if (hasUrl) {
        await deleteTelegramMessage(token, chatId, messageId);
        console.log(`Deleted link message from target user ${targetId}`);
      }

      return res.status(200).json({ ok: true });
    }

    // ==========================================
    // 2. ДРУГИЕ ПОЛЬЗОВАТЕЛИ
    // Ищем ссылки на TikTok, Instagram Reels, YouTube Shorts,
    // скачиваем и отправляем видео/фото ответом на сообщение БЕЗ подписей
    // ==========================================
    const mediaUrl = extractMediaUrl(text, entities);

    if (mediaUrl) {
      console.log(`Detected media URL: ${mediaUrl} in chat ${chatId}`);
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
 * Удаление сообщения
 */
async function deleteTelegramMessage(token, chatId, messageId) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      })
    });
  } catch (err) {
    console.error("deleteTelegramMessage error:", err.message);
  }
}

/**
 * Отправка видео ответом на сообщение (без подписи)
 */
async function sendTelegramVideo(token, chatId, replyToMessageId, videoUrl) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        video: videoUrl,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true,
        supports_streaming: true
      })
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("sendTelegramVideo failed:", data);
    }
  } catch (err) {
    console.error("sendTelegramVideo error:", err.message);
  }
}

/**
 * Отправка альбома фотографий ответом на сообщение (без подписи)
 */
async function sendTelegramMediaGroup(token, chatId, replyToMessageId, imageUrls) {
  try {
    const media = imageUrls.slice(0, 10).map(url => ({
      type: "photo",
      media: url
    }));

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        media: media,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true
      })
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
 * Отправка одного фото ответом на сообщение (без подписи)
 */
async function sendTelegramPhoto(token, chatId, replyToMessageId, photoUrl) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true
      })
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("sendTelegramPhoto failed:", data);
    }
  } catch (err) {
    console.error("sendTelegramPhoto error:", err.message);
  }
}
