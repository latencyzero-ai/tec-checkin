// ============================================================
// /api/checkin  — Vercel serverless function  (signed-link auth)
// ------------------------------------------------------------
// Identity comes from a SIGNED personal link the bot DMs each leader:
//   https://app/?session=MTG-001&id=7077574332&sig=<hmac>
//
// The sig = HMAC-SHA256("session:id", BOT_TOKEN), first 32 hex chars.
// We recompute it here and compare. A leader cannot change `id` to
// someone else's without knowing the bot secret, so the link can't be
// forged or edited. (A leader could forward their OWN link — accepted
// tradeoff for a trusted leadership group.)
//
// Then we call the atomic Supabase `toggle_attendance` RPC.
// ============================================================

import crypto from "node:crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export function signCheckin(sessionCode, telegramId, botToken) {
  const msg = `${sessionCode}:${telegramId}`;
  return crypto.createHmac("sha256", botToken).update(msg).digest("hex").slice(0, 32);
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ action: "error", message: "Method not allowed." });
    return;
  }
  if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ action: "error", message: "Server is not configured. (Missing environment variables.)" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { session_code, id, sig } = body;

    if (!session_code) {
      res.status(400).json({ action: "error", message: "No meeting code in the link." });
      return;
    }
    if (!id || !sig) {
      res.status(400).json({ action: "error", message: "This link is missing its security code. Please use the personal link the bot sent you." });
      return;
    }

    const expected = signCheckin(session_code, id, BOT_TOKEN);
    if (!timingSafeEqual(expected, sig)) {
      res.status(401).json({ action: "error", message: "This link is invalid or has been altered. Please use the personal link the bot sent you." });
      return;
    }

    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/toggle_attendance`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_session_code: session_code, p_telegram_id: Number(id) }),
    });

    if (!rpcRes.ok) {
      const detail = await rpcRes.text();
      res.status(502).json({ action: "error", message: "Could not reach the attendance service. Please try again.", detail });
      return;
    }

    const result = await rpcRes.json();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ action: "error", message: "Something went wrong. Please try again.", detail: String(err) });
  }
}
