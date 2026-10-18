(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const H = document.documentElement;
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtSol = x => { x = Number(x) || 0; return x >= 1000 ? x.toFixed(0) : x >= 100 ? x.toFixed(1) : x >= 10 ? x.toFixed(2) : x.toFixed(4); };
  const fmtInt = n => Number(n || 0).toLocaleString('en-US');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ago = iso => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
  const COLORS = ['#2f6bff', '#8f5cff', '#f5a300', '#16a9d8', '#ff4f7e', '#1fbf86', '#6a5cff', '#ff7a2f'];
  const hue = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const avatar = name => `<span class="av" style="background:${hue(name)}">${esc(String(name || '?').trim().charAt(0).toUpperCase() || '?')}</span>`;
  async function api(path, opt = {}) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(path, { cache: 'no-store', ...opt, headers: { 'content-type': 'application/json' }, signal: ctl.signal });
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const IMG = n => `/assets/img/${n}.webp`;

  /* ---------------- the 3D world bridge (world.js loads as a module, maybe after this file) ---------------- */
  const pending = [];
  const W = (fn, ...args) => { const w = window.DUBW; if (w && w.ready && typeof w[fn] === 'function') { try { w[fn](...args); } catch {} } else pending.push([fn, args]); };
  addEventListener('dubw:ready', () => { while (pending.length) { const [fn, args] = pending.shift(); W(fn, ...args); } });

  /* ---------------- the logo's gloss sweep ---------------- */
  let introDone = false;
  function shine(delay = 0) { $$('.shine').forEach((s, i) => { s.classList.remove('go'); void s.offsetWidth; setTimeout(() => s.classList.add('go'), delay + i * 110); }); }
  function intro() {
    // no intro: the page opens straight on the lobby; the logo just shines once it has loaded
    introDone = true; H.classList.add('is-ready');
    const imgs = $$('.L'); let n = 0; const go = () => { if (++n >= imgs.length) setTimeout(() => shine(), 500); };
    imgs.forEach(i => (i.complete ? go() : i.addEventListener('load', go, { once: true })));
  }

  /* ---------------- state: HUD, board, dev card, feed ---------------- */
  let S = null, tab = 'today', allCache = null, lastFeedKey = null, firstState = true, lastNudge = 0, prevDubs = new Map();
  function countTo(el, to, fmt) {
    const from = Number(el.dataset.v ?? NaN); el.dataset.v = to;
    if (!isFinite(from) || RM || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), d = 700;
    const step = now => { const t = Math.min(1, (now - t0) / d), k = 1 - Math.pow(1 - t, 3); el.textContent = fmt(from + (to - from) * k); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  async function loadState() {
    try {
      const s = await api('/api/state');
      if (!s || !s.ok) throw new Error('state');
      S = s; renderState(s); setLive(s);
      if (s.tracker && s.tracker.key && (!s.tracker.lastTick || Date.now() - Date.parse(s.tracker.lastTick) > 150000) && Date.now() - lastNudge > 120000) {
        lastNudge = Date.now(); fetch('/api/tick', { cache: 'no-store' }).catch(() => {});
      }
    } catch {
      setLive(null);
      if (!S) { ['#hPot', '#hDubs', '#hPlayers'].forEach(id => ($(id).textContent = '—')); if (tab === 'today') emptyBoard('The board is reconnecting. Pull to refresh in a moment.'); }
    }
  }
  function setLive(s) {
    const el = $('#live'), tx = $('#liveTxt');
    if (!s) { el.classList.add('off'); tx.textContent = 'reconnecting'; return; }
    if (!s.tracker.key) { el.classList.add('off'); tx.textContent = 'tracker starting'; return; }
    el.classList.remove('off');
    tx.textContent = s.tracker.lastTick ? 'live · stats read ' + ago(s.tracker.lastTick) : 'live';
  }
  function renderState(s) {
    countTo($('#hPot'), s.pot.sol, fmtSol);
    countTo($('#hDubs'), s.dubsToday, v => fmtInt(Math.round(v)));
    countTo($('#hPlayers'), s.players, v => fmtInt(Math.round(v)));
    // the dev
    const dn = $('#devName');
    if (s.dev) { dn.textContent = s.dev.name; dn.classList.remove('empty'); countTo($('#devDubs'), s.dev.dubs, v => fmtInt(Math.round(v))); countTo($('#devEst'), s.dev.est, fmtSol); }
    else { dn.textContent = 'The crown is open'; dn.classList.add('empty'); $('#devDubs').textContent = '0'; $('#devEst').textContent = '0'; }
    if (s.config) { $('#devNote').textContent = `Most dubs before 00:00 UTC takes the dev cut, ${s.config.devPct}% of the day's pot, on top of their dubs.`; $$('.mh').forEach(e => (e.textContent = fmtInt(s.config.minHold))); $('#minHold').textContent = fmtInt(s.config.minHold); }
    if (tab === 'today') renderBoard(s.board.map(r => ({ k: r.name, rank: r.rank, name: r.name, dubs: r.dubs, val: fmtSol(r.est), top: r.rank === 1 })), 'today');
    W('setBoard', s.board.slice(0, 5).map(r => ({ name: r.name, dubs: r.dubs })));
    W('setPot', s.pot.sol);
    if (s.totals) W('setPaydays', s.totals.paydays);
    // feed + toasts for new dubs
    const feed = s.feed || [];
    if (feed.length) {
      $('#feed').hidden = false;
      const items = feed.map(f => `<span><em>+${f.n} ${f.n > 1 ? 'dubs' : 'dub'}</em> · <b>${esc(f.name)}</b> · ${ago(f.at)}</span>`).join('');
      $('#feedTrk').innerHTML = items + items;
      const key = feed[0].at + feed[0].name;
      if (!firstState && lastFeedKey && key !== lastFeedKey) {
        for (const f of feed) { if (f.at + f.name === lastFeedKey) break; toast(`<img src="${IMG('crown-s')}" alt=""><div><span>VICTORY ROYALE</span><br>${esc(f.name)} +${f.n} ${f.n > 1 ? 'dubs' : 'dub'}</div>`); }
      }
      lastFeedKey = key;
    } else $('#feed').hidden = true;
    // CA + links
    const c = s.config || {};
    if (c.ca) {
      $('#ca').hidden = false; $('#caCode').textContent = c.ca;
      $('#caBuy').href = 'https://pump.fun/coin/' + c.ca; $('#caChart').href = 'https://dexscreener.com/solana/' + c.ca;
      if (c.x) { $('#caX').hidden = false; $('#caX').href = c.x; }
      $('#endLinks').innerHTML = `<a class="btn sm" href="https://pump.fun/coin/${esc(c.ca)}" target="_blank" rel="noopener">Buy $DUB</a><a class="btn blue sm" href="https://dexscreener.com/solana/${esc(c.ca)}" target="_blank" rel="noopener">Chart</a>` + (c.x ? `<a class="btn blue sm" href="${esc(c.x)}" target="_blank" rel="noopener">X</a>` : '');
    }
    // pot flow, season totals, newest players
    countTo($('#fPot'), s.pot.sol, v => fmtSol(v) + ' SOL');
    countTo($('#fDubs'), s.dubsToday, v => fmtInt(Math.round(v)));
    $('#fPer').textContent = fmtSol(s.perDub) + ' SOL'; $('#fDev').textContent = fmtSol(s.devCut) + ' SOL';
    if (s.totals) {
      countTo($('#tDubs'), s.totals.dubs, v => fmtInt(Math.round(v))); countTo($('#tPaid'), s.totals.paid, fmtSol);
      countTo($('#tDays'), s.totals.paydays, v => fmtInt(Math.round(v))); countTo($('#tPlayers'), s.totals.players, v => fmtInt(Math.round(v)));
    }
    if (s.newest) $('#joined').innerHTML = s.newest.length ? s.newest.map(p => `<li>${avatar(p.name)}<span>${esc(p.name)}</span><small>${ago(p.at)}</small></li>`).join('') : '<li class="none">Be the first name on the board.</li>';
    firstState = false;
  }
  function emptyBoard(txt) { $('#lbList').innerHTML = ''; $('#lbEmpty').hidden = false; $('#lbEmptyTxt').textContent = txt; }
  function renderBoard(rows, mode) {
    const list = $('#lbList');
    if (!rows.length) { emptyBoard(mode === 'today' ? 'No dubs yet today. The first Victory Royale takes the crown.' : 'No dubs yet. The all-time board starts with the first Victory Royale.'); return; }
    $('#lbEmpty').hidden = true;
    const before = new Map($$('.row', list).map(el => [el.dataset.k, el.getBoundingClientRect().top]));
    list.innerHTML = rows.map(r => `<li class="row${r.top ? ' top' : ''}" data-k="${esc(r.k)}"><span class="rk">${r.top ? '👑' : r.rank}</span><span class="nm">${avatar(r.name)}<b>${esc(r.name)}</b></span><span class="num">${fmtInt(r.dubs)}</span><span class="est">${r.val}</span></li>`).join('');
    $$('.row', list).forEach(el => {
      const k = el.dataset.k, t0 = before.get(k), dubs = rows.find(r => r.k === k).dubs;
      if (t0 != null) { const dy = t0 - el.getBoundingClientRect().top; if (Math.abs(dy) > 1 && !RM) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
      const pk = mode + ':' + k; if (prevDubs.has(pk) && prevDubs.get(pk) !== dubs) el.classList.add('flash'); prevDubs.set(pk, dubs);
    });
  }
  async function showTab(r) {
    tab = r; $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.r === r));
    $('#lbCols').lastElementChild.textContent = r === 'today' ? 'SOL' : 'Paid';
    if (r === 'today') { if (S) renderState(S); return; }
    try { const j = allCache && Date.now() - allCache.at < 20000 ? allCache.j : await api('/api/board'); allCache = { at: Date.now(), j };
      if (tab !== 'all') return; renderBoard(j.board.map(x => ({ k: x.name, rank: x.rank, name: x.name, dubs: x.dubs, val: fmtSol(x.paid), top: x.rank === 1 })), 'all');
    } catch { emptyBoard('Could not load the all-time board. Try again in a moment.'); }
  }

  /* ---------------- payday clock + the zone ---------------- */
  function clock() {
    const now = Date.now(), end = S ? Date.parse(S.closesAt) : Math.ceil((now + 1) / 864e5) * 864e5;
    let left = end - now; if (left < 0) { left = 0; if (S && now - Date.parse(S.closesAt) > 5000) { S.closesAt = new Date(Math.ceil((now + 1) / 864e5) * 864e5).toISOString(); loadState(); } }
    const h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4), s = Math.floor(left % 6e4 / 1e3);
    $('#hClock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    $('#mClock').textContent = $('#hClock').textContent;
    $('#zoneIn').setAttribute('r', Math.max(2, 18 * left / 864e5).toFixed(2));
    const done = 1 - left / 864e5, d = new Date(now);
    $('#dayFill').style.width = (done * 100).toFixed(2) + '%';
    $('#dayNow').style.left = (done * 100).toFixed(2) + '%';
    $('#dayNowT').textContent = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  /* ---------------- register: find, lock, prove ---------------- */
  const R = { plat: 'epic', player: null, claim: null, timer: null, poll: null };
  function step(n) {
    $$('#panels .panel').forEach(p => (p.hidden = Number(p.dataset.p) !== n));
    $$('#steps li').forEach(li => { const s = Number(li.dataset.s); li.classList.toggle('on', s === n); li.classList.toggle('ok', s < n); });
  }
  const out = (id, msg, kind) => { const o = $(id); o.className = 'out' + (kind ? ' ' + kind : ''); o.textContent = msg || ''; };
  function busy(btn, on, label) { btn.disabled = on; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label; } else if (btn.dataset.l) btn.textContent = btn.dataset.l; }
  $$('#rPlat button').forEach(b => b.addEventListener('click', () => { R.plat = b.dataset.v; $$('#rPlat button').forEach(x => x.classList.toggle('on', x === b)); W('setHood', R.plat); }));
  async function find() {
    const name = $('#rName').value.trim();
    if (name.length < 3) return out('#o1', 'Type your Epic display name (at least 3 characters).', 'err');
    const btn = $('#rFind'); busy(btn, true, 'Finding…'); out('#o1', '');
    try {
      const j = await api(`/api/lookup?name=${encodeURIComponent(name)}&platform=${R.plat}`);
      if (!j.ok) return out('#o1', j.error || 'Could not find that account.', 'err');
      if (j.registered) return out('#o1', `${j.player.name} is already registered. Check its status under Payday.`, 'ok');
      R.player = j.player;
      $('#pcard').innerHTML = `${avatar(j.player.name)}<div><b>${esc(j.player.name)}</b><small>${fmtInt(j.player.matches)} BR matches${j.player.level ? ' · level ' + j.player.level : ''}</small></div><div class="wins"><b>${fmtInt(j.player.wins)}</b><small>BR wins so far</small></div>`;
      step(2); setTimeout(() => $('#rWallet').focus({ preventScroll: true }), 50);
    } catch { out('#o1', 'The server did not answer. Try again.', 'err'); }
    finally { busy(btn, false); }
  }
  const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  async function lock() {
    const w = $('#rWallet').value.trim();
    if (!isAddr(w)) return out('#o2', 'Paste a Solana wallet address.', 'err');
    const btn = $('#rLock'); busy(btn, true, 'Locking…'); out('#o2', '');
    try {
      const j = await api('/api/register', { method: 'POST', body: JSON.stringify({ name: R.player.name, platform: R.plat, wallet: w }) });
      if (!j.ok) return out('#o2', j.error || 'Could not register.', 'err');
      if (j.done) return finished(j.player);
      startProve(j.claim);
    } catch { out('#o2', 'The server did not answer. Try again.', 'err'); }
    finally { busy(btn, false); }
  }
  function setChecks(stepName) {
    const c2 = $('#c2'), c3 = $('#c3');
    c2.className = stepName === 'public' ? 'wait' : 'ok'; $('#c2s').textContent = stepName === 'public' ? 'watching' : 'seen';
    c3.className = stepName === 'private' ? 'wait' : stepName === 'done' ? 'ok' : ''; $('#c3s').textContent = stepName === 'private' ? 'watching' : stepName === 'done' ? 'seen' : 'next';
  }
  function startProve(claim) {
    R.claim = claim; store.set('dub.claim', claim.id); step(3); setChecks(claim.step); out('#o3', '');
    clearInterval(R.timer); clearTimeout(R.poll);
    const tick = () => { const left = Math.max(0, Date.parse(claim.expiresAt) - Date.now()); $('#cTimer').textContent = `${String(Math.floor(left / 6e4)).padStart(2, '0')}:${String(Math.floor(left % 6e4 / 1e3)).padStart(2, '0')}`; if (!left) clearInterval(R.timer); };
    tick(); R.timer = setInterval(tick, 1000);
    poll();
  }
  async function poll() {
    clearTimeout(R.poll); if (!R.claim) return;
    try {
      const j = await api('/api/verify?id=' + encodeURIComponent(R.claim.id));
      if (!j.ok) { out('#o3', j.error || 'Something went wrong.', 'err'); store.del('dub.claim'); return; }
      R.claim = { ...R.claim, ...j.claim }; setChecks(j.claim.step);
      if (j.claim.step === 'done') return finished(j.player);
      if (j.claim.step === 'expired') { store.del('dub.claim'); out('#o3', 'The check ran out of time. Start again; it only takes a minute.', 'err'); $('#o3').insertAdjacentHTML('beforeend', ' <button type="button" class="linkbtn" id="again">Start again</button>'); $('#again').onclick = () => { step(1); out('#o3', ''); }; return; }
      if (j.seen === 'nokey') out('#o3', 'The tracker is switching on. Your check continues.', '');
    } catch {}
    R.poll = setTimeout(poll, document.hidden ? 20000 : 10000);
  }
  function finished(p) {
    clearInterval(R.timer); clearTimeout(R.poll); store.del('dub.claim'); R.claim = null;
    if (p) W('setName', p.name); W('emote');
    step(4); $$('#steps li').forEach(li => { li.classList.add('ok'); li.classList.remove('on'); });
    $('#doneTxt').innerHTML = p ? `<b>${esc(p.name)}</b> is on the board, paid to <b>${esc(p.short)}</b>. We start counting from your ${fmtInt(p.base)} wins. Your next Victory Royale is a dub.` : 'You are on the board. Your next Victory Royale is a dub.';
    toast(`<img src="${IMG('crown-s')}" alt=""><div><span>YOU'RE IN</span><br>Go get a dub.</div>`);
    loadState();
  }
  async function resume() {
    const id = store.get('dub.claim'); if (!id) return;
    try {
      const j = await api('/api/verify?id=' + encodeURIComponent(id));
      if (j.ok && j.claim && (j.claim.step === 'public' || j.claim.step === 'private')) startProve(j.claim);
      else store.del('dub.claim');
    } catch {}
  }
  function wallet() { const w = window; return (w.phantom && w.phantom.solana) || w.solflare || w.backpack || w.solana || null; }
  async function connect() {
    const p = wallet(); if (!p) return;
    try { const r = await p.connect(); const k = (r && r.publicKey) || p.publicKey; if (k) { $('#rWallet').value = k.toString(); out('#o2', 'Wallet connected.', 'ok'); } }
    catch { out('#o2', 'The wallet did not connect. You can paste the address instead.', 'err'); }
  }

  /* ---------------- the split calculator ---------------- */
  function calc() {
    const pot = +$('#sPot').value, all = +$('#sAll').value, mineEl = $('#sMine');
    mineEl.max = Math.min(10, all); const mine = Math.min(+mineEl.value, all), dev = $('#sDev').checked;
    const pct = (S && S.config ? S.config.devPct : 25) / 100;
    const devCut = pot * pct, per = (pot - devCut) / all, yours = mine * per, total = yours + (dev ? devCut : 0);
    $('#vPot').textContent = pot.toFixed(1) + ' SOL'; $('#vAll').textContent = all; $('#vMine').textContent = mine;
    $('#cOut').innerHTML = `${fmtSol(total)} <small>SOL</small>`;
    $('#lDev').textContent = fmtSol(devCut) + ' SOL' + (dev ? ' · yours' : '');
    $('#lPer').textContent = fmtSol(per) + ' SOL'; $('#lMine').textContent = `${mine} × ${fmtSol(per)} = ${fmtSol(yours)} SOL`;
    $('#bD').style.width = (pct * 100) + '%'; $('#bY').style.width = (yours / pot * 100) + '%'; $('#bP').style.width = Math.max(0, 100 - pct * 100 - yours / pot * 100) + '%';
    $$('#split input[type=range]').forEach(r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'));
    W('setSplit', { dev: pct, rest: Math.max(0, (pot - devCut - yours) / pot), yours: yours / pot });
  }

  /* ---------------- payday: history + status ---------------- */
  const txUrl = sig => `https://solscan.io/tx/${sig}`;
  const dayName = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  async function loadDays() {
    const box = $('#days');
    try {
      const j = await api('/api/days?limit=14');
      if (!j.ok) throw 0;
      if (!j.days.length) {
        const local = new Date(Math.ceil((Date.now() + 1) / 864e5) * 864e5).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        box.innerHTML = `<div class="empty"><img src="${IMG('coin-b')}" alt="">The first payday is tonight at 00:00 UTC (${esc(local)} your time).</div>`; return;
      }
      box.innerHTML = j.days.map((d, i) => `<details class="day"${i === 0 ? ' open' : ''}><summary><div><b>${dayName(d.day)}</b><div class="meta">${fmtInt(d.dubs)} dubs${d.dev ? ' · dev ' + esc(d.dev) : ''}${d.rolled > 0 ? ' · rolled into the next day' : ''}</div></div><div class="pot">${fmtSol(d.pot)} SOL</div></summary>
        <div class="pays">${d.payouts.length ? d.payouts.map(p => `<div class="pay"><span class="nm">${p.dev ? '👑 ' : ''}${esc(p.name)} <small style="color:var(--dim)">${p.eligible ? p.paidDubs + ' paid dubs' : esc(p.note || 'not eligible')}</small></span><span class="sol">${p.sol > 0 ? fmtSol(p.sol) + ' SOL' : '—'}</span><span>${p.sig ? `<a href="${txUrl(p.sig)}" target="_blank" rel="noopener">paid ↗</a>` : p.sol > 0 ? '<span class="badge gold">sending</span>' : ''}</span></div>`).join('') : '<div class="pay"><span class="nm">No dubs that day.</span><span></span><span></span></div>'}</div></details>`).join('');
    } catch { box.innerHTML = '<div class="empty">Match history is reconnecting.</div>'; }
  }
  async function lookupMe() {
    const q = $('#meQ').value.trim(); const btn = $('#meGo');
    if (q.length < 3) return out('#meOut', 'Type your Epic name or wallet.', 'err');
    busy(btn, true, '…'); out('#meOut', ''); $('#me').hidden = true;
    try {
      const j = await api('/api/me?q=' + encodeURIComponent(q));
      if (!j.ok) return out('#meOut', j.error || 'Not found.', 'err');
      if (j.claim) { out('#meOut', `Registration for ${j.claim.name} is waiting on the privacy switch (${j.claim.step === 'public' ? 'switch it off' : 'switch it back on'}).`, 'ok'); return; }
      const p = j.player, st = p.status === 'ok' ? '<span class="badge ok">● tracking</span>' : p.status === 'private' ? '<span class="badge warn">stats private, turn them on</span>' : '<span class="badge warn">account not found</span>';
      $('#me').innerHTML = `<div class="pcard" style="margin:0">${avatar(p.name)}<div><b>${esc(p.name)}</b><small>${esc(p.short)}</small></div><div class="wins">${st}</div></div>
        <div class="stat"><div><b>${fmtInt(j.today)}</b><small>dubs today</small></div><div><b>${j.rank ? '#' + j.rank : '—'}</b><small>rank today</small></div><div><b>${fmtSol(j.est)}</b><small>SOL so far</small></div></div>
        <div class="stat"><div><b>${fmtInt(j.total)}</b><small>dubs, all time</small></div><div><b>${fmtInt(j.payouts.filter(x => x.dev).length)}</b><small>days as dev</small></div><div><b>${fmtSol(j.payouts.filter(x => x.sig).reduce((a, x) => a + x.sol, 0))}</b><small>SOL paid</small></div></div>
        ${j.payouts.length ? '<div class="pays" style="padding:0">' + j.payouts.map(x => `<div class="pay"><span class="nm">${dayName(x.day)}${x.dev ? ' · 👑 dev' : ''} · ${x.eligible ? x.paidDubs + ' paid dubs' : esc(x.note || 'not eligible')}</span><span class="sol">${x.sol > 0 ? fmtSol(x.sol) + ' SOL' : '—'}</span><span>${x.sig ? `<a href="${txUrl(x.sig)}" target="_blank" rel="noopener">paid ↗</a>` : x.sol > 0 ? '<span class="badge gold">sending</span>' : ''}</span></div>`).join('') + '</div>' : ''}`;
      $('#me').hidden = false;
    } catch { out('#meOut', 'The server did not answer. Try again.', 'err'); }
    finally { busy(btn, false); }
  }

  /* ---------------- toasts, reveal, nav ---------------- */
  function toast(html) { const t = document.createElement('div'); t.className = 'tst'; t.innerHTML = html; $('#toast').appendChild(t); setTimeout(() => t.remove(), 4200); }
  function reveal() {
    const els = $$('.rv:not(.vis)'); if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('vis')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: .06 });
    els.forEach(e => io.observe(e));
  }
  function sweep() { const vh = innerHeight; $$('.rv:not(.vis)').forEach(e => { if (e.getBoundingClientRect().top < vh * .98) e.classList.add('vis'); }); }
  const slots = $$('.slots button');
  const stopsEls = () => $$('[data-poi]');
  function spy() {
    const y = innerHeight * .45; let cur = null;
    for (const el of stopsEls()) if (el.getBoundingClientRect().top <= y) cur = el;
    const key = cur ? cur.dataset.poi : 'top';
    slots.forEach(b => b.classList.toggle('on', b.dataset.to === key));
    $('#dockLabel').textContent = key === 'top' ? 'Lobby' : (cur.dataset.name || key);
    document.documentElement.classList.toggle('in-stop', key !== 'top');
    // the path: light the step the camera is walking past
    const how = $('#how'), r = how.getBoundingClientRect(), t = Math.min(1, Math.max(0, (y - r.top) / r.height)) / .7;
    $$('#walk li').forEach((li, i) => { const on = key === 'how' && Math.min(3, Math.floor(t * 4)) === i; li.classList.toggle('on', on); li.classList.toggle('done', key === 'how' && i < Math.floor(t * 4) && !on); });
  }
  function go(key) { const el = key === 'top' ? $('#top') : document.querySelector(`[data-poi="${key}"]`); if (el) el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' }); }
  slots.forEach(b => b.addEventListener('click', () => go(b.dataset.to)));
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key); if (n >= 1 && n <= 9 && slots[n - 1]) { go(slots[n - 1].dataset.to); e.preventDefault(); }
    if (e.key === '0') go('top');
    if (e.key === 'e' || e.key === 'E') W('emote');
  });
  let st = 0; addEventListener('scroll', () => { if (st) return; st = requestAnimationFrame(() => { st = 0; spy(); sweep(); }); }, { passive: true });
  addEventListener('hashchange', () => setTimeout(sweep, 400));

  /* ---------------- wire up ---------------- */
  function init() {
    intro();
    reveal(); spy();
    $$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.r)));
    $('#rFind').addEventListener('click', find);
    $('#rName').addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
    $('#rName').addEventListener('input', e => W('setName', e.target.value.trim()));
    $('#emote').addEventListener('click', () => W('emote'));
    $$('.mode').forEach(m => m.addEventListener('click', () => { $$('.mode').forEach(x => x.classList.toggle('on', x === m)); W('hop', Number(m.dataset.m)); }));
    $('#rLock').addEventListener('click', lock);
    $('#rWallet').addEventListener('keydown', e => { if (e.key === 'Enter') lock(); });
    $('#rBack').addEventListener('click', () => { step(1); out('#o2', ''); });
    if (wallet()) { $('#rConnect').hidden = false; $('#rConnect').addEventListener('click', connect); }
    $$('#split input').forEach(i => i.addEventListener('input', calc)); calc();
    $('#meGo').addEventListener('click', lookupMe); $('#meQ').addEventListener('keydown', e => { if (e.key === 'Enter') lookupMe(); });
    $('#caCopy').addEventListener('click', async () => { const ca = $('#caCode').textContent; try { await navigator.clipboard.writeText(ca); $('#caCopy').textContent = 'Copied'; } catch { $('#caCopy').textContent = 'Select it'; } setTimeout(() => ($('#caCopy').textContent = 'Copy'), 1600); });
    // the logo shines now and then; tap it for one more
    setInterval(() => { if (!document.hidden && introDone) shine(); }, 9000);
    $('#logo').addEventListener('pointerenter', () => shine());
    clock(); setInterval(clock, 1000);
    loadState(); setInterval(() => { if (!document.hidden) loadState(); }, 20000);
    setInterval(() => { if (S) setLive(S); }, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadState(); });
    loadDays(); setInterval(() => { if (!document.hidden) loadDays(); }, 120000);
    resume();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
