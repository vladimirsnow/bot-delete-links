export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, service: "telegram-moderation-bot" });
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

    if (!message || !message.from || message.from.id !== targetId) {
      return res.status(200).json({ ok: true });
    }

    const text = message.text || message.caption || "";
    const entities = [
      ...(message.entities || []),
      ...(message.caption_entities || [])
    ];

    const hasEntityUrl = entities.some(
      e => e.type === "url" || e.type === "text_link"
    );

    const urlRegex =
      /(?:https?:\/\/|www\.)[^\s<>()]+|(?<![@\w])(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|ru|kz|tv|cc|ly|co)(?:\/[^\s<>()]*)?/i;

    const hasUrl = hasEntityUrl || urlRegex.test(text);

    if (!hasUrl) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat?.id;
    const messageId = message.message_id;

    if (chatId === undefined || messageId === undefined) {
      return res.status(200).json({ ok: true });
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/deleteMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId
        })
      }
    );

    const result = await response.json();

    if (!result.ok) {
      console.error("Telegram deleteMessage failed:", result);
    } else {
      console.log(
        `Deleted message ${messageId} from ${targetId} in chat ${chatId}`
      );
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(200).json({ ok: true });
  }
}
