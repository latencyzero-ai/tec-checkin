// ============================================================
// genlink.js — generate a signed personal check-in link (for testing
// and for reference). In production, Workflow 2 generates these inside
// n8n using the same formula. Run locally:
//
//   node genlink.js <BOT_TOKEN> <SESSION_CODE> <TELEGRAM_ID> <BASE_URL>
//
// Example:
//   node genlink.js 123456:ABC... MTG-001 7077574332 https://tec-checkin.vercel.app
// ============================================================

import crypto from "node:crypto";

const [, , botToken, sessionCode, telegramId, baseUrl] = process.argv;

if (!botToken || !sessionCode || !telegramId || !baseUrl) {
  console.error("Usage: node genlink.js <BOT_TOKEN> <SESSION_CODE> <TELEGRAM_ID> <BASE_URL>");
  process.exit(1);
}

const sig = crypto
  .createHmac("sha256", botToken)
  .update(`${sessionCode}:${telegramId}`)
  .digest("hex")
  .slice(0, 32);

const url = `${baseUrl}/?session=${encodeURIComponent(sessionCode)}&id=${encodeURIComponent(telegramId)}&sig=${sig}`;
console.log("\nSigned check-in link:\n");
console.log(url);
console.log("");
