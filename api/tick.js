// GET /api/tick: one engine pass. The arena goes first (payments in, runs timed out, payouts sent and confirmed,
// stray SOL sent back), then the Fortnite tracker (close finished days, read the pot, read everyone's stats, match
// payouts). Anyone may call it; each part is locked to one pass at a time. Vercel Cron calls it every minute and
// visits to the site nudge it too.
const L = require('./_lib');
const D = require('./_core');
const A = require('./_arena');
module.exports = async (req, res) => {
  if (!L.dbReady()) return L.send(res, 200, { ok: false, error: 'no database' });
  const t0 = Date.now(); let arena;
  try { arena = await A.tick(); } catch (e) { arena = { error: String(e && e.message).slice(0, 200) }; }
  try { const out = await D.tick(Math.max(8000, 48000 - (Date.now() - t0))); L.send(res, 200, { ...out, arena }); }
  catch (e) { L.send(res, 200, { ok: false, error: String(e && e.message).slice(0, 200), arena }); }
};
