// DUB's world: one toon-shaded floating island behind the whole site. Every section of the page is a place on
// the island and the camera flies there as you scroll: the victory podium with the live board, the locker with
// your player, the signpost path, the mode platforms, the pot vault, the coin stacks, the supply drop, the
// watchtower and the campfire. The storm wall closes in as payday gets closer.
import * as THREE from './vendor/three.module.min.js';

const cv = document.getElementById('world');
const API = (window.DUBW = window.DUBW || {});
if (cv) { try { start(); } catch (e) { console.warn('world off', e); cv.remove(); } }

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' });
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SMALL = Math.min(innerWidth, innerHeight) < 700;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, SMALL ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x4a86f7, 70, 190);
  const cam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 400);
  cam.position.set(0, 34, 80);

  // ---------- materials ----------
  const ramp = new THREE.DataTexture(new Uint8Array([100, 100, 100, 255, 178, 178, 178, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const tcache = {};
  const toon = (c, flat = true) => tcache[c + ':' + flat] || (tcache[c + ':' + flat] = new THREE.MeshToonMaterial({ color: c, gradientMap: ramp }));
  const VC = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const INK = new THREE.MeshBasicMaterial({ color: 0x0b1440, side: THREE.BackSide });
  const GOLD = 0xffc72a, NAVY = 0x13256e, WHITE = 0xffffff;
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const at = (deg, r, y = 0) => V(Math.sin(deg * Math.PI / 180) * r, y, Math.cos(deg * Math.PI / 180) * r);

  // ---------- batching: many static parts -> one toon mesh + one ink mesh ----------
  class Batch {
    constructor() { this.p = []; this.n = []; this.c = []; this.o = []; }
    add(geo, color, m, ink = 1.06) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); g.computeVertexNormals();
      const pos = g.attributes.position.array, nor = g.attributes.normal.array, col = new THREE.Color(color);
      for (let i = 0; i < pos.length; i++) { this.p.push(pos[i]); this.n.push(nor[i]); }
      for (let i = 0; i < pos.length / 3; i++) this.c.push(col.r, col.g, col.b);
      if (ink) { g.computeBoundingBox(); const ctr = g.boundingBox.getCenter(V()); for (let i = 0; i < pos.length; i += 3) this.o.push(ctr.x + (pos[i] - ctr.x) * ink, ctr.y + (pos[i + 1] - ctr.y) * ink, ctr.z + (pos[i + 2] - ctr.z) * ink); }
      g.dispose();
    }
    mesh() {
      const grp = new THREE.Group();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      grp.add(new THREE.Mesh(g, VC));
      if (this.o.length) { const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(this.o, 3)); grp.add(new THREE.Mesh(o, INK)); }
      return grp;
    }
  }
  const M = (pos = V(), rot = [0, 0, 0], scl = [1, 1, 1]) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...(Array.isArray(scl) ? scl : [scl, scl, scl])));
  function solid(geo, color, ink = 1.05, flat = true) {
    const m = new THREE.Mesh(geo, toon(color, flat));
    if (ink) { const o = new THREE.Mesh(geo, INK); o.scale.setScalar(ink); m.add(o); }
    return m;
  }

  // ---------- canvas textures (signs, labels, the board) ----------
  const FONT = '"Lilita", "Arial Black", sans-serif';
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData = { c, x, draw }; return t; }
  function redraw(t, draw) { const { c, x } = t.userData; x.clearRect(0, 0, c.width, c.height); if (draw) t.userData.draw = draw; t.userData.draw(x, c.width, c.height); t.needsUpdate = true; }
  function rrect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
  function popText(x, txt, X, Y, size, fill = '#fff', align = 'center') {
    x.font = `${size}px ${FONT}`; x.textAlign = align; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = size * .22; x.strokeStyle = '#13256e'; x.strokeText(txt, X, Y + size * .07); x.strokeText(txt, X, Y);
    x.fillStyle = fill; x.fillText(txt, X, Y);
  }
  const texts = [];
  function label(txt, w = 512, h = 160, size = 86, fill = '#fff') {
    const t = canvasTex(w, h, x => popText(x, txt, w / 2, h / 2, size, fill)); texts.push(t);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(w / h * 1.1, 1.1, 1); return s;
  }

  // ---------- light ----------
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x2a3da8, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3); sun.position.set(-30, 50, 25); scene.add(sun);

  // ---------- the island ----------
  const R = 28;
  const isl = new Batch();
  isl.add(new THREE.CylinderGeometry(R, R - .5, 1.6, 48), 0x47d873, M(V(0, 0, 0)), 1.012);
  isl.add(new THREE.CylinderGeometry(R - .3, R - 1.6, 1.2, 48), 0x2fb95b, M(V(0, -1.3, 0)), 0);
  const rockG = new THREE.ConeGeometry(R - 1.5, 26, 40, 6); rockG.rotateX(Math.PI);
  { const p = rockG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 12.9 && y > -12.9) { const k = .85 + rnd() * .3; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y + (rnd() - .5) * 1.4); } } }
  isl.add(rockG, 0x9a6a46, M(V(0, -14.6, 0)), 1.01);
  isl.add(new THREE.CylinderGeometry(R - 5, R - 9, 2.2, 40), 0x7a4f34, M(V(0, -6, 0)), 0);
  isl.add(new THREE.CylinderGeometry(R - 12, R - 15, 2, 32), 0x6b4530, M(V(0, -12, 0)), 0);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2 + rnd() * .1; isl.add(new THREE.ConeGeometry(1 + rnd() * .7, 2.2 + rnd() * 2, 5), 0x2fb95b, M(V(Math.sin(a) * (R - .4), -2.4 - rnd() * .6, Math.cos(a) * (R - .4)), [Math.PI, 0, 0]), 0); }
  // the road around the island and the plaza in the middle
  isl.add(new THREE.CylinderGeometry(20.3, 20.3, .1, 72), 0xe2b277, M(V(0, .82, 0)), 0);
  isl.add(new THREE.CylinderGeometry(17.7, 17.7, .12, 72), 0x47d873, M(V(0, .84, 0)), 0);
  isl.add(new THREE.CylinderGeometry(7.2, 7.2, .1, 48), 0xf3d7a8, M(V(0, .83, 0)), 0);
  for (const d of [290, 155, 115, 35, 0]) { const p = at(d, 12.5); isl.add(new THREE.BoxGeometry(1.8, .09, 10.8), 0xe2b277, M(V(p.x, .83, p.z), [0, d * Math.PI / 180, 0]), 0); }
  // trees + rocks, away from the stops
  const STOPS = [290, 252, 236, 220, 204, 155, 115, 75, 35, 0, 325];
  const nearStop = d => STOPS.some(s => Math.abs(((d - s + 540) % 360) - 180) < 11);
  function tree(b, p, s) {
    b.add(new THREE.CylinderGeometry(.25 * s, .38 * s, 1.8 * s, 7), 0x7a4b2a, M(V(p.x, .8 + .9 * s, p.z)), 1.1);
    b.add(new THREE.IcosahedronGeometry(1.35 * s, 0), 0x2fbf5d, M(V(p.x, .8 + 2.4 * s, p.z), [rnd(), rnd(), 0]), 1.07);
    b.add(new THREE.IcosahedronGeometry(1 * s, 0), 0x45d873, M(V(p.x + .5 * s, .8 + 3.1 * s, p.z + .2 * s), [rnd(), rnd(), 0]), 1.07);
    b.add(new THREE.IcosahedronGeometry(.85 * s, 0), 0x27a04e, M(V(p.x - .55 * s, .8 + 3 * s, p.z - .25 * s), [rnd(), rnd(), 0]), 1.07);
  }
  for (let i = 0; i < 70; i++) {
    const d = rnd() * 360, r = rnd() < .5 ? 9 + rnd() * 7 : 22 + rnd() * 4.5;
    if (nearStop(d) && r > 15) continue;
    if (r < 17 && (d > 320 || d < 70)) continue;
    if (rnd() < .78) tree(isl, at(d, r), .8 + rnd() * .5);
    else isl.add(new THREE.DodecahedronGeometry(.8 + rnd() * .6, 0), 0x9fb3e6, M(at(d, r, 1.2), [rnd(), rnd(), rnd()], [1.3, .8, 1]), 1.06);
  }
  scene.add(isl.mesh());

  // ---------- 1. the victory podium + the live board ----------
  const pod = new THREE.Group(); scene.add(pod);
  const pbase = solid(new THREE.CylinderGeometry(2.6, 2.9, .9, 32), WHITE, 1.04, false); pbase.position.y = 1.2; pod.add(pbase);
  const pring = solid(new THREE.TorusGeometry(2.75, .14, 10, 48), GOLD, 0, false); pring.rotation.x = Math.PI / 2; pring.position.y = 1.62; pod.add(pring);
  const ptop = solid(new THREE.CylinderGeometry(1.6, 1.75, .7, 32), 0x2a66f2, 1.04, false); ptop.position.y = 1.95; pod.add(ptop);
  function crown(scale) {
    const c = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.62, .66, .38, 28, 1, true), new THREE.MeshToonMaterial({ color: GOLD, gradientMap: ramp, side: THREE.DoubleSide }));
    const bo = new THREE.Mesh(band.geometry, INK); bo.scale.setScalar(1.06); band.add(bo); c.add(band);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2;
      const s = solid(new THREE.ConeGeometry(.17, .5, 10), GOLD, 1.08); s.position.set(Math.sin(a) * .57, .42, Math.cos(a) * .57); c.add(s);
      const b = solid(new THREE.SphereGeometry(.09, 10, 8), GOLD, 0, false); b.position.set(Math.sin(a) * .57, .7, Math.cos(a) * .57); c.add(b);
      const gm = solid(new THREE.SphereGeometry(.1, 10, 8), 0xff3d6e, 0, false); gm.position.set(Math.sin(a) * .66, 0, Math.cos(a) * .66); c.add(gm); }
    c.scale.setScalar(scale); return c;
  }
  const bigCrown = crown(2.2); bigCrown.position.y = 4.6; pod.add(bigCrown);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 26, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 14; pod.add(beam);
  // the board: a billboard behind the podium that shows today's real leaderboard
  function drawBoard(rows) {
    return (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1c3bb4'); g.addColorStop(1, '#0b1a5e'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      popText(x, "TODAY'S BOARD", w / 2, 62, 64, '#ffc72a');
      if (!rows.length) { popText(x, 'NO DUBS YET', w / 2, 260, 82); x.font = `34px ${FONT}`; x.fillStyle = 'rgba(255,255,255,.75)'; x.textAlign = 'center'; x.fillText('THE FIRST VICTORY ROYALE TAKES THE CROWN', w / 2, 360); return; }
      rows.slice(0, 5).forEach((r, i) => {
        const y = 140 + i * 82; x.fillStyle = i === 0 ? 'rgba(255,199,42,.28)' : 'rgba(255,255,255,.08)'; rrect(x, 40, y - 34, w - 80, 68, 18); x.fill();
        popText(x, String(i + 1), 92, y, 44, i === 0 ? '#ffc72a' : '#fff');
        let nm = String(r.name || ''); x.font = `44px ${FONT}`; while (x.measureText(nm).width > 560 && nm.length > 3) nm = nm.slice(0, -2) + '…';
        popText(x, nm, 150, y, 44, '#fff', 'left');
        popText(x, `${r.dubs} ${r.dubs === 1 ? 'DUB' : 'DUBS'}`, w - 70, y, 44, '#ffe07a', 'right');
      });
    };
  }
  const boardTex = canvasTex(1024, 560, drawBoard([])); texts.push(boardTex);
  const bb = new THREE.Group(); bb.position.set(0, 0, -7.5); scene.add(bb);
  { const b = new Batch();
    for (const x of [-6.2, 6.2]) b.add(new THREE.BoxGeometry(.5, 11.4, .5), 0x7a4b2a, M(V(x, 6.4, 0)), 1.08);
    b.add(new THREE.BoxGeometry(13.4, 7.6, .5), NAVY, M(V(0, 8.6, -.2)), 1.03);
    b.add(new THREE.BoxGeometry(13.8, .5, .7), GOLD, M(V(0, 12.5, -.15)), 1.05);
    bb.add(b.mesh()); }
  const boardPlane = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 6.9), new THREE.MeshBasicMaterial({ map: boardTex, fog: false }));
  boardPlane.position.set(0, 8.6, .08); bb.add(boardPlane);

  // ---------- characters: chunky toon players ----------
  const SKIN = [0xffdcbc, 0xf3c39e, 0xd9a07a, 0xae7550, 0x7d5236], HAIR = [0x2b1d14, 0x5a3a22, 0xf2d06b, 0x1a1a1a, 0xff6a3d, 0x7f4fff];
  const HOODS = [0x2f6bff, 0x9b45ff, 0xff9a1f, 0x2bd46b, 0xff4fa3, 0xffd23f, 0x1fd1e0, 0xff5a4f];
  const pick = a => a[Math.floor(rnd() * a.length)];
  function player(o = {}) {
    const b = new Batch(), skin = o.skin ?? pick(SKIN), hood = o.hood ?? pick(HOODS);
    const pants = o.pants ?? pick([0x23263a, 0x3a3f5c, 0x1f3a7a]), hair = o.hair ?? pick(HAIR), shoe = o.shoe ?? pick([0xffffff, 0x1b1f2e, 0xff4f4f]);
    const sw = o.swing ?? (rnd() - .5) * .9;
    b.add(new THREE.SphereGeometry(1, 20, 14), skin, M(V(0, 2.35, 0), [0, 0, 0], [1, .94, .94]), 1.05);
    b.add(new THREE.SphereGeometry(1.04, 20, 14, 0, Math.PI * 2, 0, Math.PI * .45), hair, M(V(0, 2.39, -.03), [-.32, 0, 0], [1, .96, .96]), 1.03);
    b.add(new THREE.SphereGeometry(.11, 8, 6), 0x0b0f1c, M(V(-.32, 2.36, .9)), 0); b.add(new THREE.SphereGeometry(.11, 8, 6), 0x0b0f1c, M(V(.32, 2.36, .9)), 0);
    b.add(new THREE.CapsuleGeometry(.62, .55, 6, 14), hood, M(V(0, .95, 0), [0, 0, 0], [1.18, 1, .95]), 1.05);
    b.add(new THREE.BoxGeometry(1, 1.05, .5), 0x3a3f5c, M(V(0, 1.05, -.78)), 1.05);
    b.add(new THREE.CapsuleGeometry(.2, .62, 4, 8), hood, M(V(-.98, 1, 0), [sw, 0, .35]), 1.06); b.add(new THREE.CapsuleGeometry(.2, .62, 4, 8), hood, M(V(.98, 1, 0), [-sw, 0, -.35]), 1.06);
    b.add(new THREE.SphereGeometry(.22, 10, 8), skin, M(V(-1.2, .48, sw * .4)), 1.06); b.add(new THREE.SphereGeometry(.22, 10, 8), skin, M(V(1.2, .48, -sw * .4)), 1.06);
    b.add(new THREE.CapsuleGeometry(.23, .45, 4, 8), pants, M(V(-.34, -.05, 0), [-sw * .6, 0, 0]), 1.06); b.add(new THREE.CapsuleGeometry(.23, .45, 4, 8), pants, M(V(.34, -.05, 0), [sw * .6, 0, 0]), 1.06);
    b.add(new THREE.BoxGeometry(.42, .24, .62), shoe, M(V(-.36, -.55, .1)), 1.08); b.add(new THREE.BoxGeometry(.42, .24, .62), shoe, M(V(.36, -.55, .1)), 1.08);
    if (o.headset !== false) { b.add(new THREE.TorusGeometry(1.05, .08, 8, 24, Math.PI), 0x1b1f2e, M(V(0, 2.35, 0)), 0); b.add(new THREE.CylinderGeometry(.3, .3, .22, 14), 0x1b1f2e, M(V(-1.02, 2.3, 0), [0, 0, Math.PI / 2]), 1.05); b.add(new THREE.CylinderGeometry(.3, .3, .22, 14), 0x1b1f2e, M(V(1.02, 2.3, 0), [0, 0, Math.PI / 2]), 1.05); }
    const g = b.mesh(); const wrap = new THREE.Group(); g.position.y = .67; wrap.add(g); wrap.scale.setScalar(o.scale ?? .55); wrap.userData.body = g; return wrap;
  }
  const faceOut = (grp, p) => { grp.rotation.y = Math.atan2(p.x, p.z); };

  // ---------- 2. the locker: your player on a stage, your name above ----------
  const LOCK = at(290, 19);
  const locker = new THREE.Group(); locker.position.copy(LOCK); faceOut(locker, LOCK); scene.add(locker);
  { const b = new Batch(); b.add(new THREE.CylinderGeometry(3, 3.3, .8, 32), WHITE, M(V(0, 1.2, 0)), 1.03); b.add(new THREE.CylinderGeometry(2.4, 2.5, .3, 32), 0x8f5cff, M(V(0, 1.7, 0)), 0);
    b.add(new THREE.BoxGeometry(.3, 6, .3), NAVY, M(V(-3.2, 4, -1.8)), 1.08); b.add(new THREE.BoxGeometry(.3, 6, .3), NAVY, M(V(3.2, 4, -1.8)), 1.08); b.add(new THREE.BoxGeometry(6.7, .4, .4), GOLD, M(V(0, 7, -1.8)), 1.06);
    locker.add(b.mesh()); }
  const meOpts = { hood: 0x2f6bff, skin: 0xf3c39e, hair: 0x5a3a22, pants: 0x23263a, shoe: WHITE, swing: .15, scale: .78 };
  let me = player(meOpts); me.position.y = 1.85; locker.add(me);
  function namePlate(x, name, w, h) {
    x.fillStyle = 'rgba(11,26,94,.92)'; rrect(x, 8, 22, w - 16, h - 44, 34); x.fill(); x.strokeStyle = '#ffc72a'; x.lineWidth = 6; x.stroke();
    let n = name ? name.toUpperCase() : 'YOUR EPIC NAME'; x.font = `74px ${FONT}`; while (x.measureText(n).width > w - 90 && n.length > 3) n = n.slice(0, -2) + '…';
    popText(x, n, w / 2, h / 2 + 2, 74, name ? '#fff' : 'rgba(255,255,255,.55)');
  }
  const nameTex = canvasTex(768, 200, x => namePlate(x, '', 768, 200)); texts.push(nameTex);
  const nameSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, transparent: true, depthWrite: false })); nameSpr.scale.set(5.2, 1.36, 1); nameSpr.position.set(0, 6, 0); locker.add(nameSpr);
  const spot = new THREE.Mesh(new THREE.CylinderGeometry(.6, 3, 9, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  spot.position.y = 6; locker.add(spot);
  let emoteT = -1; const hopT = [-1, -1, -1, -1];

  // ---------- 3. the signpost path: one sign per step ----------
  const SIGNS = [['1', 'REGISTER'], ['2', 'DROP IN'], ['3', 'GET THE DUB'], ['4', 'GET PAID']];
  [252, 236, 220, 204].forEach((d, i) => {
    const p = at(d, 21.6); const g = new THREE.Group(); g.position.copy(p); faceOut(g, p); scene.add(g);
    const b = new Batch(); b.add(new THREE.BoxGeometry(.35, 4.4, .35), 0x7a4b2a, M(V(0, 2.9, 0)), 1.08); b.add(new THREE.BoxGeometry(4.6, 2.5, .3), 0x9a5b2e, M(V(0, 4.3, .1)), 1.04); g.add(b.mesh());
    const t = canvasTex(512, 280, x => { x.fillStyle = '#b06a35'; x.fillRect(0, 0, 512, 280); x.fillStyle = 'rgba(0,0,0,.12)'; for (let k = 0; k < 5; k++) x.fillRect(0, 50 + k * 56, 512, 3); popText(x, SIGNS[i][0], 256, 92, 110, '#ffc72a'); popText(x, SIGNS[i][1], 256, 210, 62); });
    texts.push(t); const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.3), new THREE.MeshBasicMaterial({ map: t })); pl.position.set(0, 4.3, .27); g.add(pl);
  });

  // ---------- 4. the modes: four platforms with 1, 2, 3, 4 players ----------
  const MODES = at(155, 19.5);
  const modes = new THREE.Group(); modes.position.copy(MODES); faceOut(modes, MODES); scene.add(modes);
  const modePl = [];
  ['SOLO', 'DUOS', 'TRIOS', 'SQUADS'].forEach((nm, i) => {
    const g = new THREE.Group(); g.position.set((i - 1.5) * 4.4, 0, (i % 2) * .8); modes.add(g); modePl.push(g);
    const base = solid(new THREE.CylinderGeometry(1.9, 2.1, .6, 24), [0x2f6bff, 0x8f5cff, 0x1fd1e0, 0xff4f7e][i], 1.04); base.position.y = 1.1; g.add(base);
    for (let k = 0; k <= i; k++) { const p = player({ scale: .42 }); p.position.set((k - i / 2) * 1.05, 1.4, (k % 2) * .4); p.rotation.y = (rnd() - .5) * .6; g.add(p); }
    const l = label(nm, 420, 130, 78); l.position.set(0, 3.6, 0); l.scale.multiplyScalar(1.4); g.add(l);
  });

  // ---------- 5. the pot: a vault chest with coins raining in ----------
  const POT = at(115, 19.5);
  const vault = new THREE.Group(); vault.position.copy(POT); faceOut(vault, POT); scene.add(vault);
  { const b = new Batch(); b.add(new THREE.BoxGeometry(4.6, 2.4, 3), 0x9a5b2e, M(V(0, 2, 0)), 1.04);
    for (const xx of [-1.7, 1.7]) b.add(new THREE.BoxGeometry(.35, 2.5, 3.1), GOLD, M(V(xx, 2, 0)), 0);
    b.add(new THREE.BoxGeometry(4.7, .35, 3.1), GOLD, M(V(0, 3.15, 0)), 0);
    b.add(new THREE.CylinderGeometry(1.5, 1.5, 4.6, 14, 1, false, 0, Math.PI), 0xb06a35, M(V(0, 3.6, -1.9), [-1.05, 0, Math.PI / 2]), 1.04);
    b.add(new THREE.CylinderGeometry(2.05, 2.05, .3, 20), 0xffe07a, M(V(0, 3.05, 0), [0, 0, 0], [1, 1, .66]), 0);
    vault.add(b.mesh()); }
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 7, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  glow.position.y = 6.5; vault.add(glow);
  const COINS = 36;
  const rain = new THREE.InstancedMesh(new THREE.CylinderGeometry(.42, .42, .1, 18), toon(GOLD, false), COINS); rain.frustumCulled = false; vault.add(rain);
  const drops = Array.from({ length: COINS }, () => ({ t: rnd(), x: (rnd() - .5) * 2.6, z: (rnd() - .5) * 1.6, s: .8 + rnd() * .5, r: rnd() * 6 }));
  let rainRate = .25;
  function potSign(x, sol, w, h) {
    x.fillStyle = 'rgba(11,26,94,.92)'; rrect(x, 8, 16, w - 16, h - 32, 34); x.fill(); x.strokeStyle = '#ffc72a'; x.lineWidth = 6; x.stroke();
    popText(x, "TODAY'S POT", w / 2, 70, 46, '#ffc72a'); popText(x, sol == null ? '— SOL' : `${Number(sol).toFixed(4)} SOL`, w / 2, 160, 78);
  }
  const potTex = canvasTex(768, 240, x => potSign(x, null, 768, 240)); texts.push(potTex);
  const potSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: potTex, transparent: true, depthWrite: false })); potSpr.scale.set(6.4, 2, 1); potSpr.position.set(0, 7.6, 0); vault.add(potSpr);

  // ---------- 6. the split: three coin stacks (dev cut / everyone's dubs / yours) ----------
  const SPL = at(75, 19.5);
  const split = new THREE.Group(); split.position.copy(SPL); faceOut(split, SPL); scene.add(split);
  const plate = solid(new THREE.CylinderGeometry(5.2, 5.6, .6, 36), WHITE, 1.03); plate.position.y = 1.1; split.add(plate);
  const stacks = [[GOLD, -2.8, 'DEV CUT'], [0x6fa8ff, 0, 'EVERYONE'], [0x5ef2b4, 2.8, 'YOURS']].map(([c, x, nm]) => {
    const s = new THREE.Group(); s.position.set(x, 1.4, 0); split.add(s);
    const col = solid(new THREE.CylinderGeometry(1, 1, 1, 24), c, 1.05, false); col.position.y = .5; s.add(col);
    const cap = solid(new THREE.CylinderGeometry(1.05, 1.05, .22, 24), 0xffe07a, 1.05, false); s.add(cap);
    const l = label(nm, 420, 120, 70); s.add(l); return { s, col, cap, l, h: 1, target: 1 };
  });

  // ---------- 7. payday: supply drops on a landing pad ----------
  const PAY = at(35, 19.5);
  const pad = new THREE.Group(); pad.position.copy(PAY); faceOut(pad, PAY); scene.add(pad);
  { const b = new Batch(); b.add(new THREE.CylinderGeometry(4.6, 4.8, .5, 32), 0x3a3f5c, M(V(0, 1, 0)), 1.03); b.add(new THREE.TorusGeometry(3.6, .22, 8, 40), GOLD, M(V(0, 1.27, 0), [Math.PI / 2, 0, 0]), 0);
    b.add(new THREE.BoxGeometry(3.4, .08, .5), WHITE, M(V(0, 1.28, 0)), 0); b.add(new THREE.BoxGeometry(.5, .08, 3.4), WHITE, M(V(0, 1.28, 0)), 0); pad.add(b.mesh()); }
  function crate() {
    const g = new THREE.Group(); const b = new Batch();
    b.add(new THREE.BoxGeometry(1.6, 1.6, 1.6), 0x2f6bff, M(V(0, .8, 0)), 1.05);
    for (const y of [.12, 1.48]) b.add(new THREE.BoxGeometry(1.7, .2, 1.7), GOLD, M(V(0, y, 0)), 0);
    b.add(new THREE.BoxGeometry(.3, 1.62, 1.65), GOLD, M(V(0, .8, 0)), 0);
    g.add(b.mesh());
    const bal = solid(new THREE.SphereGeometry(1.1, 16, 12), 0xff4f7e, 1.05, false); bal.position.y = 4.4; bal.scale.y = 1.15; g.add(bal);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 2.4, 4), INK); str.position.y = 2.6; g.add(str);
    g.userData = { bal, str }; return g;
  }
  const falling = crate(); pad.add(falling);
  const landed = []; for (let i = 0; i < 6; i++) { const c = crate(); c.userData.bal.visible = c.userData.str.visible = false; const a = i / 6 * Math.PI * 2; c.position.set(Math.cos(a) * 2.6, 1.25, Math.sin(a) * 2.6); c.rotation.y = a; c.scale.setScalar(.7); c.visible = false; pad.add(c); landed.push(c); }
  const payLabel = label('PAYDAY 00:00 UTC', 640, 130, 70, '#ffe07a'); payLabel.position.set(0, 7.6, 0); payLabel.scale.multiplyScalar(1.15); pad.add(payLabel);

  // ---------- 8. fair play: the watchtower ----------
  const TOW = at(0, 21);
  const tower = new THREE.Group(); tower.position.copy(TOW); faceOut(tower, TOW); scene.add(tower);
  { const b = new Batch();
    for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) b.add(new THREE.BoxGeometry(.35, 7, .35), 0x7a4b2a, M(V(x, 4.3, z)), 1.08);
    b.add(new THREE.BoxGeometry(4, .4, 4), 0x9a5b2e, M(V(0, 7.9, 0)), 1.04);
    for (const [x, z, w, d] of [[0, -1.9, 4, .2], [0, 1.9, 4, .2], [-1.9, 0, .2, 4], [1.9, 0, .2, 4]]) b.add(new THREE.BoxGeometry(w, 1, d), 0x9a5b2e, M(V(x, 8.6, z)), 1.04);
    b.add(new THREE.ConeGeometry(3.2, 2, 4), 0xff4f7e, M(V(0, 10.9, 0), [0, Math.PI / 4, 0]), 1.04);
    for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) b.add(new THREE.BoxGeometry(.18, 2, .18), 0x7a4b2a, M(V(x, 9.4, z)), 0);
    tower.add(b.mesh()); }
  const lamp = new THREE.Group(); lamp.position.y = 9.2; tower.add(lamp);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  cone.rotation.x = -Math.PI / 2.6; cone.position.z = 6.5; cone.position.y = -2.4; lamp.add(cone);
  const ref = player({ hood: WHITE, scale: .5 }); ref.position.set(0, 8.1, 0); tower.add(ref);

  // ---------- 9. FAQ: the campfire ----------
  const FIRE = at(325, 20.5);
  const camp = new THREE.Group(); camp.position.copy(FIRE); faceOut(camp, FIRE); scene.add(camp);
  { const b = new Batch(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.add(new THREE.CylinderGeometry(.22, .22, 2, 7), 0x7a4b2a, M(V(Math.cos(a) * .5, 1.1, Math.sin(a) * .5), [Math.PI / 2.4, a, 0]), 1.08); }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; b.add(new THREE.DodecahedronGeometry(.32, 0), 0x9fb3e6, M(V(Math.cos(a) * 1.3, .95, Math.sin(a) * 1.3)), 1.08); }
    for (let i = 0; i < 3; i++) { const a = (i / 3 + .08) * Math.PI * 2; b.add(new THREE.CylinderGeometry(.45, .45, 2.6, 8), 0x8b5a36, M(V(Math.cos(a) * 3.2, 1.25, Math.sin(a) * 3.2), [0, -a, Math.PI / 2]), 1.06); }
    camp.add(b.mesh()); }
  const flames = [0xff7a2f, 0xffc72a, 0xfff1b0].map((c, i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(.75 - i * .2, 2 - i * .5, 8), new THREE.MeshBasicMaterial({ color: c, fog: false })); f.position.y = 1.9 - i * .05; camp.add(f); return f; });
  for (let i = 0; i < 3; i++) { const a = (i / 3 + .08) * Math.PI * 2; const p = player({ scale: .45, swing: .5 }); p.position.set(Math.cos(a) * 3.2, 1.3, Math.sin(a) * 3.2); p.rotation.y = -a - Math.PI / 2; camp.add(p); }
  const qm = label('?', 200, 200, 150, '#ffc72a'); qm.position.set(0, 5, 0); qm.scale.set(2.2, 2.2, 1); camp.add(qm);

  const LABELS = { register: [nameSpr], modes: modePl.map(g => g.children[g.children.length - 1]), pot: [potSpr], split: stacks.map(s => s.l), payday: [payLabel], faq: [qm] };
  for (const arr of Object.values(LABELS)) for (const s of arr) s.material.opacity = 0;

  // ---------- the air: coins, stars, crowns, gliders, clouds ----------
  const air = new THREE.Group(); scene.add(air);
  const floaters = [];
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .44 : 1; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: .3, bevelEnabled: true, bevelThickness: .1, bevelSize: .08, bevelSegments: 2 }); starGeo.center();
  for (let i = 0; i < 26; i++) {
    const k = i % 3, d = rnd() * 360, r = 30 + rnd() * 14, o = k === 0 ? solid(new THREE.CylinderGeometry(.75, .75, .18, 22), GOLD, 1.08, false) : k === 1 ? solid(starGeo, rnd() < .7 ? GOLD : WHITE, 1.08) : crown(1.1);
    if (k === 0) o.rotation.x = Math.PI / 2;
    o.position.copy(at(d, r, 4 + rnd() * 14)); o.userData = { y: o.position.y, ph: rnd() * 6, sp: .5 + rnd() }; air.add(o); floaters.push(o);
  }
  const gliders = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const can = solid(new THREE.SphereGeometry(1.4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), [GOLD, WHITE, 0x8f5cff][i % 3], 1.05); can.scale.y = .6; can.position.y = 2.6; g.add(can);
    const p = player({ scale: .38 }); p.position.y = -.2; g.add(p);
    for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const ln = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2.1, 4), INK); ln.position.set(x * .6, 1.6, z * .6); ln.rotation.z = -x * .42; ln.rotation.x = z * .42; g.add(ln); }
    g.userData = { t: i / 6, d: rnd() * 360, r: 8 + rnd() * 18, sp: 1 / (22 + rnd() * 10) }; scene.add(g); gliders.push(g);
  }
  const clouds = new THREE.Group(); scene.add(clouds);
  for (let i = 0; i < 22; i++) {
    const b = new Batch(), n = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) b.add(new THREE.IcosahedronGeometry(1.6 + rnd() * 1.3, 1), WHITE, M(V((k - n / 2) * 1.7, rnd() * .9, rnd() * 1.3), [0, 0, 0], [1, .72, 1]), 0);
    const c = b.mesh(); const d = i / 22 * 360 + rnd() * 10, r = 38 + rnd() * 40; c.position.copy(at(d, r, -16 + rnd() * 12)); c.scale.setScalar(1.6 + rnd() * 1.8); c.lookAt(0, c.position.y, 0); clouds.add(c);
  }

  // ---------- the storm: a purple wall on the horizon, closing in as payday nears ----------
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 256; const sx = sc.getContext('2d');
  const gr = sx.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(170,120,255,0)'); gr.addColorStop(.45, 'rgba(150,90,255,.5)'); gr.addColorStop(1, 'rgba(100,40,220,.85)');
  sx.fillStyle = gr; sx.fillRect(0, 0, 256, 256); sx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) { sx.fillStyle = `rgba(255,255,255,${.04 + rnd() * .08})`; sx.fillRect(rnd() * 256, 0, 2 + rnd() * 6, 256); }
  const stormTex = new THREE.CanvasTexture(sc); stormTex.wrapS = THREE.RepeatWrapping; stormTex.repeat.set(12, 1); stormTex.colorSpace = THREE.SRGBColorSpace;
  const storm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 128, 1, true), new THREE.MeshBasicMaterial({ map: stormTex, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  storm.position.y = -10; scene.add(storm);
  const dayLeft = () => { const n = Date.now(); return (Math.ceil((n + 1) / 864e5) * 864e5 - n) / 864e5; };

  // ---------- camera stops: one per section ----------
  const outside = (p, dist, h, side = 0) => { const r = V(p.x, 0, p.z).normalize(), tg = V(-r.z, 0, r.x); return { cam: p.clone().addScaledVector(r, dist).addScaledVector(tg, side).add(V(0, h, 0)), look: p.clone().add(V(0, 2.4, 0)) }; };
  const KEYS = {
    top: () => ({ cam: V(0, 30, 74), look: V(0, 1, 0) }),
    board: () => ({ cam: V(6.5, 10, 16), look: V(0, 7, -5) }),
    register: () => { const k = outside(LOCK, 15, 4.8, -3); k.look.y = 4.2; return k; },
    how: t => { const p = at(255 - 55 * t, 21.6); const k = outside(p, 15, 5, 0); k.look.y = 4.2; return k; },
    modes: () => { const k = outside(MODES, 21, 8, 0); k.look.y = 3; return k; },
    pot: () => { const k = outside(POT, 17, 6.5, 2); k.look.y = 4.5; return k; },
    split: () => { const k = outside(SPL, 18, 7.5, -1.5); k.look.y = 3.5; return k; },
    payday: () => { const k = outside(PAY, 19, 8.5, 2); k.look.y = 4.2; return k; },
    rules: () => { const k = outside(TOW, 21, 9, -3); k.look.y = 6.5; return k; },
    faq: () => { const k = outside(FIRE, 15, 6, 2); k.look.y = 2.8; return k; },
  };
  let stops = [];
  function measure() {
    stops = [...document.querySelectorAll('[data-poi]')].map(el => { const r = el.getBoundingClientRect(); return { key: el.dataset.poi, top: r.top + scrollY, h: Math.max(1, r.height) }; }).filter(s => KEYS[s.key]);
  }
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const want = { cam: V(0, 30, 74), look: V(0, 1, 0) }, cur = { cam: V(0, 30, 74), look: V(0, 1, 0) };
  let stopIndex = 0;
  function desired() {
    if (!stops.length) return;
    const y = scrollY + innerHeight * .45;
    let i = 0; for (let k = 0; k < stops.length; k++) if (stops[k].top <= y) i = k;
    const s = stops[i], n = stops[i + 1], t = Math.min(1, Math.max(0, (y - s.top) / s.h));
    stopIndex = i;
    const A = KEYS[s.key](s.key === 'how' ? Math.min(1, t / .7) : 0);
    if (!n) { want.cam.copy(A.cam); want.look.copy(A.look); return; }
    const f = ss(.66, 1, t), B = KEYS[n.key](0);
    want.cam.lerpVectors(A.cam, B.cam, f); want.cam.y += Math.sin(f * Math.PI) * 7;
    want.look.lerpVectors(A.look, B.look, f);
  }
  function size() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.fov = cam.aspect < .8 ? 52 : 38; cam.updateProjectionMatrix(); measure(); }
  addEventListener('resize', size); size();
  addEventListener('load', measure); setTimeout(measure, 400); setTimeout(measure, 1600);
  if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe(document.body);

  // drag anywhere that isn't a panel to look around; it springs back when you let go
  let yaw = 0, pitch = 0, dragging = false, lx = 0, ly = 0, px = 0, py = 0;
  addEventListener('pointerdown', e => { if (e.target.closest('.panel,.card,button,a,input,label,summary,.hud,.dock,.map,details,.htop')) return; dragging = true; lx = e.clientX; ly = e.clientY; document.documentElement.classList.add('grab'); }, { passive: true });
  addEventListener('pointermove', e => { px = e.clientX / innerWidth - .5; py = e.clientY / innerHeight - .5; if (!dragging) return; yaw = Math.max(-1.2, Math.min(1.2, yaw - (e.clientX - lx) * .006)); pitch = Math.max(-.35, Math.min(.5, pitch + (e.clientY - ly) * .003)); lx = e.clientX; ly = e.clientY; }, { passive: true });
  addEventListener('pointerup', () => { dragging = false; document.documentElement.classList.remove('grab'); }, { passive: true });

  // ---------- the minimap ----------
  const map = document.getElementById('minimap'), mx = map && map.getContext('2d');
  const POIS = { board: V(0, 0, 0), register: LOCK, how: at(228, 21.6), modes: MODES, pot: POT, split: SPL, payday: PAY, rules: TOW, faq: FIRE };
  function drawMap() {
    if (!mx) return; const W = map.width, S = W / 2 / 44, c = W / 2;
    mx.clearRect(0, 0, W, W);
    mx.fillStyle = '#1a3fbf'; mx.beginPath(); mx.arc(c, c, W / 2, 0, 7); mx.fill();
    const sr = Math.min(W / 2 - 2, (24 + 20 * dayLeft()) * S);
    mx.fillStyle = 'rgba(143,92,255,.5)'; mx.beginPath(); mx.arc(c, c, W / 2, 0, 7); mx.arc(c, c, sr, 0, 7, true); mx.fill();
    mx.strokeStyle = '#fff'; mx.lineWidth = 2; mx.beginPath(); mx.arc(c, c, sr, 0, 7); mx.stroke();
    mx.fillStyle = '#47d873'; mx.beginPath(); mx.arc(c, c, R * S, 0, 7); mx.fill();
    mx.strokeStyle = '#e2b277'; mx.lineWidth = 2.5; mx.beginPath(); mx.arc(c, c, 19 * S, 0, 7); mx.stroke();
    const active = stops[stopIndex] && stops[stopIndex].key;
    for (const [k, p] of Object.entries(POIS)) { const on = k === active; mx.fillStyle = on ? '#ffc72a' : '#fff'; mx.strokeStyle = '#13256e'; mx.lineWidth = 2; mx.beginPath(); mx.arc(c + p.x * S, c + p.z * S, on ? 6 : 3.8, 0, 7); mx.fill(); mx.stroke(); }
    const dir = V().subVectors(cur.look, cam.position), ang = Math.atan2(dir.x, dir.z);
    const qx = Math.max(10, Math.min(W - 10, c + cam.position.x * S)), qy = Math.max(10, Math.min(W - 10, c + cam.position.z * S));
    mx.save(); mx.translate(qx, qy); mx.rotate(Math.PI - ang); mx.fillStyle = '#ffc72a'; mx.strokeStyle = '#13256e'; mx.lineWidth = 2;
    mx.beginPath(); mx.moveTo(0, -9); mx.lineTo(7, 7); mx.lineTo(0, 3); mx.lineTo(-7, 7); mx.closePath(); mx.fill(); mx.stroke(); mx.restore();
  }
  if (map) map.addEventListener('click', e => {
    const r = map.getBoundingClientRect(), W = map.width, S = W / 2 / 44, x = (e.clientX - r.left) / r.width * W - W / 2, z = (e.clientY - r.top) / r.height * W - W / 2;
    let best = null, bd = 1e9; for (const [k, p] of Object.entries(POIS)) { const d = Math.hypot(p.x * S - x, p.z * S - z); if (d < bd) { bd = d; best = k; } }
    const el = best && document.querySelector(`[data-poi="${best}"]`); if (el) el.scrollIntoView({ behavior: 'smooth' });
  });

  // ---------- the loop ----------
  let last = performance.now(), t = 0, mapT = 1, running = false, snapNext = true, snapNext2 = true, viewShift = 0;
  const tmp = V(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), one = V(1, 1, 1), zero = V(0, 0, 0), UP = V(0, 1, 0);
  function frame(now) {
    const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = Math.max(last, now); t += dt;
    desired();
    const k = snapNext ? 1 : 1 - Math.exp(-dt * 2.6); snapNext = false;
    cur.cam.lerp(want.cam, k); cur.look.lerp(want.look, k);
    if (!dragging) { yaw *= Math.exp(-dt * 1.6); pitch *= Math.exp(-dt * 1.6); }
    tmp.subVectors(cur.cam, cur.look); tmp.applyAxisAngle(UP, yaw + px * .12);
    const len = tmp.length(), hd = Math.atan2(tmp.x, tmp.z), el = Math.max(-.2, Math.min(1.35, Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)) + pitch - py * .05));
    cam.position.set(cur.look.x + Math.sin(hd) * Math.cos(el) * len, cur.look.y + Math.sin(el) * len, cur.look.z + Math.cos(hd) * Math.cos(el) * len);
    cam.lookAt(cur.look);
    // on wide screens the panels sit on the left, so the camera frames each place on the right
    const shiftTo = stopIndex > 0 && innerWidth > 980 ? -.2 : 0; viewShift += (shiftTo - viewShift) * (snapNext2 ? 1 : 1 - Math.exp(-dt * 3)); snapNext2 = false;
    cam.setViewOffset(innerWidth, innerHeight, viewShift * innerWidth, 0, innerWidth, innerHeight);
    // life
    bigCrown.rotation.y += dt * .8; bigCrown.position.y = 4.6 + Math.sin(t * 1.6) * .3; beam.material.opacity = .11 + Math.sin(t * 2.2) * .04;
    me.rotation.y = Math.sin(t * .6) * .5; me.userData.body.position.y = .67 + Math.abs(Math.sin(t * 2)) * .06;
    if (emoteT >= 0) { emoteT += dt; const e = emoteT; me.rotation.y = e * 12; me.userData.body.position.y = .67 + Math.abs(Math.sin(e * 9)) * 1.2; if (emoteT > 1.6) emoteT = -1; }
    spot.material.opacity = .1 + Math.sin(t * 1.5) * .03;
    modePl.forEach((g, i) => { let y = Math.sin(t * 1.4 + i) * .15; if (hopT[i] >= 0) { hopT[i] += dt; const h = hopT[i]; y += Math.abs(Math.sin(h * Math.PI / .55)) * 1.6 * Math.max(0, 1 - h / 1.65); g.rotation.y = h * 4; if (h > 1.65) { hopT[i] = -1; g.rotation.y = 0; } } g.position.y = y; });
    drops.forEach((d, i) => { d.t += dt * rainRate * d.s; if (d.t > 1) { d.t -= 1; d.x = (rnd() - .5) * 2.6; d.z = (rnd() - .5) * 1.6; }
      e4.set(d.r + t * 3 * d.s, t * 2, 0); q4.setFromEuler(e4); m4.compose(tmp.set(d.x, 14 - d.t * 11, d.z), q4, d.t > .97 ? zero : one); rain.setMatrixAt(i, m4); });
    rain.instanceMatrix.needsUpdate = true; glow.material.opacity = .16 + Math.sin(t * 3) * .05;
    stacks.forEach(s => { s.h += (s.target - s.h) * Math.min(1, dt * 4); s.col.scale.y = s.h; s.col.position.y = s.h / 2; s.cap.position.y = s.h + .1; s.l.position.y = s.h + 1.3; });
    { const p = (t * .07) % 1, y = 16 - p * 14.8; falling.position.set(0, Math.max(1.25, y), 0); falling.rotation.y = t * .4;
      falling.userData.bal.visible = falling.userData.str.visible = y > 1.25; falling.scale.setScalar(p > .96 ? Math.max(.001, (1 - p) * 25) : 1); }
    { const ak = stops[stopIndex] ? stops[stopIndex].key : 'top', kk = 1 - Math.exp(-dt * 5);
      for (const [key, arr] of Object.entries(LABELS)) { const on = ak === key || ak === 'top'; for (const s of arr) { s.material.opacity += ((on ? 1 : 0) - s.material.opacity) * (snapNext2 ? 1 : kk); s.visible = s.material.opacity > .02; } } }
    lamp.rotation.y = t * .7; cone.material.opacity = .1 + Math.sin(t * 2) * .03;
    flames.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 9 + i) * .12, 1 + Math.sin(t * 13 + i * 2) * .22, 1 + Math.cos(t * 10 + i) * .12); f.rotation.y = t * (1 + i); });
    floaters.forEach(o => { const u = o.userData; o.position.y = u.y + Math.sin(t * u.sp + u.ph) * .7; o.rotation.y += dt * u.sp; });
    air.rotation.y += dt * .02; clouds.rotation.y += dt * .006;
    gliders.forEach(g => { const u = g.userData; u.t = ((u.t + dt * u.sp) % 1 + 1) % 1; g.position.copy(at(u.d + u.t * 40, u.r, 26 - u.t * 25)); g.rotation.y = (u.d + u.t * 40) * Math.PI / 180; g.rotation.z = Math.sin(t * 1.3 + u.d) * .12; g.scale.setScalar(Math.max(.001, Math.min(1, (1 - u.t) * 8, u.t * 10))); });
    const SR = 90 + 50 * dayLeft(); storm.scale.set(SR, 1, SR); stormTex.offset.x = (stormTex.offset.x + dt * .008) % 1;
    renderer.render(scene, cam);
    mapT += dt; if (mapT > .1) { mapT = 0; drawMap(); }
    if (running) requestAnimationFrame(frame);
  }
  function play() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else if (!RM) play(); });

  // ---------- API for the page ----------
  API.setBoard = rows => redraw(boardTex, drawBoard(rows || []));
  API.setName = name => redraw(nameTex, x => namePlate(x, String(name || '').slice(0, 32), 768, 200));
  API.setHood = plat => { meOpts.hood = { epic: 0x2f6bff, psn: 0x1fd1e0, xbl: 0x2bd46b }[plat] || 0x2f6bff; const pos = me.position.clone(); locker.remove(me); me = player(meOpts); me.position.copy(pos); locker.add(me); };
  API.emote = () => { emoteT = 0; };
  API.setPot = sol => { redraw(potTex, x => potSign(x, sol, 768, 240)); rainRate = .2 + Math.min(1.6, Math.log10(1 + (Number(sol) || 0) * 10) * .6); };
  API.setSplit = ({ dev = .25, rest = .7, yours = .05 } = {}) => { const k = 7; stacks[0].target = Math.max(.15, dev * k); stacks[1].target = Math.max(.15, rest * k); stacks[2].target = Math.max(.15, yours * k * 3); };
  API.setPaydays = n => landed.forEach((c, i) => (c.visible = i < Math.min(6, n | 0)));
  API.snap = () => { measure(); desired(); cur.cam.copy(want.cam); cur.look.copy(want.look); snapNext = snapNext2 = true; if (!running) frame(performance.now()); };
  API.hop = i => { if (i >= 0 && i < 4) hopT[i] = 0; };
  API.measure = measure;
  API.ready = true;
  // fonts arrive after the first paint; redraw every sign once Lilita is in
  if (document.fonts && document.fonts.load) document.fonts.load('64px Lilita').then(() => texts.forEach(tx => redraw(tx))).catch(() => {});
  measure(); desired(); cur.cam.copy(want.cam); cur.look.copy(want.look);
  if (RM) { frame(performance.now()); addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true }); }
  else play();
  cv.classList.add('on');
  window.dispatchEvent(new Event('dubw:ready'));
}
