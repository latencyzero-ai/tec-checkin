// ============================================================
// /api/config — returns non-secret front-end config.
// The Login Widget needs the bot's USERNAME (public, not the token).
// Kept server-side so you only set it once in Vercel env vars.
// ============================================================

export default function handler(req, res) {
  res.status(200).json({
    bot_username: process.env.TELEGRAM_BOT_USERNAME || "tecattendancebot",
  });
}
