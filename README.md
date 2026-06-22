# TEC Check-in — Web App (Workflow 3)

The one-tap check-in page leaders use during meetings. Built on the TEC
brand. Identity is verified through the **Telegram Login Widget**, and all
attendance logic runs as an **atomic Supabase function** — the app itself
can only call that one function, nothing else in your database is reachable.

```
Leader taps group link  ->  this page (?session=MTG-001)
   -> "Log in with Telegram"  (proves who they are)
   -> taps Check In / Check Out
   -> /api/checkin verifies the Telegram signature
   -> calls toggle_attendance() in Supabase
   -> attendance_log row created / closed
```

---

## Deploy in 5 steps

### 1. Run the database function (once)
In Supabase → SQL Editor, paste **`checkin_function.sql`** and run it.
This creates `toggle_attendance()` and `get_checkin_context()` and grants
the `anon` role permission to call only those two functions.

### 2. Get your Supabase anon key
Supabase → Project Settings → API → **anon / public** key.
(Do **not** use the service_role key here — the anon key plus the function
grant is all the app needs, and it's safe to expose server-side.)

### 3. Deploy to Vercel
- Push this folder to a GitHub repo, or run `vercel` from the CLI in this folder.
- Vercel auto-detects it (static `public/` + serverless `api/`). No build step.

### 4. Set environment variables in Vercel
Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather |
| `TELEGRAM_BOT_USERNAME` | `tecattendancebot` (no @) |
| `SUPABASE_URL` | `https://ysntabwrbmsafuakkpjy.supabase.co` |
| `SUPABASE_ANON_KEY` | the anon key from step 2 |

Redeploy after adding them.

### 5. Bind the domain to your bot (required for Login Widget)
In Telegram, message **@BotFather**:
```
/setdomain
→ choose @tecattendancebot
→ send your Vercel URL, e.g.  tec-checkin.vercel.app
```
The Login Widget will not appear until this matches your live URL exactly.

---

## Test it
Open: `https://YOUR-URL.vercel.app/?session=MTG-001`
(You'll need an active session with code `MTG-001` — Workflow 2 creates these.
For a manual test, insert one row into `sessions` with `is_active = true`.)

- First tap after login → **Check In** (creates block 1)
- Tap again → **Check Out** (closes the block, records minutes)
- Tap again → **Check In** again (block 2 — a re-join)

---

## Notes & future-proofing
- **Font:** the display face is *Fraunces* (free, Google Fonts) standing in for
  *PP Editorial New* (paid). To swap, change `--font-display` in `index.html`
  and add your licensed webfont — one line, one place.
- **Security:** the Telegram hash is verified server-side in `api/checkin.js`.
  A forged URL can't check someone in — without a valid Telegram signature the
  request is rejected.
- **Concurrency:** `toggle_attendance` uses a row lock (`for update`), so 40
  people tapping at once can't create duplicate or half-written blocks.
- **Google Meet:** the same link works regardless of platform. Workflow 2 sets
  the `platform` column when the session is created; this page doesn't care.

