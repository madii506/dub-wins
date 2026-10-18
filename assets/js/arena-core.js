// DUB arena core: the block run itself, shared by the page (to play it) and the server (to replay and score it),
// plus a tiny Solana transaction builder. Integers only, so every JS engine computes the same run from the same
// seed and the same moves.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DUBA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- the run: a blocky world, three lanes, one life ----------
  // Positions are in milli-blocks, time is in ticks (60 a second). The world is built row by row from the duel's
  // seed, so both players run the exact same course, and the server replays the moves to get the real score.
  const TPS = 60, MAX_TICKS = 120 * TPS, COUNTDOWN = 3000, MAX_INPUTS = 1500;
  const V0 = 150, VMAX = 320, ACC_EVERY = 45;   // 9 blocks/s, speeding up to 19.2
  const JUMP = 38, HPEAK = 1500, CLEAR = 600, SLIDE = 36;
  const E = 0, BLOCK = 1, WALL = 2, BEAM = 3, GAP = 4;
  const GEM_PTS = [0, 5, 12, 30];               // gold, emerald, diamond
  const speedAt = tick => Math.min(VMAX, V0 + Math.floor(tick / ACC_EVERY));
  const heightAt = k => (k <= 0 || k >= JUMP ? 0 : Math.floor(4 * HPEAK * k * (JUMP - k) / (JUMP * JUMP)));

  function rng(seedHex) {
    const w = i => parseInt(String(seedHex).slice(i * 8, i * 8 + 8), 16) >>> 0;
    let a = w(0), b = w(1), c = w(2), d = w(3);
    const next = () => {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
      return t >>> 0;
    };
    for (let i = 0; i < 15; i++) next();
    return next;
  }

  function Track(seedHex) {
    const R = rng(seedHex), int = n => R() % n;
    const cells = [], gems = [];
    let next = 0;
    const fill = r => { while (cells.length <= r) { cells.push([E, E, E]); gems.push([0, 0, 0]); } };
    const vEst = r => Math.floor(Math.sqrt(22500 + Math.floor(r * 400 / 9)));
    function gem(r, l, high) { fill(r); if (gems[r][l] || cells[r][l] === WALL) return; const x = int(100); gems[r][l] = (x < 6 ? 3 : x < 26 ? 2 : 1) * 2 + (high ? 1 : 0); }
    function pattern(d) {
      for (;;) {
        const row = [0, 1, 2].map(() => { const x = int(1000); return x < 380 - Math.floor(d / 5) ? E : x < 600 ? WALL : x < 760 ? BLOCK : x < 900 ? BEAM : GAP; });
        if (row.every(c => c === WALL) || row.every(c => c === E) || (d < 300 && !row.includes(E))) continue;
        return row;
      }
    }
    function segment() {
      const r0 = next;
      if (r0 < 28) { for (let r = 0; r < 28; r++) { fill(r); if (r >= 10 && r % 2 === 0) gem(r, 1, false); } next = 28; return; }
      const d = Math.min(1000, Math.floor(r0 * 1000 / 1600));
      const v = vEst(r0), react = Math.ceil(v * 30 / 1000), jumpLen = Math.ceil(v * (JUMP + 8) / 1000);
      const slack = Math.floor((1000 - d) * 7 / 1000), pick = int(1000);
      let len;
      if (pick < 420) {
        const row = pattern(d); fill(r0); cells[r0] = row;
        for (let l = 0; l < 3; l++) if ((row[l] === BLOCK || row[l] === GAP) && int(3) === 0) gem(r0, l, true);
        len = 1 + Math.max(jumpLen, react) + slack;
        const free = [0, 1, 2].filter(l => row[l] === E);
        if (free.length && int(2) === 0) { const l = free[int(free.length)]; for (let k = 2; k < len - 1; k += 2) gem(r0 + k, l, false); }
      } else if (pick < 600) {
        const open = int(3), L = 4 + int(4 + Math.floor(d / 200));
        for (let k = 0; k < L; k++) { fill(r0 + k); for (let l = 0; l < 3; l++) if (l !== open) cells[r0 + k][l] = WALL; if (k % 2 === 1) gem(r0 + k, open, false); }
        if (d > 350 && L >= 6 && int(2) === 0) { const k = 2 + int(L - 4); cells[r0 + k][open] = int(2) ? BLOCK : BEAM; gems[r0 + k][open] = 0; }
        len = L + react + slack;
      } else if (pick < 700) {
        const G = 1 + (d > 500 ? int(2) : 0);
        for (let k = 0; k < G; k++) { fill(r0 + k); cells[r0 + k] = [GAP, GAP, GAP]; }
        gem(r0, int(3), true);
        len = G + jumpLen + slack;
      } else if (pick < 790) {
        fill(r0); cells[r0] = [BEAM, BEAM, BEAM];
        len = 1 + Math.ceil(v * (SLIDE + 6) / 1000) + slack;
      } else if (pick < 900) {
        const a = int(3), b = (a + 1 + int(2)) % 3;
        fill(r0); for (let l = 0; l < 3; l++) if (l !== a) cells[r0][l] = WALL;
        const r1 = r0 + react + 2 + Math.floor(slack / 2);
        fill(r1); for (let l = 0; l < 3; l++) if (l !== b) cells[r1][l] = WALL;
        gem(r0, a, false); gem(r1, b, false);
        len = r1 - r0 + 1 + react + slack;
      } else {
        let l = int(3); const L = 8 + int(8);
        for (let k = 0; k < L; k += 2) { gem(r0 + k, l, false); if (int(4) === 0) l = Math.max(0, Math.min(2, l + (int(2) ? 1 : -1))); }
        len = L;
      }
      next = r0 + Math.max(1, len); fill(next);
    }
    const ensure = r => { while (next <= r) segment(); };
    return {
      cell(lane, r) { if (r < 0) return E; ensure(r); return cells[r][lane + 1]; },
      gem(lane, r) { if (r < 0) return 0; ensure(r); return gems[r][lane + 1]; },
      take(lane, r) { gems[r][lane + 1] = 0; },
      ensure, cells, gems,
    };
  }

  function Run(seedHex) {
    if (!/^[0-9a-f]{32}$/.test(String(seedHex))) throw new Error('bad seed');
    const T = Track(seedHex);
    const s = { tick: 0, z: 0, prevZ: 0, lane: 0, jumpK: 0, slideK: 0, over: false, crashed: false, cause: null, gems: 0, gemPts: 0, counts: [0, 0, 0, 0], fx: [] };
    function input(code) {
      if (s.over) return;
      if (code === 0) { if (s.lane > -1) { s.lane--; s.fx.push({ k: 'lane', t: s.tick }); } }
      else if (code === 1) { if (s.lane < 1) { s.lane++; s.fx.push({ k: 'lane', t: s.tick }); } }
      else if (code === 2) { if (s.jumpK === 0) { s.jumpK = 1; s.slideK = 0; s.fx.push({ k: 'jump', t: s.tick }); } }
      else if (code === 3) { s.jumpK = 0; s.slideK = SLIDE; s.fx.push({ k: 'slide', t: s.tick }); }
      else if (code === 4) { s.over = true; s.cause = 'quit'; s.fx.push({ k: 'quit', t: s.tick }); }   // left the run early
    }
    function crash(cause, r) { s.over = true; s.crashed = true; s.cause = cause; s.tick++; s.fx.push({ k: 'crash', t: s.tick, cause, r, lane: s.lane }); }
    function step() {
      if (s.over) return;
      s.prevZ = s.z; s.z += speedAt(s.tick);
      if (s.jumpK > 0) { s.jumpK++; if (s.jumpK >= JUMP) { s.jumpK = 0; s.fx.push({ k: 'land', t: s.tick }); } }
      if (s.slideK > 0) s.slideK--;
      const h = heightAt(s.jumpK), up = h >= CLEAR;
      const rm = Math.floor(s.z / 1000), rf = Math.floor((s.z + 350) / 1000);
      for (const r of rf === rm ? [rm] : [rm, rf]) {
        const c = T.cell(s.lane, r);
        if (c === WALL) return crash('wall', r);
        if (c === BLOCK && !up) return crash('block', r);
        if (c === BEAM && s.slideK === 0) return crash('beam', r);
      }
      if (T.cell(s.lane, rm) === GAP && !up) return crash('fell', rm);
      const g = T.gem(s.lane, rm);
      if (g) { const high = g & 1, type = g >> 1; if (high ? up : h < 900) { T.take(s.lane, rm); s.gems++; s.counts[type]++; s.gemPts += GEM_PTS[type]; s.fx.push({ k: 'gem', t: s.tick, type, lane: s.lane, r: rm, high }); } }
      s.tick++;
      if (s.tick >= MAX_TICKS) { s.over = true; s.fx.push({ k: 'done', t: s.tick }); }
    }
    const result = () => ({ score: Math.floor(s.z / 1000) + s.gemPts, dist: Math.floor(s.z / 1000), gems: s.gems, gemPts: s.gemPts, counts: s.counts.slice(1),
      ticks: s.tick, secs: Math.round(s.tick * 100 / TPS) / 100, crashed: s.crashed, cause: s.cause });
    return { s, T, input, step, result };
  }

  // the server's check: replay the moves [[tick, 0 left | 1 right | 2 jump | 3 slide | 4 quit], ...] and return the real run
  function replay(seedHex, inputs) {
    if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) return { ok: false, why: 'shape' };
    let last = 0;
    for (const v of inputs) {
      if (!Array.isArray(v) || v.length !== 2 || !Number.isInteger(v[0]) || !Number.isInteger(v[1])) return { ok: false, why: 'shape' };
      if (v[0] < last || v[0] < 0 || v[0] >= MAX_TICKS || v[1] < 0 || v[1] > 4) return { ok: false, why: 'range' };
      last = v[0];
    }
    const g = Run(seedHex); let i = 0;
    while (!g.s.over) {
      while (i < inputs.length && inputs[i][0] === g.s.tick) g.input(inputs[i++][1]);
      g.step();
    }
    return { ok: true, ...g.result() };
  }

  // ---------- Solana: base58 + a legacy transaction with plain SOL transfers ----------
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58enc(bytes) {
    const d = []; let s = '';
    for (const byte of bytes) { let c = byte; for (let j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } }
    for (const byte of bytes) { if (byte === 0) s += '1'; else break; }
    for (let i = d.length - 1; i >= 0; i--) s += B58[d[i]];
    return s;
  }
  function b58dec(str) {
    const b = [];
    for (const ch of String(str)) {
      let c = B58.indexOf(ch); if (c < 0) throw new Error('bad base58');
      for (let j = 0; j < b.length; j++) { c += b[j] * 58; b[j] = c & 255; c >>= 8; }
      while (c) { b.push(c & 255); c >>= 8; }
    }
    for (const ch of String(str)) { if (ch === '1') b.push(0); else break; }
    return Uint8Array.from(b.reverse());
  }
  const key32 = s => { const k = b58dec(s); if (k.length !== 32) throw new Error('bad key ' + s); return k; };
  const isAddr = s => { try { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) && b58dec(s).length === 32; } catch { return false; } };
  const shortvec = n => { const o = []; for (;;) { const b = n & 127; n >>= 7; if (!n) { o.push(b); return o; } o.push(b | 128); } };
  const u64 = n => { const o = []; let lo = n % 4294967296, hi = Math.floor(n / 4294967296); for (let i = 0; i < 4; i++) { o.push(lo & 255); lo = Math.floor(lo / 256); } for (let i = 0; i < 4; i++) { o.push(hi & 255); hi = Math.floor(hi / 256); } return o; };
  const SYSTEM = '11111111111111111111111111111111';
  function transfer(from, to, lamports) {
    if (!Number.isSafeInteger(lamports) || lamports <= 0) throw new Error('bad amount');
    return { program: SYSTEM, keys: [[from, true, true], [to, false, true]], data: [2, 0, 0, 0, ...u64(lamports)] };
  }
  // payer first, then writable signers, read-only signers, writable accounts, read-only accounts
  function message(payer, ixs, blockhash) {
    const metas = new Map(), order = [];
    const add = (k, s, w) => { const m = metas.get(k); if (m) { m.s = m.s || s; m.w = m.w || w; } else { metas.set(k, { k, s, w }); order.push(k); } };
    add(payer, true, true);
    for (const ix of ixs) { for (const [k, s, w] of ix.keys) add(k, s, w); add(ix.program, false, false); }
    const grp = m => (m.k === payer ? 0 : m.s && m.w ? 1 : m.s ? 2 : m.w ? 3 : 4);
    const keys = order.map(k => metas.get(k)).sort((a, b) => grp(a) - grp(b) || order.indexOf(a.k) - order.indexOf(b.k));
    const idx = new Map(keys.map((m, i) => [m.k, i]));
    const signers = keys.filter(m => m.s);
    const out = [signers.length, signers.filter(m => !m.w).length, keys.filter(m => !m.s && !m.w).length, ...shortvec(keys.length)];
    for (const m of keys) out.push(...key32(m.k));
    out.push(...key32(blockhash), ...shortvec(ixs.length));
    for (const ix of ixs) out.push(idx.get(ix.program), ...shortvec(ix.keys.length), ...ix.keys.map(k => idx.get(k[0])), ...shortvec(ix.data.length), ...ix.data);
    return { bytes: Uint8Array.from(out), signers: signers.map(m => m.k) };
  }
  // the wire format with signatures (64 zero bytes for any signer that hasn't signed yet)
  function wire(msg, sigs = []) {
    const out = [...shortvec(msg.signers.length)];
    for (let i = 0; i < msg.signers.length; i++) { const s = sigs[i]; if (s && s.length !== 64) throw new Error('bad sig'); for (let j = 0; j < 64; j++) out.push(s ? s[j] : 0); }
    for (const b of msg.bytes) out.push(b);
    return Uint8Array.from(out);
  }
  const payTx = (from, to, lamports, blockhash) => wire(message(from, [transfer(from, to, lamports)], blockhash));

  return { TPS, MAX_TICKS, COUNTDOWN, MAX_INPUTS, V0, VMAX, JUMP, HPEAK, CLEAR, SLIDE, E, BLOCK, WALL, BEAM, GAP, GEM_PTS, speedAt, heightAt, Track, Run, replay,
    b58enc, b58dec, isAddr, transfer, message, wire, payTx, SYSTEM };
});
