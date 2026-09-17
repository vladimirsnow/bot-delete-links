export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });

  const token = process.env.BOT_TOKEN;
  const baseUrl = process.env.VERCEL_PROJECT_URL;

  if (!token || !baseUrl) {
    return res.status(500).json({
      ok: false,
      error: "BOT_TOKEN and VERCEL_PROJECT_URL must be configured"
    });
  }

  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram`;

  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "edited_message"],
        drop_pending_updates: false
      })
    }
  );

  const result = await response.json();

  return res.status(response.ok ? 200 : 500).json({
    ...result,
    webhook_url: webhookUrl
  });
}
