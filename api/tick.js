// GET /api/tick: one engine pass (close finished days, read the pot, read everyone's stats, match payouts).
// Anyone may call it; it is locked to one pass at a time, at most every 50 seconds. Vercel Cron calls it every
// minute and visits to the site nudge it too.
const L = require('./_lib');
const D = require('./_core');
module.exports = async (req, res) => {
  if (!L.dbReady()) return L.send(res, 200, { ok: false, error: 'no database' });
  try { L.send(res, 200, await D.tick(48000)); }
  catch (e) { L.send(res, 200, { ok: false, error: String(e && e.message).slice(0, 200) }); }
};
