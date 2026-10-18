// /api/arena?op=lobby|duel|create|join|status|start|submit|cancel|blockhash: the aim duel arena.
const L = require('./_lib');
const A = require('./_arena');
const MSG = {
  name: 'Pick a name, 2 to 16 characters.',
  wallet: 'That is not a Solana wallet address.',
  stake: 'Pick one of the stakes.',
  closed: 'Real-SOL duels open the moment $DUB launches. Practice runs work now.',
  many: 'That wallet already has 3 duels waiting for payment. Pay or cancel one first.',
  busy: 'The arena is full for a moment. Try again shortly.',
  gone: 'That duel is no longer open.',
  self: "That's your own duel. Send the link to someone else.",
  held: 'Someone is paying to take this duel right now. If they don\'t, it opens again in a few minutes.',
  auth: 'That duel ticket was not found on this device.',
  started: 'That run has already started. A run can only be played once.',
  unpaid: 'The payment has not arrived yet.',
  unstarted: 'That run was never started.',
  locked: 'That duel can not be cancelled any more.',
  slow: 'Too many tries. Wait a minute.',
  db: 'The arena is offline for a moment.',
};
const RL = Number(process.env.ARENA_RL || 1), lim = (k, n, ms) => L.limited(k, n * RL, ms);
const fail = (res, code, extra = {}) => L.send(res, 200, { ok: false, code, error: MSG[code] || 'Something went wrong.', ...extra });
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return L.send(res, 204, {});
  const qy = L.query(req), op = String(qy.op || 'lobby'), who = L.ip(req);
  if (!L.dbReady()) return fail(res, 'db');
  try {
    if (op === 'lobby') return L.send(res, 200, await A.lobby(), L.CACHE(3, 12));
    if (op === 'duel') { const r = await A.duelPublic(qy.id); return r.ok ? L.send(res, 200, r, L.CACHE(2, 6)) : fail(res, r.code); }
    if (op === 'blockhash') { if (lim('bh:' + who, 20, 60000)) return fail(res, 'slow'); return L.send(res, 200, await A.blockhash(), L.CACHE(5, 10)); }
    const b = req.method === 'POST' ? await L.body(req, 64 * 1024) : {};
    if (op === 'status') {
      if (lim('st:' + who, 90, 60000)) return fail(res, 'slow');
      const r = await A.status(qy.e || b.e, qy.k || b.k); return r.ok ? L.send(res, 200, r) : fail(res, r.code);
    }
    if (req.method !== 'POST') return L.send(res, 405, { ok: false, error: 'POST only' });
    let r;
    if (op === 'create') { if (lim('cr:' + who, 8, 600000)) return fail(res, 'slow'); r = await A.create(b); }
    else if (op === 'join') { if (lim('jn:' + who, 12, 600000)) return fail(res, 'slow'); r = await A.join(b); }
    else if (op === 'start') { if (lim('sa:' + who, 20, 60000)) return fail(res, 'slow'); r = await A.start(b.e, b.k); }
    else if (op === 'submit') { if (lim('sb:' + who, 20, 60000)) return fail(res, 'slow'); r = await A.submit(b.e, b.k, b.inputs, b.dev); }
    else if (op === 'cancel') { if (lim('cn:' + who, 20, 60000)) return fail(res, 'slow'); r = await A.cancel(b.e, b.k); }
    else return L.send(res, 404, { ok: false, error: 'unknown op' });
    return r.ok ? L.send(res, 200, r) : fail(res, r.code, r.until ? { until: r.until } : {});
  } catch (e) {
    console.error('arena api', op, e);
    return L.send(res, 200, { ok: false, code: 'server', error: 'Something went wrong. Try again.' });
  }
};
