# TEC Check-in — Web App (Workflow 3)

The one-tap check-in page leaders use during meetings, on the TEC brand.

**Identity = signed personal links.** The bot DMs each leader a link with a
signed token. The app verifies the signature server-side, so the link can't be
forged or edited. No login, no Telegram OAuth, no confirmation step — the
leader taps their link and is identified instantly. All attendance logic runs
as an atomic Supabase function; the app can only call that one function.

```
Meeting starts -> bot DMs each leader their personal link
   https://app/?session=MTG-001&id=<telegram_id>&sig=<hmac>
-> leader taps -> page shows Check In
-> /api/checkin verifies the signature
-> calls toggle_attendance() in Supabase
-> attendance_log row created / closed
```

## The signature
`sig = HMAC-SHA256("<session_code>:<telegram_id>", BOT_TOKEN)` → first 32 hex chars.
Same formula in three places: `genlink.js` (testing), `api/checkin.js`
(verification), and Workflow 2 in n8n (production link generation).

## Deploy

1. **Run the DB function once** — paste `checkin_function.sql` into Supabase SQL Editor and run.
2. **Get your Supabase anon key** — Project Settings → API → `anon`/`public` key.
3. **Deploy to Vercel** — push this folder to GitHub or run `vercel`. No build step.
4. **Set env vars in Vercel** → Settings → Environment Variables, then redeploy:

   | Name | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather |
   | `SUPABASE_URL` | `https://ysntabwrbmsafuakkpjy.supabase.co` |
   | `SUPABASE_ANON_KEY` | the anon key from step 2 |

   (No `/setdomain` needed anymore — that was only for the Login Widget.)

## Test it

1. Make sure an active session exists:
   ```sql
   INSERT INTO sessions (session_code, started_at, is_active, platform)
   VALUES ('MTG-001', now(), true, 'telegram');
   ```
2. Generate your signed test link locally (uses your real bot token):
   ```
   node genlink.js <BOT_TOKEN> MTG-001 7077574332 https://YOUR-URL.vercel.app
   ```
   (Replace 7077574332 with your own telegram_id if different.)
3. Open the printed link on your phone.
   - Tap 1 → **Check In** (block 1)
   - Tap 2 → **Check Out** (closes block, records minutes)
   - Tap 3 → **Check In** again (block 2 — a re-join)

Clean up after: delete the test rows from `attendance_log` and `sessions`.

## Notes
- **Font:** Fraunces (free) stands in for PP Editorial New (paid). Swap via
  `--font-display` in `index.html` — one line.
- **Concurrency:** `toggle_attendance` row-locks, so simultaneous taps are safe.
- **Security tradeoff:** a leader could forward their *own* link to someone
  else. For a trusted leadership group this is acceptable and avoids the
  brittle Login Widget handshake. If you ever need to close that gap, the
  link can be made single-use or short-expiry later.
- **Google Meet:** the same link works on any platform; Workflow 2 sets the
  `platform` column when it creates the session.
