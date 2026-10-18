// /api/{state,board,lookup,register,verify,me,days}: one function, routed by ?op= (see vercel.json rewrites).
const L = require('./_lib');
const D = require('./_core');
const MSG = {
  nokey: 'The win tracker is switching on. Try again in a few minutes.',
  private: 'Your stats are private. In Fortnite: Settings → Account and Privacy → turn ON "Show on Career Leaderboard", then try again.',
  notfound: 'No Epic account with that name on that platform.',
  nomatches: 'That account has no battle royale matches yet.',
  denied: 'The stats service refused the request. Try again shortly.',
  busy: 'The stats service is busy. Try again in a moment.',
  upstream: 'The stats service did not answer. Try again in a moment.',
  short: 'Type at least 3 characters.',
  wallet: 'That is not a Solana wallet address.',
  taken: 'That Epic account is already registered to another wallet.',
  wallet_taken: 'That wallet is already registered to another Epic account.',
  pending: 'Someone started a claim on this account. It expires soon; try again after.',
  noclaim: 'That registration was not found. Start again.',
  none: 'No player found for that name or wallet.',
  slow: 'Too many tries. Wait a minute.',
  db: 'The board is offline for a moment.',
};
const fail = (res, code, extra = {}) => L.send(res, 200, { ok: false, code, error: MSG[code] || 'Something went wrong.', ...extra });
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return L.send(res, 204, {});
  const qy = L.query(req), op = String(qy.op || 'state');
  if (!L.dbReady()) return fail(res, 'db');
  try {
    if (op === 'state') return L.send(res, 200, await D.state(), L.CACHE(8, 30));
    if (op === 'board') return L.send(res, 200, await D.boardAll(), L.CACHE(20, 60));
    if (op === 'days') return L.send(res, 200, await D.days(Number(qy.limit) || 14), L.CACHE(20, 60));
    if (op === 'me') { if (L.limited('me:' + L.ip(req), 30, 60000)) return fail(res, 'slow'); const r = await D.me(qy.q); return r.ok ? L.send(res, 200, r) : fail(res, r.code); }
    if (op === 'lookup') {
      if (L.limited('lk:' + L.ip(req), 12, 60000)) return fail(res, 'slow');
      const r = await D.lookup(qy.name, qy.platform); return r.ok ? L.send(res, 200, r) : fail(res, r.code);
    }
    if (op === 'register') {
      if (req.method !== 'POST') return fail(res, 'upstream');
      if (L.limited('rg:' + L.ip(req), 8, 60000)) return fail(res, 'slow');
      const b = await L.body(req); const r = await D.register(b || {});
      return r.ok ? L.send(res, 200, r) : fail(res, r.code, r.mins ? { mins: r.mins } : {});
    }
    if (op === 'verify') {
      if (L.limited('vf:' + L.ip(req), 40, 60000)) return fail(res, 'slow');
      const r = await D.verify(qy.id); return r.ok ? L.send(res, 200, r) : fail(res, r.code);
    }
    return L.send(res, 404, { ok: false, error: 'unknown op' });
  } catch (e) {
    console.error('dub api', op, e);
    return L.send(res, 200, { ok: false, code: 'server', error: 'Something went wrong. Try again.' });
  }
};
