// DUB block run: draws a run in 3D and turns keys and swipes into moves. The rules, the course and the score live in
// arena-core.js (the same code the server replays), so this file never decides anything that counts.
import * as THREE from './vendor/three.module.min.js';
const AC = window.DUBA;

/* ---------------- the atlas: our own 16x16 pixel tiles ---------------- */
const TS = 16, AW = 8, TILES = {};
let atlasTex = null;
function atlas() {
  if (atlasTex) return atlasTex;
  const names = ['grass_top', 'grass_side', 'dirt', 'stone', 'cobble', 'sand', 'sandstone', 'snow', 'snow_side', 'ice', 'log_side', 'log_top', 'leaves', 'planks', 'path', 'water',
    'lava', 'magma', 'glow', 'gold_block', 'brick', 'boom_side', 'boom_top', 'hay_side', 'hay_top', 'cactus_side', 'cactus_top', 'ore_gold', 'ore_emerald', 'ore_diamond', 'obsidian', 'crate',
    'dub', 'gem1', 'gem2', 'gem3', 'flower_r', 'flower_y', 'tuft', 'tuft_dry', 'sand_path', 'snow_path', 'magma_path', 'curb', 'pine', 'purple', 'curb_sand', 'curb_snow', 'curb_storm'];
  const c = document.createElement('canvas'); c.width = c.height = TS * AW; const x = c.getContext('2d');
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  names.forEach((n, i) => {
    TILES[n] = i; const ox = (i % AW) * TS, oy = Math.floor(i / AW) * TS;
    const px = (X, Y, col) => { if (X < 0 || Y < 0 || X >= TS || Y >= TS) return; x.fillStyle = col; x.fillRect(ox + X, oy + Y, 1, 1); };
    const fill = (cols, w) => { for (let Y = 0; Y < TS; Y++) for (let X = 0; X < TS; X++) { let k = 0, t = r() * (w ? w.reduce((a, b) => a + b) : cols.length); if (w) { while (t > w[k]) t -= w[k++]; } else k = Math.floor(t); px(X, Y, cols[Math.min(k, cols.length - 1)]); } };
    const speck = (cols, n, sz = 1) => { for (let k = 0; k < n; k++) { const X = Math.floor(r() * TS), Y = Math.floor(r() * TS), col = cols[Math.floor(r() * cols.length)]; for (let a = 0; a < sz; a++) for (let b = 0; b < sz; b++) if (r() < .8) px(X + a, Y + b, col); } };
    const border = (col, w = 1) => { for (let k = 0; k < TS; k++) for (let j = 0; j < w; j++) { px(k, j, col); px(k, TS - 1 - j, col); px(j, k, col); px(TS - 1 - j, k, col); } };
    const G = ['#5bd44a', '#4fc63f', '#68de56', '#55cd45'], DIRT = ['#8a5a36', '#7b4f2f', '#946440', '#6f4529'], STONE = ['#8d93a3', '#7f8595', '#9aa0af', '#868c9b'];
    switch (n) {
      case 'grass_top': fill(G, [4, 3, 2, 3]); speck(['#7be86a', '#3fae33'], 10); break;
      case 'grass_side': fill(DIRT); for (let X = 0; X < TS; X++) { const d = 3 + Math.floor(r() * 3); for (let Y = 0; Y < d; Y++) px(X, Y, G[Math.floor(r() * 4)]); } break;
      case 'dirt': fill(DIRT); speck(['#5d3a22', '#a5734c'], 12); break;
      case 'stone': fill(STONE); speck(['#6d7383', '#a9aebb'], 14, 2); break;
      case 'cobble': fill(['#7b8191', '#8d93a3', '#6c7282']); for (let k = 0; k < 9; k++) { const X = Math.floor(r() * 13), Y = Math.floor(r() * 13), w = 3 + Math.floor(r() * 3); for (let a = 0; a < w; a++) { px(X + a, Y, '#5a6070'); px(X, Y + a, '#5a6070'); px(X + a, Y + w, '#a3a9b8'); } } break;
      case 'sand': fill(['#f2dc93', '#ead186', '#f6e3a3', '#e5cb7c']); speck(['#d9bd6c'], 10); break;
      case 'sandstone': fill(['#e8cf86', '#efd893', '#dfc47a']); for (const Y of [3, 4, 11]) for (let X = 0; X < TS; X++) px(X, Y, Y === 4 ? '#c9ad62' : '#d6bb70'); break;
      case 'snow': fill(['#ffffff', '#f2f8ff', '#e8f2ff']); speck(['#d9e9fb'], 8); break;
      case 'snow_side': fill(DIRT); for (let X = 0; X < TS; X++) { const d = 4 + Math.floor(r() * 3); for (let Y = 0; Y < d; Y++) px(X, Y, ['#ffffff', '#eef6ff'][Math.floor(r() * 2)]); } break;
      case 'ice': fill(['#a9dcff', '#9bd3fb', '#b7e4ff']); for (let k = 0; k < 3; k++) { const s0 = Math.floor(r() * TS); for (let a = 0; a < 7; a++) px(s0 + a, a + k * 5, '#e8f7ff'); } break;
      case 'log_side': for (let X = 0; X < TS; X++) { const col = ['#6b4527', '#7a5130', '#5c3a20'][X % 3 === 0 ? 2 : Math.floor(r() * 2)]; for (let Y = 0; Y < TS; Y++) px(X, Y, r() < .1 ? '#4a2e18' : col); } break;
      case 'log_top': fill(['#b4884f']); for (let k = 2; k < 8; k += 2) for (let a = k; a < TS - k; a++) { px(a, k, '#9c7240'); px(a, TS - 1 - k, '#9c7240'); px(k, a, '#9c7240'); px(TS - 1 - k, a, '#9c7240'); } border('#6b4527'); break;
      case 'leaves': fill(['#2f9e3c', '#36ad44', '#278a33', '#3fbf4d']); speck(['#1d6e28'], 18); break;
      case 'planks': fill(['#b98a52', '#c29459', '#ad7f49']); for (const Y of [3, 7, 11, 15]) for (let X = 0; X < TS; X++) px(X, Y, '#8a6236'); for (const [X, Y0] of [[5, 0], [11, 4], [3, 8], [9, 12]]) for (let Y = Y0; Y < Y0 + 3; Y++) px(X, Y, '#8a6236'); break;
      case 'path': fill(['#c9b48a', '#bda67b', '#d3c096', '#b29b70']); speck(['#9e8a63', '#e0d0aa'], 14); break;
      case 'water': fill(['#2f7df2', '#3a8af7', '#2a6fe0']); for (let k = 0; k < 6; k++) { const X = Math.floor(r() * 12), Y = Math.floor(r() * TS); for (let a = 0; a < 4; a++) px(X + a, Y, '#7fb8ff'); } break;
      case 'lava': fill(['#ff7a1f', '#ff9a2a', '#ff6a12']); speck(['#ffd04a', '#fff08a'], 16, 2); speck(['#c43d0a'], 8); break;
      case 'magma': fill(['#5c1f2e', '#4d1826', '#6b2535']); for (let k = 0; k < 5; k++) { let X = Math.floor(r() * TS), Y = Math.floor(r() * TS); for (let a = 0; a < 6; a++) { px(X, Y, a % 2 ? '#ff7a1f' : '#ff4f2a'); X += Math.floor(r() * 3) - 1; Y += 1; } } break;
      case 'glow': fill(['#ffd84a', '#ffc72a', '#ffe680']); speck(['#ff9a2a', '#fff6c2'], 12, 2); break;
      case 'gold_block': fill(['#ffc72a', '#ffcf3f', '#f2b81f']); border('#c98d00'); for (let k = 1; k < 7; k++) px(k, 1, '#fff0a8'), px(1, k, '#fff0a8'); break;
      case 'brick': fill(['#b5523b']); for (let Y = 0; Y < TS; Y += 4) { for (let X = 0; X < TS; X++) px(X, Y, '#d8cfc4'); const o = (Y / 4) % 2 ? 4 : 0; for (let X = o; X < TS; X += 8) for (let a = 0; a < 4; a++) px(X, Y + a, '#d8cfc4'); } break;
      case 'boom_side': fill(['#e8402f', '#d93626']); for (let X = 0; X < TS; X++) for (let Y = 6; Y < 10; Y++) px(X, Y, Y === 6 || Y === 9 ? '#2b1d1d' : '#f4f1ea'); for (let X = 1; X < TS; X += 3) for (let Y = 7; Y < 9; Y++) px(X, Y, '#2b1d1d'); break;
      case 'boom_top': fill(['#e8402f', '#d93626']); for (let a = 5; a < 11; a++) for (let b = 5; b < 11; b++) px(a, b, (a - 8) ** 2 + (b - 8) ** 2 < 8 ? '#2b1d1d' : '#e8402f'); px(8, 8, '#ffd04a'); break;
      case 'hay_side': fill(['#e8c041', '#dcb032', '#f0cb52']); for (const Y of [3, 12]) for (let X = 0; X < TS; X++) px(X, Y, '#a3401f'), px(X, Y + 1, '#c4532a'); break;
      case 'hay_top': fill(['#e8c041', '#dcb032', '#f0cb52']); speck(['#c79a22'], 20); break;
      case 'cactus_side': fill(['#3c9a3a', '#47ab42', '#358a32']); for (const X of [2, 7, 12]) for (let Y = 0; Y < TS; Y++) px(X, Y, '#2a7428'); speck(['#f4f1d0'], 6); break;
      case 'cactus_top': fill(['#47ab42']); border('#2a7428'); break;
      case 'ore_gold': case 'ore_emerald': case 'ore_diamond': fill(STONE); speck({ ore_gold: ['#ffc72a', '#ffe07a'], ore_emerald: ['#2edc78', '#7cf2ae'], ore_diamond: ['#6ee6ff', '#c2f6ff'] }[n], 7, 2); break;
      case 'obsidian': fill(['#1e1430', '#25183c', '#170f26']); speck(['#5a3d8f', '#3b2766'], 12); break;
      case 'crate': fill(['#b98a52', '#c29459']); border('#6b4527', 2); for (let k = 2; k < 14; k++) px(k, k, '#6b4527'), px(k + 1, k, '#8a6236'); break;
      case 'dub': fill(['#8f5cff', '#8452f5']); border('#ffc72a', 2); for (let y = 4; y < 12; y++) { px(5, y, '#fff'); px(6, y, '#fff'); } for (let X = 5; X < 9; X++) { px(X, 4, '#fff'); px(X, 11, '#fff'); } px(9, 5, '#fff'); px(9, 10, '#fff'); for (let y = 6; y < 10; y++) { px(10, y, '#fff'); px(9, y, '#fff'); } px(8, 5, '#fff'); px(8, 10, '#fff'); break;
      case 'gem1': fill(['#ffc72a', '#ffd84a']); border('#c98d00'); for (let k = 2; k < 8; k++) px(k, 2, '#fff6c2'), px(2, k, '#fff6c2'); break;
      case 'gem2': fill(['#2edc78', '#25c86a']); border('#11904a'); for (let k = 3; k < 9; k++) px(k, 3, '#b8fbd6'); break;
      case 'gem3': fill(['#6ee6ff', '#57d6f5']); border('#1d9cc4'); for (let k = 2; k < 9; k++) px(k, 2, '#ffffff'), px(2, k, '#e8fdff'); break;
      case 'flower_r': case 'flower_y': for (let Y = 8; Y < TS; Y++) px(7, Y, '#3fae33'); px(6, 11, '#3fae33'); px(8, 13, '#3fae33'); { const col = n === 'flower_r' ? '#ff4f7e' : '#ffd84a'; for (const [a, b] of [[7, 4], [6, 5], [8, 5], [7, 6], [6, 6], [8, 6], [7, 5]]) px(a, b, col); px(7, 5, '#fff6c2'); } break;
      case 'tuft': case 'tuft_dry': { const col = n === 'tuft' ? ['#4fc63f', '#68de56'] : ['#c9a65a', '#b08f45']; for (let k = 0; k < 7; k++) { const X = 2 + Math.floor(r() * 12), h = 4 + Math.floor(r() * 7); for (let Y = TS - h; Y < TS; Y++) px(X, Y, col[k % 2]); } } break;
      case 'sand_path': fill(['#e5c98a', '#dbbd7d', '#ecd398']); speck(['#c4a463'], 14); break;
      case 'snow_path': fill(['#dfeaf7', '#d2e0f0', '#e9f1fb']); speck(['#b9cbe0'], 14); break;
      case 'magma_path': fill(['#3a1a2c', '#432033', '#311525']); speck(['#ff7a1f', '#8f5cff'], 6); break;
      case 'curb': fill(['#9aa0af', '#8d93a3']); for (let X = 0; X < TS; X++) px(X, 0, '#c4c8d3'), px(X, 15, '#6d7383'); for (const X of [0, 8]) for (let Y = 0; Y < TS; Y++) px(X, Y, '#6d7383'); break;
      case 'pine': fill(['#1f6b45', '#247a4f', '#1a5c3b']); speck(['#e8f2ff'], 16, 2); break;
      case 'purple': fill(['#8f5cff', '#7d49f0', '#9a6bff']); speck(['#b18cff'], 10); break;
      case 'curb_sand': fill(['#e8cf86', '#dfc47a']); for (let X = 0; X < TS; X++) px(X, 0, '#f6e3a3'), px(X, 15, '#c9ad62'); for (const X of [0, 8]) for (let Y = 0; Y < TS; Y++) px(X, Y, '#c9ad62'); break;
      case 'curb_snow': fill(['#f2f8ff', '#e3eefb']); for (let X = 0; X < TS; X++) px(X, 0, '#ffffff'), px(X, 15, '#b9cbe0'); for (const X of [0, 8]) for (let Y = 0; Y < TS; Y++) px(X, Y, '#b9cbe0'); break;
      case 'curb_storm': fill(['#3b2766', '#33205a']); for (let X = 0; X < TS; X++) px(X, 0, '#8f5cff'), px(X, 15, '#1e1430'); for (const X of [0, 8]) for (let Y = 0; Y < TS; Y++) px(X, Y, '#1e1430'); speck(['#ffc72a'], 3); break;
    }
  });
  atlasTex = new THREE.CanvasTexture(c); atlasTex.magFilter = atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false; atlasTex.colorSpace = THREE.SRGBColorSpace;
  return atlasTex;
}
const uvOf = name => { const i = TILES[name], e = .02 / (TS * AW); const u0 = (i % AW) / AW + e, v1 = 1 - Math.floor(i / AW) / AW - e; return [u0, v1 - 1 / AW + 2 * e, u0 + 1 / AW - 2 * e, v1]; };

/* ---------------- blocks and biomes ---------------- */
const B = {}; const BL = [null];
function blk(name, top, side, bottom = side) { B[name] = BL.length; BL.push({ name, top, side, bottom }); }
blk('grass', 'grass_top', 'grass_side', 'dirt'); blk('dirt', 'dirt', 'dirt'); blk('stone', 'stone', 'stone'); blk('sand', 'sand', 'sand'); blk('sandstone', 'sandstone', 'sandstone');
blk('snow', 'snow', 'snow_side', 'dirt'); blk('ice', 'ice', 'ice'); blk('log', 'log_top', 'log_side'); blk('leaves', 'leaves', 'leaves'); blk('path', 'path', 'path');
blk('curb', 'curb', 'curb'); blk('cobble', 'cobble', 'cobble'); blk('crate', 'crate', 'crate'); blk('hay', 'hay_top', 'hay_side'); blk('boom', 'boom_top', 'boom_side');
blk('water', 'water', 'water'); blk('lava', 'lava', 'lava'); blk('magma', 'magma', 'magma'); blk('obsidian', 'obsidian', 'obsidian'); blk('glow', 'glow', 'glow');
blk('cactus', 'cactus_top', 'cactus_side'); blk('sand_path', 'sand_path', 'sand_path'); blk('snow_path', 'snow_path', 'snow_path'); blk('magma_path', 'magma_path', 'magma_path');
blk('gold', 'gold_block', 'gold_block'); blk('dub', 'dub', 'dub'); blk('planks', 'planks', 'planks'); blk('brick', 'brick', 'brick'); blk('ore_gold', 'ore_gold', 'ore_gold');
blk('ore_emerald', 'ore_emerald', 'ore_emerald'); blk('ore_diamond', 'ore_diamond', 'ore_diamond'); blk('pine', 'pine', 'pine'); blk('purple', 'purple', 'purple');
blk('curb_sand', 'curb_sand', 'curb_sand'); blk('curb_snow', 'curb_snow', 'curb_snow'); blk('curb_storm', 'curb_storm', 'curb_storm');
const BIOMES = [
  { name: 'Grasslands', sky: 0x6fb6ff, fog: 0xa8d8ff, top: 'grass', under: 'dirt', path: 'path', curb: 'curb', wall: 'cobble', walls: ['cobble', 'brick', 'cobble'], blocks: ['crate', 'hay', 'boom'], beam: 'log', pit: 'water', tree: 'oak', deco: ['flower_r', 'flower_y', 'tuft', 'tuft'] },
  { name: 'Desert', sky: 0x8ccfff, fog: 0xffe2b0, top: 'sand', under: 'sandstone', path: 'sand_path', curb: 'curb_sand', wall: 'sandstone', walls: ['sandstone', 'sandstone', 'brick'], blocks: ['crate', 'boom', 'hay'], beam: 'planks', pit: 'lava', tree: 'cactus', deco: ['tuft_dry'] },
  { name: 'Snowpeak', sky: 0x9fd4ff, fog: 0xe4f2ff, top: 'snow', under: 'dirt', path: 'snow_path', curb: 'curb_snow', wall: 'ice', walls: ['ice', 'stone', 'ice'], blocks: ['crate', 'boom'], beam: 'log', pit: 'water', tree: 'pine', deco: [] },
  { name: 'The Storm', sky: 0x4a1f8a, fog: 0x7b45d6, top: 'magma', under: 'obsidian', path: 'magma_path', curb: 'curb_storm', wall: 'obsidian', walls: ['obsidian', 'purple', 'obsidian'], blocks: ['boom', 'crate'], beam: 'log', pit: 'lava', tree: 'glow', deco: [] },
];
const BIOME_LEN = 320;
const biomeOf = r => BIOMES[Math.floor(Math.max(0, r) / BIOME_LEN) % BIOMES.length];

/* ---------------- the run ---------------- */
export function create({ canvas, seed, onHud, onEvent, onEnd }) {
  const run = AC.Run(seed), s = run.s, T = run.T;
  const vseed = parseInt(seed.slice(0, 8), 16) | 0;
  const hash = (a, b, c = 0) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647) + vseed) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, z, sc) => { const X = Math.floor(x / sc), Z = Math.floor(z / sc), fx = x / sc - X, fz = z / sc - Z, a = hash(X, Z, 9), b = hash(X + 1, Z, 9), c = hash(X, Z + 1, 9), d = hash(X + 1, Z + 1, 9), u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Math.min(innerWidth, innerHeight) < 700 ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const sky = new THREE.Color(BIOMES[0].sky), fogC = new THREE.Color(BIOMES[0].fog);
  scene.background = sky; scene.fog = new THREE.Fog(fogC, 38, 96);
  const cam = new THREE.PerspectiveCamera(66, 1, .1, 240);
  const tex = atlas();
  const MAT = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true });
  const DECAL = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: .5, side: THREE.DoubleSide });

  /* ---- chunks: 16 rows of world, one merged mesh each ---- */
  const CH = 16, X0 = -18, XW = 36, Y0 = -4, YH = 18, ZP = 3;
  const chunks = new Map();
  const laneCols = l => { const cx = -2 * l; return [cx - 1, cx]; };
  function terrainH(x, r) {
    const d = x < 0 ? -x - 4 : x - 3; // 0 right next to the curb
    const n = vnoise(x + 100, r, 7), m = vnoise(x - 50, r + 300, 19), base = n * 3.4 + m * 4.2 - 2.4;
    return Math.max(0, Math.min(11, Math.floor(d * .32 + base * Math.min(1, d / 5))));
  }
  function buildChunk(ci) {
    const z0 = ci * CH, ZW = CH + ZP * 2, grid = new Uint8Array(XW * YH * ZW), deco = [];
    const id = (x, y, z) => ((z - (z0 - ZP)) * YH + (y - Y0)) * XW + (x - X0);
    const inb = (x, y, z) => x >= X0 && x < X0 + XW && y >= Y0 && y < Y0 + YH && z >= z0 - ZP && z < z0 + CH + ZP;
    const set = (x, y, z, b) => { if (inb(x, y, z)) grid[id(x, y, z)] = b; };
    const get = (x, y, z) => (inb(x, y, z) ? grid[id(x, y, z)] : 0);
    for (let r = z0 - ZP; r < z0 + CH + ZP; r++) {
      const bi = biomeOf(r);
      // the track: three lanes of path, a curb on each side, obstacles from the real course
      for (let x = -3; x <= 2; x++) { set(x, -1, r, B[bi.path]); set(x, -2, r, B[bi.under]); set(x, -3, r, B.stone); set(x, -4, r, B.stone); }
      for (const x of [-4, 3]) { for (let y = -4; y <= 0; y++) set(x, y, r, y === 0 ? B[bi.curb] : B.stone); }
      if (r >= 0) for (let l = -1; l <= 1; l++) {
        const c = T.cell(l, r), cols = laneCols(l), hv = hash(r, l, 5);
        if (c === AC.WALL) { const wb = B[bi.walls[Math.floor(hv * bi.walls.length)]]; for (const x of cols) for (let y = 0; y < 3; y++) set(x, y, r, y === 2 && hv > .7 ? B.dub : wb); }
        else if (c === AC.BLOCK) { const bb = B[bi.blocks[Math.floor(hv * bi.blocks.length)]]; for (const x of cols) set(x, 0, r, bb); }
        else if (c === AC.BEAM) { for (const x of cols) { set(x, 1, r, B[bi.beam]); set(x, 2, r, B[bi.beam]); } }
        else if (c === AC.GAP) { for (const x of cols) { set(x, -1, r, 0); set(x, -2, r, B[bi.pit]); } }
      }
      if (r < 0) for (let x = -3; x <= 2; x++) set(x, -1, r, B.dub);
      // the land on both sides
      for (let x = X0; x < X0 + XW; x++) {
        if (x >= -4 && x <= 3) continue;
        const h = terrainH(x, r);
        for (let y = Y0; y < h; y++) set(x, y, r, y === h - 1 ? B[bi.top] : y > h - 4 ? B[bi.under] : (hash(x, y, r) < .04 ? B[['ore_gold', 'ore_emerald', 'ore_diamond'][Math.floor(hash(r, x, y) * 3)]] : B.stone));
        const hv = hash(x, r, 1), far = Math.abs(x) >= 7;
        if (far && hv < .045 && x > X0 + 2 && x < X0 + XW - 3) {   // a tree, a cactus, a pine or a glow pillar
          if (bi.tree === 'oak') { for (let y = h; y < h + 4; y++) set(x, y, r, B.log); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let y = h + 3; y < h + 6; y++) if (Math.abs(a) + Math.abs(b) + (y - h - 3) < 4 && !(a === 0 && b === 0 && y < h + 4)) { if (!get(x + a, y, r + b)) set(x + a, y, r + b, B.leaves); } }
          else if (bi.tree === 'cactus') { const ht = 2 + Math.floor(hash(x, r, 2) * 3); for (let y = h; y < h + ht; y++) set(x, y, r, B.cactus); }
          else if (bi.tree === 'pine') { for (let y = h; y < h + 6; y++) set(x, y, r, B.log); for (let y = h + 2; y < h + 8; y++) { const w = Math.max(0, Math.floor((h + 8 - y) / 2)); for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) if (Math.abs(a) + Math.abs(b) <= w + 1 && !(a === 0 && b === 0 && y < h + 6)) set(x + a, y, r + b, B.pine); } set(x, h + 8, r, B.snow); }
          else { const ht = 3 + Math.floor(hash(x, r, 2) * 5); for (let y = h; y < h + ht; y++) set(x, y, r, y === h + ht - 1 ? B.glow : B.obsidian); }
        } else if (bi.deco.length && hv > .8 && Math.abs(x) >= 5) deco.push([x, h, r, bi.deco[Math.floor(hash(r, x, 3) * bi.deco.length)]]);
        else if (hv > .45 && hv < .452 && Math.abs(x) >= 9) { set(x, h, r, B.gold); }
      }
    }
    // emit faces for the chunk's own rows
    const P = [], N = [], U = [], C = [], idx = [];
    const FACES = [
      { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], sh: .74, t: 'side' }, { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], sh: .74, t: 'side' },
      { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], sh: 1, t: 'top' }, { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], sh: .5, t: 'bottom' },
      { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], sh: .86, t: 'side' }, { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], sh: .9, t: 'side' },
    ];
    const quad = (pts, uv, shade) => { const b = P.length / 3; for (let k = 0; k < 4; k++) { P.push(...pts[k]); C.push(shade[k], shade[k], shade[k]); } U.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    for (let r = z0; r < z0 + CH; r++) for (let y = Y0; y < Y0 + YH; y++) for (let x = X0; x < X0 + XW; x++) {
      const b = get(x, y, r); if (!b) continue; const bd = BL[b];
      for (const f of FACES) {
        const nb = get(x + f.n[0], y + f.n[1], r + f.n[2]);
        if (nb && !(BL[nb].name === 'leaves' && bd.name !== 'leaves') && !(BL[nb].name === 'pine' && bd.name !== 'pine')) continue;
        if (f.n[1] === -1 && y <= Y0 + 1) continue;
        const uv = uvOf(bd[f.t]);
        // a little corner shading: darker where the block sits low in a pit or next to the curb
        const sh = f.sh * (y < -1 ? .8 : 1) * (.96 + hash(x, y, r) * .06);
        quad(f.v.map(([a, bb, c]) => [x + a, y + bb, r + c]), uv, [sh, sh, sh, sh]);
      }
    }
    // flowers and grass: two crossed quads each
    for (const [x, y, r, tile] of deco) {
      if (r < z0 || r >= z0 + CH) continue;
      const uv = uvOf(tile), cx = x + .5, cz = r + .5, d = .42;
      quad([[cx - d, y, cz - d], [cx + d, y, cz + d], [cx + d, y + .85, cz + d], [cx - d, y + .85, cz - d]], uv, [1, 1, 1, 1]);
      quad([[cx - d, y, cz + d], [cx + d, y, cz - d], [cx + d, y + .85, cz - d], [cx - d, y + .85, cz + d]], uv, [1, 1, 1, 1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, DECAL); m.frustumCulled = true; g.computeBoundingSphere();
    scene.add(m); chunks.set(ci, m);
  }
  function syncChunks(z, budget) {
    const lo = Math.floor((z - 10) / CH), hi = Math.floor((z + 100) / CH);
    for (const [ci, m] of chunks) if (ci < lo - 1) { scene.remove(m); m.geometry.dispose(); chunks.delete(ci); }
    let built = 0;
    for (let ci = lo; ci <= hi && built < budget; ci++) if (!chunks.has(ci)) { buildChunk(ci); built++; }
  }

  /* ---- gems ---- */
  const gemGeo = [null, 1, 2, 3].map(t => { if (!t) return null; const g = new THREE.BoxGeometry(.5, .5, .5); const uv = uvOf('gem' + t), a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) ? uv[2] : uv[0], a.getY(i) ? uv[3] : uv[1]); return g; });
  const GEMMAT = new THREE.MeshBasicMaterial({ map: tex });
  const gems = new Map();
  function syncGems(z) {
    const r0 = Math.floor(z) - 2, r1 = Math.floor(z) + 72;
    for (const [k, m] of gems) { const r = m.userData.r; if (r < r0 || !T.gem(m.userData.l, r)) { scene.remove(m); gems.delete(k); } }
    for (let r = Math.max(0, r0); r <= r1; r++) for (let l = -1; l <= 1; l++) {
      const g = T.gem(l, r); if (!g) continue; const k = r * 3 + l + 1; if (gems.has(k)) continue;
      const t = g >> 1, high = g & 1, m = new THREE.Mesh(gemGeo[t], GEMMAT);
      m.position.set(-2 * l, high ? 2.2 : .75, r + .5); m.rotation.set(.6, 0, .6); m.scale.setScalar(t === 3 ? 1.25 : t === 2 ? 1.1 : 1);
      m.userData = { r, l, high, t, y: m.position.y }; scene.add(m); gems.set(k, m);
    }
  }

  /* ---- the runner: our own blocky player in DUB colours ---- */
  function boxGeo(w, h, d, col, sh = [1, .78, .9, .62]) {
    const g = new THREE.BoxGeometry(w, h, d), n = g.attributes.normal, c = [], cc = new THREE.Color(col);
    for (let i = 0; i < n.count; i++) { const k = n.getY(i) > .5 ? sh[0] : n.getY(i) < -.5 ? sh[3] : Math.abs(n.getX(i)) > .5 ? sh[1] : sh[2]; c.push(cc.r * k, cc.g * k, cc.b * k); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g;
  }
  const PM = new THREE.MeshBasicMaterial({ vertexColors: true });
  const part = (w, h, d, col, x, y, z, pivotY = 0) => { const g = new THREE.Group(), m = new THREE.Mesh(boxGeo(w, h, d, col), PM); m.position.y = -pivotY; g.add(m); g.position.set(x, y, z); return g; };
  const hero = new THREE.Group(), body = new THREE.Group(); hero.add(body); scene.add(hero);
  const torso = part(.56, .72, .32, 0x2f6bff, 0, 1.16, 0); body.add(torso);
  const pocket = part(.4, .16, .02, 0x2557d6, 0, .98, .17); body.add(pocket);
  const head = part(.5, .5, .5, 0xf3c39e, 0, 1.8, 0); body.add(head);
  const hair = part(.54, .16, .54, 0x5a3a22, 0, 2.06, -.01); body.add(hair);
  const cap = part(.52, .12, .3, 0xffc72a, 0, 2.08, -.14); body.add(cap);
  const set1 = part(.08, .3, .3, 0x13256e, -.29, 1.82, 0), set2 = part(.08, .3, .3, 0x13256e, .29, 1.82, 0); body.add(set1, set2);
  const eyeL = part(.08, .08, .02, 0x0b1440, -.11, 1.82, .26), eyeR = part(.08, .08, .02, 0x0b1440, .11, 1.82, .26); body.add(eyeL, eyeR);
  const armL = part(.2, .66, .2, 0x2f6bff, -.39, 1.5, 0, .3), armR = part(.2, .66, .2, 0x2f6bff, .39, 1.5, 0, .3); body.add(armL, armR);
  const handL = part(.18, .14, .18, 0xf3c39e, 0, -.66, 0); armL.add(handL); const handR = part(.18, .14, .18, 0xf3c39e, 0, -.66, 0); armR.add(handR);
  const legL = part(.24, .72, .26, 0x23263a, -.14, .8, 0, .36), legR = part(.24, .72, .26, 0x23263a, .14, .8, 0, .36); body.add(legL, legR);
  const shoeL = part(.26, .14, .32, 0xffffff, 0, -.72, .03); legL.add(shoeL); const shoeR = part(.26, .14, .32, 0xffffff, 0, -.72, .03); legR.add(shoeR);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  /* ---- particles ---- */
  const PN = 260, pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.14, .14, .14), new THREE.MeshBasicMaterial({ color: 0xffffff }), PN);
  pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); pmesh.frustumCulled = false; scene.add(pmesh);
  const parts = Array.from({ length: PN }, () => ({ life: 0 })); let pi = 0;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < PN; i++) { m4.makeScale(0, 0, 0); pmesh.setMatrixAt(i, m4); pmesh.setColorAt(i, col.set(0xffffff)); }
  function burst(x, y, z, colors, n, sp = 4, up = 3) {
    for (let k = 0; k < n; k++) { const p = parts[pi = (pi + 1) % PN]; const a = Math.random() * Math.PI * 2;
      Object.assign(p, { x, y, z, vx: Math.cos(a) * sp * (.3 + Math.random()), vy: up * (.4 + Math.random()), vz: Math.sin(a) * sp * (.3 + Math.random()) + 2, life: .55 + Math.random() * .5, age: 0, s: .6 + Math.random() * .9, c: colors[k % colors.length] });
      pmesh.setColorAt(pi, col.set(p.c)); }
    pmesh.instanceColor.needsUpdate = true;
  }

  /* ---- clouds + sun ---- */
  const clouds = new THREE.Group(); scene.add(clouds);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .92, fog: false });
  for (let i = 0; i < 16; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(6 + Math.random() * 10, 1.2, 4 + Math.random() * 6), cloudMat); c.position.set((Math.random() - .5) * 120, 30 + Math.random() * 8, Math.random() * 200); clouds.add(c); }
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false })); scene.add(sun);

  /* ---- input: keys and swipes ---- */
  const queue = [], inputs = []; let dev = null, swipe = null, started = false, ended = false, endAt = 0;
  function press(code, from) { if (!started || s.over) return; if (!dev) dev = from; queue.push(code); }
  const KEYS = { ArrowLeft: 0, KeyA: 0, ArrowRight: 1, KeyD: 1, ArrowUp: 2, KeyW: 2, Space: 2, ArrowDown: 3, KeyS: 3 };
  function onKey(e) { const c = KEYS[e.code]; if (c === undefined) return; e.preventDefault(); if (e.repeat) return; press(c, 'keys'); }
  function onDown(e) { swipe = { x: e.clientX, y: e.clientY, done: false, id: e.pointerId }; }
  function onMove(e) {
    if (!swipe || swipe.done || e.pointerId !== swipe.id) return; const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y, m = Math.max(Math.abs(dx), Math.abs(dy));
    if (m < 22) return; swipe.done = true;
    press(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3), e.pointerType === 'mouse' ? 'mouse' : 'touch');
  }
  function onUp() { swipe = null; }
  addEventListener('keydown', onKey, true); canvas.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);

  /* ---- loop ---- */
  const STEP = 1000 / AC.TPS; let acc = 0, last = 0, raf = 0, t0 = 0, crashT = -1, overT = 0, laneX = 0, shake = 0, lastBiome = -1, mile = 0, lean = 0;
  const camPos = new THREE.Vector3(0, 10, -14), camLook = new THREE.Vector3(0, 1, 8);
  function size() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.fov = cam.aspect < .8 ? 78 : 64; cam.updateProjectionMatrix(); }
  size(); addEventListener('resize', size);
  syncChunks(0, 99); syncGems(0);

  function tickSim() {
    let n = 0;
    while (acc >= STEP && !s.over && n < 12) {
      while (queue.length) { const c = queue.shift(); inputs.push([s.tick, c]); run.input(c); }
      run.step(); acc -= STEP; n++;
    }
    if (n >= 12) acc = Math.min(acc, STEP * 2);
    for (const f of s.fx.splice(0)) {
      if (f.k === 'gem') { burst(-2 * f.lane, f.high ? 2.2 : .8, f.r + .5, [['', '#ffc72a', '#2edc78', '#6ee6ff'][f.type], '#ffffff', ['', '#fff0a8', '#b8fbd6', '#e8fdff'][f.type]], 14, 3, 3); }
      if (f.k === 'land') burst(laneX, .05, s.z / 1000, ['#ffffff', '#d8cfc4'], 6, 2, 1);
      if (f.k === 'crash') { crashT = 0; shake = 1; const bi = biomeOf(f.r || 0); burst(laneX, 1, s.z / 1000 + .6, ['#ffffff', '#ffc72a', '#ff4f7e', '#8a5a36', '#9aa0af'], 46, 6, 5); void bi; }
      if (onEvent) onEvent(f);
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - (last || now)) / 1000; last = now;
    const cd = (now - t0) / AC.COUNTDOWN;
    if (!started && cd >= 1) { started = true; acc = 0; if (onEvent) onEvent({ k: 'go' }); }
    if (started && !s.over) { acc += dt * 1000; tickSim(); }
    if (s.over) overT += dt;
    const alpha = s.over ? 1 : acc / STEP;
    const zf = (s.prevZ + (s.z - s.prevZ) * Math.min(1, alpha)) / 1000;
    // the runner
    const tx = -2 * s.lane; laneX += (tx - laneX) * Math.min(1, dt * 16); lean += ((tx - laneX) * -.18 - lean) * Math.min(1, dt * 10);
    const h = AC.heightAt(s.jumpK) / 1000, sliding = s.slideK > 0, speed = AC.speedAt(s.tick) * AC.TPS / 1000;
    hero.position.set(laneX, h, zf); hero.rotation.z = lean;
    const ph = zf * 2.2;
    if (crashT >= 0) {
      crashT += dt; body.rotation.x = Math.min(Math.PI / 2, crashT * 5); body.position.y = Math.max(-.2, .3 - crashT); hero.position.z = zf - Math.min(.8, crashT * 2);
      armL.rotation.x = armR.rotation.x = -2.4; legL.rotation.x = .4; legR.rotation.x = -.3;
    } else if (s.over) { body.rotation.x = 0; body.position.y = Math.abs(Math.sin(now / 160)) * .25; armL.rotation.x = armR.rotation.x = -2.9; armL.rotation.z = .3; armR.rotation.z = -.3; legL.rotation.x = legR.rotation.x = 0; }
    else if (sliding) { body.rotation.x = -1.15; body.position.y = .35; armL.rotation.x = armR.rotation.x = -2.6; legL.rotation.x = legR.rotation.x = 1.25; }
    else if (s.jumpK > 0) { body.rotation.x = .12; body.position.y = 0; armL.rotation.x = -2.6; armR.rotation.x = -2.3; legL.rotation.x = .8; legR.rotation.x = -.5; }
    else if (!started) { body.rotation.x = 0; body.position.y = Math.abs(Math.sin(now / 300)) * .05; armL.rotation.x = Math.sin(now / 400) * .2; armR.rotation.x = -armL.rotation.x; legL.rotation.x = legR.rotation.x = 0; }
    else { body.rotation.x = .16; body.position.y = Math.abs(Math.sin(ph)) * .1; armL.rotation.x = Math.sin(ph) * 1.1; armR.rotation.x = -Math.sin(ph) * 1.1; legL.rotation.x = -Math.sin(ph) * 1; legR.rotation.x = Math.sin(ph) * 1; }
    shadow.position.set(laneX, .02, zf + .05); shadow.scale.setScalar(1 - Math.min(.5, h * .3)); shadow.material.opacity = .25 - Math.min(.15, h * .08);
    // camera: a swoop in during the countdown, then right behind the runner
    const k = Math.min(1, Math.max(0, cd)), e = 1 - Math.pow(1 - k, 3);
    const want = new THREE.Vector3(laneX * .7, 3.2 + h * .35 - (sliding ? .5 : 0), zf - 5.4), look = new THREE.Vector3(laneX * .85, 1.1 + h * .3, zf + 7);
    if (!started) { want.set(Math.sin(e * 2.4 + .6) * (9 - e * 8.3), 9 - e * 5.8, zf - 2 - e * 3.4); }
    camPos.lerp(want, started ? Math.min(1, dt * 9) : 1); camLook.lerp(look, started ? Math.min(1, dt * 12) : 1);
    if (shake > .01) { camPos.x += (Math.random() - .5) * shake * .6; camPos.y += (Math.random() - .5) * shake * .6; shake *= Math.exp(-dt * 5); }
    cam.position.copy(camPos); cam.lookAt(camLook);
    const fov = (cam.aspect < .8 ? 78 : 64) + Math.min(14, (speed - 9) * 1.2); if (Math.abs(cam.fov - fov) > .05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
    // world around the camera
    syncChunks(zf, 1); syncGems(zf);
    for (const m of gems.values()) { m.rotation.y = now / 400 + m.userData.r; m.position.y = m.userData.y + Math.sin(now / 260 + m.userData.r) * .12; }
    const r = Math.floor(zf), bi = Math.floor(r / BIOME_LEN) % BIOMES.length, into = (r % BIOME_LEN) / BIOME_LEN;
    const b0 = BIOMES[bi], b1 = BIOMES[(bi + 1) % BIOMES.length], mix = Math.max(0, (into - .9) / .1);
    sky.set(b0.sky).lerp(new THREE.Color(b1.sky), mix); fogC.set(b0.fog).lerp(new THREE.Color(b1.fog), mix); scene.fog.color.copy(fogC);
    if (bi !== lastBiome) { if (lastBiome >= 0 && onEvent) onEvent({ k: 'biome', name: b0.name }); lastBiome = bi; }
    const m100 = Math.floor(zf / 100); if (m100 > mile) { mile = m100; if (onEvent) onEvent({ k: 'mile', n: m100 * 100 }); }
    for (const c of clouds.children) { c.position.z -= dt * 1.2; if (c.position.z < zf - 40) c.position.z += 220; }
    clouds.position.z = 0; sun.position.set(-30, 46, zf + 150); sun.lookAt(cam.position);
    // particles
    let any = false;
    for (let i = 0; i < PN; i++) { const p = parts[i]; if (p.life <= 0) continue; any = true; p.age += dt; if (p.age >= p.life) { p.life = 0; m4.makeScale(0, 0, 0); pmesh.setMatrixAt(i, m4); continue; }
      p.vy -= 14 * dt; p.x += p.vx * dt; p.y = Math.max(.05, p.y + p.vy * dt); p.z += p.vz * dt; const sc = p.s * (1 - p.age / p.life);
      e4.set(p.age * 6, p.age * 4, 0); q4.setFromEuler(e4); m4.compose(v3.set(p.x, p.y, p.z), q4, s3.set(sc, sc, sc)); pmesh.setMatrixAt(i, m4); }
    if (any) pmesh.instanceMatrix.needsUpdate = true;
    renderer.render(scene, cam);
    if (onHud) onHud({ started, countdown: started ? 0 : Math.max(0, AC.COUNTDOWN - (now - t0)), score: Math.floor(s.z / 1000) + s.gemPts, dist: Math.floor(s.z / 1000), gems: s.gems, gemPts: s.gemPts, speed, secs: s.tick / AC.TPS, over: s.over, biome: b0.name });
    if (s.over && !ended && overT >= (s.crashed ? 1.3 : .7)) { ended = true; if (onEnd) onEnd(run.result(), inputs.slice(), dev || (matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys')); }
  }
  return {
    start() { t0 = performance.now(); last = 0; raf = requestAnimationFrame(frame); },
    // leaving mid-run ends it right there, with the score it has
    quit() { if (!started) { started = true; } if (s.over) return; queue.length = 0; inputs.push([s.tick, 4]); run.input(4); if (onEvent) onEvent({ k: 'quit' }); },
    result: () => run.result(), inputs: () => inputs.slice(), get over() { return s.over; },
    dispose() {
      cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); canvas.removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); removeEventListener('resize', size);
      for (const m of chunks.values()) m.geometry.dispose(); renderer.dispose();
    },
  };
}
window.DUBRUN = { create };
window.dispatchEvent(new Event('dubrun:ready'));
