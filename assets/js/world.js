// DUB's lobby island: a toon-shaded floating island in the sky, the victory crown on its podium,
// players gliding down, coins in the air, and the storm wall around it closing as payday gets closer.
import * as THREE from './vendor/three.module.min.js';

const cv = document.getElementById('world');
const hero = document.getElementById('top');
if (cv && hero) start();

function start() {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch { cv.remove(); return; }
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x3d78f5, 55, 130);
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 300);

  // ---------- toon materials + ink outlines ----------
  const ramp = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const mats = {};
  const toon = (c, flat = true) => mats[c + ':' + flat] || (mats[c + ':' + flat] = new THREE.MeshToonMaterial({ color: c, gradientMap: ramp, flatShading: flat }));
  const INK = new THREE.MeshBasicMaterial({ color: 0x0b1440, side: THREE.BackSide });
  function mesh(geo, color, { ink = 1.05, flat = true } = {}) {
    const m = new THREE.Mesh(geo, toon(color, flat));
    if (ink) { const o = new THREE.Mesh(geo, INK); o.scale.setScalar(ink); m.add(o); }
    return m;
  }
  const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

  // ---------- light ----------
  scene.add(new THREE.HemisphereLight(0xe6efff, 0x2a3da8, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-10, 18, 12); scene.add(sun);

  // ---------- the island ----------
  const island = new THREE.Group(); scene.add(island);
  const grassGeo = new THREE.CylinderGeometry(9.2, 8.7, 1.5, 18, 1);
  island.add(mesh(grassGeo, 0x47d873, { ink: 1.02 }));
  const lip = mesh(new THREE.CylinderGeometry(8.9, 8.2, 0.9, 18), 0x2fb95b, { ink: 0 }); lip.position.y = -1.1; island.add(lip);
  const rockGeo = new THREE.ConeGeometry(8.4, 10, 18, 4); rockGeo.rotateX(Math.PI);
  { const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 4.9 && y > -4.9) { p.setX(i, p.getX(i) * (0.86 + rnd() * 0.28)); p.setZ(i, p.getZ(i) * (0.86 + rnd() * 0.28)); p.setY(i, y + (rnd() - .5) * 0.8); } } rockGeo.computeVertexNormals(); }
  const rock = mesh(rockGeo, 0x9a6a46, { ink: 1.02 }); rock.position.y = -6.4; island.add(rock);
  const band = mesh(new THREE.CylinderGeometry(7.3, 6.2, 1.2, 18), 0x7a4f34, { ink: 0 }); band.position.y = -3.3; island.add(band);
  // grass drips over the edge
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + rnd() * .2; const d = mesh(new THREE.ConeGeometry(0.55 + rnd() * .35, 1.4 + rnd() * 1.2, 5), 0x2fb95b, { ink: 0 }); d.rotation.x = Math.PI; d.position.set(Math.cos(a) * 8.55, -1.6 - rnd() * .5, Math.sin(a) * 8.55); island.add(d); }
  // trees
  function tree(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, 0.75, z); g.scale.setScalar(s);
    const t = mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.7, 7), 0x7a4b2a); t.position.y = .85; g.add(t);
    const c1 = mesh(new THREE.IcosahedronGeometry(1.25, 0), 0x2fbf5d); c1.position.y = 2.25; g.add(c1);
    const c2 = mesh(new THREE.IcosahedronGeometry(0.95, 0), 0x45d873); c2.position.set(.45, 2.95, .2); g.add(c2);
    const c3 = mesh(new THREE.IcosahedronGeometry(0.8, 0), 0x27a04e); c3.position.set(-.5, 2.85, -.25); g.add(c3);
    island.add(g);
  }
  [[-5.6, -2.5, 1.15], [-3.9, 4.6, .9], [5.4, -3.6, 1.05], [6.1, 2.7, .85], [-6.6, 2.1, .75], [2.4, -6.2, .8], [-1.8, -6.3, .7]].forEach(a => tree(...a));
  // rocks + bushes
  for (const [x, z, s] of [[3.9, 4.9, .7], [-2.9, 2.8, .45], [6.8, -.4, .5], [-7.1, -.8, .55], [1.2, 6.6, .5]]) { const r = mesh(new THREE.DodecahedronGeometry(1, 0), 0x9fb3e6); r.position.set(x, .9, z); r.scale.set(s * 1.3, s, s); r.rotation.y = rnd() * 3; island.add(r); }
  // the podium + the crown + a victory beam
  const pod = new THREE.Group(); island.add(pod); pod.position.y = .75;
  pod.add(mesh(new THREE.CylinderGeometry(1.9, 2.1, .7, 28), 0xffffff, { flat: false }));
  const ringG = mesh(new THREE.TorusGeometry(2.0, .12, 10, 40), 0xffc72a, { ink: 0, flat: false }); ringG.rotation.x = Math.PI / 2; ringG.position.y = .36; pod.add(ringG);
  const pod2 = mesh(new THREE.CylinderGeometry(1.2, 1.3, .55, 28), 0x2a66f2, { flat: false }); pod2.position.y = .6; pod.add(pod2);
  const GOLD = 0xffc72a;
  function crown(scale) {
    const c = new THREE.Group();
    const band = mesh(new THREE.CylinderGeometry(.62, .66, .38, 24, 1, true), GOLD, { ink: 1.06, flat: false }); band.material = band.material.clone(); band.material.side = THREE.DoubleSide; c.add(band);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2;
      const s = mesh(new THREE.ConeGeometry(.17, .5, 10), GOLD, { ink: 1.08 }); s.position.set(Math.sin(a) * .57, .42, Math.cos(a) * .57); c.add(s);
      const b = mesh(new THREE.SphereGeometry(.09, 10, 8), GOLD, { ink: 0, flat: false }); b.position.set(Math.sin(a) * .57, .7, Math.cos(a) * .57); c.add(b);
      const gm = mesh(new THREE.SphereGeometry(.1, 10, 8), 0xff3d6e, { ink: 0, flat: false }); gm.position.set(Math.sin(a) * .66, 0, Math.cos(a) * .66); c.add(gm); }
    c.scale.setScalar(scale); return c;
  }
  const bigCrown = crown(2.1); bigCrown.position.y = 3.4; pod.add(bigCrown);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.1, 16, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 8.4; pod.add(beam);
  // loot chests
  function chest(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, .75, z); g.rotation.y = ry;
    const base = mesh(new THREE.BoxGeometry(1.7, .9, 1.05), 0x9a5b2e); base.position.y = .45; g.add(base);
    const lidG = new THREE.CylinderGeometry(.52, .52, 1.7, 10, 1, false, 0, Math.PI); lidG.rotateZ(Math.PI / 2);
    const lid = mesh(lidG, 0xb06a35); lid.position.y = .9; g.add(lid);
    for (const xx of [-.62, .62]) { const tr = mesh(new THREE.BoxGeometry(.16, .96, 1.1), GOLD, { ink: 0 }); tr.position.set(xx, .46, 0); g.add(tr); }
    const lock = mesh(new THREE.BoxGeometry(.3, .34, .1), GOLD, { ink: 0 }); lock.position.set(0, .82, .55); g.add(lock);
    island.add(g); return g;
  }
  chest(3.4, 1.4, -.6); chest(-3.2, -2.9, .9);
  // flag
  { const pole = mesh(new THREE.CylinderGeometry(.07, .07, 4.2, 6), 0xffffff, { ink: 1.3 }); pole.position.set(-1.6, 2.8, 4.2); island.add(pole);
    const fg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.8, -.45, 0), new THREE.Vector3(0, -.95, 0)]); fg.computeVertexNormals();
    const flag = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: GOLD, side: THREE.DoubleSide })); flag.position.set(-1.6, 4.85, 4.2); island.add(flag); island.userData.flag = flag; }

  // ---------- things in the air ----------
  const air = new THREE.Group(); scene.add(air);
  const coins = [];
  const coinGeo = new THREE.CylinderGeometry(.55, .55, .14, 24);
  for (let i = 0; i < 14; i++) {
    const c = mesh(coinGeo, GOLD, { ink: 1.08, flat: false }); const a = i / 14 * Math.PI * 2, r = 11 + rnd() * 6;
    c.position.set(Math.cos(a) * r, 1 + rnd() * 7, Math.sin(a) * r); c.rotation.x = Math.PI / 2; c.userData = { a, r, y: c.position.y, sp: .6 + rnd() * .8, ph: rnd() * 6 };
    air.add(c); coins.push(c);
  }
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .44 : 1; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: .3, bevelEnabled: true, bevelThickness: .1, bevelSize: .08, bevelSegments: 2 }); starGeo.center();
  const stars = [];
  for (let i = 0; i < 6; i++) { const s = mesh(starGeo, i % 3 ? GOLD : 0xffffff, { ink: 1.08 }); const a = rnd() * Math.PI * 2, r = 13 + rnd() * 7; s.position.set(Math.cos(a) * r, 2 + rnd() * 7, Math.sin(a) * r); s.scale.setScalar(.7 + rnd() * .5); s.userData = { sp: .5 + rnd(), y: s.position.y, ph: rnd() * 6 }; air.add(s); stars.push(s); }
  const crowns = [];
  for (let i = 0; i < 3; i++) { const c = crown(.9 + rnd() * .4); const a = i / 3 * Math.PI * 2 + .6, r = 15; c.position.set(Math.cos(a) * r, 4 + rnd() * 4, Math.sin(a) * r); c.userData = { y: c.position.y, ph: rnd() * 6 }; air.add(c); crowns.push(c); }
  // players gliding down under canopies
  const HOOD = [0x8f5cff, 0xff7a2f, 0x2f6bff, 0xff4f7e, 0x1fbf86];
  const gliders = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const can = mesh(new THREE.SphereGeometry(1.25, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), i % 2 ? GOLD : 0xffffff, { ink: 1.05 }); can.scale.y = .6; can.position.y = 2.2; g.add(can);
    const body = mesh(new THREE.CapsuleGeometry(.28, .5, 4, 10), HOOD[i % HOOD.length]); body.position.y = .2; g.add(body);
    const head = mesh(new THREE.SphereGeometry(.27, 12, 10), 0xf3c39e, { flat: false }); head.position.y = .82; g.add(head);
    for (const [x, z] of [[-.9, 0], [.9, 0], [0, -.9], [0, .9]]) { const ln = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.7, 4), INK); ln.position.set(x * .55, 1.5, z * .55); ln.rotation.z = -x * .45; ln.rotation.x = z * .45; g.add(ln); }
    g.userData = { t: i / 4, side: i % 2 ? 1 : -1, x: 12 + rnd() * 7, z: -6 + rnd() * 10, sp: 1 / (18 + rnd() * 8), ph: rnd() * 6 };
    scene.add(g); gliders.push(g);
  }
  // clouds
  const clouds = new THREE.Group(); scene.add(clouds);
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group(); const n = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) { const b = mesh(new THREE.IcosahedronGeometry(1.4 + rnd() * 1.2, 1), 0xffffff, { ink: 0 }); b.position.set((k - n / 2) * 1.5, rnd() * .8, rnd() * 1.2); b.scale.y = .72; c.add(b); }
    const a = i / 14 * Math.PI * 2 + rnd() * .4, r = 30 + rnd() * 26; c.position.set(Math.cos(a) * r, -14 + rnd() * 9, Math.sin(a) * r); c.scale.setScalar(1.6 + rnd() * 1.6); c.lookAt(0, c.position.y, 0);
    clouds.add(c);
  }

  // ---------- the storm wall: closes in as payday nears ----------
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 256; const sx = sc.getContext('2d');
  const gr = sx.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(170,120,255,0)'); gr.addColorStop(.45, 'rgba(150,90,255,.55)'); gr.addColorStop(1, 'rgba(100,40,220,.9)');
  sx.fillStyle = gr; sx.fillRect(0, 0, 256, 256);
  sx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) { sx.fillStyle = `rgba(255,255,255,${.04 + Math.random() * .08})`; const x = Math.random() * 256; sx.fillRect(x, 0, 2 + Math.random() * 6, 256); }
  const stormTex = new THREE.CanvasTexture(sc); stormTex.wrapS = THREE.RepeatWrapping; stormTex.repeat.set(10, 1); stormTex.colorSpace = THREE.SRGBColorSpace;
  const storm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 26, 128, 1, true), new THREE.MeshBasicMaterial({ map: stormTex, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  storm.position.y = -9; scene.add(storm);
  const dayLeft = () => { const n = Date.now(); return (Math.ceil((n + 1) / 864e5) * 864e5 - n) / 864e5; };

  // ---------- camera + loop ----------
  let W = 0, H = 0, dist = 34, px = 0, py = 0, tx = 0, ty = 0, running = false, visible = true, last = performance.now(), t = 0;
  function size() {
    const r = hero.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false); cam.aspect = W / H;
    const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect);
    dist = Math.max(42, 10.5 / Math.tan(hf)); cam.updateProjectionMatrix();
  }
  addEventListener('resize', size); size();
  addEventListener('pointermove', e => { px = e.clientX / innerWidth - .5; py = e.clientY / innerHeight - .5; }, { passive: true });
  function frame(now) {
    const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = Math.max(last, now); t += dt;
    tx += (px - tx) * .04; ty += (py - ty) * .04;
    const a = Math.sin(t * .06) * .35 + tx * .5;
    cam.position.set(Math.sin(a) * dist, 12.5 + ty * -2.5 + Math.sin(t * .2) * .3, Math.cos(a) * dist);
    cam.lookAt(0, 7.2, 0);
    island.rotation.y += dt * .05; island.position.y = Math.sin(t * .7) * .25;
    bigCrown.rotation.y += dt * .8; bigCrown.position.y = 3.4 + Math.sin(t * 1.6) * .25;
    beam.material.opacity = .13 + Math.sin(t * 2.2) * .04;
    if (island.userData.flag) island.userData.flag.rotation.y = Math.sin(t * 3) * .25;
    for (const c of coins) { const u = c.userData; c.rotation.z += dt * u.sp * 2; c.position.y = u.y + Math.sin(t * u.sp + u.ph) * .6; }
    for (const s of stars) { const u = s.userData; s.rotation.y += dt * u.sp; s.rotation.z = Math.sin(t + u.ph) * .3; s.position.y = u.y + Math.sin(t * .8 + u.ph) * .5; }
    for (const c of crowns) { const u = c.userData; c.rotation.y += dt * .6; c.position.y = u.y + Math.sin(t * .9 + u.ph) * .5; }
    air.rotation.y += dt * .025; clouds.rotation.y += dt * .008;
    // gliders drift down on the left and right of the island, never across the logo
    const sideDir = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    for (const g of gliders) { const u = g.userData; u.t = ((u.t + dt * u.sp) % 1 + 1) % 1; const yy = 15 - u.t * 14;
      const off = u.side * (u.x - u.t * 3);
      g.position.set(sideDir.x * off + Math.sin(a) * u.z, yy, sideDir.z * off + Math.cos(a) * u.z);
      g.rotation.z = Math.sin(t * 1.4 + u.ph) * .12; g.rotation.y = a + Math.sin(t * .5 + u.ph) * .4;
      g.scale.setScalar(Math.max(.001, Math.min(1, (1 - u.t) * 6, u.t * 12))); }
    const R = 95 + 55 * dayLeft();
    storm.scale.set(R, 1, R); stormTex.offset.x = (stormTex.offset.x + dt * .01) % 1;
    renderer.render(scene, cam);
    if (running) requestAnimationFrame(frame);
  }
  function play() { if (running || RM) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  function stop() { running = false; }
  const sync = () => (visible && !document.hidden ? play() : stop());
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; sync(); }, { threshold: .01 }).observe(hero);
  document.addEventListener('visibilitychange', sync);
  if (RM) { frame(performance.now()); } else play();
  cv.classList.add('on');
}
