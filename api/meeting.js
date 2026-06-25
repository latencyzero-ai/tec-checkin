// ============================================================
// /api/meeting?session=MTG-001
// Returns the active meeting's display name (and platform) for a
// session code, so the check-in page can show "School of Kingdom
// Leadership" instead of the internal MTG code.
// Read-only, anon-key, no secrets exposed.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const sessionCode = (req.query && req.query.session) || "";
  if (!sessionCode) {
    res.status(400).json({ ok: false, message: "No session code." });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ ok: false, message: "Server not configured." });
    return;
  }
  try {
    const url = `${SUPABASE_URL}/rest/v1/sessions?session_code=eq.${encodeURIComponent(sessionCode)}&select=session_code,meeting_name,platform,is_active&limit=1`;
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    const rows = await r.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) {
      res.status(200).json({ ok: true, found: false });
      return;
    }
    res.status(200).json({
      ok: true,
      found: true,
      session_code: row.session_code,
      meeting_name: row.meeting_name || row.session_code,
      platform: row.platform,
      is_active: row.is_active,
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Lookup failed." });
  }
}
