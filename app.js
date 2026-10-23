/* Pedra Mestra — interface: mesa 3D, menu, balões do professor e folhas.
   As regras e o professor ficam em engine.js (globais: G, newMatch, step, userMove...). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = s => document.querySelector(s);
const stage = $('#stage'), MENU = $('#menu'), HUD = $('#hud'), POP = $('#pop');

/* ================== Pedras em SVG (balões e folhas) ================== */
function tileSVG(a, b, o = {}) {
  const s = o.s || 20, v = !!o.v, w = v ? s : 2 * s, h = v ? 2 * s : s, r = s * .16;
  let g = '';
  const half = (n, ox, oy) => { for (const [x, y] of PIP[n]) { const px = v ? x : y, py = v ? y : x; g += `<circle class="tp" cx="${(ox + px * s).toFixed(2)}" cy="${(oy + py * s).toFixed(2)}" r="${(s * .095).toFixed(2)}"/>`; } };
  half(a, 0, 0); half(b, v ? 0 : s, v ? s : 0);
  const line = v ? `<line class="tl" x1="${s * .2}" y1="${s}" x2="${s * .8}" y2="${s}"/>` : `<line class="tl" x1="${s}" y1="${s * .2}" x2="${s}" y2="${s * .8}"/>`;
  return `<svg class="tile" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${a} e ${b}"><rect class="tf" x=".75" y=".75" width="${w - 1.5}" height="${h - 1.5}" rx="${r}"/>${line}${g}</svg>`;
}
const mini = (t, s = 11) => tileSVG(t[0], t[1], { s });
function face(n, s = 22) {
  let g = ''; for (const [x, y] of PIP[n]) g += `<circle class="tp" cx="${x * s}" cy="${y * s}" r="${s * .095}"/>`;
  return `<svg class="tile" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true"><rect class="tf" x=".75" y=".75" width="${s - 1.5}" height="${s - 1.5}" rx="${s * .18}"/>${g}</svg>`;
}

/* ================== Estado da interface ================== */
const UI = { screen: 'menu', paused: false, timer: null, popSig: '', popEv: null };
const SPEED = { watch: 2100, train: 1500, solo: 1000, demo: 2400 };
const PLAY_NAME = { watch: 'Assistir', train: 'Treino', solo: 'Solo' };
const sheetOpen = () => $('#sheetRoot').childElementCount > 0;

/* ================== Cena 3D ================== */
const V = { ok: false, tiles: new Map(), players: {}, hl: new Map(), frame: 0, hid: '', flash: null, lastKey: null, W: 1, H: 1,
            cam: null, camCur: null, camGoal: null, smoke: [], ember: null, pad: null, padSig: '' };
const SEATPOS = { '1x1': ['S', 'N'], '2x2': ['S', 'E', 'N', 'W'] };
const PL = { N: { x: 0, z: -9.5 }, E: { x: 8.3, z: -4.6 }, W: { x: -8.3, z: -4.6 } };
const ANCH = { S: [0, 2.15, 6.25], N: [0, 4.6, -9.5], E: [8.3, 4.6, -4.6], W: [-8.3, 4.6, -4.6] };
const RACK = { N: { c: [0, -6.3], along: [1, 0], n: [0, -1] }, E: { c: [5.95, -1.7], along: [0, 1], n: [1, 0] }, W: { c: [-5.95, -1.7], along: [0, 1], n: [-1, 0] } };
const TARGET_PT = new THREE.Vector3(0, 0, 0.3);
const ELEV = 47 * Math.PI / 180;
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const qFlat = (u, down = false) => new THREE.Quaternion().setFromEuler(tmpE.set(down ? Math.PI / 2 : -Math.PI / 2, Math.atan2(-u[0], -u[1]), 0, 'YXZ'));
const qStand = (n, tilt) => new THREE.Quaternion().setFromEuler(tmpE.set(-tilt, Math.atan2(n[0], n[1]), 0, 'YXZ'));

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, ...o });

function init3D() {
  try {
    V.fg = new THREE.WebGLRenderer({ canvas: $('#fg3d'), antialias: true, alpha: true });
    V.bg = new THREE.WebGLRenderer({ canvas: $('#bg3d'), antialias: false });
  } catch (e) {
    stage.insertAdjacentHTML('beforeend', '<p class="no3d-msg">Seu navegador não conseguiu abrir a mesa 3D. Atualize o navegador ou ative a aceleração gráfica.</p>');
    return;
  }
  V.fg.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  V.bg.setPixelRatio(.75);
  for (const r of [V.fg, V.bg]) { r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; }
  V.fg.setClearColor(0x000000, 0);
  V.fg.shadowMap.enabled = true; V.fg.shadowMap.type = THREE.PCFSoftShadowMap;
  V.cam = new THREE.PerspectiveCamera(34, 1, .5, 200);
  V.fgScene = new THREE.Scene(); V.bgScene = new THREE.Scene();
  buildRoom(); buildTable(); buildProps(); buildTiles(); buildPlayers();
  V.ray = new THREE.Raycaster();
  new ResizeObserver(resize3D).observe(stage);
  $('#fg3d').addEventListener('pointerdown', onPick);
  V.ok = true;
  resize3D();
  requestAnimationFrame(loop);
}

/* ---------- O bar ao fundo (camada desfocada) ---------- */
function buildRoom() {
  const s = V.bgScene;
  s.background = new THREE.Color(0x0a0604); s.fog = new THREE.Fog(0x0a0604, 55, 140);
  s.add(new THREE.HemisphereLight(0x9a7650, 0x080403, .8));
  const key = new THREE.DirectionalLight(0xffd2a0, 1.2); key.position.set(0, 10, 8); s.add(key);
  const warm = new THREE.SpotLight(0xffc68a, 1400, 0, .8, .7, 2); warm.position.set(0, 15, 0); warm.target.position.set(0, 0, -5); s.add(warm, warm.target);
  const neonPink = new THREE.PointLight(0xff4f86, 90, 34, 2); neonPink.position.set(-9.5, 8, -18); s.add(neonPink);
  const neonAmber = new THREE.PointLight(0xffa53a, 70, 30, 2); neonAmber.position.set(9.5, 8, -18); s.add(neonAmber);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), std(0x140c08, { roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -3.4; s.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(160, 50), std(0x1b110c, { roughness: 1 })); wall.position.set(0, 14, -25); s.add(wall);

  // Balcão com prateleiras e garrafas contra luz
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(34, 9), new THREE.MeshBasicMaterial({ color: 0x6b3a14 })); glow.position.set(0, 5.2, -24.4); s.add(glow);
  const shelfMat = std(0x2a190e);
  const bottleCols = [0x7a3d10, 0x2f5a2a, 0xa86a1e, 0x5d1f1a, 0xc9b27a, 0x1f3f4a];
  for (let row = 0; row < 3; row++) {
    const y = 1.6 + row * 2.9;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(34, .22, 1.4), shelfMat); shelf.position.set(0, y, -23.6); s.add(shelf);
    for (let x = -16; x < 16; x += .8 + Math.random() * .6) {
      const h = 1.1 + Math.random() * .9, r = .22 + Math.random() * .12;
      const col = bottleCols[(Math.random() * bottleCols.length) | 0];
      const b = new THREE.Mesh(lathe([[0, 0], [r, 0], [r, h * .62], [r * .45, h * .8], [r * .38, h], [0, h]], 12),
        std(col, { roughness: .2, emissive: col, emissiveIntensity: .35 }));
      b.position.set(x, y + .11, -23.4 + Math.random() * .3); s.add(b);
    }
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(40, 3.4, 2.4), std(0x2b1a10, { roughness: .6 })); counter.position.set(0, -1.7, -19.5); s.add(counter);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(40.6, .3, 2.8), std(0x4a2c18, { roughness: .35 })); counterTop.position.set(0, .05, -19.5); s.add(counterTop);

  // Letreiros neon
  const neon = (text, color, w, h, x, y) => {
    const tex = canvasTex(512, 192, (g, W, H) => {
      g.clearRect(0, 0, W, H); g.font = '800 120px Unbounded, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 28; g.fillStyle = color; g.fillText(text, W / 2, H / 2 + 6);
      g.shadowBlur = 8; g.fillStyle = '#fff4f0'; g.fillText(text, W / 2, H / 2 + 6);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    m.position.set(x, y, -24.2); s.add(m);
  };
  neon('BAR', '#ff4f86', 8, 3, -9.5, 10.2);
  neon('DOMINÓ', '#ffb347', 11, 4.1, 9.5, 10.4);

  // Luzes desfocadas (bokeh) e outras mesas
  const bokehCols = [0xffcf8a, 0xffb36b, 0xf6e3b4, 0xff9466, 0xff6f91];
  const sph = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 44; i++) {
    const m = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: bokehCols[i % bokehCols.length], toneMapped: false, transparent: true, opacity: .55 + Math.random() * .45 }));
    m.scale.setScalar(.18 + Math.random() * .4);
    m.position.set(-26 + Math.random() * 52, .5 + Math.random() * 13, -23 + Math.random() * 9); s.add(m);
  }
  for (const [x, z] of [[-15, -13], [15, -14], [-21, -5], [21, -4]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, .25, 24), std(0x2b1a10, { roughness: .5 })); t.position.set(x, -.6, z); s.add(t);
    const candle = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffb35c, toneMapped: false })); candle.scale.setScalar(.3); candle.position.set(x, .1, z); s.add(candle);
    const pl = new THREE.PointLight(0xff9a40, 8, 8, 2); pl.position.set(x, .8, z); s.add(pl);
  }
}

/* ---------- Mesa com spot central (camada nítida) ---------- */
function buildTable() {
  const s = V.fgScene;
  s.add(new THREE.AmbientLight(0xffe2c4, .16));
  const spot = new THREE.SpotLight(0xffd39a, 1250, 0, .6, .62, 2);
  spot.position.set(0, 15, .6); spot.target.position.set(0, 0, .3);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.0003; spot.shadow.normalBias = .02;
  spot.shadow.camera.near = 6; spot.shadow.camera.far = 30;
  s.add(spot, spot.target);
  const rim = new THREE.DirectionalLight(0x9db8ff, .22); rim.position.set(-6, 5, -10); s.add(rim);

  const felt = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#1f4b44'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14000; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)'; g.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4); }
    const rg = g.createRadialGradient(W / 2, H / 2, W * .2, W / 2, H / 2, W * .75); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
  });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(13.8, 14.6), new THREE.MeshStandardMaterial({ map: felt, roughness: .96 }));
  top.rotation.x = -Math.PI / 2; top.receiveShadow = true; s.add(top);

  const wood = canvasTex(512, 64, (g, W, H) => {
    g.fillStyle = '#3d2414'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,210,160'},${.04 + Math.random() * .08})`; g.lineWidth = 1 + Math.random() * 2; const y = Math.random() * H; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * .3, y + 4, W * .6, y - 4, W, y + 2); g.stroke(); }
  }, [2, 1]);
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: .45, color: 0xffffff });
  const railF = new RoundedBoxGeometry(15.4, .5, .8, 2, .18), railS = new RoundedBoxGeometry(.8, .5, 14.6, 2, .18);
  for (const z of [-7.7, 7.7]) { const m = new THREE.Mesh(railF, woodMat); m.position.set(0, .05, z); m.castShadow = m.receiveShadow = true; s.add(m); }
  for (const x of [-7.3, 7.3]) { const m = new THREE.Mesh(railS, woodMat); m.position.set(x, .05, 0); m.castShadow = m.receiveShadow = true; s.add(m); }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.6, 16), std(0x24150c, { roughness: .6 })); apron.position.y = -1.0; s.add(apron);
}

/* ---------- Objetos do bar sobre a mesa ---------- */
function buildProps() {
  const s = V.fgScene;
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xdfeef0, roughness: .05, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide });
  const beerMat = new THREE.MeshStandardMaterial({ color: 0xe08a1c, roughness: .25, emissive: 0x4a2200, emissiveIntensity: .6, transparent: true, opacity: .92 });
  const foamMat = std(0xfff5e0, { roughness: .95 });
  const corkMat = std(0xa9844f, { roughness: .9 });
  const add = (m, x, y, z, shadow = true) => { m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; s.add(m); return m; };

  const coaster = (x, z) => add(new THREE.Mesh(new THREE.CylinderGeometry(.66, .66, .05, 32), corkMat), x, .025, z, false);
  const beer = (x, z, fill) => {
    coaster(x, z);
    const h = 1.7, bh = h * fill;
    add(new THREE.Mesh(lathe([[0, 0], [.36, 0], [.4, .06], [.47, h], [.48, h + .02]], 32), glassMat), x, .05, z, false);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.36 + .1 * fill, .35, bh, 28), beerMat), x, .1 + bh / 2, z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.37 + .1 * fill + .01, .36 + .1 * fill, .16, 28), foamMat), x, .1 + bh + .08, z);
  };
  beer(6.35, 4.3, .72);

  // Garrafa e copo americano no canto de trás
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0x3a1c08, roughness: .12, metalness: .1, transparent: true, opacity: .9 });
  add(new THREE.Mesh(lathe([[0, 0], [.42, 0], [.44, .05], [.44, 1.9], [.3, 2.35], [.15, 2.6], [.15, 3.05], [.18, 3.1], [0, 3.1]], 28), bottleMat), -6.25, 0, -6.5);
  const label = canvasTex(256, 96, (g, W, H) => {
    g.fillStyle = '#efe2c2'; g.fillRect(0, 0, W, H); g.fillStyle = '#7a2a1a'; g.fillRect(0, 10, W, 6); g.fillRect(0, H - 16, W, 6);
    g.font = '800 34px Unbounded, Arial Black, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#3a1c08'; g.fillText('MESTRA', W / 2, H / 2 + 12);
  });
  add(new THREE.Mesh(new THREE.CylinderGeometry(.445, .445, .7, 28, 1, true), new THREE.MeshStandardMaterial({ map: label, roughness: .7 })), -6.25, 1.05, -6.5, false);
  coaster(-5.15, -6.95);
  add(new THREE.Mesh(lathe([[0, 0], [.3, 0], [.33, .05], [.36, 1.0], [.37, 1.02]], 24), glassMat), -5.15, .05, -6.95, false);
  add(new THREE.Mesh(new THREE.CylinderGeometry(.33, .3, .55, 24), beerMat), -5.15, .38, -6.95);

  // Cinzeiro com cigarro aceso
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: .25, metalness: .35 });
  add(new THREE.Mesh(lathe([[0, 0], [.72, 0], [.8, .08], [.82, .3], [.66, .32], [.58, .14], [0, .14]], 32), ashMat), 6.1, 0, -6.7);
  const paper = std(0xf2eee6, { roughness: .9 }), filter = std(0xc9803a, { roughness: .8 });
  const cig = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .9, 12), paper); body.position.y = .45;
  const filt = new THREE.Mesh(new THREE.CylinderGeometry(.057, .057, .3, 12), filter); filt.position.y = -.15;
  V.ember = new THREE.Mesh(new THREE.CylinderGeometry(.056, .056, .06, 12), new THREE.MeshBasicMaterial({ color: 0xff5a1a, toneMapped: false }));
  V.ember.position.y = .93;
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(.054, .05, .08, 10), std(0x8a8580)); ash.position.y = .99;
  cig.add(body, filt, V.ember, ash); cig.rotation.z = Math.PI / 2 - .12; cig.rotation.y = .5; cig.position.set(6.0, .36, -6.55);
  cig.traverse(o => { o.castShadow = true; }); s.add(cig);
  for (const [dx, dz, r] of [[.25, .1, .3], [-.2, -.15, 1.9]]) {
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .32, 10), filter); butt.rotation.z = Math.PI / 2; butt.rotation.y = r; butt.position.set(6.1 + dx, .2, -6.7 + dz); s.add(butt);
  }
  V.emberPos = new THREE.Vector3(); V.ember.getWorldPosition(V.emberPos); cig.updateMatrixWorld(true); V.ember.getWorldPosition(V.emberPos);
  const smokeTex = canvasTex(64, 64, (g, W) => { const rg = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, W); });
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xd9d2c8, transparent: true, opacity: 0, depthWrite: false }));
    sp.userData.phase = i / 8; s.add(sp); V.smoke.push(sp);
  }

  // Isqueiro
  add(new THREE.Mesh(new RoundedBoxGeometry(.32, .14, .62, 2, .05), std(0xb3261e, { roughness: .35 })), 5.0, .07, -7.0).rotation.y = .4;

  // Bloco de placar e lápis
  const padTex = canvasTex(256, 320, () => {});
  V.pad = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, .05, 1.9), [std(0xe8e2d4), std(0xe8e2d4), new THREE.MeshStandardMaterial({ map: padTex, roughness: .9 }), std(0xe8e2d4), std(0xe8e2d4), std(0xe8e2d4)]), -6.05, .03, 3.75, false);
  V.pad.rotation.y = .12; V.pad.receiveShadow = true;
  const pencil = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.5, 6), std(0xe8b524, { roughness: .5 }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.05, .18, 6), std(0xe9c9a0)); tip.position.y = .84;
  pencil.add(pb, tip); pencil.rotation.z = Math.PI / 2; pencil.rotation.y = -.5; pencil.position.set(-5.85, .06, 5.0); pencil.traverse(o => o.castShadow = true); s.add(pencil);
}

function updatePad() {
  if (!V.pad || !G) return;
  const T = TEAMS[G.mode], sig = G.mode + G.score.join('-') + G.handNo;
  if (sig === V.padSig) return; V.padSig = sig;
  const tex = V.pad.material[2].map, c = tex.image, g = c.getContext('2d');
  g.fillStyle = '#f6f1e4'; g.fillRect(0, 0, 256, 320);
  g.strokeStyle = '#a9bfdc'; g.lineWidth = 2; for (let y = 70; y < 320; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.strokeStyle = '#d98a8a'; g.beginPath(); g.moveTo(128, 50); g.lineTo(128, 320); g.stroke();
  g.fillStyle = '#2a2a3a'; g.font = '700 30px Figtree, sans-serif'; g.textAlign = 'center';
  g.fillText('PLACAR', 128, 40);
  g.font = '600 24px Figtree, sans-serif'; g.fillText(T[0], 64, 92); g.fillText(T[1], 192, 92);
  g.font = '700 64px Figtree, sans-serif'; g.fillStyle = '#1f3a8a'; g.fillText(G.score[0], 64, 180); g.fillText(G.score[1], 192, 180);
  g.font = '500 20px Figtree, sans-serif'; g.fillStyle = '#555'; g.fillText(`rodada ${G.handNo}`, 128, 290);
  tex.needsUpdate = true;
}

/* ---------- Pedras ---------- */
function faceTex(lo, hi) {
  return canvasTex(128, 256, g => {
    g.clearRect(0, 0, 128, 256);
    rr(g, 2, 2, 124, 252, 16);
    const gr = g.createLinearGradient(0, 0, 128, 256); gr.addColorStop(0, '#fcf7ee'); gr.addColorStop(1, '#ebe0cc'); g.fillStyle = gr; g.fill();
    g.strokeStyle = '#bba98a'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 128); g.lineTo(108, 128); g.stroke();
    const pips = (n, oy) => { for (const [x, y] of PIP[n]) { const cx = x * 128, cy = oy + y * 128; g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.arc(cx + 1, cy + 1.5, 12.5, 0, 7); g.fill(); g.fillStyle = '#16110e'; g.beginPath(); g.arc(cx, cy, 11.5, 0, 7); g.fill(); } };
    pips(lo, 0); pips(hi, 128);
    g.fillStyle = '#b98a3c'; g.beginPath(); g.arc(64, 128, 5, 0, 7); g.fill();
  });
}
function buildTiles() {
  const bodyGeo = new RoundedBoxGeometry(1, 2, .32, 3, .085), faceGeo = new THREE.PlaneGeometry(.92, 1.92);
  const backTex = canvasTex(128, 256, g => { rr(g, 2, 2, 124, 252, 16); g.fillStyle = '#efe5d2'; g.fill(); g.strokeStyle = '#d4c6ab'; g.lineWidth = 4; rr(g, 16, 16, 96, 224, 10); g.stroke(); g.fillStyle = '#b98a3c'; g.beginPath(); g.arc(64, 128, 7, 0, 7); g.fill(); });
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: .4, transparent: true });
  for (const t of ALL) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xf1e8d6, roughness: .38, emissive: 0x000000 }));
    body.castShadow = true; body.receiveShadow = true;
    const fm = new THREE.MeshStandardMaterial({ map: faceTex(t[0], t[1]), roughness: .34, transparent: true, emissive: 0x000000 });
    const f = new THREE.Mesh(faceGeo, fm); f.position.z = .162;
    const b = new THREE.Mesh(faceGeo, backMat); b.position.z = -.162; b.rotation.y = Math.PI;
    g.add(body, f, b);
    g.userData = { key: key(t), body, fm, tw: null, to: null, em: 0 };
    body.userData.key = key(t);
    V.fgScene.add(g); V.tiles.set(key(t), g);
  }
}

/* ---------- Jogadores (camada desfocada) ---------- */
function makePlayer(skin, hair) {
  const g = new THREE.Group();
  const shirt = std(0x888888, { roughness: .85 }), sk = std(skin, { roughness: .7 }), hr = std(hair, { roughness: .9 });
  const chair = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, .3), std(0x3a2418, { roughness: .6 })); chair.position.set(0, 1.0, -1.15); g.add(chair);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.85, 1.1, 6, 14), shirt); torso.position.set(0, .75, 0); torso.scale.set(1.18, 1, .75); g.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .45, 10), sk); neck.position.set(0, 1.85, 0); g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 2.45, .05);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(.6, 20, 16), sk));
  const h = new THREE.Mesh(new THREE.SphereGeometry(.64, 20, 14, 0, Math.PI * 2, 0, Math.PI * .55), hr); h.rotation.x = -.3; h.position.set(0, .07, -.05); head.add(h);
  g.add(head);
  for (const sx of [-1, 1]) {
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(.25, .9, 4, 10), shirt); up.position.set(sx * 1.08, .95, .25); up.rotation.set(-.55, 0, sx * .12); g.add(up);
    const fo = new THREE.Mesh(new THREE.CapsuleGeometry(.22, 1.0, 4, 10), sk); fo.position.set(sx * .85, .3, 1.0); fo.rotation.set(Math.PI / 2 - .15, 0, -sx * .35); g.add(fo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.25, 12, 10), sk); hand.position.set(sx * .62, .25, 1.62); g.add(hand);
  }
  g.userData = { torso, head, shirt, phase: Math.random() * 6 };
  return g;
}
function buildPlayers() {
  const looks = { N: [0xc68e64, 0x2a1a12], E: [0x8d5a3b, 0x15100c], W: [0xe0b48f, 0x5a3a22] };
  for (const pos of ['N', 'E', 'W']) {
    const p = makePlayer(...looks[pos]);
    p.position.set(PL[pos].x, .35, PL[pos].z); p.scale.setScalar(1.18);
    p.rotation.order = 'YXZ';
    p.rotation.y = Math.atan2(-PL[pos].x, -PL[pos].z);
    V.bgScene.add(p); V.players[pos] = p;
  }
}
function updatePlayers() {
  const seats = SEATPOS[G.mode];
  for (const pos of ['N', 'E', 'W']) {
    const p = seats.indexOf(pos), pl = V.players[pos];
    pl.visible = p >= 0;
    if (p >= 0) pl.userData.shirt.color.setHex(team(p) === 0 ? 0xc9852f : 0xa8443a);
  }
}

/* ---------- Disposição das pedras ---------- */
// Corrente em "cobra": cada braço sai do centro e dobra nas bordas.
function layoutBoard() {
  const b = G.board, n = b.length; if (!n) return [];
  const out = new Array(n), XLIM = 4.6, gap = .06;
  const ci = G.ci, c = b[ci], cDbl = c.a === c.b;
  out[ci] = { x: 0, z: 0, u: cDbl ? [0, -1] : (c.a <= c.b ? [-1, 0] : [1, 0]) };
  const half = cDbl ? .5 : 1;
  const arm = (start, stop, stepI, vals, end, h, t) => {
    let after = false;
    for (let i = start; i !== stop; i += stepI) {
      const { inner, outer } = vals(i), dbl = inner === outer, lo = Math.min(inner, outer);
      if (h[1] === 0 && !dbl && Math.abs(end[0] + h[0] * (2 + gap)) > XLIM) {
        const cx = end[0] + h[0] * (.5 + gap), cz = end[1] + t * .5;
        out[i] = { x: cx, z: cz, u: inner === lo ? [0, -t] : [0, t] };
        end = [cx + h[0] * .5, end[1] + t * (2 + gap)];
        h = [-h[0], 0]; after = true; continue;
      }
      let len, u;
      if (dbl && !after) { len = 1; u = h[0] !== 0 ? [0, -1] : [-1, 0]; }
      else { len = 2; u = inner === lo ? [-h[0], -h[1]] : [h[0], h[1]]; }
      out[i] = { x: end[0] + h[0] * (gap + len / 2), z: end[1] + h[1] * (gap + len / 2), u };
      end = [end[0] + h[0] * (gap + len), end[1] + h[1] * (gap + len)];
      after = false;
    }
  };
  arm(ci + 1, n, 1, i => ({ inner: b[i].a, outer: b[i].b }), [half, 0], [1, 0], -1);
  arm(ci - 1, -1, -1, i => ({ inner: b[i].b, outer: b[i].a }), [-half, 0], [-1, 0], 1);
  return out;
}

function computeTargets() {
  const T = new Map(), seats = SEATPOS[G.mode];
  const reg = { cx: 0, cz: -.3, hw: G.n === 2 ? 4.0 : 4.8, hd: 4.2 };
  const lay = layoutBoard();
  if (lay.length) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const o of lay) { const ax = Math.abs(o.u[0]) > .5, ex = ax ? 1 : .5, ez = ax ? .5 : 1; x0 = Math.min(x0, o.x - ex); x1 = Math.max(x1, o.x + ex); z0 = Math.min(z0, o.z - ez); z1 = Math.max(z1, o.z + ez); }
    const s = Math.min(1, 2 * reg.hw / (x1 - x0), 2 * reg.hd / (z1 - z0)), bx = (x0 + x1) / 2, bz = (z0 + z1) / 2;
    G.board.forEach((b, i) => { const o = lay[i]; T.set(key([b.a, b.b]), { zone: 'board', p: new THREE.Vector3(reg.cx + (o.x - bx) * s, .16 * s, reg.cz + (o.z - bz) * s), q: qFlat(o.u), s }); });
  }
  for (let p = 0; p < G.n; p++) {
    const pos = seats[p], h = G.hands[p], n = h.length;
    if (pos === 'S') {
      const sp = Math.min(1.12, 11.4 / Math.max(n, 1));
      h.forEach((t, i) => {
        const x = (i - (n - 1) / 2) * sp, z = 6.25; let y = .86;
        if (G.await) {
          if (G.await.evals.some(e => e.m.t === t)) y += .28;
          if (G.sel === t) y += .35;
          if (G.hint && G.hint.m.t === t) y += .2;
        }
        const nx = -x * .05, L = Math.hypot(nx, 1);
        T.set(key(t), { zone: 'hand', p: new THREE.Vector3(x, y, z), q: qStand([nx / L, 1 / L], .52), s: 1 });
      });
    } else {
      const flat = G.reveal || G.over, R = RACK[pos], sp = Math.min(1.08, (pos === 'N' ? 9.5 : 7.6) / Math.max(n, 1));
      h.forEach((t, i) => {
        const off = (i - (n - 1) / 2) * sp, x = R.c[0] + R.along[0] * off, z = R.c[1] + R.along[1] * off;
        T.set(key(t), flat ? { zone: 'hand', p: new THREE.Vector3(x, .16, z), q: qFlat(R.n), s: 1 } : { zone: 'hand', p: new THREE.Vector3(x, .98, z), q: qStand(R.n, .14), s: 1 });
      });
    }
  }
  G.bone.forEach((t, i) => { const col = i % 7, layer = Math.floor(i / 7); T.set(key(t), { zone: 'bone', p: new THREE.Vector3(5.65, .16 + layer * .33, -3.9 + col * 1.15), q: qFlat([1, 0], true), s: 1 }); });
  return T;
}

function resetPile() {
  let i = 0;
  for (const m of V.tiles.values()) {
    m.position.set((Math.random() - .5) * 1.6, .16 + (i++ % 4) * .33, (Math.random() - .5) * 1.6 - .3);
    m.quaternion.copy(qFlat([Math.cos(i), Math.sin(i)], true)); m.scale.setScalar(1);
    m.userData.tw = null; m.userData.to = null;
  }
}

function sync3D() {
  if (!V.ok || !G) return;
  const hid = G.mid + ':' + G.handNo, deal = hid !== V.hid;
  if (deal) { V.hid = hid; resetPile(); updatePlayers(); }
  if (G.lastKey !== V.lastKey) { V.lastKey = G.lastKey; if (G.lastKey) V.flash = { key: G.lastKey, t0: performance.now() }; }
  const T = computeTargets(), now = performance.now();
  let k = 0;
  for (const [kk, m] of V.tiles) {
    const tg = T.get(kk); if (!tg) continue;
    const prev = m.userData.to;
    if (prev && prev.p.distanceToSquared(tg.p) < 1e-6 && prev.q.angleTo(tg.q) < 1e-3 && Math.abs(prev.s - tg.s) < 1e-4) continue;
    const toBoard = tg.zone === 'board' && (!prev || prev.zone !== 'board');
    const arc = deal ? .8 : toBoard ? 1.7 : (prev && prev.zone !== tg.zone ? 1.0 : 0);
    m.userData.tw = { fp: m.position.clone(), fq: m.quaternion.clone(), fs: m.scale.x, tg, t0: now + (deal ? 250 + (k++) * 32 : 0), dur: toBoard ? 620 : deal ? 520 : 380, arc };
    m.userData.to = tg;
  }
  V.hl.clear();
  if (G.board.length) { const f = G.board[0], l = G.board[G.board.length - 1]; V.hl.set(key([f.a, f.b]), [0xeaa53f, .16]); V.hl.set(key([l.a, l.b]), [0xeaa53f, .16]); }
  V.dim = null;
  if (G.await && UI.screen === 'game') {
    V.dim = new Set(G.hands[0].map(key));
    for (const e of G.await.evals) { V.hl.set(key(e.m.t), [0x5fd38a, .2]); V.dim.delete(key(e.m.t)); }
    if (G.sel) V.hl.set(key(G.sel), [0xeaa53f, .45]);
    if (G.hint) V.hl.set(key(G.hint.m.t), [0xffc04d, .6]);
  }
  updatePad();
}

/* ---------- Câmera ---------- */
function insets() {
  const H = V.H;
  if (UI.screen !== 'game') return { top: H * .04, bottom: Math.min(H * .56, 470) };
  const top = $('#hudTop').getBoundingClientRect().bottom, bottom = H - $('#hudBottom').getBoundingClientRect().top;
  return { top: Math.max(top, 60), bottom: Math.max(bottom, 80) };
}
function applyCam(d, top, bottom) {
  const W = V.W, H = V.H, extra = Math.abs(bottom - top), cam = V.cam;
  cam.aspect = W / (H + extra);
  cam.setViewOffset(W, H + extra, 0, bottom > top ? bottom - top : 0, W, H);
  cam.position.set(TARGET_PT.x, TARGET_PT.y + Math.sin(ELEV) * d, TARGET_PT.z + Math.cos(ELEV) * d);
  cam.lookAt(TARGET_PT); cam.updateMatrixWorld();
}
function fitCamera() {
  if (!V.ok) return;
  const { top, bottom } = insets(), H = V.H;
  const pts = [[-7.7, .3, 8.1], [7.7, .3, 8.1], [-7.7, .3, -8.1], [7.7, .3, -8.1], [-5.2, 2.1, 6.25], [5.2, 2.1, 6.25], [0, 4.2, -9.5]].map(p => new THREE.Vector3(...p));
  const yMin = -1 + 2 * bottom / H + .01, yMax = 1 - 2 * top / H - .01;
  let topEff = top, hi = 140;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 8; hi = 140;
    for (let i = 0; i < 26; i++) {
      const d = (lo + hi) / 2; applyCam(d, topEff, bottom);
      const fits = pts.every(p => { const v = p.clone().project(V.cam); return Math.abs(v.x) <= .97 && v.y >= yMin && v.y <= yMax; });
      if (fits) hi = d; else lo = d;
    }
    applyCam(hi, topEff, bottom);
    const minY = Math.min(...pts.map(p => p.clone().project(V.cam).y));
    const slackPx = (minY - yMin) * H / 2;
    if (slackPx < 4) break;
    topEff += slackPx * 1.6;
  }
  V.camGoal = { d: hi, top: topEff, bottom };
  if (!V.camCur) V.camCur = { ...V.camGoal };
}
function resize3D() {
  if (!V.ok) return;
  V.W = stage.clientWidth; V.H = stage.clientHeight;
  V.fg.setSize(V.W, V.H, false); V.bg.setSize(V.W, V.H, false);
  fitCamera(); if (V.camGoal) V.camCur = { ...V.camGoal };
}
const refit = () => requestAnimationFrame(() => fitCamera());

/* ---------- Toque nas pedras ---------- */
function onPick(e) {
  if (!G || !G.await || UI.screen !== 'game') return;
  const r = e.currentTarget.getBoundingClientRect();
  V.ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), V.cam);
  const bodies = G.hands[0].map(t => V.tiles.get(key(t)).userData.body);
  const hit = V.ray.intersectObjects(bodies, false)[0];
  if (hit) { const t = G.hands[0].find(x => key(x) === hit.object.userData.key); if (t) pickTile(t); }
}

/* ---------- Animação ---------- */
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const cWhite = new THREE.Color(0xffffff), cDim = new THREE.Color(0x8a8275);
const cBone = new THREE.Color(0xf1e8d6), cBoneDim = cBone.clone().multiply(cDim);
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(100, now - (V.last || now)); V.last = now;
  if (V.camGoal && V.camCur) {
    const c = V.camCur, g = V.camGoal, k = 1 - Math.exp(-dt / 140);
    c.d += (g.d - c.d) * k; c.top += (g.top - c.top) * k; c.bottom += (g.bottom - c.bottom) * k;
    applyCam(c.d, c.top, c.bottom);
  }
  for (const m of V.tiles.values()) {
    const ud = m.userData, tw = ud.tw;
    if (tw) {
      let t = (now - tw.t0) / tw.dur;
      if (t >= 0) {
        if (t >= 1) t = 1;
        const e = ease(t);
        m.position.lerpVectors(tw.fp, tw.tg.p, e); m.position.y += tw.arc * Math.sin(Math.PI * e);
        m.quaternion.slerpQuaternions(tw.fq, tw.tg.q, e); m.scale.setScalar(tw.fs + (tw.tg.s - tw.fs) * e);
        if (t === 1) ud.tw = null;
      }
    }
    let [col, inten] = V.hl.get(ud.key) || [0xeaa53f, 0];
    if (V.flash && V.flash.key === ud.key) { const f = .7 * (1 - (now - V.flash.t0) / 2200); if (f > inten) { inten = f; col = 0xffb84d; } }
    if (V.hl.has(ud.key) && (V.hl.get(ud.key)[1] >= .6)) inten *= .75 + .25 * Math.sin(now / 160);
    ud.em += (inten - ud.em) * Math.min(1, dt / 100);
    ud.body.material.emissive.setHex(col); ud.body.material.emissiveIntensity = ud.em;
    ud.fm.emissive.setHex(col); ud.fm.emissiveIntensity = ud.em * .6;
    const dim = V.dim && V.dim.has(ud.key);
    ud.body.material.color.lerp(dim ? cBoneDim : cBone, .15); ud.fm.color.lerp(dim ? cDim : cWhite, .15);
  }
  animPlayers(now); animSmoke(now); placeOverlays();
  V.fg.render(V.fgScene, V.cam);
  if (!(V.frame++ & 1)) V.bg.render(V.bgScene, V.cam);
}
function animPlayers(now) {
  if (!G) return;
  const seats = SEATPOS[G.mode], turnPos = G.over ? null : seats[G.turn];
  for (const pos of ['N', 'E', 'W']) {
    const pl = V.players[pos]; if (!pl.visible) continue;
    const u = pl.userData, t = now / 1000;
    u.torso.scale.y = 1 + .02 * Math.sin(t * 1.7 + u.phase);
    const lookAt = turnPos && turnPos !== pos ? (turnPos === 'S' ? [0, 6.5] : [PL[turnPos].x, PL[turnPos].z]) : [0, 0];
    const yaw = Math.atan2(lookAt[0] - PL[pos].x, lookAt[1] - PL[pos].z) - pl.rotation.y;
    const yw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    u.head.rotation.y += (Math.max(-.7, Math.min(.7, yw)) - u.head.rotation.y) * .05;
    const lean = turnPos === pos ? .16 : 0;
    u.head.rotation.x += ((turnPos === pos ? .35 : .12) - u.head.rotation.x) * .05;
    pl.rotation.x += (lean - pl.rotation.x) * .05;
  }
}
function animSmoke(now) {
  if (!V.ember) return;
  V.ember.material.color.setHSL(.04, 1, .5 + .08 * Math.sin(now / 90) + .05 * Math.sin(now / 37));
  for (const sp of V.smoke) {
    const t = ((now / 4200) + sp.userData.phase) % 1;
    sp.position.set(V.emberPos.x + Math.sin(t * 6 + sp.userData.phase * 9) * .25 * t, V.emberPos.y + .1 + t * 2.8, V.emberPos.z + Math.cos(t * 4) * .15 * t);
    sp.scale.setScalar(.25 + t * 1.3);
    sp.material.opacity = .14 * Math.sin(Math.PI * t);
  }
}

/* ---------- Etiquetas e balões presos à cena ---------- */
const v3 = new THREE.Vector3();
function project(p) { v3.set(...p).project(V.cam); return [(v3.x + 1) / 2 * V.W, (1 - v3.y) / 2 * V.H]; }
function placeOverlays() {
  if (UI.screen !== 'game' || !G) return;
  const seats = SEATPOS[G.mode];
  for (const el of $('#labels').children) {
    const [x, y] = project(ANCH[el.dataset.pos]);
    const w = el.offsetWidth, cx = Math.max(8 + w / 2, Math.min(V.W - 8 - w / 2, x));
    el.style.transform = `translate(${cx - w / 2}px, ${y - el.offsetHeight}px)`;
  }
  if (POP.hidden) return;
  const w = POP.offsetWidth, h = POP.offsetHeight, ins = V.camGoal || { top: 80, bottom: 120 };
  const hudTop = $('#hudTop').getBoundingClientRect().bottom;
  let left = (V.W - w) / 2, top = hudTop + 4, tx = w / 2, cls = 'prof';
  const pos = POP.dataset.pos;
  if (pos) {
    cls = 'say';
    if (pos !== 'S') {
      const [ax, ay] = project(ANCH[pos]);
      const lbl = $(`#labels [data-pos="${pos}"]`), ly = lbl ? ay - lbl.offsetHeight : ay;
      if (ly > top + h + 10) { left = Math.max(12, Math.min(V.W - w - 12, ax - w / 2)); tx = Math.max(22, Math.min(w - 22, ax - left)); cls = 'down'; }
    }
  }
  POP.style.transform = `translate(${left}px, ${top}px)`;
  POP.style.setProperty('--tx', tx + 'px');
  POP.classList.toggle('down', cls === 'down'); POP.classList.toggle('say', cls === 'say'); POP.classList.toggle('prof', cls === 'prof');
}

/* ================== HUD ================== */
function buildLabels() {
  const seats = SEATPOS[G.mode];
  $('#labels').innerHTML = seats.map((pos, p) => p === 0 ? '' : `<div class="lbl" data-pos="${pos}" data-p="${p}"></div>`).join('');
}
function lackChip(p) { const l = [...G.know.lacks[p]].sort(); return l.length ? `<span class="lack">sem ${l.join('·')}</span>` : ''; }
function renderHud() {
  const T = TEAMS[G.mode];
  $('#gMode').textContent = G.mode === '1x1' ? 'Mano a mano' : 'Duplas';
  $('#gSub').textContent = `${PLAY_NAME[G.play]} · rodada ${G.handNo} · até ${TARGET}`;
  $('#gScore').innerHTML = `<span class="dot t0"></span><i>${T[0]}</i>${G.score[0]}<i>·</i>${G.score[1]}<i>${T[1]}</i><span class="dot t1"></span>`;
  const mid = G.n === 2 ? `dorme <b style="font-size:13px;font-family:var(--f-mono)">${G.bone.length}</b>` : (G.over ? 'fim da rodada' : `vez de <strong>${nameOf(G.turn)}</strong>`);
  $('#ends').innerHTML = G.board.length
    ? `${face(G.L, 22)}<b>${G.L}</b><span class="sep"></span><span>${mid}</span><span class="sep"></span><b>${G.R}</b>${face(G.R, 22)}`
    : `<span style="padding-left:6px">mesa vazia</span><span class="sep"></span><span>${G.over ? '' : 'vez de <strong>' + nameOf(G.turn) + '</strong>'}</span>`;
  for (const el of $('#labels').children) {
    const p = +el.dataset.p;
    el.className = 'lbl' + (G.turn === p && !G.over ? ' turn' : '');
    el.innerHTML = `<span class="dot t${team(p)}"></span><b>${nameOf(p)}</b><span class="n">${G.hands[p].length}</span>${lackChip(p)}`;
  }
  const h = G.hands[0];
  $('#me').innerHTML = `<span class="dot t0"></span><b>${G.play === 'watch' && G.n === 4 ? 'Sul' : 'Você'}</b><span class="n">${h.length} pedras · ${handPips(h)} pts</span>${lackChip(0)}${G.await ? '<span class="turn-pill">Sua vez</span>' : ''}`;
  const watch = G.play === 'watch';
  const next = G.matchOver ? 'Nova partida' : G.over ? 'Próxima rodada' : G.await ? 'Sua vez' : 'Próxima';
  $('#controls').innerHTML = `<button class="ctl" data-c="count">Contagem</button>`
    + (watch ? `<button class="ctl" data-c="reveal" aria-pressed="${G.reveal}">Mãos</button>` : `<button class="ctl" data-c="hint" ${G.await && G.await.evals.length > 1 ? '' : 'disabled'}>Dica</button>`)
    + `<button class="ctl" data-c="pause" aria-pressed="${UI.paused}">${UI.paused ? 'Seguir' : 'Pausar'}</button>`
    + `<button class="primary" data-c="next" ${G.await ? 'disabled' : ''}>${next}</button>`;
}

/* ================== Balões ================== */
const endsTxt = e => e[0] === e[1] ? `${e[0]}` : `${e[0]} nem ${e[1]}`;
function say(p, main, why, extra = '') {
  return { pos: SEATPOS[G.mode][p], html: `<div class="p-who"><span class="dot t${team(p)}"></span>${nameOf(p)}</div><div class="p-main">${main}</div>${why ? `<div class="p-why">${why}</div>` : ''}${extra}` };
}
const prof = (title, main, body) => ({ pos: '', html: `<div class="p-who">${title}</div>${main ? `<div class="p-main">${main}</div>` : ''}${body || ''}` });
function popFor(ev) {
  const teach = G.play !== 'solo';
  const whyRow = (tags) => `<div class="p-row">${tags}<button class="why-btn" data-why>Por quê?</button></div>`;
  switch (ev.type) {
    case 'start':
      return prof(`Rodada ${G.handNo}`, `${nameOf(ev.p)} começa`, `<div class="p-why">${ev.why}</div>` + (teach ? `<div class="p-row"><span class="tag">Dica</span><span class="p-why">${TIPS[(G.handNo - 1) % TIPS.length]}</span></div>` : ''));
    case 'await': {
      let body = `<div class="p-why">${G.sel ? 'Essa pedra serve nas duas pontas. Onde jogar?' : G.await.forced ? 'Toque na carroça para abrir a mesa.' : 'Toque numa pedra que brilha.'}</div>`;
      if (G.sel) body += `<div class="choice">${G.await.evals.filter(e => e.m.t === G.sel).map((e, i) => `<button data-o="${i}">No ${e.m.side === 'L' ? G.L : G.R} (${e.m.side === 'L' ? 'esquerda' : 'direita'})</button>`).join('')}</div>`;
      if (G.hint) { const r = reasonsFor(G.hint, 0)[0]; body += `<div class="p-row"><span class="tag">Dica</span><span class="p-why">${mini(G.hint.m.t)} ${G.board.length ? (G.hint.m.side === 'L' ? 'na esquerda' : 'na direita') : ''}: ${r.short}</span></div>`; }
      return prof('Sua vez', G.board.length ? `Pontas ${G.L} e ${G.R}` : 'Você abre a mesa', body);
    }
    case 'pass': {
      let tip = '';
      if (teach && G.n === 4 && ev.p !== 0 && team(ev.p) === 0) tip = `Parceiro sem ${list(ev.ends)}: evite essas pontas.`;
      else if (teach && team(ev.p) !== 0) tip = `Anote: ${list(ev.ends)} na ponta trava ${nameOf(ev.p)}.`;
      return say(ev.p, 'Passo!', `Não tenho ${endsTxt(ev.ends)}.`, tip ? `<div class="p-row"><span class="tag">Leitura</span><span class="p-why">${tip}</span></div>` : '');
    }
    case 'draw':
      return say(ev.p, `Comprei ${ev.drawn} ${ev.drawn > 1 ? 'pedras' : 'pedra'}`, `Estava sem ${endsTxt(ev.ends)}. Restam ${ev.left} no dorme.`,
        teach && ev.p !== 0 ? `<div class="p-row"><span class="tag">Leitura</span><span class="p-why">Deixe ${list(ev.ends)} nas pontas para apertar.</span></div>` : '');
    case 'play': {
      UI.popEv = ev;
      const t = ev.chosen.m.t, side = G.board.length === 1 ? '' : (ev.chosen.m.side === 'L' ? ' na esquerda' : ' na direita');
      if (ev.user) {
        if (!ev.graded) return null;
        const best = ev.evals[0], good = ev.rank === 0 || ev.g >= 9.95, cls = good ? 'good' : ev.g >= 7 ? 'mid' : 'bad';
        const body = good
          ? `<div class="verdict good">Boa! Era a melhor jogada. Nota 10</div><div class="p-why">${reasonsFor(ev.chosen, 0)[0].short}</div>`
          : `<div class="verdict ${cls}">Nota ${fmt(ev.g)} · melhor era ${mini(best.m.t)}</div><div class="p-why">${reasonsFor(best, 0)[0].short}</div>`;
        return prof('Professor', '', body + whyRow(''));
      }
      if (!teach) return say(ev.p, `Joguei ${mini(t, 13)}`, '');
      if (ev.forced) return say(ev.p, `Abro com ${mini(t, 13)}`, 'Regra: a maior carroça abre.');
      if (ev.only) return say(ev.p, `Joguei ${mini(t, 13)}${side}`, 'Era a única que servia.');
      const rs = reasonsFor(ev.chosen, ev.p);
      const tags = [...new Set(rs.filter(r => r.cls === 'pos').slice(0, 2).map(r => TAG[r.tag]))].map(x => `<span class="tag">${x}</span>`).join('');
      return say(ev.p, `Joguei ${mini(t, 13)}${side}`, rs[0].short, whyRow(tags));
    }
  }
  return null;
}
function renderPop() {
  const pop = UI.screen === 'game' && G ? popFor(G.lastEv) : null;
  const sig = pop ? pop.pos + pop.html : '';
  if (sig === UI.popSig) return;
  UI.popSig = sig;
  if (!pop) { POP.hidden = true; return; }
  POP.dataset.pos = pop.pos; POP.innerHTML = pop.html; POP.hidden = false;
  POP.style.animation = 'none'; void POP.offsetWidth; POP.style.animation = '';
  placeOverlays();
}
POP.addEventListener('click', e => {
  if (e.target.closest('[data-why]')) return showDetail(UI.popEv);
  const o = e.target.closest('[data-o]');
  if (o && G.await && G.sel) { const opts = G.await.evals.filter(x => x.m.t === G.sel); doUserMove(opts[+o.dataset.o].m); }
});

/* ================== Fluxo ================== */
function render() {
  if (!G) return;
  if (UI.screen === 'game') renderHud();
  renderPop();
  sync3D();
}
function schedule() {
  clearTimeout(UI.timer);
  if (!G) return;
  const menu = UI.screen === 'menu';
  if (!menu && (UI.paused || sheetOpen())) return;
  if (G.await) return;
  if (G.over && !menu) return;
  UI.timer = setTimeout(tick, menu ? (G.over ? 3800 : SPEED.demo) : SPEED[G.play]);
}
function tick() {
  if (UI.screen === 'menu' && G.over) { if (G.matchOver) newMatch('2x2', 'watch'); else newHand(); G.reveal = false; render(); schedule(); return; }
  if (G.over) return;
  step(); afterStep();
}
function afterStep() {
  render();
  if (G.over && UI.screen === 'game') { setTimeout(() => { if (UI.screen === 'game' && G.over && !sheetOpen()) showResult(); }, 1300); return; }
  schedule();
}
function onNext() {
  if (!G || UI.screen !== 'game') return;
  if (G.matchOver) { newMatch(G.mode, G.play); buildLabels(); render(); schedule(); return; }
  if (G.over) { closeSheet(true); newHand(); render(); schedule(); return; }
  if (G.await) return;
  clearTimeout(UI.timer); step(); afterStep();
}
function pickTile(t) {
  if (!G.await) return;
  const opts = G.await.evals.filter(e => e.m.t === t);
  if (!opts.length) return;
  if (opts.length === 1) return doUserMove(opts[0].m);
  G.sel = G.sel === t ? null : t; render();
}
function doUserMove(m) { userMove(m); afterStep(); }

function startGame(mode, play) {
  closeSheet(true);
  newMatch(mode, play);
  UI.screen = 'game'; UI.paused = false; UI.popSig = '';
  MENU.hidden = true; HUD.hidden = false;
  buildLabels(); render(); refit(); schedule();
}
function toMenu() {
  clearTimeout(UI.timer); closeSheet(true);
  UI.screen = 'menu'; HUD.hidden = true; MENU.hidden = false; POP.hidden = true; UI.popSig = '';
  newMatch('2x2', 'watch'); G.reveal = false;
  for (let i = 0; i < 6; i++) step();
  render(); refit(); schedule();
}

$('#controls').addEventListener('click', e => {
  const b = e.target.closest('[data-c]'); if (!b || b.disabled) return;
  const c = b.dataset.c;
  if (c === 'next') onNext();
  else if (c === 'count') showCount();
  else if (c === 'reveal') { G.reveal = !G.reveal; render(); }
  else if (c === 'pause') { UI.paused = !UI.paused; render(); schedule(); }
  else if (c === 'hint' && G.await) { G.hint = G.await.evals[0]; render(); }
});
$('#btnBack').addEventListener('click', toMenu);
document.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => pickMode(b.dataset.play)));
$('#btnRules').addEventListener('click', showRules);
$('#btnCredits').addEventListener('click', showCredits);
document.addEventListener('keydown', e => {
  if (UI.screen !== 'game' || sheetOpen()) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); onNext(); }
});
window.addEventListener('resize', refit);

/* ================== Folhas ================== */
function sheet(html) {
  const root = $('#sheetRoot');
  root.innerHTML = `<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const bg = root.firstElementChild;
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet()));
  clearTimeout(UI.timer);
  return root;
}
function closeSheet(silent) { $('#sheetRoot').innerHTML = ''; if (!silent) schedule(); }

function pickMode(play) {
  const intro = { solo: 'Você joga contra o computador. Use Dica quando travar.', train: 'Você joga e o professor dá nota de 0 a 10 a cada lance.', watch: 'O professor joga por todos e explica cada lance em balões.' }[play];
  sheet(`<h3>${PLAY_NAME[play]}</h3><p>${intro}</p>
    <div class="mode-pick">
      <button class="mode-card" data-mode="1x1"><div class="mc-num">1<span>×</span>1</div><div><h5>Mano a mano</h5><p>Contra um rival. 14 pedras no dorme: sem jogada, compra até encaixar.</p></div></button>
      <button class="mode-card" data-mode="2x2"><div class="mc-num">2<span>×</span>2</div><div><h5>Duplas</h5><p>Você e Norte contra Leste e Oeste. Sem compra e sem conversa: só a jogada comunica.</p></div></button>
    </div>
    <button class="linkbtn" data-close>Voltar</button>`);
  document.querySelectorAll('.mode-card').forEach(b => b.addEventListener('click', () => startGame(b.dataset.mode, play)));
}

function showRules() {
  sheet(`<h3>Dominó clássico</h3>
  <h4>Modos</h4>
  <ul>
    <li><strong>Jogar solo:</strong> você contra o computador, sem explicações. O botão Dica mostra a melhor jogada.</li>
    <li><strong>Treino:</strong> você joga e recebe nota de 0 a 10 em cada lance, com o motivo.</li>
    <li><strong>Assistir:</strong> o professor joga por todos e explica cada lance em balões. Toque em "Por quê?" para ver tudo.</li>
  </ul>
  <h4>A mesa</h4>
  <ul>
    <li><strong>28 pedras</strong>, de 0|0 a 6|6. Cada número aparece em 7 pedras. Cada jogador recebe 7.</li>
    <li><strong>1×1:</strong> as 14 que sobram ficam no <strong>dorme</strong>. Sem pedra que encaixe, compre até conseguir jogar. Dorme vazio: passe.</li>
    <li><strong>2×2:</strong> as 28 pedras são distribuídas, parceiros frente a frente. Sem compra: sem jogada, passe. Nada de conversa ou sinais.</li>
    <li><strong>Saída:</strong> na primeira rodada abre quem tem a carroça de 6 (no 1×1, a maior carroça na mão). Depois, sai quem venceu a rodada anterior.</li>
  </ul>
  <h4>Pontuação</h4>
  <ul>
    <li><strong>Batida:</strong> quem fica sem pedras marca a soma das mãos do lado adversário.</li>
    <li><strong>Jogo trancado:</strong> ninguém consegue jogar. Vence o lado com menos pontos na mão e marca os pontos do outro. Empate: ninguém marca.</li>
    <li>Partida até <strong>${TARGET} pontos</strong>.</li>
  </ul>
  <h4>O que o professor observa</h4>
  <ol>
    <li><strong>Bloqueio:</strong> chance de o próximo adversário não ter as novas pontas.</li>
    <li><strong>Leitura:</strong> quem passou ou comprou não tem aqueles números.</li>
    <li><strong>Controle:</strong> ficar com pedras que servem nas pontas.</li>
    <li><strong>Carroças:</strong> jogar cedo.</li>
    <li><strong>Peso:</strong> livrar pedras pesadas.</li>
    <li><strong>Parceria:</strong> não travar o parceiro e devolver os números que ele abre.</li>
    <li><strong>Tranca:</strong> só trancar com a mão mais leve.</li>
  </ol>
  <button class="primary" data-close>Entendi</button>`);
}

function showCredits() {
  sheet(`<div class="credits">
      <svg viewBox="0 0 512 512" width="88" height="88" aria-hidden="true"><use href="#mark"/></svg>
      <div><div class="w1" style="font-size:34px">Pedra</div><div class="w2" style="justify-content:center">MESTRA</div></div>
      <p>Criado por</p>
      <div class="by">Henrique Ruher</div>
    </div>
    <h4>Sobre</h4>
    <ul>
      <li>Dominó clássico de 28 pedras, mano a mano e em duplas.</li>
      <li>Mesa 3D feita com Three.js.</li>
    </ul>
    <p class="s-count" style="text-align:center">Versão 2.0</p>
    <button class="primary" data-close>Fechar</button>`);
}

function showDetail(ev) {
  if (!ev) return;
  const p = ev.p, e = ev.chosen, best = ev.evals[0];
  let html = `<h3>${nameOf(p)} jogou ${mini(e.m.t, 14)}</h3>`;
  if (ev.user && ev.graded) {
    const good = ev.rank === 0 || ev.g >= 9.95;
    html += `<p><strong>Nota ${fmt(good ? 10 : ev.g)}.</strong> ${good ? 'Era a melhor jogada.' : `A melhor era ${mini(best.m.t, 12)}: sua escolha ${altReason(best, e)}.`}</p>`;
    if (!good) html += `<h4>O que a melhor fazia</h4><ul class="reasons">${reasonsFor(best, p).map(r => `<li class="${r.cls}">${r.txt}</li>`).join('')}</ul><h4>Sua jogada</h4>`;
  } else html += `<h4>Por que esta jogada</h4>`;
  html += `<ul class="reasons">${reasonsFor(e, p).map(r => `<li class="${r.cls}">${r.txt}</li>`).join('')}</ul>`;
  const alts = ev.evals.filter(x => x !== e).slice(0, 4);
  if (alts.length) html += `<h4>Outras opções</h4>` + alts.map(a => `<div class="alt">${mini(a.m.t, 11)}<span>${G.board.length === 1 ? '' : (a.m.side === 'L' ? 'esq.' : 'dir.') + ' → '}pontas ${a.nl}·${a.nr}: ${a === best ? 'a melhor' : altReason(best, a)}</span><span class="grade">${fmt(grade(best, a))}</span></div>`).join('');
  if (!ev.user) html += `<p class="s-count">O professor só usou o que ${nameOf(p)} sabia: a própria mão, a mesa e quem passou ou comprou.</p>`;
  sheet(html + `<button class="primary" data-close>Voltar à mesa</button>`);
}

function showCount() {
  const onBoard = new Set(G.board.map(b => key([b.a, b.b]))), mine = new Set(G.hands[0].map(key));
  let rows = '';
  for (let n = 0; n <= 6; n++) {
    const ts = ALL.filter(t => has(t, n));
    const b = ts.filter(t => onBoard.has(key(t))).length, m = ts.filter(t => mine.has(key(t))).length;
    rows += `${face(n, 20)}<div class="slots">${[...Array(7)].map((_, i) => `<i class="${i < b ? 'b' : i < b + m ? 'm' : ''}"></i>`).join('')}</div><span class="s-count">${7 - b - m} fora</span>`;
  }
  const lacks = [...Array(G.n).keys()].map(p => { const l = [...G.know.lacks[p]].sort(); return `<li><strong>${nameOf(p)}:</strong> ${l.length ? 'não tem ' + list(l) : 'nada revelado ainda'}</li>`; }).join('');
  sheet(`<h3>Contagem de pedras</h3>
    <p>Cada número existe em 7 pedras. O que não está na mesa nem na sua mão está com ${G.n === 2 ? 'o rival ou no dorme' : 'os outros três'}.</p>
    <div class="legend"><span><i style="background:var(--amber)"></i>na mesa</span><span><i style="background:var(--sage)"></i>na sua mão</span><span><i style="background:var(--wood-3)"></i>com os outros</span></div>
    <div class="count-grid">${rows}</div>
    <h4>O que cada um já revelou</h4><ul>${lacks}</ul>
    <button class="primary" data-close>Voltar à mesa</button>`);
}

function showResult() {
  if (!G.result) return;
  const r = G.result, T = TEAMS[G.mode];
  const title = r.kind === 'bateu' ? `${nameOf(r.p)} bateu!` : 'Jogo trancado';
  const sub = r.win < 0 ? 'Empate na contagem: ninguém marca.' : `${T[r.win]} ${G.n === 4 ? 'marcam' : 'marca'} ${r.pts} pontos${r.kind === 'trancou' ? ` (menos pontos na mão: ${r.tp[r.win]} contra ${r.tp[1 - r.win]})` : ''}.`;
  const rows = [...Array(G.n).keys()].map(p => `<div class="res-row"><div><strong><span class="dot t${team(p)}"></span> ${nameOf(p)}</strong><div class="tiles">${G.hands[p].map(t => tileSVG(t[0], t[1], { s: 10, v: true })).join('') || '<span class="s-count">sem pedras</span>'}</div></div><span class="s-count">${handPips(G.hands[p])} pts</span></div>`).join('');
  const st = G.play === 'train' && G.stats.asked ? `<p>Seu treino: <strong>${G.stats.best} de ${G.stats.asked}</strong> jogadas iguais às do professor, nota média <strong>${fmt(G.stats.sumGrade / G.stats.asked)}</strong>.</p>` : '';
  const champ = G.matchOver ? `<p><strong>${T[G.score[0] >= G.score[1] ? 0 : 1]} ${G.n === 4 ? 'vencem' : 'vence'} a partida!</strong></p>` : '';
  sheet(`<h3>${title}</h3><p>${sub}</p>
    <div class="big-score"><div>${G.score[0]}<small>${T[0]}</small></div><span style="color:var(--ink-faint)">·</span><div>${G.score[1]}<small>${T[1]}</small></div></div>
    ${champ}<div>${rows}</div>${st}
    <button class="primary" id="resNext">${G.matchOver ? 'Nova partida' : 'Próxima rodada'}</button>
    <button class="linkbtn" data-close>Ver a mesa</button>`);
  $('#resNext').addEventListener('click', onNext);
}

/* ================== Início ================== */
init3D();
toMenu();
