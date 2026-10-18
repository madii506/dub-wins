// DUB arena on the page: the lobby, the duel sheet (make, take, pay, play, result), the run's HUD and its sounds.
(() => {
  'use strict';
  const AC = window.DUBA; if (!AC) return;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const H = document.documentElement;
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtInt = n => Number(n || 0).toLocaleString('en-US');
  const fmtSol = x => { x = Number(x) || 0; return x >= 100 ? x.toFixed(1) : String(+x.toFixed(4)); };
  const ago = iso => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
  const mmss = ms => { ms = Math.max(0, ms); const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000); return `${m}:${String(s).padStart(2, '0')}`; };
  const COLORS = ['#2f6bff', '#8f5cff', '#f5a300', '#16a9d8', '#ff4f7e', '#1fbf86', '#6a5cff', '#ff7a2f'];
  const hue = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const avatar = n => `<span class="av" style="background:${hue(n)}">${esc(String(n || '?').trim().charAt(0).toUpperCase() || '?')}</span>`;
  const DEV = { keys: '<span class="dv" title="Played on a keyboard">⌨</span>', mouse: '<span class="dv" title="Played with a mouse">🖱</span>', touch: '<span class="dv" title="Played on a touch screen">📱</span>', pen: '<span class="dv" title="Played with a pen">✎</span>' };
  const runLine = x => (x && x.dist != null ? `${fmtInt(x.dist)} blocks · ${x.gems} gems` : '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const txUrl = sig => `https://solscan.io/tx/${sig}`;
  const IMG = n => `/assets/img/${n}.webp`;
  const isMobile = () => matchMedia('(max-width: 640px), (pointer: coarse)').matches;
  async function api(op, body, qs = '') {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch('/api/arena?op=' + op + qs, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      return await r.json();
    } catch { return { ok: false, code: 'net', error: 'The server did not answer. Check your connection and try again.' }; }
    finally { clearTimeout(t); }
  }
  const pending = [];
  const W = (fn, ...a) => { const w = window.DUBW; if (w && w.ready && typeof w[fn] === 'function') { try { w[fn](...a); } catch {} } else pending.push([fn, a]); };
  addEventListener('dubw:ready', () => { while (pending.length) { const [fn, a] = pending.shift(); W(fn, ...a); } });
  function toast(html) { const t = document.createElement('div'); t.className = 'tst'; t.innerHTML = html; $('#toast').appendChild(t); setTimeout(() => t.remove(), 4200); }
  function countTo(el, to, fmt, d = 700) {
    if (!el) return; const from = Number(el.dataset.v ?? NaN); el.dataset.v = to;
    if (!isFinite(from) || RM || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(); const step = now => { const t = Math.min(1, (now - t0) / d), k = 1 - Math.pow(1 - t, 3); el.textContent = fmt(from + (to - from) * k); if (t < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
  }

  /* ---------------- tickets: the duels this device is in (entry id + secret) ---------------- */
  const KEY = 'dub.duels';
  const mine = () => { try { return JSON.parse(store.get(KEY) || '[]').filter(x => x && x.e && Date.now() - x.at < 14 * 864e5); } catch { return []; } };
  const saveMine = l => store.set(KEY, JSON.stringify(l.slice(-40)));
  const remember = (e, k, d, side, stake) => { const l = mine().filter(x => x.e !== e); l.push({ e, k, d, side, stake, at: Date.now() }); saveMine(l); };
  const ticketFor = duelId => mine().filter(x => x.d === duelId).pop();
  const me0 = () => { try { return JSON.parse(store.get('dub.me') || '{}'); } catch { return {}; } };

  /* ---------------- sounds ---------------- */
  let AX = null;
  const sfxOn = () => store.get('dub.sfx') !== '0';
  function audio() { if (!AX) { try { AX = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (AX && AX.state === 'suspended') AX.resume(); return AX; }
  function tone(f, dur, type = 'sine', vol = .12, to = 0, delay = 0) {
    if (!sfxOn() || !AX) return; const t = AX.currentTime + delay, o = AX.createOscillator(), g = AX.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(AX.destination); o.start(t); o.stop(t + dur + .02);
  }
  const SFX = {
    jump: () => tone(380, .16, 'square', .05, 720),
    slide: () => { tone(220, .18, 'sawtooth', .035, 120); },
    lane: () => tone(560, .05, 'triangle', .05, 640),
    land: () => tone(140, .07, 'sine', .07, 90),
    gem: t => { const f = [0, 880, 1046, 1318][t] || 880; tone(f, .1, 'triangle', .11); tone(f * 1.5, .16, 'triangle', .08, 0, .06); if (t === 3) tone(f * 2, .22, 'sine', .06, 0, .12); },
    crash: () => { tone(160, .35, 'sawtooth', .1, 50); tone(90, .45, 'square', .06, 40, .02); },
    mile: () => { tone(784, .1, 'triangle', .08); tone(1046, .16, 'triangle', .08, 0, .08); },
    tick: () => tone(660, .1, 'square', .05),
    go: () => { tone(880, .12, 'square', .06); tone(1320, .25, 'triangle', .1, 0, .06); },
    ahead: () => { tone(660, .08, 'triangle', .1); tone(990, .14, 'triangle', .1, 0, .08); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .22, 'triangle', .11, 0, i * .09)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, .26, 'sine', .1, 0, i * .14)),
  };

  /* ---------------- wallets (Wallet Standard: Phantom, Solflare, Backpack, ...) ---------------- */
  const wallets = [];
  (() => {
    const reg = { register: (...ws) => { for (const w of ws) if (w && !wallets.includes(w)) wallets.push(w); renderWalletBtns(); return () => {}; } };
    addEventListener('wallet-standard:register-wallet', e => { try { e.detail(reg); } catch {} });
    try { dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: reg })); } catch {}
  })();
  const solWallets = () => wallets.filter(w => w.features && w.features['standard:connect'] && w.features['solana:signAndSendTransaction'] && (w.chains || []).some(c => String(c).startsWith('solana:')));
  let linked = null; // { w, account }
  async function connectWallet(w) {
    const r = await w.features['standard:connect'].connect();
    const account = (r && r.accounts && r.accounts[0]) || (w.accounts && w.accounts[0]);
    if (!account) throw new Error('no account');
    linked = { w, account }; return account.address;
  }
  async function payWith(w, to, lamports) {
    if (!linked || linked.w !== w) await connectWallet(w);
    const bh = await api('blockhash'); if (!bh.ok) throw new Error(bh.error || 'no blockhash');
    const tx = AC.payTx(linked.account.address, to, lamports, bh.blockhash);
    const chain = (w.chains || []).includes('solana:mainnet') ? 'solana:mainnet' : (w.chains || [])[0];
    const out = await w.features['solana:signAndSendTransaction'].signAndSendTransaction({ account: linked.account, chain, transaction: tx });
    const o = Array.isArray(out) ? out[0] : out; return o && o.signature ? AC.b58enc(o.signature) : null;
  }
  function renderWalletBtns() { const box = $('#pWallets'); if (box && F.view) payButtons(box, F.view); const c = $('#fConnect'); if (c) c.hidden = !solWallets().length; }

  /* ---------------- the lobby ---------------- */
  let LOB = null, aTab = 'open', lastRecent = null, lobbyErr = 0;
  async function loadLobby() {
    const j = await api('lobby');
    const live = $('#aLive'), lt = $('#aLiveTxt');
    if (!j.ok) { lobbyErr++; live.classList.add('off'); lt.textContent = 'reconnecting'; if (!LOB) renderLobby(); return; }
    lobbyErr = 0; LOB = j; live.classList.remove('off'); lt.textContent = j.live ? `live · ${j.live} playing now` : 'live';
    $('#aClosed').hidden = j.config.open;
    countTo($('#aOpen'), j.open.length, v => fmtInt(Math.round(v))); countTo($('#aPlayed'), j.stats.duels, v => fmtInt(Math.round(v)));
    countTo($('#aWon'), j.stats.won, v => fmtSol(v)); countTo($('#aBest'), j.stats.best, v => fmtInt(Math.round(v)));
    countTo($('#hOpen'), j.open.length, v => fmtInt(Math.round(v))); countTo($('#hWon'), j.stats.won, v => fmtSol(v));
    renderLobby();
    const top = j.open.slice().sort((a, b) => b.stake - a.stake || b.score - a.score)[0], last = j.recent.find(r => r.status === 'paid');
    W('setArena', { open: j.open.length, live: j.live, played: j.stats.duels, top: top ? { name: top.name, score: top.score, stake: top.stake } : null,
      last: last ? { a: last.a, b: last.b, winner: last.winner, prize: last.prize } : null, closed: !j.config.open });
    // a duel just finished somewhere: shout it
    const key = j.recent[0] ? j.recent[0].id + j.recent[0].status : '';
    if (lastRecent !== null && key && key !== lastRecent) {
      for (const r of j.recent) { if (r.id + r.status === lastRecent) break; if (r.status !== 'paid') continue;
        const w = r.winner === 'a' ? r.a : r.winner === 'b' ? r.b : null, l = r.winner === 'a' ? r.b : r.a;
        toast(`<img src="${IMG('crown-s')}" alt=""><div><span>${w ? 'DUEL WON' : 'DUEL TIED'}</span><br>${w ? `${esc(w.name)} beat ${esc(l.name)} · +${fmtSol(r.prize)} SOL` : `${esc(r.a.name)} = ${esc(r.b.name)}`}</div>`);
        if (w) W('arenaFx', 'win');
      }
    }
    lastRecent = key;
  }
  function renderLobby() {
    const list = $('#aList'), empty = $('#aEmpty'), et = $('#aEmptyTxt');
    $$('#arena .tabs button').forEach(b => b.classList.toggle('on', b.dataset.a === aTab));
    if (aTab === 'mine') return renderMine();
    if (!LOB) { list.innerHTML = '<li class="duel skel-row"></li><li class="duel skel-row"></li>'; empty.hidden = true; return; }
    if (aTab === 'open') {
      const rows = LOB.open, mineIds = new Set(mine().filter(x => x.side === 'a').map(x => x.d));
      if (!rows.length) { list.innerHTML = ''; empty.hidden = false; et.innerHTML = LOB.config.open ? 'No open duels right now. Make the first one: it shows up here and on the big screen above the arena.' : 'The arena opens for real SOL the moment $DUB launches. Warm up with a practice run.'; return; }
      empty.hidden = true;
      list.innerHTML = rows.map(d => {
        const own = mineIds.has(d.id);
        return `<li class="duel${own ? ' own' : ''}${d.held ? ' held' : ''}" data-id="${esc(d.id)}">
          <div class="who">${avatar(d.name)}<div><b>${esc(d.name)}${own ? ' <em class="you">you</em>' : ''}</b><small>${DEV[d.dev] || ''}${runLine(d)} · ${ago(d.openAt)}</small><small class="mb">To beat <b>${fmtInt(d.score)}</b> · ${fmtSol(d.stake)} SOL · win ${fmtSol(d.prize)}</small></div></div>
          <div class="beat"><span class="k">To beat</span><b>${fmtInt(d.score)}</b></div>
          <div class="stake"><b>${fmtSol(d.stake)}<small> SOL</small></b><small>win ${fmtSol(d.prize)}</small></div>
          ${own ? '<button type="button" class="btn sm navy" data-open>Open</button>' : d.held ? '<button type="button" class="btn sm" disabled><i class="spin"></i>Taken</button>' : '<button type="button" class="btn sm gold" data-take>Beat it</button>'}
        </li>`;
      }).join('');
    } else {
      const rows = LOB.recent;
      if (!rows.length) { list.innerHTML = ''; empty.hidden = false; et.textContent = 'No finished duels yet. The first winner gets their name up here.'; return; }
      empty.hidden = true;
      list.innerHTML = rows.map(r => `<li class="res" data-id="${esc(r.id)}">
        <div class="vs"><span class="${r.winner === 'a' ? 'w' : ''}">${esc(r.a.name)} <b>${fmtInt(r.a.score)}</b></span><i>vs</i><span class="${r.winner === 'b' ? 'w' : ''}">${esc(r.b.name || '—')} <b>${r.b.score == null ? '—' : r.b.score < 0 ? 'forfeit' : fmtInt(r.b.score)}</b></span></div>
        <div class="pr">${r.winner === 'tie' ? 'Tie · both refunded' : `+${fmtSol(r.prize)} SOL`}</div>
        <div class="tx">${r.sig ? `<a href="${txUrl(r.sig)}" target="_blank" rel="noopener">paid ↗</a>` : '<span class="badge gold">sending</span>'}<small>${ago(r.at)}</small></div>
      </li>`).join('');
    }
  }
  let mineCache = new Map();
  async function renderMine() {
    const list = $('#aList'), empty = $('#aEmpty'), l = mine().slice().reverse().slice(0, 10);
    if (!l.length) { list.innerHTML = ''; empty.hidden = false; $('#aEmptyTxt').textContent = 'Duels you make or take on this device show up here.'; return; }
    empty.hidden = true;
    const row = t => { const v = mineCache.get(t.e); const st = v ? label(v) : 'checking…';
      return `<li class="duel mine" data-e="${esc(t.e)}"><div class="who">${avatar(v ? v.me.name : '?')}<div><b>${v ? esc(v.me.name) : 'Duel'} <em class="you">${t.side === 'a' ? 'made' : 'took'}</em></b><small>${fmtSol(t.stake)} SOL · ${ago(new Date(t.at).toISOString())}</small></div></div>
        <div class="st">${st}</div><button type="button" class="btn sm navy" data-resume>Open</button></li>`; };
    list.innerHTML = l.map(row).join('');
    for (const t of l) { if (mineCache.has(t.e) && Date.now() - mineCache.get(t.e)._at < 15000) continue;
      const v = await api('status', null, `&e=${encodeURIComponent(t.e)}&k=${encodeURIComponent(t.k)}`); if (!v.ok) continue; v._at = Date.now(); mineCache.set(t.e, v);
      const li = list.querySelector(`[data-e="${t.e}"]`); if (li && aTab === 'mine') li.outerHTML = row(t); }
  }
  function label(v) {
    const s = stepFor(v), d = v.duel, won = d.winner && d.winner === v.me.side;
    return { pay: '<span class="badge gold">waiting for payment</span>', ready: '<span class="badge gold">paid · ready to play</span>', live: '<span class="badge ok">live in the lobby</span>',
      playing: '<span class="badge gold">run in progress</span>', expired: '<span class="badge">expired</span>', lost: '<span class="badge">refunded</span>', refund: '<span class="badge">refunded</span>',
      result: d.winner === 'tie' ? '<span class="badge">tie · refunded</span>' : won ? `<span class="badge ok">won ${fmtSol(d.prize)} SOL</span>` : '<span class="badge warn">lost</span>' }[s] || '';
  }

  /* ---------------- the sheet ---------------- */
  const SH = $('#sheet'), SB = $('#shBody');
  const F = { e: null, k: null, side: null, view: null, step: null, timer: 0, clock: 0, mode: null, duel: null, stake: null };
  function openSheet() { if (!SH.hidden && SH.classList.contains('in')) return; SH.hidden = false; H.classList.add('sheet-on'); requestAnimationFrame(() => requestAnimationFrame(() => SH.classList.add('in'))); }
  function closeSheet() { SH.classList.remove('in'); H.classList.remove('sheet-on'); clearTimeout(F.timer); clearInterval(F.clock); F.e = null; F.step = null; F.view = null; setTimeout(() => { if (!SH.classList.contains('in')) SH.hidden = true; }, 260); if (aTab === 'mine') renderMine(); }
  function render(html) { SB.innerHTML = html; SB.scrollTop = 0; SB.classList.remove('swap'); void SB.offsetWidth; SB.classList.add('swap'); }
  const outMsg = (id, msg, kind = 'err') => { const o = $(id); if (!o) return; o.className = 'out ' + kind; o.textContent = msg || ''; };
  SH.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !SH.hidden && GM.el.hidden) closeSheet(); });

  function stepFor(v) {
    const me = v.me, d = v.duel;
    if (me.status === 'pending') return 'pay';
    if (me.status === 'expired') return 'expired';
    if (me.status === 'lost') return 'lost';
    if (me.status === 'paid') return d.status === 'refunding' || d.status === 'refunded' ? 'refund' : 'ready';
    if (me.status === 'playing') return 'playing';
    if (d.status === 'settling' || d.status === 'paid') return 'result';
    if (d.status === 'refunding' || d.status === 'refunded') return 'refund';
    return me.side === 'a' ? 'live' : 'result';
  }
  async function refresh() {
    if (!F.e) return;
    const v = await api('status', null, `&e=${encodeURIComponent(F.e)}&k=${encodeURIComponent(F.k)}`);
    if (!F.e) return;
    if (!v.ok) { if (v.code === 'net') { schedule(4000); return; } render(`<div class="sh-head"><h3 class="pop">Hmm.</h3></div><p class="sh-p">${esc(v.error)}</p><button class="btn ghost" data-close>Close</button>`); return; }
    F.view = v; mineCache.set(F.e, { ...v, _at: Date.now() });
    const step = stepFor(v);
    if (step !== F.step) { F.step = step; (STEPS[step] || STEPS.live)(v); } else if (UPD[step]) UPD[step](v);
    const every = { pay: 2500, ready: 15000, live: 4000, playing: 4000, result: v.duel.pay && v.duel.pay.sig ? 0 : 2500, refund: v.duel.pay && v.duel.pay.sig ? 0 : 3000, expired: 0, lost: 0 }[step];
    if (every) schedule(every);
  }
  function schedule(ms) { clearTimeout(F.timer); F.timer = setTimeout(() => { if (document.hidden) schedule(ms); else refresh(); }, ms); }
  function follow(e, k, side) { F.e = e; F.k = k; F.side = side; F.step = null; openSheet(); render('<div class="sh-load"><i class="spin big"></i></div>'); refresh(); }

  // --- make a duel
  function formCreate() {
    F.e = null; F.mode = 'create'; openSheet();
    const m = me0(), stakes = LOB ? LOB.config.stakes : [0.05, 0.1, 0.25, 0.5, 1], closed = LOB && !LOB.config.open;
    let sel = Number(store.get('dub.stake')) || 0.1; if (!stakes.includes(sel)) sel = stakes[1] || stakes[0];
    render(`<div class="sh-head"><span class="sh-kicker">New duel</span><h3 class="pop">Put SOL on your aim</h3></div>
      ${closed ? '<div class="sh-note">Real-SOL duels open the moment $DUB launches. Until then, warm up with a practice run.</div>' : ''}
      <label class="lbl" for="fName">Your name</label><input class="input" id="fName" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Shown in the lobby" value="${esc(m.name || '')}">
      <label class="lbl" for="fWallet">Your wallet <small>winnings and refunds land here</small></label>
      <div class="field"><input class="input" id="fWallet" maxlength="44" autocomplete="off" spellcheck="false" placeholder="Solana wallet address" value="${esc(m.wallet || '')}"><button type="button" class="btn navy sm" id="fConnect"${solWallets().length ? '' : ' hidden'}>Connect</button></div>
      <label class="lbl">Stake</label>
      <div class="stakes" id="fStakes">${stakes.map(s => `<button type="button" data-s="${s}" class="${s === sel ? 'on' : ''}"><b>${fmtSol(s)}</b><small>SOL</small></button>`).join('')}</div>
      <div class="sh-sum" id="fSum"></div>
      <button type="button" class="btn gold wide" id="fGo"${closed ? ' disabled' : ''}>Create duel</button>
      ${closed ? '<button type="button" class="btn ghost wide" id="fPractice">Practice run</button>' : ''}
      <div class="out" id="fOut" aria-live="polite"></div>
      <p class="sh-fine">You play first. Your score goes up in the lobby, and anyone can take you on for the same stake. Nobody takes it? Cancel any time before someone does and your SOL comes back. Unclaimed duels refund themselves after a day.</p>`);
    const sum = () => { const s = Number($('#fStakes .on').dataset.s), fee = LOB ? LOB.config.feePct : 5; $('#fSum').innerHTML = `You put in <b>${fmtSol(s)} SOL</b>. Whoever wins takes <b>${fmtSol(s * 2 * (1 - fee / 100))} SOL</b>.`; };
    $$('#fStakes button').forEach(b => b.onclick = () => { $$('#fStakes button').forEach(x => x.classList.toggle('on', x === b)); store.set('dub.stake', b.dataset.s); sum(); });
    sum(); wireConnect();
    if ($('#fPractice')) $('#fPractice').onclick = () => { closeSheet(); practice(); };
    $('#fGo').onclick = async () => {
      const name = $('#fName').value.trim(), wallet = $('#fWallet').value.trim(), stake = Number($('#fStakes .on').dataset.s);
      if (name.length < 2) return outMsg('#fOut', 'Pick a name, 2 to 16 characters.');
      if (!AC.isAddr(wallet)) return outMsg('#fOut', 'Paste your Solana wallet address, or connect your wallet.');
      store.set('dub.me', JSON.stringify({ name, wallet }));
      const b = $('#fGo'); b.disabled = true; b.textContent = 'Creating…'; outMsg('#fOut', '');
      const r = await api('create', { name, wallet, stake, dev: isMobile() ? 'touch' : 'keys' });
      b.disabled = false; b.textContent = 'Create duel';
      if (!r.ok) return outMsg('#fOut', r.error || 'Could not create the duel.');
      remember(r.entry, r.token, r.duel.id, 'a', stake); follow(r.entry, r.token, 'a');
    };
  }
  function wireConnect() {
    const c = $('#fConnect'); if (!c) return;
    c.onclick = async () => {
      const ws = solWallets(); if (!ws.length) return;
      const w = ws.length === 1 ? ws[0] : await pickWallet(ws); if (!w) return;
      try { const a = await connectWallet(w); $('#fWallet').value = a; outMsg('#fOut', `${w.name} connected.`, 'ok'); }
      catch { outMsg('#fOut', 'The wallet did not connect. You can paste the address instead.'); }
    };
  }
  function pickWallet(ws) {
    return new Promise(res => {
      const box = document.createElement('div'); box.className = 'wpick';
      box.innerHTML = `<div class="k">Pick a wallet</div>${ws.map((w, i) => `<button type="button" data-i="${i}"><img src="${esc(w.icon)}" alt="">${esc(w.name)}</button>`).join('')}<button type="button" class="linkbtn" data-i="-1">Cancel</button>`;
      SB.appendChild(box); box.scrollIntoView({ block: 'nearest' });
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; box.remove(); res(ws[Number(b.dataset.i)] || null); };
    });
  }

  // --- take a duel
  async function formJoin(id) {
    F.e = null; F.mode = 'join'; openSheet(); render('<div class="sh-load"><i class="spin big"></i></div>');
    const t = ticketFor(id); if (t) return follow(t.e, t.k, t.side);
    const j = await api('duel', null, '&id=' + encodeURIComponent(id));
    if (!j.ok) return render(`<div class="sh-head"><h3 class="pop">Duel not found</h3></div><p class="sh-p">${esc(j.error || 'That duel does not exist.')}</p><button class="btn ghost" data-close>Back to the lobby</button>`);
    const d = j.duel;
    if (d.status !== 'open') return publicResult(d);
    const m = me0();
    render(`<div class="sh-head"><span class="sh-kicker">Challenge · ${fmtSol(d.stake)} SOL each</span><h3 class="pop">Beat ${esc(d.a.name)}</h3></div>
      <div class="tobeat big"><div>${avatar(d.a.name)}<span><b>${esc(d.a.name)}</b><small>${DEV[d.a.dev] || ''}${runLine(d.a)}${d.a.secs ? ' · ' + mmss(d.a.secs * 1000) : ''}</small></span></div><div class="sc"><span class="k">Score to beat</span><b>${fmtInt(d.a.score)}</b></div></div>
      <div class="sh-sum">You put in <b>${fmtSol(d.stake)} SOL</b>. Beat <b>${fmtInt(d.a.score)}</b> and you take <b>${fmtSol(d.prize)} SOL</b>, paid the second your run ends.</div>
      ${d.held ? '<div class="sh-note">Someone is paying to take this duel right now. If they don\'t pay, it opens again in a few minutes.</div>' : ''}
      <label class="lbl" for="fName">Your name</label><input class="input" id="fName" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Shown in the lobby" value="${esc(m.name || '')}">
      <label class="lbl" for="fWallet">Your wallet <small>winnings land here</small></label>
      <div class="field"><input class="input" id="fWallet" maxlength="44" autocomplete="off" spellcheck="false" placeholder="Solana wallet address" value="${esc(m.wallet || '')}"><button type="button" class="btn navy sm" id="fConnect"${solWallets().length ? '' : ' hidden'}>Connect</button></div>
      <button type="button" class="btn gold wide" id="fGo"${d.held ? ' disabled' : ''}>Take the duel</button>
      <div class="out" id="fOut" aria-live="polite"></div>
      <p class="sh-fine">You run the exact same world ${esc(d.a.name)} ran. You pay, then you have ${LOB ? LOB.config.times.play : 30} minutes to play. Warm up first with a free practice run if you like.</p>`);
    wireConnect();
    $('#fGo').onclick = async () => {
      const name = $('#fName').value.trim(), wallet = $('#fWallet').value.trim();
      if (name.length < 2) return outMsg('#fOut', 'Pick a name, 2 to 16 characters.');
      if (!AC.isAddr(wallet)) return outMsg('#fOut', 'Paste your Solana wallet address, or connect your wallet.');
      store.set('dub.me', JSON.stringify({ name, wallet }));
      const b = $('#fGo'); b.disabled = true; b.textContent = 'Taking it…';
      const r = await api('join', { duel: d.id, name, wallet, dev: isMobile() ? 'touch' : 'keys' });
      b.disabled = false; b.textContent = 'Take the duel';
      if (!r.ok) return outMsg('#fOut', r.error || 'Could not take the duel.');
      remember(r.entry, r.token, d.id, 'b', d.stake); follow(r.entry, r.token, 'b');
    };
  }
  function publicResult(d) {
    const st = d.status === 'paid' || d.status === 'settling';
    render(`<div class="sh-head"><span class="sh-kicker">Duel ${esc(d.id)}</span><h3 class="pop">${st ? 'This duel is over' : 'This duel is closed'}</h3></div>
      ${st ? versus(d) : `<p class="sh-p">${d.status === 'refunded' || d.status === 'refunding' ? 'It was cancelled and the SOL went back.' : d.status === 'open' ? '' : 'Someone already took it.'}</p>`}
      <div class="row2"><button type="button" class="btn gold" data-make>Make your own duel</button><button type="button" class="btn ghost" data-close>Back to the lobby</button></div>`);
    SB.querySelector('[data-make]').onclick = formCreate;
  }

  // --- the steps of a duel this device is in
  const clockTo = (el, iso, done) => { clearInterval(F.clock); const tick = () => { const left = Date.parse(iso) - Date.now(); if ($(el)) $(el).textContent = mmss(left); if (left <= 0) { clearInterval(F.clock); if (done) done(); } }; tick(); F.clock = setInterval(tick, 1000); };
  function versus(d, side) {
    const sc = s => (s == null ? '—' : s < 0 ? 'forfeit' : fmtInt(s));
    const card = (x, k) => `<div class="vside${d.winner === k ? ' win' : ''}${side === k ? ' me' : ''}">${avatar(x ? x.name : '?')}<span class="nm">${esc(x ? x.name : 'Waiting…')}${side === k ? ' <em class="you">you</em>' : ''}</span><b>${sc(x ? (k === 'a' ? d.a.score : x.score) : null)}</b>
      <small>${x && x.dist != null && !x.note ? runLine(x) : x && x.note ? esc(x.note) : ''}</small>${d.winner === k ? '<i class="crownmark"></i>' : ''}</div>`;
    return `<div class="versus">${card(d.a, 'a')}<div class="vs-mid">VS</div>${card(d.b, 'b')}</div>`;
  }
  const STEPS = {
    pay(v) {
      const me = v.me, d = v.duel, a = me.side === 'a';
      render(`<div class="sh-head"><span class="sh-kicker">${a ? 'Your duel' : 'Challenge'} · step 1 of 2</span><h3 class="pop">Send <span id="pNeed">${fmtSol(me.needLam / 1e9)}</span> SOL</h3></div>
        ${a ? '' : `<div class="tobeat"><span class="k">Score to beat</span><b>${fmtInt(d.a.score)}</b><small>by ${esc(d.a.name)}</small></div>`}
        <div class="payto"><div class="qr" id="pQr" aria-label="QR code to pay from a phone wallet"></div>
          <div class="pinfo"><span class="k">To this duel's own address</span><code id="pDep">${esc(me.dep)}</code>
            <div class="row2"><button type="button" class="btn sm" id="pCopy">Copy address</button><button type="button" class="btn sm ghost" id="pAmt">Copy amount</button></div></div></div>
        <div class="paybtns" id="pWallets"></div>
        <div class="waitln"><i class="spin"></i><span id="pState">Waiting for your SOL…</span><b id="pClock"></b></div>
        <div class="out" id="pOut" aria-live="polite"></div>
        <p class="sh-fine">This address belongs to this duel only, and only the arena can move what's in it: to the winner, or back to you. Sent a bit too much? The extra comes back with the result.${a ? '' : ' The duel is held for you while you pay.'}</p>
        ${a ? '<button type="button" class="linkbtn" id="pCancel">Cancel this duel</button>' : ''}`);
      payButtons($('#pWallets'), v);
      $('#pCopy').onclick = () => copy(me.dep, '#pCopy', 'Copied');
      $('#pAmt').onclick = () => copy(String(+(me.needLam / 1e9).toFixed(9)), '#pAmt', 'Copied');
      if ($('#pCancel')) $('#pCancel').onclick = () => cancelDuel();
      qr($('#pQr'), `solana:${me.dep}?amount=${+(me.needLam / 1e9).toFixed(9)}&label=${encodeURIComponent('DUB arena')}&message=${encodeURIComponent('Duel ' + d.id)}`);
      clockTo('#pClock', me.expiresAt);
      UPD.pay(v);
    },
    ready(v) {
      const me = v.me, d = v.duel, a = me.side === 'a';
      render(`<div class="sh-head"><span class="sh-kicker"><i class="ok">✓</i> Paid · step 2 of 2</span><h3 class="pop">Your run is ready</h3></div>
        ${a ? '' : `<div class="tobeat"><span class="k">Score to beat</span><b>${fmtInt(d.a.score)}</b><small>by ${esc(d.a.name)}</small></div>`}
        <ul class="howplay">
          <li><b>← →</b><span>switch lanes past walls</span></li><li><b>↑</b><span>jump crates and gaps</span></li>
          <li><b>↓</b><span>slide under beams</span></li><li><b>Gems</b><span>gold 5 · emerald 12 · diamond 30</span></li>
          <li><b>Score</b><span>blocks run + gems</span></li><li><b>One life</b><span>it ends when you crash, or at 2:00</span></li></ul>
        <button type="button" class="btn gold wide big" id="rStart">Start my run</button>
        <div class="out" id="rOut" aria-live="polite"></div>
        <p class="sh-fine">Play within <b id="rClock"></b>. Once you start, the run counts and can't be paused, so find a comfy spot first. On a phone, swipe.${a ? ' Want your SOL back instead?' : ''}</p>
        ${a ? '<button type="button" class="linkbtn" id="rCancel">Cancel this duel</button>' : ''}`);
      clockTo('#rClock', me.playBy); loadRun().catch(() => {});
      $('#rStart').onclick = () => runDuel();
      if ($('#rCancel')) $('#rCancel').onclick = () => cancelDuel();
    },
    live(v) {
      const me = v.me, d = v.duel, link = location.origin + '/?duel=' + d.id;
      render(`<div class="sh-head"><span class="sh-kicker"><i class="dot"></i> Live in the lobby</span><h3 class="pop">Your duel is up</h3></div>
        <div class="myscore"><span class="k">Your score</span><b>${fmtInt(d.a.score)}</b><small>${me.note ? esc(me.note) : runLine(me) + (me.secs ? ' · ' + mmss(me.secs * 1000) : '')}</small></div>
        <div class="sh-sum">Anyone who beats it takes <b>${fmtSol(d.prize)} SOL</b>. If they don't, <b>you</b> do, paid the second their run ends.</div>
        <div class="share"><input class="input" readonly value="${esc(link)}" id="lLink"><button type="button" class="btn sm" id="lCopy">Copy link</button>
          <a class="btn sm navy" target="_blank" rel="noopener" href="https://x.com/intent/tweet?text=${encodeURIComponent(`I put ${fmtSol(d.stake)} SOL on ${fmtInt(d.a.score)} in the $DUB arena. Beat it and it's yours.`)}&url=${encodeURIComponent(link)}">Post on X</a></div>
        <div class="waitln" id="lState"></div>
        <button type="button" class="linkbtn" id="lCancel">Cancel and get my SOL back</button>`);
      $('#lCopy').onclick = () => copy(link, '#lCopy', 'Copied');
      $('#lCancel').onclick = () => cancelDuel();
      UPD.live(v);
    },
    playing(v) {
      render(`<div class="sh-head"><span class="sh-kicker">Run in progress</span><h3 class="pop">Your run started</h3></div>
        <p class="sh-p">This run was started and can't be restarted. Whatever it sent counts; if nothing was sent, it scores 0 once its time is up.</p><div class="waitln"><i class="spin"></i><span>Waiting for the score…</span></div>`);
    },
    result(v) {
      const me = v.me, d = v.duel, side = me.side, won = d.winner === side, tie = d.winner === 'tie';
      render(`<div class="verdict ${tie ? 'tie' : won ? 'win' : 'lose'}"><span>${tie ? "IT'S A TIE" : won ? 'YOU WIN' : 'YOU LOST'}</span></div>
        ${versus(d, side)}
        <div class="payout ${won ? 'win' : ''}">${tie ? `<b>Both refunded</b>` : won ? `<b>+${fmtSol(d.prize)} SOL</b>` : `<b>${esc(side === 'a' ? d.b.name : d.a.name)} takes ${fmtSol(d.prize)} SOL</b>`}<span id="payState"></span></div>
        <div class="row2"><button type="button" class="btn gold" id="xMake">${won ? 'Run it back' : 'Make a duel'}</button><button type="button" class="btn ghost" data-close>Back to the lobby</button></div>`);
      $('#xMake').onclick = formCreate;
      UPD.result(v);
      if (Date.now() - lastCele > 15000) { if (won) { celebrate(); SFX.win(); W('arenaFx', 'win'); } else if (!tie) SFX.lose(); }
    },
    refund(v) {
      render(`<div class="sh-head"><span class="sh-kicker">Refund</span><h3 class="pop">Your SOL is going back</h3></div>
        <p class="sh-p">${esc(v.duel.note === 'nobody took it' ? 'Nobody took your duel in time, so it refunded itself.' : v.duel.note === 'creator never played' ? "The run wasn't played in time, so the duel refunded itself." : 'The duel is cancelled.')}</p>
        <div class="waitln" id="payState"></div><div class="row2"><button type="button" class="btn gold" id="xMake">Make a new duel</button><button type="button" class="btn ghost" data-close>Close</button></div>`);
      $('#xMake').onclick = formCreate; UPD.refund(v);
    },
    expired(v) {
      render(`<div class="sh-head"><span class="sh-kicker">Closed</span><h3 class="pop">${v.duel.note === 'cancelled' ? 'Duel cancelled' : 'Time ran out'}</h3></div>
        <p class="sh-p">${v.me.gotLam > 0 ? 'The payment came in too late or short, so it is being sent back to your wallet automatically.' : 'No payment came in, so nothing moved. Make a new one whenever you like.'}</p>
        <div class="row2"><button type="button" class="btn gold" id="xMake">Make a duel</button><button type="button" class="btn ghost" data-close>Close</button></div>`);
      $('#xMake').onclick = formCreate;
    },
    lost(v) {
      render(`<div class="sh-head"><span class="sh-kicker">Too slow this time</span><h3 class="pop">Someone got there first</h3></div>
        <p class="sh-p">Another challenger's payment landed first, so they got this duel. Your ${fmtSol(v.me.got)} SOL is on its way back to ${esc(v.me.short)} automatically.</p>
        <div class="row2"><button type="button" class="btn gold" data-close>Find another duel</button></div>`);
    },
  };
  const UPD = {
    pay(v) {
      const me = v.me; $('#pNeed').textContent = fmtSol(me.needLam / 1e9);
      $('#pState').innerHTML = me.gotLam > 0 ? `Got ${fmtSol(me.got)} SOL so far. Send <b>${fmtSol(me.needLam / 1e9)}</b> more.` : 'Waiting for your SOL…';
    },
    live(v) {
      const d = v.duel, el = $('#lState'); if (!el) return;
      el.className = 'waitln' + (d.status !== 'open' ? ' hot' : '');
      el.innerHTML = d.status === 'open' ? (d.held ? '<i class="spin"></i><span>A challenger is paying to take you on…</span>' : '<i class="spin"></i><span>Waiting for a challenger. Share the link to find one faster.</span>')
        : d.status === 'joined' ? `<i class="pulse"></i><span><b>${esc(d.b ? d.b.name : 'A challenger')}</b> paid in and is about to play.</span>` : `<i class="pulse"></i><span><b>${esc(d.b ? d.b.name : 'A challenger')}</b> is playing against your score right now!</span>`;
      const c = $('#lCancel'); if (c) c.hidden = d.status !== 'open' || d.held;
    },
    result(v) {
      const p = v.duel.pay, el = $('#payState'); if (!el) return;
      el.innerHTML = p && p.sig ? `<i class="ok">✓</i> Paid <a href="${txUrl(p.sig)}" target="_blank" rel="noopener">view on Solscan ↗</a>` : '<i class="spin"></i> Sending the payout…';
    },
    refund(v) { const p = v.duel.pay, el = $('#payState'); if (el) el.innerHTML = p && p.sig ? `<i class="ok">✓</i> Refunded <a href="${txUrl(p.sig)}" target="_blank" rel="noopener">view on Solscan ↗</a>` : '<i class="spin"></i><span>Sending it back…</span>'; },
  };
  function payButtons(box, v) {
    if (!box || !v || v.me.status !== 'pending') return;
    const ws = solWallets(), lam = v.me.needLam;
    if (ws.length) box.innerHTML = ws.slice(0, 3).map((w, i) => `<button type="button" class="btn gold" data-w="${i}"><img src="${esc(w.icon)}" alt="">Pay with ${esc(w.name)}</button>`).join('');
    else box.innerHTML = isMobile()
      ? `<a class="btn gold" href="https://phantom.app/ul/browse/${encodeURIComponent(location.origin + '/?duel=' + v.duel.id)}?ref=${encodeURIComponent(location.origin)}">Open in Phantom</a><a class="btn ghost" href="solana:${v.me.dep}?amount=${+(lam / 1e9).toFixed(9)}&label=DUB%20arena">Pay in a wallet app</a>`
      : '<span class="paynote">No browser wallet found. Scan the code with your phone wallet, or send from any wallet or exchange to the address above.</span>';
    $$('[data-w]', box).forEach(b => b.onclick = async () => {
      const w = ws[Number(b.dataset.w)]; b.disabled = true; const label = b.innerHTML; b.innerHTML = '<i class="spin"></i>Confirm in your wallet…';
      try { const sig = await payWith(w, v.me.dep, F.view ? F.view.me.needLam : lam); outMsg('#pOut', sig ? 'Sent. Waiting for the network to confirm…' : 'Sent.', 'ok'); schedule(1500); }
      catch (e) { outMsg('#pOut', /reject|denied|cancel/i.test(String(e && e.message)) ? 'You cancelled it in the wallet.' : 'The wallet could not send it. Try again, or send to the address by hand.'); }
      b.disabled = false; b.innerHTML = label;
    });
  }
  async function cancelDuel() {
    const r = await api('cancel', { e: F.e, k: F.k });
    if (!r.ok) { toast(`<img src="${IMG('star-white')}" alt=""><div><span>CAN'T CANCEL</span><br>${esc(r.error)}</div>`); return; }
    F.step = null; refresh(); loadLobby();
  }
  async function copy(text, btn, done) { try { await navigator.clipboard.writeText(text); } catch { const i = document.createElement('textarea'); i.value = text; document.body.appendChild(i); i.select(); try { document.execCommand('copy'); } catch {} i.remove(); } const b = $(btn); if (b) { const l = b.textContent; b.textContent = done; setTimeout(() => (b.textContent = l), 1400); } }
  let qrLoad = null;
  function qr(el, text) {
    if (!el) return;
    if (!window.qrcode) { if (!qrLoad) qrLoad = new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/assets/js/vendor/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); qrLoad.then(() => qr(el, text)).catch(() => (el.hidden = true)); return; }
    try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { el.hidden = true; }
  }
  let lastCele = 0;
  function celebrate() {
    if (RM) return; const box = document.createElement('div'); box.className = 'confetti';
    const cols = ['#ffc72a', '#ffe07a', '#5ef2b4', '#6fa8ff', '#ff4f7e', '#8f5cff', '#fff'];
    box.innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * .5}s;animation-duration:${1.6 + Math.random() * 1.4}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
    document.body.appendChild(box); setTimeout(() => box.remove(), 3600);
  }

  /* ---------------- playing a duel run ---------------- */
  async function runDuel() {
    audio();
    const b = $('#rStart'); if (b) { b.disabled = true; b.textContent = 'Loading the world…'; }
    try { await loadRun(); } catch { if (b) { b.disabled = false; b.textContent = 'Start my run'; } outMsg('#rOut', 'The 3D world could not load. Check your connection and try again.'); return; }
    if (b) b.textContent = 'Starting…';
    const s = await api('start', { e: F.e, k: F.k });
    if (!s.ok) { if (b) { b.disabled = false; b.textContent = 'Start my run'; } outMsg('#rOut', s.error || 'Could not start.'); if (s.code === 'started') { F.step = null; refresh(); } return; }
    const e = F.e, k = F.k, side = F.side;
    clearTimeout(F.timer); SH.classList.remove('in'); SH.hidden = true; H.classList.remove('sheet-on');
    play({ seed: s.seed, mode: 'duel', target: s.target, side, onEnd: async (res, inputs, dev) => {
      endCard({ kind: 'sending', res });
      let r = null;
      for (let i = 0; i < 6; i++) { r = await api('submit', { e, k, inputs, dev }); if (r.ok || (r.code !== 'net' && r.code !== 'server')) break; await sleep(1200 * (i + 1)); }
      if (!r || !r.ok) { endCard({ kind: 'error', res, msg: (r && r.error) || 'Could not send the run.' }); return; }
      mineCache.set(e, { ...r, _at: Date.now() });
      endCard({ kind: side === 'a' ? 'posted' : 'verdict', res, view: r, after: () => { F.e = e; F.k = k; F.side = side; F.step = null; openSheet(); refresh(); } });
      loadLobby();
    } });
  }
  function practice() { audio(); const b = new Uint8Array(16); crypto.getRandomValues(b); if (GM.run) { GM.run.dispose(); GM.run = null; } play({ seed: [...b].map(x => x.toString(16).padStart(2, '0')).join(''), mode: 'practice' }); }

  /* ---------------- the run: a 3D blocky world (run.js), the HUD and the end card ---------------- */
  const GM = { el: $('#game'), cv: $('#gRun'), run: null, mode: 'practice', target: null, side: null, onEnd: null, ahead: false, ended: false, shown: 0, count: 0, res: null };
  let runMod = null;
  const loadRun = () => runMod || (runMod = import('/assets/js/run.js?v=1').then(() => window.DUBRUN).catch(e => { runMod = null; throw e; }));
  const CAUSE = { wall: 'Ran into a wall', block: 'Tripped on a block', beam: 'Hit a beam', fell: 'Fell into a gap', quit: 'Left the run' };
  const SHOUT = { wall: 'BONK!', block: 'TRIPPED!', beam: 'OOF!', fell: 'SPLASH!', quit: 'RUN ENDED' };
  const GEMN = ['', 'gold', 'emerald', 'diamond'], GEMC = ['', '#ffc72a', '#2edc78', '#6ee6ff'];
  function big(txt, cls = '') { const b = $('#gBig'); b.textContent = txt; b.className = 'g-big pop ' + cls; void b.offsetWidth; b.classList.add('show'); }
  function pop(txt, color) { const box = $('#gPops'), el = document.createElement('div'); el.className = 'g-pop'; el.style.color = color; el.textContent = txt; box.appendChild(el); setTimeout(() => el.remove(), 1100); }
  function banner(txt) { const b = $('#gBanner'); b.textContent = txt; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  async function play({ seed, mode, target = null, side = null, onEnd = null }) {
    let R;
    try { R = await loadRun(); } catch { toast(`<img src="${IMG('star-white')}" alt=""><div><span>HOLD UP</span><br>The 3D world could not load. Check your connection.</div>`); return false; }
    if (GM.run) { GM.run.dispose(); GM.run = null; }
    Object.assign(GM, { mode, target, side, onEnd, ahead: false, ended: false, shown: 0, count: 0, res: null });
    GM.el.hidden = false; H.classList.add('game-on'); W('pause', true); if (window.DUBM) window.DUBM.duck(true);
    $('#gRace').hidden = target == null; $('#gEnd').hidden = true; $('#gEnd').innerHTML = ''; $('#gConfirm').hidden = true; $('#gExit').hidden = false; $('#gPops').innerHTML = '';
    $('#gMode').textContent = mode === 'practice' ? 'Practice run' : side === 'b' ? 'Duel · beat the score' : 'Duel · set the score';
    $('#gTarget').textContent = target != null ? fmtInt(target) : '';
    $('#gHelp').innerHTML = isMobile() ? 'Swipe <b>←</b> <b>→</b> to switch lanes · <b>↑</b> jump · <b>↓</b> slide' : '<kbd>←</kbd><kbd>→</kbd> switch lanes · <kbd>↑</kbd> jump · <kbd>↓</kbd> slide';
    $('#gHelp').classList.add('show'); $('#gBig').className = 'g-big pop';
    requestAnimationFrame(() => GM.el.classList.add('in'));
    GM.run = R.create({ canvas: GM.cv, seed, onHud: hud, onEvent: runEvent, onEnd: (res, inputs, dev) => finish(res, inputs, dev) });
    GM.run.start();
    return true;
  }
  let hudLast = '';
  function hud(h) {
    if (!h.started) { const n = Math.ceil(h.countdown / 1000); if (n !== GM.count && n > 0) { GM.count = n; big(n); SFX.tick(); } }
    GM.shown += (h.score - GM.shown) * .3; if (Math.abs(h.score - GM.shown) < 1) GM.shown = h.score;
    const key = Math.round(GM.shown) + '|' + h.dist + '|' + h.gems + '|' + Math.floor(h.secs) + '|' + h.speed.toFixed(1);
    if (key === hudLast) return; hudLast = key;
    $('#gScore').textContent = fmtInt(Math.round(GM.shown));
    $('#gSub').textContent = `${fmtInt(h.dist)} blocks · ${h.gems} ${h.gems === 1 ? 'gem' : 'gems'}`;
    $('#gTime').textContent = mmss(h.secs * 1000);
    $('#gRing').style.strokeDashoffset = (h.secs / (AC.MAX_TICKS / AC.TPS)) * 125.7;
    $('#gSpeed').textContent = h.speed.toFixed(1);
    if (GM.target != null) {
      const sc = h.score, p = GM.target > 0 ? Math.min(1, sc / GM.target) : 1, ahead = sc > GM.target;
      $('#gRaceFill').style.width = (p * 100) + '%'; $('#gRace').classList.toggle('ahead', ahead);
      $('#gRaceTxt').textContent = ahead ? `AHEAD by ${fmtInt(sc - GM.target)}` : `${fmtInt(GM.target - sc + 1)} to go`;
      if (ahead && !GM.ahead) { GM.ahead = true; SFX.ahead(); banner('AHEAD!'); }
    }
  }
  function runEvent(ev) {
    if (ev.k === 'go') { big('GO!', 'go'); SFX.go(); setTimeout(() => $('#gHelp').classList.remove('show'), 4000); }
    else if (ev.k === 'jump') SFX.jump();
    else if (ev.k === 'slide') SFX.slide();
    else if (ev.k === 'lane') SFX.lane();
    else if (ev.k === 'land') SFX.land();
    else if (ev.k === 'gem') { SFX.gem(ev.type); pop(`+${AC.GEM_PTS[ev.type]} ${GEMN[ev.type]}`, GEMC[ev.type]); }
    else if (ev.k === 'crash') { SFX.crash(); big(SHOUT[ev.cause] || 'WIPEOUT!', 'bad'); }
    else if (ev.k === 'quit') big('RUN ENDED', 'bad');
    else if (ev.k === 'done') { big('2:00!', 'go'); SFX.win(); }
    else if (ev.k === 'mile') { banner(`${fmtInt(ev.n)} BLOCKS`); SFX.mile(); }
    else if (ev.k === 'biome') banner(ev.name.toUpperCase());
  }
  function finish(res, inputs, dev) {
    if (GM.ended) return; GM.ended = true; GM.res = res;
    if (GM.mode === 'practice') endCard({ kind: 'practice', res });
    else if (GM.onEnd) GM.onEnd(res, inputs, dev);
  }
  function stat(res) {
    return `<div class="g-stats"><div><b>${fmtInt(res.dist)}</b><span>blocks</span></div><div><b>${res.gems}</b><span>gems</span></div><div><b>${mmss(res.secs * 1000)}</b><span>time</span></div><div><b>${res.counts ? res.counts[2] : 0}</b><span>diamonds</span></div></div>
      <div class="g-cause">${esc(CAUSE[res.cause] || (res.crashed ? 'Wiped out' : 'Ran the full 2:00'))}</div>`;
  }
  function endCard({ kind, res, view, msg, after }) {
    const box = $('#gEnd'); box.hidden = false;
    let html = '';
    if (kind === 'practice') {
      const best = Math.max(res.score, Number(store.get('dub.best') || 0)), isNew = res.score > 0 && res.score >= best; store.set('dub.best', best);
      html = `<span class="g-kick">Practice run</span><b class="g-final" id="gFinal">0</b>${stat(res)}<div class="g-best">${isNew ? '<em>New best!</em>' : `Your best: <b>${fmtInt(best)}</b>`}</div>
        <div class="row2"><button type="button" class="btn gold" id="eAgain">Run again</button><button type="button" class="btn navy" id="eMake">Put SOL on it</button><button type="button" class="btn ghost" id="eClose">Close</button></div>`;
    } else if (kind === 'sending') html = `<span class="g-kick">Run over</span><b class="g-final" id="gFinal">0</b>${stat(res)}<div class="g-wait"><i class="spin"></i>Sending your run to the arena…</div>`;
    else if (kind === 'error') html = `<span class="g-kick">Run over</span><b class="g-final">${fmtInt(res.score)}</b><div class="out err">${esc(msg)}</div><div class="row2"><button type="button" class="btn gold" id="eClose">Close</button></div>`;
    else if (kind === 'posted') {
      const d = view.duel;
      html = `<span class="g-kick">Your duel is live</span><b class="g-final" id="gFinal">0</b>${stat(res)}<div class="g-wait">Anyone who beats <b>${fmtInt(d.a.score)}</b> takes ${fmtSol(d.prize)} SOL. If they can't, you do.</div>
        <div class="row2"><button type="button" class="btn gold" id="eNext">Share my duel</button></div>`;
    } else if (kind === 'verdict') {
      const d = view.duel, side = GM.side, won = d.winner === side, tie = d.winner === 'tie';
      html = `<span class="g-kick ${tie ? '' : won ? 'w' : 'l'}">${tie ? "It's a tie" : won ? 'You win' : 'So close'}</span><b class="g-final" id="gFinal">0</b>
        <div class="g-vs">vs ${esc(d.a.name)}'s <b>${fmtInt(d.a.score)}</b></div>${stat(res)}
        <div class="g-wait">${tie ? 'Both stakes go back.' : won ? `<b>+${fmtSol(d.prize)} SOL</b> is on its way to your wallet.` : `${esc(d.a.name)} takes the pot this time.`}</div>
        <div class="row2"><button type="button" class="btn gold" id="eNext">${won ? 'See the payout' : 'Continue'}</button></div>`;
      lastCele = Date.now(); if (won) { celebrate(); SFX.win(); W('arenaFx', 'win'); } else if (!tie) SFX.lose();
    }
    box.innerHTML = html; box.classList.remove('in'); void box.offsetWidth; box.classList.add('in'); $('#gExit').hidden = kind === 'sending';
    const fin = $('#gFinal'); if (fin) { fin.dataset.v = 0; countTo(fin, res.score, v => fmtInt(Math.round(v)), 900); }
    if ($('#eAgain')) $('#eAgain').onclick = () => practice();
    if ($('#eMake')) $('#eMake').onclick = () => { closeGame(); formCreate(); };
    if ($('#eClose')) $('#eClose').onclick = () => closeGame();
    if ($('#eNext')) $('#eNext').onclick = () => { closeGame(); if (after) after(); };
  }
  function closeGame() {
    if (GM.run) { GM.run.dispose(); GM.run = null; }
    GM.el.classList.remove('in'); H.classList.remove('game-on');
    setTimeout(() => { GM.el.hidden = true; }, 200); W('pause', false); if (window.DUBM) window.DUBM.duck(false);
  }
  function askExit() {
    if (!$('#gEnd').hidden) { const n = $('#eNext') || $('#eClose'); if (n) n.click(); return; }
    if (GM.mode === 'practice') return closeGame();
    if (GM.ended || (GM.run && GM.run.over)) return;
    $('#gConfirm').hidden = false;
  }
  $('#gExit').onclick = askExit;
  $('#gKeep').onclick = () => { $('#gConfirm').hidden = true; };
  $('#gStop').onclick = () => { $('#gConfirm').hidden = true; if (GM.run) GM.run.quit(); };
  $('#gSfx').onclick = () => { store.set('dub.sfx', sfxOn() ? '0' : '1'); $('#gSfx').classList.toggle('off', !sfxOn()); };
  $('#gSfx').classList.toggle('off', !sfxOn());
  addEventListener('keydown', e => { if (!GM.el.hidden && e.key === 'Escape') { e.preventDefault(); askExit(); } }, true);
  // a duel run can't be paused: leaving the tab ends it right there and sends what it has
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !GM.run || GM.mode !== 'duel' || GM.ended) return;
    if (!GM.run.over) GM.run.quit();
    finish(GM.run.result(), GM.run.inputs(), isMobile() ? 'touch' : 'keys');
  });

  /* ---------------- wire up ---------------- */
  function init() {
    $('#aMake').onclick = formCreate; $('#aPractice').onclick = practice;
    $$('[data-practice]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); practice(); }));
    $$('#arena .tabs button').forEach(b => b.onclick = () => { aTab = b.dataset.a; renderLobby(); });
    $('#aList').addEventListener('click', e => {
      const li = e.target.closest('li'); if (!li) return;
      if (e.target.closest('[data-take]')) formJoin(li.dataset.id);
      else if (e.target.closest('[data-open]')) { const t = ticketFor(li.dataset.id); if (t) follow(t.e, t.k, t.side); }
      else if (e.target.closest('[data-resume]')) { const t = mine().find(x => x.e === li.dataset.e); if (t) follow(t.e, t.k, t.side); }
      else if (li.classList.contains('res') && !e.target.closest('a')) formJoin(li.dataset.id);
    });
    loadLobby(); setInterval(() => { if (!document.hidden) loadLobby(); }, 6000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadLobby(); });
    // a shared duel link: ?duel=<id>
    const q = new URLSearchParams(location.search).get('duel');
    if (q && /^[0-9a-f]{6,24}$/.test(q)) { setTimeout(() => { const a = $('#arena'); if (a) a.scrollIntoView({ behavior: 'auto' }); formJoin(q); }, 350); }
    // anything still in progress on this device? say so once
    const live = mine().filter(x => Date.now() - x.at < 864e5).pop();
    if (live && !q) api('status', null, `&e=${encodeURIComponent(live.e)}&k=${encodeURIComponent(live.k)}`).then(v => {
      if (!v.ok) return; const s = stepFor(v);
      if (s === 'pay' || s === 'ready') { const b = $('#aResume'); b.hidden = false; b.innerHTML = `<i class="pulse"></i>${s === 'pay' ? 'Your duel is waiting for payment' : 'Your run is paid and ready'} · <b>Open</b>`; b.onclick = () => { b.hidden = true; follow(live.e, live.k, live.side); }; }
    });
  }
  window.DUBA_UI = { practice, formCreate, formJoin };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
