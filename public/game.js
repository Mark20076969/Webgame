import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

window.__started = true;
const SEED = 1337, CS = 32, SEG = 40, RAD = 3, CUT = 0.5, GLB = 'survival_models.glb';
const UP = new THREE.Vector3(0, 1, 0);

// ---------- zaj ----------
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, y, o = 4) {
  let s = 0, a = 1, f = 1, t = 0;
  for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); t += a; a *= 0.5; f *= 2; }
  return s / t;
}
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- terep ----------
let _b = 0;   // az utolsó height() hívás sima alapmagassága (a vízszinthez)
function baseSm(x, z) {
  const flat = smooth(4, 14, Math.hypot(x, z));
  const low = 0.9 * fbm(x * 0.05, z * 0.05, 3) * (0.3 + 0.7 * flat) * 1.6;
  const mask = smooth(0.05, 0.45, fbm(x * 0.005 + 200, z * 0.005, 3)) * smooth(40, 90, Math.hypot(x, z));
  const ridge = Math.max(0, 1 - Math.abs(fbm(x * 0.02, z * 0.02, 4)) * 1.6);
  return low + mask * 26 * (0.6 + 0.4 * ridge);
}
// folyó = a nagy léptékű zaj nulla-vonala, patak = a kisebb léptékűé; magas hegyen és a kezdőpont körül nincs
function carveD(x, z, b) {
  const a = Math.abs(fbm(x * .006 + 500, z * .006, 2)), c = Math.abs(fbm(x * .02 - 300, z * .02 + 80, 2));
  const d = Math.max(1.4 * (1 - smooth(.018, .06, a)), .7 * (1 - smooth(.025, .075, c)));
  return d * (1 - smooth(6, 14, b)) * smooth(10, 24, Math.hypot(x, z));
}
function height(x, z) {
  const flat = smooth(4, 14, Math.hypot(x, z)), b = baseSm(x, z); _b = b;
  return b + .25 * fbm(x * .25 + 40, z * .25, 2) * (0.3 + 0.7 * flat) * 1.6 - carveD(x, z, b);
}
const waterY = (x, z) => baseSm(x, z) - .55;
const wet = (x, z) => height(x, z) < waterY(x, z) + .35;
const slope = (x, z) => Math.hypot(height(x + .5, z) - height(x - .5, z), height(x, z + .5) - height(x, z - .5));

const C = {
  grass: new THREE.Color(.16, .32, .08), grass2: new THREE.Color(.26, .40, .11), dry: new THREE.Color(.45, .42, .18),
  rock: new THREE.Color(.36, .34, .31), rock2: new THREE.Color(.50, .48, .45), wet: new THREE.Color(.26, .22, .17)
};
const waterMat = new THREE.MeshLambertMaterial({ color: 0x2f78a8, transparent: true, opacity: 0.75 });
const tc = new THREE.Color();

// ---------- jelenet ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec3e6);
scene.fog = new THREE.Fog(0x9ec3e6, 40, CS * RAD);
const cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.6));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.position.set(50, 80, 30); scene.add(sun);
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });

// ---------- példányosítás ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Matrix4().makeScale(0, 0, 0);
const M = (x, y, z, yaw, s) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, yaw), _s.set(s, s, s));

class Pool {
  constructor(root, cap) {
    this.parts = [];
    root.updateWorldMatrix(true, true);
    const inv = root.matrixWorld.clone().invert();
    root.traverse(o => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, cap);
      im.rel = inv.clone().multiply(o.matrixWorld);
      im.frustumCulled = false;
      for (let i = 0; i < cap; i++) im.setMatrixAt(i, _z);
      this.parts.push(im); scene.add(im);
    });
    this.free = Array.from({ length: cap }, (_, i) => cap - 1 - i);
  }
  set(id, m) { for (const p of this.parts) { p.setMatrixAt(id, _m.multiplyMatrices(m, p.rel)); p.instanceMatrix.needsUpdate = true; } }
  alloc(m) { const id = this.free.pop(); if (id === undefined) return -1; this.set(id, m); return id; }
  release(id) { for (const p of this.parts) { p.setMatrixAt(id, _z); p.instanceMatrix.needsUpdate = true; } this.free.push(id); }
}
const pools = {};

// ---------- bogyók ----------
const BCAP = 3000, RED = new THREE.Color(.8, .05, .05), BLUE = new THREE.Color(.12, .18, .85);
const berryIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshLambertMaterial(), BCAP);
berryIM.frustumCulled = false;
for (let i = 0; i < BCAP; i++) { berryIM.setMatrixAt(i, _z); berryIM.setColorAt(i, RED); }
scene.add(berryIM);
const berryFree = Array.from({ length: BCAP }, (_, i) => BCAP - 1 - i);
function berryAlloc(x, y, z, col) {
  const id = berryFree.pop(); if (id === undefined) return -1;
  berryIM.setMatrixAt(id, M(x, y, z, 0, 1)); berryIM.setColorAt(id, col === 'red' ? RED : BLUE);
  berryIM.instanceMatrix.needsUpdate = true; berryIM.instanceColor.needsUpdate = true; return id;
}
function berryRelease(id) { berryIM.setMatrixAt(id, _z); berryIM.instanceMatrix.needsUpdate = true; berryFree.push(id); }
const picked = new Map(), broken = new Set(), shards = new Map();
const inv = { pine: 0, broad: 0, stone: 0, red: 0, blue: 0, mred: 0, mbrown: 0 };
// ---------- hotbar ----------
const ITEMS = [['pine', 'Fenyő rönk', '#5a3b20'], ['broad', 'Tölgy rönk', '#8b6b3e'], ['stone', 'Kődarab', '#8d8b86'],
  ['red', 'Piros bogyó', '#cc1111'], ['blue', 'Kék bogyó', '#2230d9'], ['mred', 'Piros gomba', '#b01010'], ['mbrown', 'Barna gomba', '#6a3d1c']];
let sel = 0;
const order = [];   // a tárgyak a felvétel sorrendjében kerülnek a hotbarba
function updateInv() {
  const hb = document.getElementById('hotbar'); if (!hb) return;
  hb.innerHTML = '';
  for (const [k] of ITEMS) if (inv[k] > 0 && !order.includes(k)) order.push(k);
  for (let i = 0; i < 9; i++) {
    const it = ITEMS.find(x => x[0] === order[i]), d = document.createElement('div');
    d.style.cssText = `width:64px;height:64px;box-sizing:border-box;border:3px solid ${i === sel ? '#fff' : '#444'};background:rgba(0,0,0,.5);border-radius:6px;position:relative;color:#fff;font:600 10px system-ui;text-align:center`;
    if (it) d.innerHTML = `<div style="width:24px;height:24px;margin:8px auto 3px;border-radius:5px;background:${it[2]};opacity:${inv[it[0]] ? 1 : .3}"></div>${it[1]}<b style="position:absolute;right:4px;bottom:2px;font-size:13px">${inv[it[0]] || ''}</b>`;
    hb.appendChild(d);
  }
}
updateInv();
function toast(t) {
  const box = document.getElementById('toasts'); if (!box) return;
  const e = document.createElement('div');
  e.textContent = t;
  e.style.cssText = 'background:rgba(0,0,0,.55);color:#fff;padding:6px 12px;margin-top:6px;border-radius:6px;font:600 15px system-ui;transition:opacity .6s';
  box.appendChild(e);
  setTimeout(() => e.style.opacity = 0, 2200); setTimeout(() => e.remove(), 2900);
}
function allocLog(ch, rec) {
  const p = pools[rec.model || 'log_long']; if (!p) return;
  const id = p.alloc(M(rec.x, height(rec.x, rec.z), rec.z, rec.a, rec.s || 1));
  if (id >= 0) ch.logs.push({ rec, id, p });
}

// ---------- chunkok ----------
const chunks = new Map(), felled = new Map(), anims = [];

function genChunk(cx, cz) {
  const key = cx + ',' + cz, x0 = cx * CS, z0 = cz * CS, st = CS / SEG, n = SEG + 3, V = SEG + 1;
  const H = new Float32Array(n * n), W = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    H[j * n + i] = height(x0 + (i - 1) * st, z0 + (j - 1) * st); W[j * n + i] = _b - .55;
  }
  const pos = new Float32Array(V * V * 3), nor = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = (j * V + i) * 3, c = (j + 1) * n + i + 1, y = H[c];
    const dx = (H[c + 1] - H[c - 1]) / (2 * st), dz = (H[c + n] - H[c - n]) / (2 * st), L = Math.hypot(dx, 1, dz);
    pos[k] = x0 + i * st; pos[k + 1] = y; pos[k + 2] = z0 + j * st;
    nor[k] = -dx / L; nor[k + 1] = 1 / L; nor[k + 2] = -dz / L;
    const nn = fbm(pos[k] * .12, pos[k + 2] * .12, 3) * .5 + .5;
    tc.copy(C.grass).lerp(C.grass2, nn);
    tc.lerp(C.dry, smooth(.55, .85, fbm(pos[k] * .07 + 90, pos[k + 2] * .07, 2) * .5 + .5) * .6);
    tc.lerp(C.rock.clone().lerp(C.rock2, nn), Math.max(smooth(.18, .4, 1 - nor[k + 1]), smooth(9, 15, y)));
    tc.lerp(C.wet, smooth(.15, .8, (W[c] + .55) - y));
    col[k] = tc.r; col[k + 1] = tc.g; col[k + 2] = tc.b;
  }
  const idx = [];
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, terrainMat); scene.add(mesh);

  const ch = { cx, cz, mesh, items: [], trees: [], rocks: [], berries: [], logs: [], water: null };
  {
    const wp = new Float32Array(V * V * 3), wn = new Float32Array(V * V * 3), wi = [];
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = (j * V + i) * 3; wp[k] = pos[k]; wp[k + 1] = W[(j + 1) * n + i + 1]; wp[k + 2] = pos[k + 2]; wn[k + 1] = 1;
    }
    const isWet = (i, j) => H[(j + 1) * n + i + 1] < W[(j + 1) * n + i + 1] - .03;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++)
      if (isWet(i, j) || isWet(i + 1, j) || isWet(i, j + 1) || isWet(i + 1, j + 1)) {
        const a = j * V + i, b = a + 1, c = a + V, d = c + 1; wi.push(a, c, b, b, c, d);
      }
    if (wi.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
      wg.setAttribute('normal', new THREE.BufferAttribute(wn, 3));
      wg.setIndex(wi);
      ch.water = new THREE.Mesh(wg, waterMat); scene.add(ch.water);
    }
  }
  const R = mulberry(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ SEED);
  const add = (name, x, z, s, yaw, y) => {
    const p = pools[name]; if (!p || wet(x, z)) return -1;
    const id = p.alloc(M(x, y === undefined ? height(x, z) : y, z, yaw, s));
    if (id >= 0) ch.items.push([p, id]); return id;
  };
  const forest = (x, z) => smooth(-.1, .35, fbm(x * .012 + 90, z * .012, 3));
  const rx = () => x0 + R() * CS, rz = () => z0 + R() * CS, spawn = (x, z) => Math.hypot(x, z) < 6;

  for (let k = 0; k < 16; k++) {
    const x = rx(), z = rz(), h = height(x, z), r1 = R(), r2 = R(), r3 = R(), r4 = R();
    if (r1 > forest(x, z) || spawn(x, z) || h > 16 || slope(x, z) > .7 || wet(x, z)) continue;
    if (!ch.trees.every(t => Math.hypot(t.x - x, t.z - z) > 2.8)) continue;
    const type = (h > 4 || r2 < .35) ? 'pine' : 'broad', v = r3 < .5 ? 'a' : 'b', s = .9 + r4 * .8, yaw = r1 * 6.28;
    const t = { x, z, y: h, s, yaw, type, v, key: key + ':' + k, chunk: ch, top: -1, down: false };
    const sp = pools[`${type}_${v}_stump`], tp = pools[`${type}_${v}_top`];
    if (sp) { const id = sp.alloc(M(x, h, z, yaw, s)); if (id >= 0) ch.items.push([sp, id]); }
    const f = felled.get(t.key);
    if (f) { t.down = true; for (const rec of f) if (!rec.got) allocLog(ch, rec); }
    else if (tp) { t.top = tp.alloc(M(x, h + CUT * s, z, yaw, s)); t.tp = tp; }
    ch.trees.push(t);
  }
  for (let k = 0; k < 6; k++) {
    const x = rx(), z = rz(), r = R(), r2 = R();
    if (spawn(x, z) || height(x, z) > 20) continue;
    const sz = r < .5 ? 's' : r < .8 ? 'm' : 'l', s = .8 + R() * .6, yaw = R() * 6.28;
    const rr = { s: .45, m: .85, l: 1.5 }[sz] * s;
    let mn = height(x, z), mx = mn;
    for (let a = 0; a < 8; a++) { const h = height(x + Math.cos(a * .785) * rr, z + Math.sin(a * .785) * rr); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    if (mx - mn > 0.9 * rr) continue;                       // túl meredek hely: ott nincs szikla
    const rk = `${key}:r${k}`, rname = `rock_${sz}${r2 < .5 ? 1 : 2}`;
    if (broken.has(rk)) { for (const rec of shards.get(rk) || []) if (!rec.got) allocLog(ch, rec); continue; }
    const rid = add(rname, x, z, s, yaw, mn - 0.12 * s);
    if (rid >= 0) { ch.items.pop(); ch.rocks.push({ x, z, r: rr * 0.8, rr, s, yaw, y: mn - 0.12 * s, id: rid, pool: pools[rname], hits: 0, gone: false, key: rk, ch }); }
  }
  for (let k = 0; k < 6; k++) {
    const x = rx(), z = rz(), ok = R() < forest(x, z) && !spawn(x, z) && height(x, z) < 12;
    const s = .8 + R() * .5, yaw = R() * 6.28, bn = R() < .5 ? 'bush_a' : 'bush_b';
    const bb = Array.from({ length: 7 }, () => [R() * 6.28, .15 + R() * 1.0, R() < .5 ? 'red' : 'blue']);
    if (!ok || add(bn, x, z, s, yaw) < 0) continue;
    const cy = height(x, z) + .4 * s, rr = .52 * s;
    bb.forEach(([th, ph, col], b) => {
      const bk = `${key}:b${k}:${b}`, pk = picked.get(bk);
      if (pk && Date.now() - pk < 180000) return;
      const bx = x + Math.cos(th) * Math.cos(ph) * rr, by = cy + Math.sin(ph) * rr * .8, bz = z + Math.sin(th) * Math.cos(ph) * rr;
      const id = berryAlloc(bx, by, bz, col);
      if (id >= 0) ch.berries.push({ id, x: bx, y: by, z: bz, key: bk, col, got: false });
    });
  }
  for (let k = 0; k < 45; k++) { const x = rx(), z = rz(); if (slope(x, z) < .9 && height(x, z) < 14) add(fbm(x * .05 + 5, z * .05, 2) > 0 ? 'grass_green' : 'grass_dry', x, z, .8 + R() * .6, R() * 6.28); }
  for (let k = 0; k < 10; k++) { const x = rx(), z = rz(); if (fbm(x * .04 + 9, z * .04, 2) > .15 && height(x, z) < 6) add(R() < .5 ? 'flower_yellow' : 'flower_white', x, z, 1, R() * 6.28); }
  for (let k = 0; k < 3 && ch.trees.length; k++) {
    const t = ch.trees[Math.floor(R() * ch.trees.length)], red = R() < .5, mx = t.x + 1 + R(), mz = t.z + R() * 2 - 1, a = R() * 6.28;
    const mk = `${key}:m${k}`, pk = picked.get(mk);
    if (wet(mx, mz) || (pk && Date.now() - pk < 180000)) continue;
    allocLog(ch, { x: mx, z: mz, a, s: 1.2, type: red ? 'mred' : 'mbrown', model: red ? 'mushroom_red' : 'mushroom_brown', key: mk, got: false });
  }
  chunks.set(key, ch);
}
function unload(key, ch) {
  for (const [p, id] of ch.items) p.release(id);
  for (const b of ch.berries) if (!b.got) berryRelease(b.id);
  for (const l of ch.logs) if (!l.rec.got) l.p.release(l.id);
  for (const r of ch.rocks) if (!r.gone) r.pool.release(r.id);
  if (ch.water) { scene.remove(ch.water); ch.water.geometry.dispose(); }
  for (const t of ch.trees) if (t.top >= 0 && !t.down) t.tp.release(t.top);
  scene.remove(ch.mesh); ch.mesh.geometry.dispose(); chunks.delete(key);
}
function updateChunks(budget) {
  const pcx = Math.floor(player.x / CS), pcz = Math.floor(player.z / CS), need = [];
  for (const [k, c] of chunks) if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > RAD + 1) unload(k, c);
  for (let dz = -RAD; dz <= RAD; dz++) for (let dx = -RAD; dx <= RAD; dx++)
    if (!chunks.has((pcx + dx) + ',' + (pcz + dz))) need.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
  need.sort((a, b) => a[0] - b[0]);
  for (const [, x, z] of need.slice(0, budget)) genChunk(x, z);
  return need.length;
}

// ---------- fa kidöntése ----------
const fw = new THREE.Vector3();
function tryFell() {
  cam.getWorldDirection(fw);
  let best = null, bd = 1e9;
  for (const c of chunks.values()) for (const t of c.trees) {
    if (t.down) continue;
    const px = t.x - cam.position.x, py = t.y + 1.8 * t.s - cam.position.y, pz = t.z - cam.position.z;
    const d = Math.hypot(px, pz), tp = px * fw.x + py * fw.y + pz * fw.z;
    if (d > 4.5 || tp < 0) continue;
    if (Math.hypot(px - fw.x * tp, py - fw.y * tp, pz - fw.z * tp) < 1.3 * t.s && d < bd) { bd = d; best = t; }
  }
  if (!best) return hitRock();
  best.down = true;
  const dx = best.x - cam.position.x, dz = best.z - cam.position.z, L = Math.hypot(dx, dz) || 1;
  anims.push({ t: best, dir: [dx / L, dz / L], time: 0 });
}
function hitRock() {
  let best = null, bd = 5;
  for (const c of chunks.values()) for (const r of c.rocks) {
    if (r.gone) continue;
    const px = r.x - cam.position.x, py = r.y + r.rr * .45 - cam.position.y, pz = r.z - cam.position.z;
    const tp = px * fw.x + py * fw.y + pz * fw.z;
    if (tp < 0 || tp > bd) continue;
    if (Math.hypot(px - fw.x * tp, py - fw.y * tp, pz - fw.z * tp) < r.rr * .85) { bd = tp; best = r; }
  }
  if (!best) return;
  best.hits++;
  if (best.hits < 3) { toast(`A kő megrepedt (${best.hits}/3)`); return; }
  best.gone = true; best.pool.release(best.id);
  const recs = Array.from({ length: 4 + Math.floor(Math.random() * 3) }, () => {
    const a = Math.random() * 6.28, d = Math.random() * best.rr * .8;
    return { x: best.x + Math.cos(a) * d, z: best.z + Math.sin(a) * d, a: Math.random() * 6.28, s: .45 + Math.random() * .3,
      type: 'stone', model: Math.random() < .5 ? 'rock_s1' : 'rock_s2', key: best.key, got: false };
  });
  broken.add(best.key); shards.set(best.key, recs);
  for (const rec of recs) allocLog(best.ch, rec);
  toast('A kő darabokra tört!');
}
function updateAnims(dt) {
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3();
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i], t = a.t, [dx, dz] = a.dir, END = Math.PI / 2 - 0.06, FALL = 1.6;
    a.time += dt;
    const T = a.time / FALL;
    const ang = T < 1 ? END * T * T : END + 0.05 * Math.sin((a.time - FALL) * 14) * Math.exp(-(a.time - FALL) * 5);
    q1.setFromAxisAngle(ax.set(dz, 0, -dx), ang); q2.setFromAxisAngle(UP, t.yaw);
    if (t.top >= 0) t.tp.set(t.top, new THREE.Matrix4().compose(_p.set(t.x, t.y + CUT * t.s, t.z), q1.multiply(q2), _s.set(t.s, t.s, t.s)));
    if (a.time > 2.6) {
      if (t.top >= 0) { t.tp.release(t.top); t.top = -1; }
      const recs = [1.6, 4].map(d => ({ x: t.x + dx * d, z: t.z + dz * d, a: Math.atan2(-dz, dx), type: t.type, got: false }));
      felled.set(t.key, recs);
      if (chunks.get(t.chunk.cx + ',' + t.chunk.cz) === t.chunk) for (const rec of recs) allocLog(t.chunk, rec);
      anims.splice(i, 1);
    }
  }
}

// ---------- játékos ----------
const player = { x: 0, y: height(0, 0) + 1.7, z: 0, vy: 0, yaw: 0, pitch: 0, ground: true };
const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('keydown', e => { const m = /^Digit([1-9])$/.exec(e.code); if (m) { sel = +m[1] - 1; updateInv(); } });
const ov = document.getElementById('ov');
// ---------- felhasználónév + jelszó + mentés (Netlify Function + Blobs) ----------
let user = null, pw = '', lastSrv = 0, busy = false;
const snapshot = () => ({
  x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, inv, order,
  felled: [...felled], broken: [...broken], shards: [...shards], picked: [...picked]
});
async function api(body, keepalive = false) {
  const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive });
  const j = await r.json().catch(() => ({ error: 'Szerverhiba (' + r.status + ')' }));
  if (!r.ok) throw new Error(j.error || 'Szerverhiba');
  return j;
}
function saveGame(force = false) {
  if (!user) return;
  const now = Date.now();
  if (!force && now - lastSrv < 30000) return;   // a szerver felé legfeljebb 30 mp-enként
  lastSrv = now;
  api({ action: 'save', name: user, password: pw, save: snapshot() }, true).catch(e => console.warn('Mentés:', e.message));
}
function applySave(s) {
  felled.clear(); broken.clear(); shards.clear(); picked.clear();
  for (const k in inv) inv[k] = 0;
  order.length = 0;
  if (s) {
    Object.assign(inv, s.inv); order.push(...s.order);
    for (const [k, v] of s.felled) felled.set(k, v);
    for (const k of s.broken) broken.add(k);
    for (const [k, v] of s.shards) shards.set(k, v);
    for (const [k, v] of s.picked) picked.set(k, v);
    player.x = s.x; player.z = s.z; player.yaw = s.yaw; player.pitch = s.pitch;
  } else { player.x = 0; player.z = 0; player.yaw = 0; player.pitch = 0; }
  player.y = height(player.x, player.z) + 1.7; player.vy = 0;
  for (const [k, c] of [...chunks]) unload(k, c);   // a világ újratöltődik a mentett állapottal
  updateInv();
}
const nameEl = document.getElementById('name'), pwEl = document.getElementById('pw');
nameEl.value = localStorage.getItem('survival:last') || '';
ov.addEventListener('click', async e => {
  if (e.target === nameEl || e.target === pwEl || busy) return;
  const n = nameEl.value.trim().slice(0, 20), p = pwEl.value;
  if (!n || !p) { (n ? pwEl : nameEl).focus(); return; }
  if (n.toLowerCase() !== (user || '').toLowerCase() || p !== pw) {
    busy = true; msg.textContent = 'Belépés…';
    try {
      const r = await api({ action: 'load', name: n, password: p });
      user = n; pw = p; localStorage.setItem('survival:last', n);
      applySave(r.save);
      toast(r.created ? `Új fiók létrehozva: ${n}` : `Üdv újra, ${n}!`);
      msg.textContent = 'Belépve – kattints a folytatáshoz';
    } catch (err) { msg.textContent = 'Hiba: ' + err.message; }
    busy = false;
    return;
  }
  renderer.domElement.requestPointerLock();
});
for (const el of [nameEl, pwEl]) {
  el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ov.click(); } });
  el.addEventListener('keyup', e => e.stopPropagation());
}
setInterval(() => saveGame(), 10000);
addEventListener('beforeunload', () => saveGame(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });
document.addEventListener('pointerlockchange', () => { ov.style.display = document.pointerLockElement ? 'none' : 'flex'; if (!document.pointerLockElement) saveGame(true); });
addEventListener('mousemove', e => {
  if (!document.pointerLockElement) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * 0.0022));
});
addEventListener('mousedown', e => {
  if (!document.pointerLockElement) return;
  if (e.button === 0) tryFell(); else if (e.button === 2) tryPick();
});
addEventListener('contextmenu', e => { if (document.pointerLockElement) e.preventDefault(); });
function tryPick() {
  cam.getWorldDirection(fw);
  let best = null, bd = 1e9;
  for (const c of chunks.values()) for (const b of c.berries) {
    if (b.got) continue;
    const px = b.x - cam.position.x, py = b.y - cam.position.y, pz = b.z - cam.position.z;
    const tp = px * fw.x + py * fw.y + pz * fw.z;
    if (tp < 0 || tp > 3.5) continue;
    if (Math.hypot(px - fw.x * tp, py - fw.y * tp, pz - fw.z * tp) < 0.12 + 0.05 * tp && tp < bd) { bd = tp; best = b; }
  }
  if (!best) return pickLog();
  best.got = true; berryRelease(best.id); picked.set(best.key, Date.now());
  inv[best.col]++; updateInv(); toast(best.col === 'red' ? 'Piros bogyó +1' : 'Kék bogyó +1');
}
function pickLog() {
  let best = null, bd = 1e9;
  for (const c of chunks.values()) for (const l of c.logs) {
    const rec = l.rec; if (rec.got) continue;
    const big = rec.type === 'pine' || rec.type === 'broad';
    const ax = Math.cos(rec.a), az = -Math.sin(rec.a), gy = height(rec.x, rec.z) + (big ? .25 : .1);
    for (const o of big ? [-.9, 0, .9] : [0]) {
      const px = rec.x + ax * o - cam.position.x, py = gy - cam.position.y, pz = rec.z + az * o - cam.position.z;
      const tp = px * fw.x + py * fw.y + pz * fw.z;
      if (tp < 0 || tp > (big ? 4.5 : 3.8)) continue;
      if (Math.hypot(px - fw.x * tp, py - fw.y * tp, pz - fw.z * tp) < (big ? .6 : .3 + .05 * tp) && tp < bd) { bd = tp; best = l; }
    }
  }
  if (!best) return;
  const rec = best.rec; rec.got = true; best.p.release(best.id);
  if (rec.type === 'mred' || rec.type === 'mbrown') picked.set(rec.key, Date.now());
  inv[rec.type]++; updateInv(); toast(`${ITEMS.find(i => i[0] === rec.type)[1]} +1`);
}

function movePlayer(dt) {
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sp = (keys.ShiftLeft ? 9 : 5) * dt * (height(player.x, player.z) < waterY(player.x, player.z) ? .55 : 1), sy = Math.sin(player.yaw), cy = Math.cos(player.yaw), l = Math.hypot(f, r) || 1;
  player.x += (-sy * f + cy * r) / l * sp * (f || r ? 1 : 0);
  player.z += (-cy * f - sy * r) / l * sp * (f || r ? 1 : 0);
  for (const c of chunks.values()) for (const t of c.trees) {
    const dx = player.x - t.x, dz = player.z - t.z, d = Math.hypot(dx, dz), rr = (t.down ? .25 : .45) * t.s + .35;
    if (d < rr && d > 1e-4) { player.x = t.x + dx / d * rr; player.z = t.z + dz / d * rr; }
  }
  for (const c of chunks.values()) for (const r of c.rocks) {
    if (r.gone) continue;
    const dx = player.x - r.x, dz = player.z - r.z, d = Math.hypot(dx, dz), rr = r.r + .35;
    if (d < rr && d > 1e-4) { player.x = r.x + dx / d * rr; player.z = r.z + dz / d * rr; }
  }
  const gy = height(player.x, player.z) + 1.7;
  if (keys.Space && player.ground) { player.vy = 6; player.ground = false; }
  player.vy -= 18 * dt; player.y += player.vy * dt;
  if (player.y <= gy) { player.y = gy; player.vy = 0; player.ground = true; } else player.ground = false;
  cam.position.set(player.x, player.y, player.z);
  cam.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  sun.position.set(player.x + 50, 80, player.z + 30); sun.target.position.set(player.x, 0, player.z); sun.target.updateMatrixWorld();
}

// ---------- indítás ----------
const msg = document.getElementById('msg');
window.__started = true;
addEventListener('error', e => { msg.textContent = 'Hiba: ' + e.message; });
addEventListener('unhandledrejection', e => { msg.textContent = 'Hiba: ' + (e.reason && e.reason.message || e.reason); console.error(e.reason); });
new GLTFLoader().load(GLB, async gltf => {
  const caps = { grass_green: 1500, grass_dry: 1500, flower_yellow: 500, flower_white: 500 };
  const missing = [];
  for (const o of gltf.scene.children) pools[o.name] = new Pool(o, caps[o.name] || 700);
  for (const n of ['pine_a_top', 'broad_a_top', 'log_long', 'rock_s1']) if (!pools[n]) missing.push(n);
  if (missing.length) console.warn('Hiányzó modellek a GLB-ből:', missing);
  for (let r = 0; updateChunks(8) > 0 && r < 50; r++) { msg.textContent = 'Világ generálása…'; await new Promise(requestAnimationFrame); }
  msg.textContent = 'Add meg a neved és a jelszavad, majd kattints';
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.pointerLockElement) movePlayer(dt);
    updateChunks(1); updateAnims(dt);
    renderer.render(scene, cam);
  });
}, undefined, () => { msg.textContent = 'Nem találom a survival_models.glb fájlt (helyi szerveren futtasd, ne file://-ként).'; });
