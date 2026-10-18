// DUB engine: registration with a stats-privacy ownership proof, the win tracker, the daily pot and payday.
// Days run 00:00 to 24:00 UTC. A dub counts on the day the tracker sees it.
const L = require('./_lib');
const C = require('./_config');
const LAM = 1e9;

// ---------- schema ----------
let made = null;
function ready() {
  if (!made) made = (async () => {
    for (const st of [
      `CREATE TABLE IF NOT EXISTS dub_meta (k text PRIMARY KEY, v text NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS dub_players (id serial PRIMARY KEY, account_id text UNIQUE NOT NULL, name text NOT NULL, platform text NOT NULL DEFAULT 'epic',
        wallet text UNIQUE NOT NULL, base_wins int NOT NULL, last_wins int NOT NULL, last_matches int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'ok',
        checked_at timestamptz, good_at timestamptz, active_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS dub_claims (id text PRIMARY KEY, account_id text NOT NULL, name text NOT NULL, platform text NOT NULL, wallet text NOT NULL,
        step text NOT NULL, wins int NOT NULL, matches int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
        polled_at timestamptz, private_at timestamptz, done_at timestamptz)`,
      `CREATE INDEX IF NOT EXISTS dub_claims_acct ON dub_claims(account_id, step)`,
      `CREATE TABLE IF NOT EXISTS dub_events (id bigserial PRIMARY KEY, player_id int NOT NULL, day date NOT NULL, n int NOT NULL, wins_after int NOT NULL, at timestamptz NOT NULL DEFAULT now())`,
      `CREATE INDEX IF NOT EXISTS dub_events_day ON dub_events(day, player_id)`,
      `CREATE TABLE IF NOT EXISTS dub_pot (day date PRIMARY KEY, lamports bigint NOT NULL DEFAULT 0, carried bigint NOT NULL DEFAULT 0, updated_at timestamptz)`,
      `CREATE TABLE IF NOT EXISTS dub_days (day date PRIMARY KEY, pot bigint NOT NULL, dubs int NOT NULL, paid_dubs int NOT NULL, dev_id int, dev_name text,
        per_dub bigint NOT NULL DEFAULT 0, dev_cut bigint NOT NULL DEFAULT 0, rolled bigint NOT NULL DEFAULT 0, closed_at timestamptz NOT NULL DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS dub_payouts (day date NOT NULL, player_id int NOT NULL, name text NOT NULL, wallet text NOT NULL, dubs int NOT NULL, paid_dubs int NOT NULL,
        is_dev boolean NOT NULL DEFAULT false, lamports bigint NOT NULL, eligible boolean NOT NULL DEFAULT true, note text, sig text, paid_at timestamptz, PRIMARY KEY (day, player_id))`,
      `CREATE TABLE IF NOT EXISTS dub_sigs (sig text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())`,
    ]) await L.q(st);
    await L.q(`INSERT INTO dub_meta (k, v) VALUES ('first_day', $1) ON CONFLICT (k) DO NOTHING`, [dayOf(Date.now())]);
  })().catch(e => { made = null; throw e; });
  return made;
}
const meta = async k => { const r = await L.q(`SELECT v FROM dub_meta WHERE k = $1`, [k]); return r[0] ? r[0].v : null; };
const setMeta = (k, v) => L.q(`INSERT INTO dub_meta (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`, [k, String(v)]);

// ---------- time ----------
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
const dayStart = d => Date.parse(d + 'T00:00:00Z');
const nextDay = d => dayOf(dayStart(d) + 86400000);
const iso = v => (v ? new Date(v).toISOString() : null);
const sol = lam => Math.round(Number(lam || 0) / 1e5) / 1e4;   // 4 decimals

// ---------- Fortnite stats (fortnite-api.com, needs FNAPI_KEY) ----------
const keySet = () => !!(process.env.FNAPI_KEY || process.env.FORTNITE_API_KEY);
function parseStats(d) {
  const all = (d.stats && d.stats.all) || {};
  let wins = 0, matches = 0; const modes = {};
  for (const m of C.MODES) { const s = all[m]; modes[m] = s ? (s.wins | 0) : 0; if (s) { wins += s.wins | 0; matches += s.matches | 0; } }
  return { id: d.account && d.account.id, name: d.account && d.account.name, wins, matches, modes, level: d.battlePass ? d.battlePass.level : null };
}
async function fnStats({ id, name, platform = 'epic' }) {
  const key = process.env.FNAPI_KEY || process.env.FORTNITE_API_KEY;
  if (!key) return { ok: false, code: 'nokey' };
  const base = 'https://fortnite-api.com/v2/stats/br/v2', qs = 'timeWindow=lifetime&image=none';
  const url = id ? `${base}/${encodeURIComponent(id)}?${qs}` : `${base}?name=${encodeURIComponent(name)}&accountType=${platform}&${qs}`;
  let r;
  try { r = await L.getJson(url, { headers: { Authorization: key } }, 8000); } catch { return { ok: false, code: 'upstream' }; }
  const err = String((r.json && (r.json.error || r.json.message)) || '');
  if (r.status === 200 && r.json && r.json.data && r.json.data.account) return { ok: true, ...parseStats(r.json.data) };
  if (r.status === 403 && /public/i.test(err)) return { ok: false, code: 'private' };
  if (r.status === 401 || r.status === 403) return { ok: false, code: 'denied' };
  if (r.status === 404) return { ok: false, code: /match/i.test(err) ? 'nomatches' : 'notfound' };
  if (r.status === 429) return { ok: false, code: 'busy' };
  return { ok: false, code: 'upstream', status: r.status };
}

// ---------- the pot: creator fees accrued today, read from pump.fun's creator vaults ----------
async function creator() {
  if (C.PAYER && L.isAddr(C.PAYER)) return C.PAYER;
  if (!C.CA || !L.isAddr(C.CA)) return null;
  const k = await meta('creator:' + C.CA); if (k) return k;
  const [curve] = await L.accounts([L.bondingCurveOf(C.CA)]);
  if (!curve || curve.data.length < 81) return null;
  const c = L.b58enc(curve.data.subarray(49, 81)); await setMeta('creator:' + C.CA, c); return c;
}
async function vaultLamports(cr) {
  const v1 = L.creatorVaultOf(cr), v2 = L.ataOf(L.ammVaultOf(cr), L.SOL, L.TOKEN);
  const [a, b] = await L.accounts([v1, v2]);
  const curve = a ? Math.max(0, a.lamports - L.RENT0) : 0;
  const amm = b && b.data.length >= 72 ? Number(b.data.readBigUInt64LE(64)) : 0;
  return curve + amm;
}
async function accruePot(today) {
  const cr = await creator(); if (!cr) return { ok: false, why: 'no coin yet' };
  const now = await vaultLamports(cr);
  const last = Number(await meta('vault_last:' + cr) || 0);
  const delta = now - last;
  if (delta > 0) await L.q(`INSERT INTO dub_pot (day, lamports, updated_at) VALUES ($1, $2, now()) ON CONFLICT (day) DO UPDATE SET lamports = dub_pot.lamports + EXCLUDED.lamports, updated_at = now()`, [today, delta]);
  await setMeta('vault_last:' + cr, now);
  return { ok: true, vault: now, added: Math.max(0, delta) };
}
async function potOf(day) {
  const r = await L.q(`SELECT lamports, carried FROM dub_pot WHERE day = $1`, [day]);
  return r[0] ? Number(r[0].lamports) + Number(r[0].carried) : 0;
}

// ---------- the tracker ----------
async function pollPlayers(budgetMs, today) {
  if (!keySet()) return { polled: 0, why: 'no key' };
  const t0 = Date.now(); let polled = 0, dubs = 0, stop = false;
  const due = await L.q(`SELECT * FROM dub_players WHERE status <> 'gone' AND (checked_at IS NULL OR checked_at < now() - (CASE WHEN active_at > now() - interval '2 hours' THEN interval '150 seconds' ELSE interval '10 minutes' END))
    ORDER BY checked_at NULLS FIRST LIMIT 400`);
  let i = 0;
  const worker = async () => {
    while (!stop && i < due.length && Date.now() - t0 < budgetMs) {
      const p = due[i++]; const s = await fnStats({ id: p.account_id }); polled++;
      if (s.ok) {
        const active = s.matches !== p.last_matches;
        if (s.wins > p.last_wins) {
          const since = p.good_at ? Date.now() - new Date(p.good_at).getTime() : 0;
          const most = Math.max(1, Math.ceil(since / (C.WIN_MIN * 60000)));
          const n = Math.min(s.wins - p.last_wins, most);
          await L.q(`INSERT INTO dub_events (player_id, day, n, wins_after) VALUES ($1, $2, $3, $4)`, [p.id, today, n, s.wins]); dubs += n;
        }
        await L.q(`UPDATE dub_players SET last_wins = $2, last_matches = $3, name = $4, status = 'ok', checked_at = now(), good_at = now(), active_at = CASE WHEN $5::boolean THEN now() ELSE active_at END WHERE id = $1`,
          [p.id, s.wins, s.matches, String(s.name || p.name).slice(0, 40), active]);
      } else if (s.code === 'private') await L.q(`UPDATE dub_players SET status = 'private', checked_at = now() WHERE id = $1`, [p.id]);
      else if (s.code === 'notfound') await L.q(`UPDATE dub_players SET status = 'missing', checked_at = now() WHERE id = $1`, [p.id]);
      else if (s.code === 'busy' || s.code === 'nokey' || s.code === 'denied') stop = true;
      else await L.q(`UPDATE dub_players SET checked_at = now() WHERE id = $1`, [p.id]);
      await new Promise(r => setTimeout(r, L.MOCK ? 0 : 250));
    }
  };
  await Promise.all([worker(), worker()]);
  return { polled, dubs, due: due.length };
}

// ---------- payday: close every finished day ----------
async function holdOk(wallet) {
  if (!C.CA || !L.isAddr(C.CA) || !(C.MIN_HOLD > 0)) return true;
  const r = await L.rpc('getTokenAccountsByOwner', [wallet, { mint: C.CA }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  let amt = 0; for (const a of r.value || []) amt += Number(a.account.data.parsed.info.tokenAmount.uiAmount || 0);
  return amt >= C.MIN_HOLD;
}
async function dayBoard(day) {
  return L.q(`SELECT e.player_id AS id, p.name, p.wallet, SUM(e.n)::int AS dubs, MAX(e.at) AS last_at FROM dub_events e JOIN dub_players p ON p.id = e.player_id
    WHERE e.day = $1 GROUP BY e.player_id, p.name, p.wallet ORDER BY dubs DESC, last_at ASC`, [day]);
}
function split(pot, rows) {
  // rows: [{id, dubs, eligible}], already ordered by dubs desc then first to get there
  const ok = rows.filter(r => r.eligible && r.dubs > 0);
  const paid = ok.reduce((a, r) => a + Math.min(r.dubs, C.CAP), 0);
  if (!paid || pot <= 0) return { paid, devId: ok[0] ? ok[0].id : null, devCut: 0, perDub: 0, amounts: new Map() };
  const devCut = Math.floor(pot * C.DEV_PCT / 100), perDub = Math.floor((pot - devCut) / paid), devId = ok[0].id;
  const amounts = new Map(ok.map(r => [r.id, Math.min(r.dubs, C.CAP) * perDub + (r.id === devId ? devCut : 0)]));
  return { paid, devId, devCut, perDub, amounts };
}
async function closeDays(today) {
  const first = await meta('first_day'); if (!first) return [];
  const closed = [];
  for (let d = first; d < today; d = nextDay(d)) {
    const done = await L.q(`SELECT 1 FROM dub_days WHERE day = $1`, [d]); if (done.length) continue;
    const board = await dayBoard(d), pot = await potOf(d);
    for (const r of board) {
      try { r.eligible = await holdOk(r.wallet); r.note = r.eligible ? null : `held under ${C.MIN_HOLD.toLocaleString('en-US')} $DUB at payday`; }
      catch { const since = Date.now() - dayStart(nextDay(d)); if (since < 2 * 3600e3) return closed; r.eligible = true; r.note = 'hold not checked'; }
    }
    const s = split(pot, board);
    const dubs = board.reduce((a, r) => a + r.dubs, 0);
    const rolled = s.paid ? 0 : pot;
    const dev = board.find(r => r.id === s.devId);
    await L.q(`INSERT INTO dub_days (day, pot, dubs, paid_dubs, dev_id, dev_name, per_dub, dev_cut, rolled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (day) DO NOTHING`,
      [d, pot, dubs, s.paid, s.paid ? s.devId : null, s.paid && dev ? dev.name : null, s.perDub, s.devCut, rolled]);
    for (const r of board) {
      await L.q(`INSERT INTO dub_payouts (day, player_id, name, wallet, dubs, paid_dubs, is_dev, lamports, eligible, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [d, r.id, r.name, r.wallet, r.dubs, r.eligible ? Math.min(r.dubs, C.CAP) : 0, !!s.paid && r.id === s.devId, s.amounts.get(r.id) || 0, !!r.eligible, r.note || null]);
    }
    if (rolled > 0) await L.q(`INSERT INTO dub_pot (day, carried, updated_at) VALUES ($1, $2, now()) ON CONFLICT (day) DO UPDATE SET carried = dub_pot.carried + EXCLUDED.carried, updated_at = now()`, [nextDay(d), rolled]);
    closed.push(d);
  }
  return closed;
}

// ---------- payouts: spot transfers from the payer wallet to each winner, on-chain ----------
async function matchPayouts() {
  const due = await L.q(`SELECT day, player_id, wallet, lamports FROM dub_payouts WHERE sig IS NULL AND lamports > 0 ORDER BY day`);
  if (!due.length) return { matched: 0 };
  const payer = await creator(); if (!payer) return { matched: 0, why: 'no payer' };
  const sigs = await L.rpc('getSignaturesForAddress', [payer, { limit: 40, commitment: 'confirmed' }]);
  let matched = 0, looked = 0;
  for (const s of sigs) {
    if (s.err || looked >= 15) continue;
    const seen = await L.q(`SELECT 1 FROM dub_sigs WHERE sig = $1`, [s.signature]); if (seen.length) continue;
    looked++;
    const tx = await L.rpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
    if (!tx) continue;
    const ins = [...(tx.transaction.message.instructions || [])];
    for (const g of (tx.meta && tx.meta.innerInstructions) || []) ins.push(...g.instructions);
    for (const i of ins) {
      if (i.program !== 'system' || !i.parsed || i.parsed.type !== 'transfer' || i.parsed.info.source !== payer) continue;
      const to = i.parsed.info.destination, lam = Number(i.parsed.info.lamports);
      const row = due.find(r => r.wallet === to && !r.sig && lam >= Number(r.lamports) * 0.95);
      if (row) { row.sig = s.signature; matched++; await L.q(`UPDATE dub_payouts SET sig = $3, paid_at = to_timestamp($4) WHERE day = $1 AND player_id = $2 AND sig IS NULL`, [row.day, row.player_id, s.signature, s.blockTime || Date.now() / 1000]); }
    }
    await L.q(`INSERT INTO dub_sigs (sig) VALUES ($1) ON CONFLICT DO NOTHING`, [s.signature]);
  }
  return { matched, looked };
}

// ---------- one engine pass (locked: one at a time, at most every 50 s) ----------
async function tick(budget = 45000) {
  await ready();
  const gap = Number(process.env.TICK_GAP_MS ?? 50000), now = Date.now();
  const got = await L.q(`INSERT INTO dub_meta (k, v) VALUES ('tick_lock', $1) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v WHERE dub_meta.v::bigint < $2 RETURNING k`, [String(now), now - gap]);
  if (!got.length) return { ok: true, skipped: 'busy' };
  const today = dayOf(now), out = { ok: true, day: today };
  try { out.closed = await closeDays(today); } catch (e) { out.closeErr = String(e.message).slice(0, 120); }
  try { out.pot = await accruePot(today); } catch (e) { out.potErr = String(e.message).slice(0, 120); }
  try { out.track = await pollPlayers(Math.max(5000, budget - (Date.now() - now) - 8000), today); } catch (e) { out.trackErr = String(e.message).slice(0, 120); }
  try { out.pay = await matchPayouts(); } catch (e) { out.payErr = String(e.message).slice(0, 120); }
  await setMeta('tick_ok', Date.now());
  return out;
}

// ---------- registration: find you, lock in a wallet, prove it's you ----------
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 32);
const PLATFORMS = ['epic', 'psn', 'xbl'];
async function lookup(name, platform) {
  name = cleanName(name); platform = PLATFORMS.includes(platform) ? platform : 'epic';
  if (name.length < 3) return { ok: false, code: 'short' };
  const s = await fnStats({ name, platform });
  if (!s.ok) return s;
  await ready();
  const p = (await L.q(`SELECT name, wallet FROM dub_players WHERE account_id = $1`, [s.id]))[0];
  return { ok: true, player: { id: s.id, name: s.name, wins: s.wins, matches: s.matches, modes: s.modes, level: s.level }, registered: !!p };
}
async function register({ name, platform, wallet }) {
  await ready();
  wallet = String(wallet || '').trim();
  if (!L.isAddr(wallet)) return { ok: false, code: 'wallet' };
  const f = await lookup(name, platform); if (!f.ok) return f;
  const acct = f.player.id;
  const byAcct = (await L.q(`SELECT * FROM dub_players WHERE account_id = $1`, [acct]))[0];
  if (byAcct) return byAcct.wallet === wallet ? { ok: true, done: true, player: pub(byAcct) } : { ok: false, code: 'taken' };
  const byWallet = (await L.q(`SELECT name FROM dub_players WHERE wallet = $1`, [wallet]))[0];
  if (byWallet) return { ok: false, code: 'wallet_taken' };
  const open = (await L.q(`SELECT * FROM dub_claims WHERE account_id = $1 AND step IN ('public','private') AND expires_at > now() ORDER BY created_at DESC`, [acct]))[0];
  if (open && open.wallet === wallet) return { ok: true, claim: pubClaim(open) };
  if (open) return { ok: false, code: 'pending', mins: Math.ceil((new Date(open.expires_at) - Date.now()) / 60000) };
  const id = require('crypto').randomBytes(12).toString('hex');
  const rows = await L.q(`INSERT INTO dub_claims (id, account_id, name, platform, wallet, step, wins, matches, expires_at) VALUES ($1,$2,$3,$4,$5,'public',$6,$7, now() + make_interval(mins => $8::int)) RETURNING *`,
    [id, acct, f.player.name, PLATFORMS.includes(platform) ? platform : 'epic', wallet, f.player.wins, f.player.matches, C.CLAIM_MIN]);
  return { ok: true, claim: pubClaim(rows[0]) };
}
async function verify(id) {
  await ready();
  const c = (await L.q(`SELECT * FROM dub_claims WHERE id = $1`, [String(id || '').slice(0, 40)]))[0];
  if (!c) return { ok: false, code: 'noclaim' };
  if (c.step === 'done') { const p = (await L.q(`SELECT * FROM dub_players WHERE account_id = $1`, [c.account_id]))[0]; return { ok: true, claim: pubClaim(c), player: p ? pub(p) : null }; }
  if (new Date(c.expires_at) < Date.now() || c.step === 'expired') { await L.q(`UPDATE dub_claims SET step = 'expired' WHERE id = $1`, [c.id]); return { ok: true, claim: { ...pubClaim(c), step: 'expired' } }; }
  if (c.polled_at && Date.now() - new Date(c.polled_at).getTime() < Number(process.env.VERIFY_GAP_MS ?? 10000)) return { ok: true, claim: pubClaim(c), wait: true };
  await L.q(`UPDATE dub_claims SET polled_at = now() WHERE id = $1`, [c.id]);
  const s = await fnStats({ id: c.account_id });
  if (c.step === 'public' && !s.ok && s.code === 'private') {
    const r = await L.q(`UPDATE dub_claims SET step = 'private', private_at = now() WHERE id = $1 RETURNING *`, [c.id]);
    return { ok: true, claim: pubClaim(r[0]) };
  }
  if (c.step === 'private' && s.ok) {
    const clash = await L.q(`SELECT account_id, wallet FROM dub_players WHERE account_id = $1 OR wallet = $2`, [c.account_id, c.wallet]);
    if (clash.length) { await L.q(`UPDATE dub_claims SET step = 'expired' WHERE id = $1`, [c.id]); return { ok: false, code: clash[0].account_id === c.account_id ? 'taken' : 'wallet_taken' }; }
    const p = (await L.q(`INSERT INTO dub_players (account_id, name, platform, wallet, base_wins, last_wins, last_matches, checked_at, good_at) VALUES ($1,$2,$3,$4,$5,$5,$6, now(), now()) RETURNING *`,
      [c.account_id, s.name || c.name, c.platform, c.wallet, s.wins, s.matches]))[0];
    const r = await L.q(`UPDATE dub_claims SET step = 'done', done_at = now() WHERE id = $1 RETURNING *`, [c.id]);
    await L.q(`UPDATE dub_claims SET step = 'expired' WHERE account_id = $1 AND id <> $2 AND step IN ('public','private')`, [c.account_id, c.id]);
    return { ok: true, claim: pubClaim(r[0]), player: pub(p) };
  }
  return { ok: true, claim: pubClaim(c), seen: s.ok ? 'public' : s.code };
}
const short = w => (w ? w.slice(0, 4) + '…' + w.slice(-4) : '');
function pub(p) { return { name: p.name, platform: p.platform, wallet: p.wallet, short: short(p.wallet), status: p.status, joined: iso(p.created_at), base: p.base_wins, wins: p.last_wins }; }
function pubClaim(c) { return { id: c.id, name: c.name, platform: c.platform, wallet: c.wallet, short: short(c.wallet), step: c.step, wins: c.wins, expiresAt: iso(c.expires_at), privateAt: iso(c.private_at) }; }

// ---------- reads ----------
async function state() {
  await ready();
  const now = Date.now(), today = dayOf(now), start = dayStart(today), end = start + 86400000;
  const [board, pot, players, feed, tickOk, last, tot, newest] = await Promise.all([
    dayBoard(today), potOf(today),
    L.q(`SELECT COUNT(*)::int AS n FROM dub_players`),
    L.q(`SELECT e.n, e.at, p.name FROM dub_events e JOIN dub_players p ON p.id = e.player_id ORDER BY e.id DESC LIMIT 24`),
    meta('tick_ok'),
    L.q(`SELECT * FROM dub_days ORDER BY day DESC LIMIT 1`),
    L.q(`SELECT (SELECT COALESCE(SUM(n),0) FROM dub_events)::int AS dubs, (SELECT COALESCE(SUM(lamports),0) FROM dub_payouts WHERE sig IS NOT NULL)::bigint AS paid,
      (SELECT COUNT(*) FROM dub_days WHERE paid_dubs > 0)::int AS paydays`),
    L.q(`SELECT name, created_at FROM dub_players ORDER BY id DESC LIMIT 8`),
  ]);
  const rows = board.map(r => ({ ...r, eligible: true }));
  const s = split(pot, rows);
  const lead = board[0];
  return {
    ok: true, now: iso(now), day: today, opensAt: iso(start), closesAt: iso(end),
    pot: { lamports: pot, sol: sol(pot), live: !!(C.CA && L.isAddr(C.CA)) },
    players: players[0].n, dubsToday: board.reduce((a, r) => a + r.dubs, 0),
    dev: lead ? { name: lead.name, dubs: lead.dubs, est: sol(s.amounts.get(lead.id) || 0) } : null,
    board: board.slice(0, 50).map((r, i) => ({ rank: i + 1, name: r.name, dubs: r.dubs, paid: Math.min(r.dubs, C.CAP), est: sol(s.amounts.get(r.id) || 0), dev: i === 0 })),
    perDub: sol(s.perDub), devCut: sol(s.devCut),
    feed: feed.map(f => ({ name: f.name, n: f.n, at: iso(f.at) })),
    lastDay: last[0] ? { day: String(last[0].day instanceof Date ? dayOf(last[0].day) : last[0].day).slice(0, 10), pot: sol(last[0].pot), dubs: last[0].dubs, dev: last[0].dev_name } : null,
    config: { ca: C.CA, x: C.X, devPct: C.DEV_PCT, cap: C.CAP, minHold: C.MIN_HOLD, modes: C.MODES, claimMin: C.CLAIM_MIN },
    tracker: { key: keySet(), lastTick: tickOk ? iso(Number(tickOk)) : null },
    totals: { dubs: tot[0].dubs, paid: sol(tot[0].paid), paydays: tot[0].paydays, players: players[0].n },
    newest: newest.map(p => ({ name: p.name, at: iso(p.created_at) })),
  };
}
async function boardAll() {
  await ready();
  const rows = await L.q(`SELECT p.name, COALESCE(SUM(e.n),0)::int AS dubs, COUNT(DISTINCT e.day)::int AS days,
      (SELECT COUNT(*) FROM dub_days d WHERE d.dev_id = p.id)::int AS devs,
      (SELECT COALESCE(SUM(lamports),0) FROM dub_payouts o WHERE o.player_id = p.id AND o.sig IS NOT NULL) AS paid
    FROM dub_players p LEFT JOIN dub_events e ON e.player_id = p.id GROUP BY p.id, p.name HAVING COALESCE(SUM(e.n),0) > 0 ORDER BY dubs DESC, MIN(e.at) ASC LIMIT 100`);
  return { ok: true, board: rows.map((r, i) => ({ rank: i + 1, name: r.name, dubs: r.dubs, days: r.days, devs: r.devs, paid: sol(r.paid) })) };
}
async function days(limit = 14) {
  await ready();
  const ds = await L.q(`SELECT * FROM dub_days ORDER BY day DESC LIMIT $1`, [Math.min(60, limit | 0 || 14)]);
  const out = [];
  for (const d of ds) {
    const day = d.day instanceof Date ? dayOf(d.day) : String(d.day).slice(0, 10);
    const pays = await L.q(`SELECT name, wallet, dubs, paid_dubs, is_dev, lamports, eligible, note, sig FROM dub_payouts WHERE day = $1 ORDER BY is_dev DESC, lamports DESC, dubs DESC`, [day]);
    out.push({ day, pot: sol(d.pot), dubs: d.dubs, paidDubs: d.paid_dubs, dev: d.dev_name, perDub: sol(d.per_dub), devCut: sol(d.dev_cut), rolled: sol(d.rolled),
      payouts: pays.map(p => ({ name: p.name, short: short(p.wallet), dubs: p.dubs, paidDubs: p.paid_dubs, dev: p.is_dev, sol: sol(p.lamports), eligible: p.eligible, note: p.note, sig: p.sig })) });
  }
  return { ok: true, days: out };
}
async function me(qs) {
  await ready();
  const k = String(qs || '').trim().slice(0, 60); if (k.length < 3) return { ok: false, code: 'short' };
  const p = (await L.q(`SELECT * FROM dub_players WHERE wallet = $1 OR lower(name) = lower($1) LIMIT 1`, [k]))[0];
  if (!p) {
    const c = (await L.q(`SELECT * FROM dub_claims WHERE (wallet = $1 OR lower(name) = lower($1)) AND step IN ('public','private') AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [k]))[0];
    return c ? { ok: true, claim: pubClaim(c) } : { ok: false, code: 'none' };
  }
  const today = dayOf(Date.now());
  const [t, all, pays, board, pot] = await Promise.all([
    L.q(`SELECT COALESCE(SUM(n),0)::int AS n FROM dub_events WHERE player_id = $1 AND day = $2`, [p.id, today]),
    L.q(`SELECT COALESCE(SUM(n),0)::int AS n FROM dub_events WHERE player_id = $1`, [p.id]),
    L.q(`SELECT day, dubs, paid_dubs, is_dev, lamports, eligible, note, sig FROM dub_payouts WHERE player_id = $1 ORDER BY day DESC LIMIT 10`, [p.id]),
    dayBoard(today), potOf(today),
  ]);
  const s = split(pot, board.map(r => ({ ...r, eligible: true })));
  const rank = board.findIndex(r => r.id === p.id);
  return { ok: true, player: pub(p), today: t[0].n, total: all[0].n, rank: rank >= 0 ? rank + 1 : null, est: sol(s.amounts.get(p.id) || 0),
    payouts: pays.map(x => ({ day: x.day instanceof Date ? dayOf(x.day) : String(x.day).slice(0, 10), dubs: x.dubs, paidDubs: x.paid_dubs, dev: x.is_dev, sol: sol(x.lamports), eligible: x.eligible, note: x.note, sig: x.sig })) };
}

module.exports = { ready, tick, lookup, register, verify, state, boardAll, days, me, fnStats, split, dayOf, keySet, creator, meta, setMeta };
