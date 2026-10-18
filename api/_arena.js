// DUB arena: 1v1 block-run duels for SOL.
// Each player pays their stake into an address that belongs to that one duel side (its key is derived from a server
// secret and never stored). The creator runs first and the duel goes up in the lobby with that score. A challenger
// pays, runs the exact same world, and the moment their run is in, one transaction pays the winner
// 95% of the pot straight from the two deposit addresses; 5% goes to the creator wallet. Every transaction drains its
// deposit addresses to zero, so a payout can never go out twice.
const crypto = require('crypto');
const L = require('./_lib');
const C = require('./_config');
const D = require('./_core');
const AC = require('../assets/js/arena-core.js');

const LAM = 1e9, SIGFEE = 5000;
const STAKES = (C.STAKES || [0.05, 0.1, 0.25, 0.5, 1]).map(s => Math.round(s * LAM));
const FEE_PCT = Number(C.DUEL_FEE_PCT ?? 5);
const MIN = 60000;
const RUN_MS = t => AC.COUNTDOWN + Math.ceil(t * 1000 / AC.TPS);
const T = { payA: 30 * MIN, payB: 10 * MIN, hold: 4 * MIN, play: 30 * MIN, open: 24 * 60 * MIN, run: RUN_MS(AC.MAX_TICKS) + 60000, lease: 75000,
  ...(process.env.ARENA_T ? JSON.parse(process.env.ARENA_T) : {}) };
const sol = lam => Math.round(Number(lam || 0) / 1e5) / 1e4;
const iso = v => (v ? new Date(v).toISOString() : null);
const ms = v => (v ? new Date(v).getTime() : 0);
const rid = n => crypto.randomBytes(n).toString('hex');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const short = w => (w ? w.slice(0, 4) + '…' + w.slice(-4) : '');
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

// ---------- schema ----------
let made = null;
function ready() {
  if (!made) made = (async () => {
    await D.ready();
    for (const st of [
      `CREATE TABLE IF NOT EXISTS dub_duels (id text PRIMARY KEY, stake bigint NOT NULL, seed text NOT NULL, status text NOT NULL, a text NOT NULL, b text,
        hold text, hold_until timestamptz, a_score int, b_score int, winner text, fee bigint, prize bigint, note text,
        created_at timestamptz NOT NULL DEFAULT now(), open_at timestamptz, done_at timestamptz)`,
      `CREATE INDEX IF NOT EXISTS dub_duels_st ON dub_duels(status, created_at)`,
      `CREATE TABLE IF NOT EXISTS dub_entries (id text PRIMARY KEY, duel text NOT NULL, side text NOT NULL, name text NOT NULL, wallet text NOT NULL, tok text NOT NULL,
        dep text UNIQUE NOT NULL, status text NOT NULL, lamports bigint NOT NULL DEFAULT 0, dev text, score int, dist int, gems int, secs real, cause text, inputs text, note text,
        paid_at timestamptz, started_at timestamptz, done_at timestamptz, expires_at timestamptz NOT NULL, checked_at timestamptz, swept_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now())`,
      `CREATE INDEX IF NOT EXISTS dub_entries_st ON dub_entries(status, created_at)`,
      `CREATE INDEX IF NOT EXISTS dub_entries_duel ON dub_entries(duel)`,
      `CREATE TABLE IF NOT EXISTS dub_pays (id text PRIMARY KEY, kind text NOT NULL, duel text, entries text NOT NULL, status text NOT NULL DEFAULT 'open',
        sigs text NOT NULL DEFAULT '', sig text, plan text, tries int NOT NULL DEFAULT 0, sent_at timestamptz, done_at timestamptz, note text,
        created_at timestamptz NOT NULL DEFAULT now())`,
      `CREATE INDEX IF NOT EXISTS dub_pays_st ON dub_pays(status)`,
    ]) await L.q(st);
  })().catch(e => { made = null; throw e; });
  return made;
}

// ---------- deposit keys: HMAC(master, entry id) -> ed25519 seed ----------
let master = null; const keys = new Map(), byAddr = new Map();
async function getMaster() {
  if (master) return master;
  await L.q(`INSERT INTO dub_meta (k, v) VALUES ('arena_master', $1) ON CONFLICT (k) DO NOTHING`, [rid(32)]);
  const r = await L.q(`SELECT v FROM dub_meta WHERE k = 'arena_master'`);
  master = Buffer.from(r[0].v, 'hex'); return master;
}
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
async function keyOf(entryId) {
  if (keys.has(entryId)) return keys.get(entryId);
  const seed = crypto.createHmac('sha256', await getMaster()).update('dub-arena:' + entryId).digest();
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: 'der', type: 'pkcs8' });
  const pub = crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32);
  const k = { priv, addr: L.b58enc(pub) }; keys.set(entryId, k); byAddr.set(k.addr, k); return k;
}

// ---------- chain ----------
async function balances(addrs) {
  const out = new Map();
  for (let i = 0; i < addrs.length; i += 100) {
    const chunk = addrs.slice(i, i + 100);
    const r = await L.rpc('getMultipleAccounts', [chunk, { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 0, length: 0 } }]);
    chunk.forEach((a, j) => out.set(a, r.value[j] ? Number(r.value[j].lamports) : 0));
  }
  return out;
}
async function latestBlockhash() { const r = await L.rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]); return r.value.blockhash; }
async function statuses(sigs) { if (!sigs.length) return []; const r = await L.rpc('getSignatureStatuses', [sigs, { searchTransactionHistory: true }]); return r.value || []; }
const landed = s => s && !s.err && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized');

let feeCache = { at: 0, w: null };
async function feeWallet() {
  if (C.FEE_WALLET && L.isAddr(C.FEE_WALLET)) return C.FEE_WALLET;
  if (feeCache.w && Date.now() - feeCache.at < 600000) return feeCache.w;
  let w = null; try { w = await D.creator(); } catch {}
  feeCache = { at: Date.now(), w }; return w;
}

// ---------- payouts: one job per money movement, retried until it lands ----------
// kinds: settle (a finished duel, both deposits), refund (a duel that never got played out, the creator's deposit),
// sweep (anything that arrives at a closed deposit address goes back to its player)
function plan(job, ents, bal, fee, duel) {
  const order = ents.slice().sort((x, y) => (x.side < y.side ? -1 : 1));
  const srcs = order.map(e => ({ e, addr: keys.get(e.id).addr, bal: bal.get(keys.get(e.id).addr) || 0 })).filter(s => s.bal > 0);
  if (!srcs.length) throw new Error('nothing to send');
  const txFee = SIGFEE * srcs.length, payer = srcs[0];
  if (payer.bal <= txFee) throw new Error('payer too small');
  const left = new Map(srcs.map(s => [s.addr, s === payer ? s.bal - txFee : s.bal])), moves = [];
  const give = (to, amt, from) => {
    let need = amt;
    for (const a of from ? [from] : [...left.keys()]) {
      if (need <= 0) break; const take = Math.min(need, left.get(a) || 0); if (take <= 0) continue;
      const m = moves.find(x => x[0] === a && x[1] === to); if (m) m[2] += take; else moves.push([a, to, take]);
      left.set(a, left.get(a) - take); need -= take;
    }
    if (need > 0) throw new Error(`short by ${need} lamports`);
  };
  const rest = () => [...left.values()].reduce((a, v) => a + v, 0);
  const depOf = e => keys.get(e.id).addr, balOf = e => bal.get(depOf(e)) || 0;
  if (job.kind === 'settle') {
    const A = ents.find(e => e.side === 'a'), B = ents.find(e => e.side === 'b'), stake = Number(duel.stake);
    if (duel.winner === 'tie') { give(A.wallet, Math.max(0, balOf(A) - txFee / 2)); give(B.wallet, rest()); }
    else {
      if (!fee) throw new Error('no fee wallet');
      const W = duel.winner === 'a' ? A : B, prize = stake * 2 - Math.floor(stake * 2 * FEE_PCT / 100);
      give(A.wallet, Math.max(0, balOf(A) - stake), depOf(A));
      give(B.wallet, Math.max(0, balOf(B) - stake), depOf(B));
      give(W.wallet, prize);
      give(fee, rest());
    }
  } else give(order[0].wallet, rest());
  if (rest() !== 0) throw new Error('not drained');
  return { payer: payer.addr, moves: moves.filter(m => m[2] > 0) };
}
async function finishPay(job, sig, note) {
  const r = await L.q(`UPDATE dub_pays SET status = 'done', sig = $2, done_at = now(), note = COALESCE($3, note) WHERE id = $1 AND status = 'open' RETURNING *`, [job.id, sig, note || null]);
  if (!r.length) return false;
  const ids = job.entries;
  if (job.kind === 'settle') {
    await L.q(`UPDATE dub_duels SET status = 'paid', done_at = COALESCE(done_at, now()) WHERE id = $1 AND status = 'settling'`, [job.duel]);
    await L.q(`UPDATE dub_entries SET status = 'out' WHERE id = ANY(string_to_array($1, ','))`, [ids]);
  } else if (job.kind === 'refund') {
    await L.q(`UPDATE dub_duels SET status = 'refunded', done_at = COALESCE(done_at, now()) WHERE id = $1 AND status = 'refunding'`, [job.duel]);
    await L.q(`UPDATE dub_entries SET status = 'out' WHERE id = ANY(string_to_array($1, ',')) AND status = 'refund'`, [ids]);
  } else await L.q(`UPDATE dub_entries SET swept_at = now() WHERE id = ANY(string_to_array($1, ','))`, [ids]);
  return true;
}
// cheap: did one of the transactions we sent land?
async function checkPay(job) {
  const sigs = String(job.sigs || '').split(',').filter(Boolean);
  if (!sigs.length || job.status !== 'open') return false;
  const st = await statuses(sigs);
  const i = st.findIndex(landed);
  if (i >= 0) { await finishPay(job, sigs[i]); return true; }
  return false;
}
async function runPay(id) {
  const got = await L.q(`UPDATE dub_pays SET sent_at = now(), tries = tries + 1 WHERE id = $1 AND status = 'open' AND (sent_at IS NULL OR sent_at < now() - make_interval(secs => $2::int)) RETURNING *`,
    [id, Math.round(T.lease / 1000)]);
  if (!got.length) return { id, busy: true };
  const job = got[0], sigs = String(job.sigs || '').split(',').filter(Boolean);
  try {
    if (sigs.length) {
      const st = await statuses(sigs), i = st.findIndex(landed);
      if (i >= 0) { await finishPay(job, sigs[i]); return { id, done: sigs[i] }; }
      if (st.some(s => s && !s.err)) { await L.q(`UPDATE dub_pays SET sent_at = now() - make_interval(secs => $2::int) WHERE id = $1`, [id, Math.round(T.lease / 1000) - 8]); return { id, wait: true }; }
    }
    const ents = await L.q(`SELECT * FROM dub_entries WHERE id = ANY(string_to_array($1, ','))`, [job.entries]);
    for (const e of ents) await keyOf(e.id);
    const bal = await balances(ents.map(e => keys.get(e.id).addr));
    if ([...bal.values()].every(v => v === 0)) {
      // empty deposits: either one of our sends landed (find it) or there was never anything to send (a sweep)
      if (sigs.length) {
        const seen = await L.rpc('getSignaturesForAddress', [keys.get(ents[0].id).addr, { limit: 20, commitment: 'confirmed' }]).catch(() => []);
        const hit = (seen || []).find(x => !x.err && sigs.includes(x.signature));
        if (hit) { await finishPay(job, hit.signature); return { id, done: hit.signature }; }
      } else if (job.kind === 'sweep') { await finishPay(job, null, 'nothing to send'); return { id, done: 'empty' }; }
      await L.q(`UPDATE dub_pays SET note = $2, status = CASE WHEN tries > 40 THEN 'stuck' ELSE status END WHERE id = $1`, [id, 'deposits read empty, checking again']);
      return { id, wait: 'empty' };
    }
    const duel = job.duel ? (await L.q(`SELECT * FROM dub_duels WHERE id = $1`, [job.duel]))[0] : null;
    const p = plan(job, ents, bal, job.kind === 'settle' ? await feeWallet() : null, duel);
    const msg = AC.message(p.payer, p.moves.map(([f, t, l]) => AC.transfer(f, t, l)), await latestBlockhash());
    const sg = msg.signers.map(a => crypto.sign(null, Buffer.from(msg.bytes), byAddr.get(a).priv));
    const sig = L.b58enc(sg[0]);
    await L.q(`UPDATE dub_pays SET sigs = CASE WHEN sigs = '' THEN $2 ELSE sigs || ',' || $2 END, plan = $3, note = NULL WHERE id = $1`, [id, sig, JSON.stringify(p.moves.map(m => [m[1], m[2]]))]);
    try { await L.rpc('sendTransaction', [Buffer.from(AC.wire(msg, sg)).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 8 }], 15000); }
    catch (e) {
      // rejected before it reached the chain: try again in ~10 s with fresh balances
      await L.q(`UPDATE dub_pays SET note = $2, sent_at = now() - make_interval(secs => $3::int) WHERE id = $1`, [id, String(e.message).slice(0, 200), Math.round(T.lease / 1000) - 10]);
      return { id, error: String(e.message).slice(0, 120) };
    }
    return { id, sent: sig };
  } catch (e) {
    console.error('arena pay', id, e);
    await L.q(`UPDATE dub_pays SET note = $2 WHERE id = $1`, [id, String(e.message).slice(0, 200)]);
    return { id, error: String(e.message).slice(0, 120) };
  }
}
async function openPay(id, kind, duel, entries) {
  await L.q(`INSERT INTO dub_pays (id, kind, duel, entries) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET status = 'open', sent_at = NULL
    WHERE dub_pays.status = 'done' AND dub_pays.kind = 'sweep' AND dub_pays.done_at < now() - interval '1 minute'`, [id, kind, duel, entries]);
  return runPay(id);
}

// ---------- duel lifecycle ----------
// duel: new -> ready -> live -> open -> joined -> fight -> settling -> paid
//       new -> expired · ready/open -> refunding -> refunded
// entry: pending -> paid -> playing -> done -> settle/refund -> out · pending -> expired · pending -> lost (slot taken)
async function getDuel(id) { return (await L.q(`SELECT * FROM dub_duels WHERE id = $1`, [String(id || '').slice(0, 24)]))[0] || null; }
async function getEntry(id) { return (await L.q(`SELECT * FROM dub_entries WHERE id = $1`, [String(id || '').slice(0, 40)]))[0] || null; }
async function auth(id, token) {
  const e = await getEntry(id);
  if (!e || typeof token !== 'string' || token.length < 20) return null;
  const a = Buffer.from(e.tok, 'hex'), b = Buffer.from(sha(token), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? e : null;
}
async function refundDuel(d, note, from) {
  const r = await L.q(`UPDATE dub_duels SET status = 'refunding', note = $2, done_at = now() WHERE id = $1 AND status = ANY(string_to_array($3, ',')) RETURNING *`, [d.id, note, from.join(',')]);
  if (!r.length) return false;
  await L.q(`UPDATE dub_entries SET status = 'refund' WHERE id = $1`, [d.a]);
  await openPay('refund:' + d.id, 'refund', d.id, d.a);
  return true;
}
async function settle(d, aScore, bScore, note) {
  const winner = aScore > bScore ? 'a' : bScore > aScore ? 'b' : 'tie';
  const stake = Number(d.stake), cut = winner === 'tie' ? 0 : Math.floor(stake * 2 * FEE_PCT / 100);
  const r = await L.q(`UPDATE dub_duels SET status = 'settling', winner = $2, b_score = $3, fee = $4, prize = $5, note = COALESCE($6, note), done_at = now()
    WHERE id = $1 AND status IN ('joined', 'fight') RETURNING *`, [d.id, winner, bScore, cut, winner === 'tie' ? stake : stake * 2 - cut, note || null]);
  if (!r.length) return false;
  await L.q(`UPDATE dub_entries SET status = 'settle' WHERE id = $1 OR id = $2`, [d.a, d.b]);
  await openPay('settle:' + d.id, 'settle', d.id, d.a + ',' + d.b);
  return true;
}
async function finishRun(e, d, inputs, dev, why) {
  let rep = why ? null : AC.replay(d.seed, inputs);
  let note = why || null;
  if (!rep || !rep.ok) { if (rep && !rep.ok) note = 'bad run'; rep = { score: 0, dist: 0, gems: 0, secs: 0, cause: null }; }
  const r = await L.q(`UPDATE dub_entries SET status = 'done', score = $2, dist = $3, gems = $4, secs = $5, cause = $6, inputs = $7, dev = COALESCE($8, dev), note = $9, done_at = now()
    WHERE id = $1 AND status = 'playing' RETURNING *`, [e.id, rep.score, rep.dist, rep.gems, rep.secs, rep.cause, inputs && !why ? JSON.stringify(inputs).slice(0, 30000) : null, dev || null, note]);
  if (!r.length) return null;
  if (e.side === 'a') await L.q(`UPDATE dub_duels SET status = 'open', a_score = $2, open_at = now() WHERE id = $1 AND status = 'live'`, [d.id, rep.score]);
  else { const fresh = await getDuel(d.id); await settle(fresh, Number(fresh.a_score), rep.score, why ? 'challenger ' + why : null); }
  return rep;
}
async function markPaid(e, lam) {
  if (e.side === 'a') {
    const r = await L.q(`UPDATE dub_entries SET status = 'paid', paid_at = now(), lamports = $2 WHERE id = $1 AND status = 'pending' RETURNING id`, [e.id, lam]);
    if (r.length) await L.q(`UPDATE dub_duels SET status = 'ready' WHERE id = $1 AND status = 'new'`, [e.duel]);
    return;
  }
  // a challenger: the first one whose payment arrives gets the slot; anyone else is sent their SOL back
  const got = await L.q(`UPDATE dub_duels SET status = CASE WHEN status = 'open' THEN 'joined' ELSE status END, b = $2, hold = NULL, hold_until = NULL
    WHERE id = $1 AND (status = 'open' OR b = $2) RETURNING id`, [e.duel, e.id]);
  await L.q(`UPDATE dub_entries SET status = $3, paid_at = now(), lamports = $2 WHERE id = $1 AND status = 'pending'`, [e.id, lam, got.length ? 'paid' : 'lost']);
}
async function checkFunding(rows) {
  if (!rows.length) return 0;
  for (const e of rows) await keyOf(e.id);
  const bal = await balances(rows.map(e => e.dep));
  let n = 0;
  for (const e of rows) {
    const lam = bal.get(e.dep) || 0, stake = Number(e.stake);
    if (lam >= stake) { await markPaid(e, lam); n++; continue; }
    if (Date.now() > ms(e.expires_at)) {
      await L.q(`UPDATE dub_entries SET status = 'expired', lamports = $2 WHERE id = $1 AND status = 'pending'`, [e.id, lam]);
      if (e.side === 'a') await L.q(`UPDATE dub_duels SET status = 'expired', done_at = now() WHERE id = $1 AND status = 'new'`, [e.duel]);
    } else await L.q(`UPDATE dub_entries SET lamports = $2, checked_at = now() WHERE id = $1`, [e.id, lam]);
  }
  return n;
}
// everything with a clock on it, for one duel or for all of them
async function timeouts(only) {
  const one = only ? String(only) : null, n = { refunds: 0, runs: 0, forfeits: 0 };
  // a creator who paid but never played, or whose duel nobody took in time: refund
  for (const d of await L.q(`SELECT d.* FROM dub_duels d JOIN dub_entries a ON a.id = d.a WHERE d.status = 'ready' AND a.paid_at < now() - make_interval(secs => $1::int) AND ($2::text IS NULL OR d.id = $2)`, [T.play / 1000 | 0, one]))
    n.refunds += await refundDuel(d, 'creator never played', ['ready']) ? 1 : 0;
  for (const d of await L.q(`SELECT d.* FROM dub_duels d WHERE d.status = 'open' AND d.open_at < now() - make_interval(secs => $1::int) AND (d.hold IS NULL OR d.hold_until < now()) AND ($2::text IS NULL OR d.id = $2)`, [T.open / 1000 | 0, one]))
    n.refunds += await refundDuel(d, 'nobody took it', ['open']) ? 1 : 0;
  // a run that was started and never sent in scores what it sent: nothing
  for (const r of await L.q(`SELECT e.id AS eid FROM dub_entries e WHERE e.status = 'playing' AND e.started_at < now() - make_interval(secs => $1::int) AND ($2::text IS NULL OR e.duel = $2)`, [T.run / 1000 | 0, one])) {
    const e = await getEntry(r.eid), d = await getDuel(e.duel); if (await finishRun(e, d, [], null, 'no run sent')) n.runs++;
  }
  // a challenger who paid and never played forfeits
  for (const d of await L.q(`SELECT d.* FROM dub_duels d JOIN dub_entries b ON b.id = d.b WHERE d.status = 'joined' AND b.status = 'paid' AND b.paid_at < now() - make_interval(secs => $1::int) AND ($2::text IS NULL OR d.id = $2)`, [T.play / 1000 | 0, one])) {
    await L.q(`UPDATE dub_entries SET status = 'done', score = 0, note = 'never played', done_at = now() WHERE id = $1 AND status = 'paid'`, [d.b]);
    if (await settle(d, Number(d.a_score), -1, 'challenger never played')) n.forfeits++;
  }
  return n;
}
async function sweep() {
  const rows = await L.q(`SELECT * FROM dub_entries WHERE status IN ('expired', 'lost', 'out') AND created_at > now() - interval '7 days'
    AND (swept_at IS NULL OR swept_at < now() - interval '10 minutes') AND (checked_at IS NULL OR checked_at < now() - interval '2 minutes') ORDER BY checked_at NULLS FIRST LIMIT 200`);
  if (!rows.length) return 0;
  for (const e of rows) await keyOf(e.id);
  const bal = await balances(rows.map(e => e.dep));
  let n = 0;
  for (const e of rows) {
    const lam = bal.get(e.dep) || 0;
    await L.q(`UPDATE dub_entries SET checked_at = now(), swept_at = CASE WHEN $2::bigint = 0 THEN now() ELSE swept_at END WHERE id = $1`, [e.id, lam]);
    if (lam > SIGFEE) { await openPay('sweep:' + e.id, 'sweep', e.duel, e.id); n++; }
  }
  return n;
}
async function tick() {
  await ready();
  const now = Date.now(), gap = Number(process.env.ARENA_GAP_MS ?? 20000);
  const got = await L.q(`INSERT INTO dub_meta (k, v) VALUES ('arena_lock', $1) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v WHERE dub_meta.v::bigint < $2 RETURNING k`, [String(now), now - gap]);
  if (!got.length) return { skipped: 'busy' };
  const out = {};
  try { out.funded = await checkFunding(await L.q(`SELECT e.*, d.stake FROM dub_entries e JOIN dub_duels d ON d.id = e.duel WHERE e.status = 'pending' ORDER BY e.created_at LIMIT 300`)); } catch (e) { out.fundErr = String(e.message).slice(0, 120); }
  try { out.time = await timeouts(); } catch (e) { out.timeErr = String(e.message).slice(0, 120); }
  try { out.pays = []; for (const j of await L.q(`SELECT * FROM dub_pays WHERE status = 'open' ORDER BY created_at LIMIT 25`)) out.pays.push((await checkPay(j)) ? { id: j.id, done: true } : await runPay(j.id)); } catch (e) { out.payErr = String(e.message).slice(0, 120); }
  try { out.swept = await sweep(); } catch (e) { out.sweepErr = String(e.message).slice(0, 120); }
  return out;
}

// ---------- what the page sees ----------
function pubEntry(e) {
  if (!e) return null;
  return { name: e.name, short: short(e.wallet), score: e.score == null ? null : e.score, dist: e.dist, gems: e.gems, secs: e.secs == null ? null : Number(e.secs), cause: e.cause || null, dev: e.dev || null, note: e.note || null };
}
function pubDuel(d, A, B, job) {
  const stake = Number(d.stake), cut = Math.floor(stake * 2 * FEE_PCT / 100);
  return { id: d.id, status: d.status, stake: sol(stake), pot: sol(stake * 2), prize: sol(stake * 2 - cut), fee: sol(cut),
    a: { ...pubEntry(A), score: d.a_score == null ? null : d.a_score }, b: B ? pubEntry(B) : null, winner: d.winner || null,
    held: !!(d.hold && ms(d.hold_until) > Date.now()), heldUntil: d.hold && ms(d.hold_until) > Date.now() ? iso(d.hold_until) : null,
    createdAt: iso(d.created_at), openAt: iso(d.open_at), doneAt: iso(d.done_at), note: d.note || null,
    pay: job ? { status: job.status, sig: job.sig || null, sent: !!job.sigs } : null };
}
async function duelView(d) {
  const [A, B] = await Promise.all([getEntry(d.a), d.b ? getEntry(d.b) : null]);
  const job = (await L.q(`SELECT * FROM dub_pays WHERE id = $1 OR id = $2`, ['settle:' + d.id, 'refund:' + d.id]))[0] || null;
  return pubDuel(d, A, B, job);
}
async function lobby() {
  await ready();
  const [open, recent, live, tot, fee] = await Promise.all([
    L.q(`SELECT d.*, a.name AS an, a.dev AS adev, a.dist AS adist, a.gems AS agems, a.secs AS asecs FROM dub_duels d JOIN dub_entries a ON a.id = d.a WHERE d.status = 'open' ORDER BY d.stake DESC, d.open_at DESC LIMIT 60`),
    L.q(`SELECT d.*, a.name AS an, b.name AS bn, p.sig AS psig FROM dub_duels d JOIN dub_entries a ON a.id = d.a LEFT JOIN dub_entries b ON b.id = d.b
      LEFT JOIN dub_pays p ON p.id = 'settle:' || d.id WHERE d.status IN ('paid', 'settling') ORDER BY d.done_at DESC LIMIT 20`),
    L.q(`SELECT COUNT(*)::int AS n FROM dub_duels WHERE status IN ('live', 'joined', 'fight', 'settling')`),
    L.q(`SELECT COUNT(*)::int AS duels, COALESCE(SUM(CASE WHEN winner <> 'tie' THEN prize ELSE 0 END), 0)::bigint AS won, COALESCE(SUM(fee), 0)::bigint AS fees,
      COALESCE(MAX(GREATEST(a_score, COALESCE(b_score, 0))), 0)::int AS best FROM dub_duels WHERE status = 'paid'`),
    feeWallet(),
  ]);
  const now = Date.now();
  return {
    ok: true, now: iso(now),
    open: open.map(d => ({ id: d.id, name: d.an, dev: d.adev || null, score: d.a_score, dist: d.adist, gems: d.agems, secs: d.asecs == null ? null : Number(d.asecs), stake: sol(d.stake),
      prize: sol(Number(d.stake) * 2 - Math.floor(Number(d.stake) * 2 * FEE_PCT / 100)), openAt: iso(d.open_at), held: !!(d.hold && ms(d.hold_until) > now) })),
    recent: recent.map(d => ({ id: d.id, a: { name: d.an, score: d.a_score }, b: { name: d.bn, score: d.b_score }, winner: d.winner, prize: sol(d.prize), stake: sol(d.stake),
      status: d.status, sig: d.psig || null, at: iso(d.done_at) })),
    live: live[0].n,
    stats: { duels: tot[0].duels, won: sol(tot[0].won), fees: sol(tot[0].fees), best: tot[0].best },
    config: { open: !!fee, feePct: FEE_PCT, feeTo: fee ? short(fee) : null, stakes: STAKES.map(sol), maxSecs: AC.MAX_TICKS / AC.TPS,
      times: { payA: T.payA / MIN, payB: T.payB / MIN, hold: T.hold / MIN, play: T.play / MIN, openH: T.open / 60 / MIN } },
  };
}
async function duelPublic(id) {
  await ready();
  const d = await getDuel(id); if (!d) return { ok: false, code: 'gone' };
  return { ok: true, duel: await duelView(d) };
}

// ---------- player actions ----------
async function create({ name, wallet, stake, dev }) {
  await ready();
  name = cleanName(name); wallet = String(wallet || '').trim();
  if (name.length < 2) return { ok: false, code: 'name' };
  if (!L.isAddr(wallet)) return { ok: false, code: 'wallet' };
  const lam = Math.round(Number(stake) * LAM); if (!STAKES.includes(lam)) return { ok: false, code: 'stake' };
  if (!(await feeWallet())) return { ok: false, code: 'closed' };
  const mine = await L.q(`SELECT COUNT(*)::int AS n FROM dub_entries WHERE wallet = $1 AND status = 'pending'`, [wallet]);
  if (mine[0].n >= 3) return { ok: false, code: 'many' };
  const all = await L.q(`SELECT COUNT(*)::int AS n FROM dub_entries WHERE status = 'pending'`);
  if (all[0].n >= 400) return { ok: false, code: 'busy' };
  const did = rid(5), eid = rid(8), token = rid(24), k = await keyOf(eid);
  await L.q(`INSERT INTO dub_duels (id, stake, seed, status, a) VALUES ($1, $2, $3, 'new', $4)`, [did, lam, rid(16), eid]);
  await L.q(`INSERT INTO dub_entries (id, duel, side, name, wallet, tok, dep, status, dev, expires_at) VALUES ($1, $2, 'a', $3, $4, $5, $6, 'pending', $7, now() + make_interval(secs => $8::int))`,
    [eid, did, name, wallet, sha(token), k.addr, devOf(dev), T.payA / 1000 | 0]);
  return { ok: true, entry: eid, token, ...(await mineView(await getEntry(eid))) };
}
async function join({ duel, name, wallet, dev }) {
  await ready();
  name = cleanName(name); wallet = String(wallet || '').trim();
  if (name.length < 2) return { ok: false, code: 'name' };
  if (!L.isAddr(wallet)) return { ok: false, code: 'wallet' };
  const d = await getDuel(duel); if (!d || d.status !== 'open') return { ok: false, code: 'gone' };
  const A = await getEntry(d.a); if (A.wallet === wallet) return { ok: false, code: 'self' };
  const eid = rid(8), token = rid(24), k = await keyOf(eid);
  const held = await L.q(`UPDATE dub_duels SET hold = $2, hold_until = now() + make_interval(secs => $3::int) WHERE id = $1 AND status = 'open' AND (hold IS NULL OR hold_until < now()) RETURNING id`,
    [d.id, eid, T.hold / 1000 | 0]);
  if (!held.length) { const h = await getDuel(d.id); return { ok: false, code: 'held', until: h && iso(h.hold_until) }; }
  await L.q(`INSERT INTO dub_entries (id, duel, side, name, wallet, tok, dep, status, dev, expires_at) VALUES ($1, $2, 'b', $3, $4, $5, $6, 'pending', $7, now() + make_interval(secs => $8::int))`,
    [eid, d.id, name, wallet, sha(token), k.addr, devOf(dev), T.payB / 1000 | 0]);
  return { ok: true, entry: eid, token, ...(await mineView(await getEntry(eid))) };
}
const devOf = v => (['keys', 'touch', 'mouse', 'pen'].includes(v) ? v : null);
async function mineView(e) {
  const d = await getDuel(e.duel);
  const stake = Number(d.stake), lam = Number(e.lamports || 0);
  return { me: { id: e.id, side: e.side, name: e.name, short: short(e.wallet), status: e.status, dep: e.dep, stake: sol(stake), stakeLam: stake, got: sol(lam), gotLam: lam,
    need: sol(Math.max(0, stake - lam)), needLam: Math.max(0, stake - lam), expiresAt: iso(e.expires_at), paidAt: iso(e.paid_at), startedAt: iso(e.started_at),
    score: e.score, dist: e.dist, gems: e.gems, secs: e.secs == null ? null : Number(e.secs), cause: e.cause || null, note: e.note || null,
    playBy: e.paid_at ? iso(ms(e.paid_at) + T.play) : null },
    duel: await duelView(d) };
}
async function status(id, token) {
  await ready();
  let e = await auth(id, token); if (!e) return { ok: false, code: 'auth' };
  if (e.status === 'pending' && Date.now() - ms(e.checked_at) > 2500) {
    const d = await getDuel(e.duel); await checkFunding([{ ...e, stake: d.stake }]); e = await getEntry(e.id);
  }
  await timeouts(e.duel);
  const d = await getDuel(e.duel);
  if (d.status === 'settling' || d.status === 'refunding') {
    const job = (await L.q(`SELECT * FROM dub_pays WHERE id = $1`, [(d.status === 'settling' ? 'settle:' : 'refund:') + d.id]))[0];
    if (job && job.status === 'open' && !(await checkPay(job))) await runPay(job.id);
  }
  return { ok: true, ...(await mineView(await getEntry(e.id))) };
}
async function start(id, token) {
  await ready();
  const e = await auth(id, token); if (!e) return { ok: false, code: 'auth' };
  const d = await getDuel(e.duel);
  if (e.status === 'playing' || e.status === 'done') return { ok: false, code: 'started' };
  if (e.status !== 'paid') return { ok: false, code: 'unpaid' };
  if (e.side === 'a' ? d.status !== 'ready' : !(d.status === 'joined' && d.b === e.id)) return { ok: false, code: 'gone' };
  const r = await L.q(`UPDATE dub_entries SET status = 'playing', started_at = now() WHERE id = $1 AND status = 'paid' RETURNING started_at`, [e.id]);
  if (!r.length) return { ok: false, code: 'started' };
  await L.q(`UPDATE dub_duels SET status = $2 WHERE id = $1 AND status = $3`, [d.id, e.side === 'a' ? 'live' : 'fight', e.side === 'a' ? 'ready' : 'joined']);
  return { ok: true, seed: d.seed, countdown: AC.COUNTDOWN, maxTicks: AC.MAX_TICKS, target: e.side === 'b' ? d.a_score : null, sendBy: iso(ms(r[0].started_at) + T.run) };
}
async function submit(id, token, inputs, dev) {
  await ready();
  const e = await auth(id, token); if (!e) return { ok: false, code: 'auth' };
  if (e.status !== 'playing') return e.status === 'done' || e.status === 'settle' || e.status === 'out' ? { ok: true, ...(await mineView(e)) } : { ok: false, code: 'unstarted' };
  const d = await getDuel(e.duel);
  const el = Number((await L.q(`SELECT (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::bigint AS el FROM dub_entries WHERE id = $1`, [e.id]))[0].el);
  // the run has to take as long in real time as it says it did (no fast-forward), and not much longer (no slow motion)
  const rep = AC.replay(d.seed, inputs), took = rep.ok ? RUN_MS(rep.ticks) : 0;
  let why = null;
  if (el > T.run) why = 'sent too late';
  else if (rep.ok && el < took - 1500) why = 'sent faster than the run can be played';
  else if (rep.ok && el > took + 45000) why = 'run took longer than it can';
  await finishRun(e, d, why ? [] : inputs, devOf(dev), why);
  return { ok: true, ...(await mineView(await getEntry(e.id))) };
}
async function cancel(id, token) {
  await ready();
  const e = await auth(id, token); if (!e) return { ok: false, code: 'auth' };
  if (e.side !== 'a') return { ok: false, code: 'locked' };
  const d = await getDuel(e.duel);
  if (d.status === 'new') {
    await L.q(`UPDATE dub_duels SET status = 'expired', note = 'cancelled', done_at = now() WHERE id = $1 AND status = 'new'`, [d.id]);
    await L.q(`UPDATE dub_entries SET status = 'expired', note = 'cancelled' WHERE id = $1 AND status = 'pending'`, [e.id]);
  } else if (d.status === 'ready') await refundDuel(d, 'cancelled', ['ready']);
  else if (d.status === 'open') {
    if (d.hold && ms(d.hold_until) > Date.now()) return { ok: false, code: 'held' };
    const r = await L.q(`UPDATE dub_duels SET hold = NULL WHERE id = $1 AND status = 'open' AND (hold IS NULL OR hold_until < now()) RETURNING id`, [d.id]);
    if (!r.length || !(await refundDuel(d, 'cancelled', ['open']))) return { ok: false, code: 'locked' };
  } else return { ok: false, code: 'locked' };
  return { ok: true, ...(await mineView(await getEntry(e.id))) };
}
async function blockhash() { return { ok: true, blockhash: await latestBlockhash() }; }

module.exports = { ready, tick, lobby, duelPublic, create, join, status, start, submit, cancel, blockhash, keyOf, T, STAKES, FEE_PCT };
