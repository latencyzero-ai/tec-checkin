// ============================================================
// /api/checkin  — Vercel serverless function
// ------------------------------------------------------------
// 1. Receives the Telegram Login Widget payload from the browser.
// 2. Verifies the payload's hash against the bot token (server-side).
//    This is what stops anyone forging a check-in for someone else.
// 3. Calls the Supabase `toggle_attendance` RPC (anon key + the one
//    granted function — nothing else in the DB is reachable).
// ============================================================

import crypto from "node:crypto";

// --- Environment variables (set these in Vercel project settings) ---
//   TELEGRAM_BOT_TOKEN  -> from BotFather
//   SUPABASE_URL        -> https://ysntabwrbmsafuakkpjy.supabase.co
//   SUPABASE_ANON_KEY   -> the public anon key (NOT the service key)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Telegram login payloads older than this are rejected (replay protection).
const MAX_AUTH_AGE_SECONDS = 86400; // 24h

function verifyTelegramAuth(data, botToken) {
  // Telegram signs the login payload with a key derived from the bot token.
  // We rebuild the data-check-string from every field except `hash`,
  // sorted alphabetically, joined by newlines, then HMAC-SHA256 it.
  const { hash, ...fields } = data;
  if (!hash) return { ok: false, reason: "Missing hash." };

  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  if (hmac !== hash) return { ok: false, reason: "Signature check failed." };

  const authDate = Number(fields.auth_date || 0);
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > MAX_AUTH_AGE_SECONDS) {
    return { ok: false, reason: "Login expired. Please tap Login again." };
  }

  return { ok: true, telegramId: Number(fields.id) };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ action: "error", message: "Method not allowed." });
    return;
  }
  if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({
      action: "error",
      message: "Server is not configured. (Missing environment variables.)",
    });
    return;
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { session_code, auth } = body;

    if (!session_code) {
      res.status(400).json({ action: "error", message: "No meeting code in the link." });
      return;
    }
    if (!auth || !auth.id) {
      res.status(400).json({ action: "error", message: "Please log in with Telegram first." });
      return;
    }

    // 1) Verify the Telegram login signature.
    const v = verifyTelegramAuth(auth, BOT_TOKEN);
    if (!v.ok) {
      res.status(401).json({ action: "error", message: v.reason });
      return;
    }

    // 2) Call the atomic RPC. The DB decides check-in vs check-out.
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/toggle_attendance`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_session_code: session_code,
        p_telegram_id: v.telegramId,
      }),
    });

    if (!rpcRes.ok) {
      const detail = await rpcRes.text();
      res.status(502).json({
        action: "error",
        message: "Could not reach the attendance service. Please try again.",
        detail,
      });
      return;
    }

    const result = await rpcRes.json();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      action: "error",
      message: "Something went wrong. Please try again.",
      detail: String(err),
    });
  }
}
