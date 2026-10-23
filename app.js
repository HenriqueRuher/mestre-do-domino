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
const SPEED = { watch: 2100, solo: 1000, demo: 2400 };
const PLAY_NAME = { watch: 'Assistir', train: 'Treino', solo: 'Solo' };
const sheetOpen = () => $('#sheetRoot').childElementCount > 0;

/* ================== Cena 3D ================== */
const V = { ok: false, tiles: new Map(), players: {}, hl: new Map(), frame: 0, hid: '', flash: null, lastKey: null, W: 1, H: 1,
            cam: null, camCur: null, camGoal: null, smoke: [], ember: null, pad: null, padSig: '' };
const SEATPOS = { '1x1': ['S', 'N'], '2x2': ['S', 'E', 'N', 'W'] };
const PL = { N: { x: 0, z: -11.4 }, E: { x: 11.2, z: -.3 }, W: { x: -11.2, z: -.3 } };
const ANCH = { S: [0, 2.15, 6.25], N: [0, 11.2, -11.4], E: [11.2, 11.2, -.3], W: [-11.2, 11.2, -.3] };
const RACK = { N: { c: [0, -6.3], along: [1, 0], n: [0, -1] }, E: { c: [5.95, -.3], along: [0, 1], n: [1, 0] }, W: { c: [-5.95, -.3], along: [0, 1], n: [-1, 0] } };
const TARGET_PT = new THREE.Vector3(0, 0, 0.3);
const ELEV = 40 * Math.PI / 180;
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
    V.mid = new THREE.WebGLRenderer({ canvas: $('#mid3d'), antialias: true, alpha: true });
  } catch (e) {
    stage.insertAdjacentHTML('beforeend', '<p class="no3d-msg">Seu navegador não conseguiu abrir a mesa 3D. Atualize o navegador ou ative a aceleração gráfica.</p>');
    return;
  }
  V.fg.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  V.bg.setPixelRatio(.75);
  V.mid.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); V.mid.setClearColor(0x000000, 0);
  for (const r of [V.fg, V.bg, V.mid]) r.toneMapping = THREE.ACESFilmicToneMapping;
  V.fg.toneMappingExposure = .9; V.bg.toneMappingExposure = 1.2; V.mid.toneMappingExposure = 1.15;
  V.fg.setClearColor(0x000000, 0);
  V.fg.shadowMap.enabled = true; V.fg.shadowMap.type = THREE.PCFSoftShadowMap;
  V.cam = new THREE.PerspectiveCamera(46, 1, .5, 600);
  V.fgScene = new THREE.Scene(); V.bgScene = new THREE.Scene(); V.midScene = new THREE.Scene();
  buildRoom(); buildTable(); buildProps(); buildTiles(); buildMidLights(); buildPlayers(); buildLife(); scaleRoomLights();
  V.ray = new THREE.Raycaster();
  new ResizeObserver(resize3D).observe(stage);
  $('#fg3d').addEventListener('pointerdown', onPick);
  V.ok = true;
  resize3D();
  requestAnimationFrame(loop);
}

/* ---------- O bar ao fundo (camada desfocada) ---------- */
// O bar é modelado em "escala de pessoa" e ampliado (ROOM_K) para casar com a mesa e as pedras.
const ROOM_K = 3.4;
function buildRoom() {
  V.room = new THREE.Group(); V.room.scale.setScalar(ROOM_K); V.bgScene.add(V.room);
  const s = V.room, BZ = -22;
  V.bgScene.background = new THREE.Color(0x060403); V.bgScene.fog = new THREE.Fog(0x070403, 130, 430);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.9, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .55, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -3.39; shadow.scale.set(1.15, 1.25, 1); s.add(shadow);
  s.add(new THREE.HemisphereLight(0x6a4a30, 0x050302, .5));
  const key = new THREE.DirectionalLight(0xffcf9a, 1.0); key.position.set(0, 10, 8); s.add(key);
  const warm = new THREE.SpotLight(0xffc68a, 900, 0, .7, .7, 2); warm.position.set(0, 15, 0); warm.target.position.set(0, 0, -5); s.add(warm, warm.target);
  const back = new THREE.DirectionalLight(0xff9a50, 1.1); back.position.set(0, 6, -20); s.add(back); // contra-luz do balcão: silhuetas
  const neonPink = new THREE.PointLight(0xff4f86, 160, 34, 2); neonPink.position.set(-10, 9, BZ + 3); s.add(neonPink);
  const neonAmber = new THREE.PointLight(0xffa53a, 130, 34, 2); neonAmber.position.set(10, 9, BZ + 3); s.add(neonAmber);

  // Piso de tábuas e paredes de tijolo
  const planks = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#1a100a'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 32) { g.fillStyle = `rgb(${30 + Math.random() * 14},${18 + Math.random() * 8},${11 + Math.random() * 5})`; g.fillRect(0, y + 1, W, 30); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(Math.random() * W, y, 2, 32); }
  }, [14, 14]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: planks, roughness: .7 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3.4; s.add(floor);
  const bricks = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#140a07'; g.fillRect(0, 0, W, H);
    const bw = 64, bh = 28;
    for (let r = 0; r * bh < H; r++) for (let c = -1; c * bw < W; c++) {
      const x = c * bw + (r % 2) * bw / 2, y = r * bh, v = 34 + Math.random() * 26;
      g.fillStyle = `rgb(${v + 26},${v * .5},${v * .36})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
    for (let i = 0; i < 6000; i++) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  }, [12, 4]);
  const brickMat = new THREE.MeshStandardMaterial({ map: bricks, roughness: .95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(90, 34), brickMat); wall.position.set(0, 13, BZ - 1); s.add(wall);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(70, 34), brickMat); w.position.set(sx * 30, 13, 10); w.rotation.y = -sx * Math.PI / 2; s.add(w); }

  // Fundo do bar: espelho, prateleiras iluminadas por trás e garrafas
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5), new THREE.MeshStandardMaterial({ color: 0x2a2320, metalness: .9, roughness: .18 })); mirror.position.set(0, 6.2, BZ - .9); s.add(mirror);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, .5), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }));
  const shelfMat = std(0x24150c);
  const bottleCols = [0x7a3d10, 0x2f5a2a, 0xa86a1e, 0x5d1f1a, 0xc9b27a, 0x1f3f4a, 0x8a1f2a];
  for (let row = 0; row < 3; row++) {
    const y = 3.1 + row * 2.5;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(30, .2, 1.2), shelfMat); shelf.position.set(0, y, BZ - .3); s.add(shelf);
    const strip = glow.clone(); strip.position.set(0, y + .14, BZ - .82); strip.scale.y = .5; s.add(strip);
    for (let x = -14.2; x < 14.2; x += .65 + Math.random() * .55) {
      const h = 1.1 + Math.random() * .9, r = .2 + Math.random() * .12;
      const col = bottleCols[(Math.random() * bottleCols.length) | 0];
      const b = new THREE.Mesh(lathe([[0, 0], [r, 0], [r, h * .62], [r * .45, h * .8], [r * .38, h], [0, h]], 10),
        std(col, { roughness: .15, emissive: col, emissiveIntensity: .45, transparent: true, opacity: .9 }));
      b.position.set(x, y + .1, BZ - .2 + Math.random() * .3); s.add(b);
    }
  }
  // Balcão com tampo envernizado, frisos, apoio de latão e chopeira
  const wood = std(0x2a170c, { roughness: .5 }), brass = std(0xb8893a, { roughness: .25, metalness: .85 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(32, 4.9, 2.2), wood); counter.position.set(0, -.95, -16.6); s.add(counter);
  for (let x = -15; x <= 15; x += 2.5) { const panel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.6, .08), std(0x341d10, { roughness: .45 })); panel.position.set(x, -1.0, -15.47); s.add(panel); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(32.8, .3, 2.8), std(0x4a2a15, { roughness: .2 })); top.position.set(0, 1.6, -16.6); s.add(top);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 32, 10), brass); rail.rotation.z = Math.PI / 2; rail.position.set(0, -2.6, -15.1); s.add(rail);
  for (const x of [-1.2, -.4, .4, 1.2]) { const tap = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 1.1, 10), brass); tap.position.set(x + 4, 2.3, -16.9); s.add(tap); }
  // Banquetas
  const leather = std(0x5a1a14, { roughness: .55 });
  for (const x of [-12, -7.5, -3, 1.5, 6, 10.5]) {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(.75, .7, .32, 20), leather); seat.position.set(x, -.45, -13.9); s.add(seat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 2.6, 8), brass); pole.position.set(x, -1.9, -13.9); s.add(pole);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.5, .05, 6, 20), brass); ring.rotation.x = Math.PI / 2; ring.position.set(x, -2.2, -13.9); s.add(ring);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.65, .7, .12, 20), brass); base.position.set(x, -3.33, -13.9); s.add(base);
  }
  // Pendentes sobre o balcão
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1d3a2e, roughness: .4, metalness: .5, side: THREE.DoubleSide });
  const sph = new THREE.SphereGeometry(1, 12, 10);
  for (const x of [-10, -3.4, 3.4, 10]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 8, 4), std(0x111111)); cord.position.set(x, 13, -16.4); s.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(1.15, .95, 24, 1, true), shadeMat); shade.position.set(x, 8.6, -16.4); s.add(shade);
    const bulb = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false })); bulb.scale.setScalar(.36); bulb.position.set(x, 8.15, -16.4); s.add(bulb);
    const pl = new THREE.PointLight(0xffc27a, 130, 18, 2); pl.position.set(x, 7.8, -16.2); s.add(pl);
  }
  // Letreiros neon
  const neon = (text, color, w, h, x, y) => {
    const tex = canvasTex(512, 192, (g, W, H) => {
      g.clearRect(0, 0, W, H); g.font = '800 120px Unbounded, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 28; g.fillStyle = color; g.fillText(text, W / 2, H / 2 + 6);
      g.shadowBlur = 8; g.fillStyle = '#fff4f0'; g.fillText(text, W / 2, H / 2 + 6);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    m.position.set(x, y, BZ - .7); s.add(m); (V.neons = V.neons || []).push(m);
  };
  neon('BAR', '#ff4f86', 7, 2.6, -9.5, 12.4);
  neon('DOMINÓ', '#ffb347', 10, 3.7, 9, 12.5);
  // Alvo de dardos e quadros na parede
  const dart = canvasTex(128, 128, (g, W) => {
    const c = W / 2; [[60, '#111'], [54, '#e8dcc0'], [44, '#111'], [36, '#a8261e'], [26, '#e8dcc0'], [16, '#1d5a2e'], [6, '#a8261e']].forEach(([r, col]) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill(); });
  });
  const board = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshStandardMaterial({ map: dart, roughness: .8 })); board.position.set(19, 7, BZ - .85); s.add(board);
  for (const [x, y, w, h, col] of [[-19, 8, 3.2, 4.2, 0x3a2a1a], [-24, 6.5, 2.4, 3.2, 0x2a1f30]]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + .3, h + .3, .1), brass); frame.position.set(x, y, BZ - .9); s.add(frame);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std(col, { roughness: .9, emissive: col, emissiveIntensity: .2 })); art.position.set(x, y, BZ - .84); s.add(art);
  }
  // Clientes no balcão, de costas (silhuetas)
  const patrons = [{ x: -7.5, style: 'cap', shirt: 0x2b2f3a, pose: 'drink' }, { x: 1.5, style: 'bun', shirt: 0x4a2430, pose: 'rest' }, { x: 6, style: 'fedora', shirt: 0x26302a, pose: 'cig' }];
  for (const pt of patrons) {
    const p = makePlayer({ skin: 0x7a5038, hair: 0x120c08, style: pt.style, pose: pt.pose, chair: false });
    p.userData.shirt.color.setHex(pt.shirt);
    p.position.set(pt.x, .2, -14.2); p.rotation.y = Math.PI + (Math.random() - .5) * .5; p.scale.setScalar(1.05); s.add(p);
  }
  // Outras mesas com velas e cadeiras vazias
  for (const [x, z] of [[-22, -2.5], [19.5, -2.5]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, .2, 24), std(0x2b1a10, { roughness: .4 })); t.position.set(x, -.6, z); s.add(t);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.18, .5, 2.7, 10), std(0x1a0f08)); leg.position.set(x, -2.05, z); s.add(leg);
    const candle = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffb35c, toneMapped: false })); candle.scale.setScalar(.25); candle.position.set(x, -.2, z); s.add(candle);
    const pl = new THREE.PointLight(0xff9a40, 10, 9, 2); pl.position.set(x, .6, z); s.add(pl);
    for (const a of [0, 2.2, 4.2]) { const c = makeChair(); c.position.set(x + Math.sin(a) * 3.2, -.35, z + Math.cos(a) * 3.2); c.rotation.y = a + Math.PI; s.add(c); }
  }
  // Luzes desfocadas e névoa de fumaça
  const bokehCols = [0xffcf8a, 0xffb36b, 0xf6e3b4, 0xff9466, 0xff6f91];
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: bokehCols[i % bokehCols.length], toneMapped: false, transparent: true, opacity: .4 + Math.random() * .4 }));
    m.scale.setScalar(.14 + Math.random() * .3);
    m.position.set(-24 + Math.random() * 48, 2 + Math.random() * 12, BZ + .5 + Math.random() * 6); s.add(m);
  }
  const hazeTex = canvasTex(128, 128, (g, W) => { const rg = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); rg.addColorStop(0, 'rgba(255,200,150,.55)'); rg.addColorStop(1, 'rgba(255,200,150,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, W); });
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, transparent: true, opacity: .07 + Math.random() * .05, depthWrite: false }));
    sp.scale.set(16 + Math.random() * 10, 8 + Math.random() * 5, 1); sp.position.set(-18 + Math.random() * 36, 5 + Math.random() * 6, -18 + Math.random() * 8); s.add(sp);
  }
}

/* ---------- Vida no bar: objetos e acontecimentos ao fundo ---------- */
// Mapa de ambiente simples (luzes quentes num salão escuro) para reflexos realistas.
function warmEnv(renderer) {
  const tex = canvasTex(512, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a110b'); gr.addColorStop(.5, '#2a1a10'); gr.addColorStop(1, '#0a0605'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { const x = Math.random() * W, y = H * (.25 + Math.random() * .3), r = 6 + Math.random() * 18; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,200,130,.95)'); rg.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    const top = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, 90); top.addColorStop(0, 'rgba(255,225,170,1)'); top.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = top; g.fillRect(0, 0, W, 90);
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromEquirectangular(tex).texture;
  tex.dispose(); pm.dispose();
  return env;
}

// Pessoa em pé com pernas que andam (para garçom, jogadores de sinuca).
function makeStanding(o) {
  const g = new THREE.Group(), body = makePlayer({ ...o, chair: false });
  body.position.y = 2.6; g.add(body);
  const pants = std(o.pants || 0x1c1a20, { roughness: .8 }), shoe = std(0x0d0a08, { roughness: .5 });
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * .38, 2.45, 0); g.add(hip);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.27, 2.1, 4, 10), pants); leg.position.y = -1.25; hip.add(leg);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(.4, .25, .75, 2, .08), shoe); foot.position.set(0, -2.45, .18); hip.add(foot);
    legs.push(hip);
  }
  g.userData = { body, legs, head: body.userData.head };
  return g;
}

function buildLife() {
  const s = V.room, BZ = -22, A = V.bgAnim = [];
  V.bgScene.environment = warmEnv(V.bg);
  const fgEnv = warmEnv(V.fg);
  for (const m of V.tiles.values()) for (const mat of [m.userData.body.material, m.userData.fm]) { mat.envMap = fgEnv; mat.envMapIntensity = .45; }
  const brass = std(0xb8893a, { roughness: .25, metalness: .85 }), sph = new THREE.SphereGeometry(1, 12, 10);
  const basic = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

  // TV com futebol (textura animada) e a luz azulada que ela joga no salão
  const tv = document.createElement('canvas'); tv.width = 256; tv.height = 144;
  const tvTex = new THREE.CanvasTexture(tv); tvTex.colorSpace = THREE.SRGBColorSpace;
  const frame = new THREE.Mesh(new RoundedBoxGeometry(4.8, 3.0, .3, 2, .08), std(0x0c0c0e, { roughness: .4 })); frame.position.set(-15.5, 8.2, BZ - .6); s.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false })); screen.position.set(-15.5, 8.2, BZ - .44); s.add(screen);
  const tvLight = new THREE.PointLight(0x8fb8ff, 40, 16, 2); tvLight.position.set(-15.5, 7.5, BZ + 2); s.add(tvLight);
  const ball = { x: 128, y: 72, vx: 1.6, vy: .7 }, men = [...Array(10)].map((_, i) => ({ x: 20 + Math.random() * 216, y: 20 + Math.random() * 104, t: i < 5 ? 0 : 1 }));
  let tvLast = 0;
  A.push(t => {
    if (t - tvLast < .09) return; tvLast = t;
    const g = tv.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#2f7a34' : '#348a3a'; g.fillRect(i * 32, 0, 32, 144); }
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.strokeRect(8, 8, 240, 128); g.beginPath(); g.moveTo(128, 8); g.lineTo(128, 136); g.stroke(); g.beginPath(); g.arc(128, 72, 18, 0, 7); g.stroke();
    ball.x += ball.vx; ball.y += ball.vy; if (ball.x < 14 || ball.x > 242) ball.vx *= -1; if (ball.y < 14 || ball.y > 130) ball.vy *= -1;
    for (const m of men) { m.x += (ball.x - m.x) * .02 + (Math.random() - .5) * 2; m.y += (ball.y - m.y) * .015 + (Math.random() - .5) * 2; g.fillStyle = m.t ? '#f2f2f2' : '#e0b020'; g.fillRect(m.x - 2, m.y - 4, 5, 8); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ball.x, ball.y, 2.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(6, 6, 64, 14); g.fillStyle = '#fff'; g.font = '700 10px sans-serif'; g.fillText('FLA 1 x 1 FLU', 10, 17);
    tvTex.needsUpdate = true;
    tvLight.intensity = 30 + Math.random() * 25;
  });

  // Jukebox com luzes que mudam de cor
  const jb = new THREE.Group(); jb.position.set(23, -3.4, -19.5); jb.rotation.y = -.5; s.add(jb);
  jb.add(Object.assign(new THREE.Mesh(new RoundedBoxGeometry(2.6, 3.6, 1.5, 3, .2), std(0x5a1f12, { roughness: .3 })), {}));
  jb.children[0].position.y = 1.8;
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.5, 24, 1, false, -Math.PI / 2, Math.PI), std(0x5a1f12, { roughness: .3 })); arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; arch.position.y = 3.6; jb.add(arch);
  const jbGlow = [];
  for (const [x, y, w, h] of [[0, 3.6, 2.2, .25], [-1.1, 2.0, .2, 3.0], [1.1, 2.0, .2, 3.0], [0, .9, 1.8, .5]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .1), basic(0xff8030)); m.position.set(x, y, .78); jb.add(m); jbGlow.push(m); }
  const jbLight = new THREE.PointLight(0xff6040, 35, 12, 2); jbLight.position.set(0, 2.5, 1.5); jb.add(jbLight);
  A.push(t => { jbGlow.forEach((m, i) => m.material.color.setHSL((t * .08 + i * .18) % 1, .9, .55)); jbLight.color.setHSL((t * .08) % 1, .8, .55); });

  // Mesa de sinuca com luminária e dois jogadores (um dá tacadas)
  const pool = new THREE.Group(); pool.position.set(-17.5, 0, -11.5); s.add(pool);
  const rail = new THREE.Mesh(new RoundedBoxGeometry(8.4, .6, 4.8, 2, .15), std(0x3a1f10, { roughness: .35 })); rail.position.y = -.5; pool.add(rail);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(7.6, .1, 4.0), std(0x1f6a3a, { roughness: .9 })); cloth.position.y = -.17; pool.add(cloth);
  for (const [x, z] of [[-3.5, -1.8], [3.5, -1.8], [-3.5, 1.8], [3.5, 1.8]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, 2.7, 10), std(0x2a160a)); l.position.set(x, -2.1, z); pool.add(l); }
  const ballCols = [0xf2f2f2, 0xe0b020, 0x1a3a9a, 0xb02020, 0x5a2a8a, 0xe06a20, 0x1a7a3a, 0x7a1a1a, 0x111111];
  ballCols.forEach((c, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), std(c, { roughness: .15 })); b.position.set(i ? 1.4 + (i % 3) * .26 : -1.6, -.0, i ? ((i % 3) - 1) * .3 + (i > 5 ? .15 : 0) : 0); pool.add(b); });
  const pShade = new THREE.Mesh(new THREE.CylinderGeometry(.6, 1.6, .8, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0x1d4a2e, side: THREE.DoubleSide, roughness: .4 })); pShade.position.y = 5.2; pShade.rotation.y = Math.PI / 4; pShade.scale.set(2.2, 1, 1); pool.add(pShade);
  const pBulb = new THREE.Mesh(new THREE.BoxGeometry(5, .1, .6), basic(0xfff0c8)); pBulb.position.y = 4.8; pool.add(pBulb);
  const pLight = new THREE.PointLight(0xfff0c8, 90, 12, 2); pLight.position.y = 4.2; pool.add(pLight);
  const cueGuy = makeStanding({ skin: 0x9a6a48, hair: 0x15100c, style: 'curly', pose: 'rest', pants: 0x2a2a3a });
  cueGuy.userData.body.userData.shirt.color.setHex(0x3a5a7a);
  cueGuy.position.set(-23.2, -3.4, -11.2); cueGuy.rotation.y = Math.PI / 2; s.add(cueGuy);
  cueGuy.userData.body.rotation.x = .55;
  const cue = new THREE.Mesh(new THREE.CylinderGeometry(.03, .06, 5.2, 8), std(0xc89a5a, { roughness: .4 })); cue.rotation.z = Math.PI / 2 - .08; cue.position.set(-20.6, .2, -11.4); s.add(cue);
  const watcher = makeStanding({ skin: 0xd9a07a, hair: 0x5a3a22, style: 'bun', pose: 'drink', pants: 0x3a1a20 });
  watcher.userData.body.userData.shirt.color.setHex(0x7a3a4a);
  watcher.position.set(-13, -3.4, -14.6); watcher.rotation.y = -.4; s.add(watcher);
  A.push(t => {
    const k = (t % 6) / 6, strike = k > .82 ? Math.sin((k - .82) / .18 * Math.PI) : 0;
    cue.position.x = -20.6 + strike * .9 - Math.sin(t * 2) * .15 * (k < .82 ? 1 : 0);
    if (k > .9) pool.children.filter(c => c.geometry && c.geometry.type === 'SphereGeometry')[0].position.x = -1.6 + (k - .9) * 20;
    else pool.children.filter(c => c.geometry && c.geometry.type === 'SphereGeometry')[0].position.x = -1.6;
    watcher.userData.head.rotation.y = Math.sin(t * .7) * .4;
  });

  // Garçom atravessando o salão com bandeja
  const waiter = makeStanding({ skin: 0x7a5038, hair: 0x120c08, style: 'bald', pose: 'drink', vest: true, pants: 0x111111 });
  waiter.userData.body.userData.shirt.color.setHex(0xf0ece2);
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, .05, 20), brass); tray.position.set(-.55, 4.4, .9); waiter.add(tray);
  for (const dx of [-.25, .2]) { const gl = new THREE.Mesh(new THREE.CylinderGeometry(.14, .12, .5, 12), std(0xe08a1c, { emissive: 0x3a1a00 })); gl.position.set(-.55 + dx, 4.7, .9 + dx * .5); waiter.add(gl); }
  s.add(waiter);
  A.push(t => {
    const cyc = (t % 34) / 34, walking = cyc < .7, u = Math.min(1, cyc / .7), dir = Math.floor(t / 34) % 2 ? -1 : 1;
    waiter.position.set(dir * (-30 + 60 * u), -3.4 + (walking ? Math.abs(Math.sin(t * 6)) * .12 : 0), -7.2);
    waiter.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    waiter.visible = walking;
    waiter.userData.legs.forEach((l, i) => { l.rotation.x = walking ? Math.sin(t * 6 + i * Math.PI) * .5 : 0; });
  });

  // Barman atrás do balcão, secando copos
  const barman = makePlayer({ skin: 0xc68e64, hair: 0x2a1a12, style: 'bald', pose: 'drink', vest: true, chair: false });
  barman.userData.shirt.color.setHex(0xe8e2d4);
  barman.position.set(0, 1.0, -18.7); s.add(barman);
  A.push(t => { barman.position.x = Math.sin(t * .12) * 9 + Math.sin(t * .5) * .4; barman.rotation.y = Math.cos(t * .12) * .5; barman.userData.head.rotation.y = Math.sin(t * .4) * .5; });

  // Clientes no balcão conversando (cabeças e corpos se mexem)
  s.children.filter(o => o.userData && o.userData.torso && o.position.z > -15 && o.position.z < -13).forEach((p, i) => {
    A.push(t => { p.userData.head.rotation.y = Math.sin(t * .6 + i * 2) * .6; p.rotation.z = Math.sin(t * .4 + i) * .04; });
  });

  // Relógio de parede com a hora real
  const clock = new THREE.Group(); clock.position.set(17, 12.6, BZ - .8); s.add(clock);
  clock.add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, .15, 32).rotateX(Math.PI / 2), std(0xefe6d2, { roughness: .6 })));
  clock.add(new THREE.Mesh(new THREE.TorusGeometry(1.1, .09, 8, 32), brass));
  const hand = (len, w) => { const h = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, .04), std(0x111111)); m.position.y = len / 2; h.add(m); h.position.z = .1; clock.add(h); return h; };
  const hH = hand(.55, .1), hM = hand(.85, .06);
  A.push(() => { const d = new Date(); hM.rotation.z = -d.getMinutes() / 60 * Math.PI * 2; hH.rotation.z = -((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2; });

  // Barris e engradados
  for (const [x, z] of [[-26, -18], [-24.2, -19.2]]) {
    const b = new THREE.Mesh(lathe([[0, 0], [.9, 0], [1.05, .9], [1.1, 1.5], [1.05, 2.1], [.9, 3], [0, 3]], 20), std(0x5a3418, { roughness: .6 })); b.position.set(x, -3.4, z); s.add(b);
    for (const y of [.4, 1.5, 2.6]) { const hp = new THREE.Mesh(new THREE.TorusGeometry(1.05, .05, 6, 24), std(0x2a2a2a, { metalness: .6, roughness: .4 })); hp.rotation.x = Math.PI / 2; hp.position.set(x, -3.4 + y, z); s.add(hp); }
  }
  for (const [x, y, z, r] of [[25, -2.7, -12.5, .2], [25.3, -1.3, -12.4, -.1], [23.6, -2.7, -11.4, .5]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.2), std(0xa8261e, { roughness: .6 })); c.position.set(x, y, z); c.rotation.y = r; s.add(c);
    for (let i = 0; i < 6; i++) { const bt = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .5, 8), std(0x3a1c08, { roughness: .2 })); bt.position.set(x - .6 + (i % 3) * .6, y + .9, z - .3 + Math.floor(i / 3) * .6); s.add(bt); }
  }

  // Cachorro dormindo perto da mesa, abanando o rabo de vez em quando
  const dog = new THREE.Group(); dog.position.set(10.5, -3.4, -12); dog.rotation.y = -.4; s.add(dog);
  const fur = std(0x8a5a2e, { roughness: .9 });
  const torsoD = new THREE.Mesh(new THREE.CapsuleGeometry(.6, 1.6, 6, 12), fur); torsoD.rotation.z = Math.PI / 2; torsoD.position.y = .55; dog.add(torsoD);
  const headD = new THREE.Mesh(new THREE.SphereGeometry(.5, 14, 12), fur); headD.position.set(1.5, .45, .2); dog.add(headD);
  for (const sz of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), std(0x5a3a1e)); ear.scale.set(.6, 1.2, .4); ear.position.set(1.4, .55, .2 + sz * .38); dog.add(ear); }
  const tail = new THREE.Group(); tail.position.set(-1.3, .7, 0); dog.add(tail);
  const tm = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .8, 4, 8), fur); tm.position.y = .4; tm.rotation.z = .6; tail.add(tm);
  A.push(t => { const wag = (t % 9) < 2; tail.rotation.x = wag ? Math.sin(t * 14) * .7 : 0; torsoD.scale.y = 1 + Math.sin(t * 1.4) * .04; });

  // Neon "BAR" que pisca de vez em quando
  const bar = V.neons && V.neons[0];
  if (bar) A.push(t => { const k = t % 11; bar.material.opacity = (k > 8.6 && k < 9.4 && Math.sin(t * 60) > 0) ? .25 : 1; });

  // Poeira flutuando na luz do spot (camada nítida)
  const n = 140, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 10; pos[i * 3 + 1] = 1 + Math.random() * 9; pos[i * 3 + 2] = (Math.random() - .5) * 10; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe2b0, size: .06, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  V.fgScene.add(dust);
  V.fgAnim = [t => { const a = dustGeo.attributes.position; for (let i = 0; i < n; i++) { let y = a.array[i * 3 + 1] + .004 + Math.sin(t + i) * .002; if (y > 10) y = 1; a.array[i * 3 + 1] = y; a.array[i * 3] += Math.sin(t * .3 + i) * .002; } a.needsUpdate = true; }];
}

function scaleRoomLights() {
  V.room.traverse(o => { if (o.isPointLight || o.isSpotLight) { if (o.distance) o.distance *= ROOM_K; o.intensity *= ROOM_K * ROOM_K; } });
}

/* ---------- Mesa com spot central (camada nítida) ---------- */
function buildTable() {
  const s = V.fgScene;
  s.add(new THREE.AmbientLight(0xffe2c4, .07));
  const spot = new THREE.SpotLight(0xffd39a, 1350, 0, .56, .58, 2);
  spot.position.set(0, 15, .6); spot.target.position.set(0, 0, .3);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.0003; spot.shadow.normalBias = .02;
  spot.shadow.camera.near = 6; spot.shadow.camera.far = 30;
  s.add(spot, spot.target);
  const rim = new THREE.DirectionalLight(0x9db8ff, .12); rim.position.set(-6, 5, -10); s.add(rim);

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
  const legGeo = lathe([[0, 0], [.55, 0], [.6, .5], [.42, 1.8], [.6, 4.6], [.36, 7.6], [.48, 9.3], [.65, 9.7], [.65, 10], [0, 10]], 16), legMat = std(0x24150c, { roughness: .5 });
  for (const [x, z] of [[-6.5, -7.1], [6.5, -7.1], [-6.5, 7.1], [6.5, 7.1]]) { const l = new THREE.Mesh(legGeo, legMat); l.position.set(x, -11.6, z); s.add(l); }
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
  beer(6.45, 6.65, .72);

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
  V.pad = add(new THREE.Mesh(new THREE.BoxGeometry(1.15, .05, 1.5), [std(0xe8e2d4), std(0xe8e2d4), new THREE.MeshStandardMaterial({ map: padTex, roughness: .9 }), std(0xe8e2d4), std(0xe8e2d4), std(0xe8e2d4)]), -6.3, .03, 6.45, false);
  V.pad.rotation.y = .1; V.pad.receiveShadow = true;
  const pencil = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.5, 6), std(0xe8b524, { roughness: .5 }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.05, .18, 6), std(0xe9c9a0)); tip.position.y = .84;
  pencil.add(pb, tip); pencil.rotation.z = Math.PI / 2; pencil.rotation.y = .7; pencil.position.set(-6.25, .1, 6.5); pencil.traverse(o => o.castShadow = true); s.add(pencil);
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

/* ---------- Jogadores e cadeiras (camada do meio, levemente desfocada) ---------- */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Cadeira de bistrô: pernas torneadas, aro de reforço, encosto de madeira curvada e assento estofado.
function makeChair() {
  const g = new THREE.Group();
  const wood = std(0x4a2a16, { roughness: .4 }), leather = std(0x3d1611, { roughness: .45 }), brassM = std(0xc49546, { roughness: .25, metalness: .85 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  mesh(new THREE.CylinderGeometry(1.0, .95, .16, 32), wood, 0, -.62, -.2);
  const cush = mesh(new THREE.SphereGeometry(.9, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), leather, 0, -.55, -.2); cush.scale.y = .22;
  for (let a = 0; a < 12; a++) mesh(new THREE.SphereGeometry(.03, 6, 5), brassM, Math.sin(a / 12 * Math.PI * 2) * .97, -.6, -.2 + Math.cos(a / 12 * Math.PI * 2) * .97);
  const legGeo = lathe([[0, 0], [.06, 0], [.075, .25], [.055, .8], [.09, 1.3], [.055, 1.55], [.075, 2.2], [.1, 2.5], [.11, 2.72], [0, 2.72]], 10);
  for (const [x, z] of [[-.7, .35], [.7, .35], [-.64, -.8], [.64, -.8]]) { const l = mesh(legGeo, wood, x, -3.42, z); l.rotation.z = x * .07; l.rotation.x = z > 0 ? -.06 : .06; }
  const ring = mesh(new THREE.TorusGeometry(.7, .035, 6, 36), wood, 0, -2.25, -.22); ring.rotation.x = Math.PI / 2;
  const tube = (pts, r, seg = 48) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p))), seg, r, 8), wood);
  tube([[-.78, -.55, -.95], [-.86, .6, -1.08], [-.8, 1.6, -1.15], [-.45, 2.25, -1.18], [0, 2.38, -1.2], [.45, 2.25, -1.18], [.8, 1.6, -1.15], [.86, .6, -1.08], [.78, -.55, -.95]], .075);
  tube([[-.42, -.5, -.98], [-.5, .7, -1.1], [-.38, 1.55, -1.16], [0, 1.78, -1.18], [.38, 1.55, -1.16], [.5, .7, -1.1], [.42, -.5, -.98]], .05, 40);
  tube([[-.84, 1.0, -1.11], [0, 1.08, -1.16], [.84, 1.0, -1.11]], .045, 16);
  return g;
}

// Membro em cápsula ligando dois pontos.
function limb(A, B, r, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, A.distanceTo(B), 4, 10), mat);
  m.position.copy(A).add(B).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

// Mão: palma e dedos alinhados ao antebraço.
function makeHand(pos, dir, mat, sx, curl) {
  const h = new THREE.Group(); h.position.copy(pos); h.quaternion.setFromUnitVectors(V3(0, 0, 1), dir);
  const palm = new THREE.Mesh(new RoundedBoxGeometry(.3, .12, .32, 2, .05), mat); palm.position.z = .14; h.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(.042, .17, 3, 6), mat);
    f.position.set(-.11 + i * .073, -.02 - curl * .06, .36 - curl * .04); f.rotation.x = Math.PI / 2 + curl; h.add(f);
  }
  const t = new THREE.Mesh(new THREE.CapsuleGeometry(.045, .15, 3, 6), mat); t.position.set(sx * .17, .02, .16); t.rotation.set(Math.PI / 2, 0, sx * .9); h.add(t);
  return h;
}

// Figuras sem rosto: silhueta, roupa, acessórios e gestos — a imaginação completa o resto.
// style: cap | fedora | bun | curly | bald ; pose: rest | chin | drink | cig
function makePlayer({ skin, hair, style, pose, vest = false, jacket = false, glasses = false, watch = true, chair = true }) {
  const g = new THREE.Group();
  const shirt = std(0x888888, { roughness: .8 }), sk = std(skin, { roughness: .6 }), hr = std(hair, { roughness: .85 });
  const dark = std(0x17120f, { roughness: .75, side: THREE.DoubleSide }), cloth2 = std(0x2b2622, { roughness: .8, side: THREE.DoubleSide });
  const gold = std(0xd8a64a, { roughness: .2, metalness: .9 });
  const put = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  if (chair) g.add(makeChair());

  // Tronco torneado e achatado, ombros, gola com pontas e botões
  const torso = put(lathe([[0, -.2], [.66, -.2], [.7, .25], [.74, .8], [.82, 1.2], [.9, 1.45], [.84, 1.68], [.55, 1.84], [.3, 1.9], [0, 1.9]], 28), shirt, 0, 0, 0);
  torso.scale.z = .72;
  for (const sx of [-1, 1]) put(new THREE.SphereGeometry(.34, 16, 12), shirt, sx * .86, 1.58, 0);
  const collar = put(new THREE.TorusGeometry(.32, .07, 6, 18), shirt, 0, 1.86, .02); collar.rotation.x = Math.PI / 2 - .2;
  for (const sx of [-1, 1]) { const pt = put(new THREE.BoxGeometry(.22, .04, .2), shirt, sx * .14, 1.8, .3); pt.rotation.set(-.6, sx * .5, sx * .4); }
  const btn = std(0xe8e0d0, { roughness: .4 });
  [[1.55, .64], [1.23, .6], [.91, .56], [.59, .54]].forEach(([y, z]) => put(new THREE.SphereGeometry(.035, 8, 6), btn, 0, y, z));

  // Colete ou paletó abertos na frente; senão, suspensórios
  if (vest || jacket) {
    const prof = jacket ? [[.73, -.2], [.77, .3], [.81, .85], [.89, 1.22], [.96, 1.48], [.9, 1.7], [.6, 1.86], [.4, 1.9]] : [[.7, .05], [.74, .5], [.78, .9], [.86, 1.25], [.89, 1.42], [.6, 1.6]];
    const v = put(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28, .42, Math.PI * 2 - .84), jacket ? cloth2 : dark, 0, 0, 0); v.scale.z = .75;
    if (vest) for (let i = 0; i < 3; i++) put(new THREE.SphereGeometry(.03, 6, 6), gold, .26, 1.1 - i * .25, .58);
    if (jacket) for (const sx of [-1, 1]) { const lap = put(new THREE.BoxGeometry(.24, .75, .03), cloth2, sx * .3, 1.42, .63); lap.rotation.set(-.25, sx * .35, sx * .35); }
  } else for (const sx of [-1, 1]) { const s = put(new THREE.BoxGeometry(.1, 1.7, .02), std(0x5a1a14), sx * .36, .85, .62); s.rotation.x = -.12; }

  // Pescoço e cabeça sem feições: só volume e uma faixa de sombra nos olhos
  put(new THREE.CylinderGeometry(.23, .27, .42, 12), sk, 0, 1.98, .02);
  const head = new THREE.Group(); head.position.set(0, 2.55, .06); g.add(head);
  put(new THREE.SphereGeometry(.56, 24, 18), sk, 0, 0, 0, head).scale.set(.92, 1.06, .98);
  put(new THREE.SphereGeometry(.42, 18, 12), sk, 0, -.26, .1, head).scale.set(1, .8, .95);
  put(new THREE.ConeGeometry(.08, .2, 8), sk, 0, -.06, .56, head).rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) put(new THREE.SphereGeometry(.12, 10, 8), sk, sx * .52, -.02, 0, head).scale.set(.45, 1, .8);
  const shade = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .45 });
  put(new THREE.SphereGeometry(.53, 20, 6, Math.PI / 2 - .95, 1.9, Math.PI * .43, Math.PI * .11), shade, 0, 0, .04, head).scale.set(.95, 1.06, 1.04);

  if (style === 'bald') {
    put(new THREE.SphereGeometry(.45, 16, 10, Math.PI / 2 - .9, 1.8, Math.PI * .55, Math.PI * .4), hr, 0, -.15, .12, head);
  } else if (style === 'curly') {
    for (let i = 0; i < 22; i++) { const a = i * 2.4, r = .5, y = .15 + (i % 5) * .08; put(new THREE.SphereGeometry(.17, 10, 8), hr, Math.cos(a) * r * (1 - y * .5), y, Math.sin(a) * r * (1 - y * .5) - .05, head); }
  } else {
    const h = put(new THREE.SphereGeometry(.6, 22, 14, 0, Math.PI * 2, 0, Math.PI * .52), hr, 0, .08, -.04, head); h.scale.set(.96, 1.02, 1.02); h.rotation.x = -.25;
  }
  if (style === 'cap') {
    const cap = put(new THREE.SphereGeometry(.66, 22, 12, 0, Math.PI * 2, 0, Math.PI * .5), dark, 0, .2, .02, head); cap.scale.set(1.05, .48, 1.12); cap.rotation.x = .18;
    put(new THREE.CylinderGeometry(.46, .48, .045, 18, 1, false, -Math.PI / 2, Math.PI), dark, 0, .2, .42, head).rotation.x = .22;
    put(new THREE.SphereGeometry(.05, 8, 6), dark, 0, .52, .08, head);
  } else if (style === 'fedora') {
    put(lathe([[0, 0], [.5, 0], [.52, .12], [.48, .45], [.38, .56], [.15, .5], [0, .54]], 24), dark, 0, .3, 0, head);
    put(new THREE.CylinderGeometry(.53, .53, .11, 24), std(0x5a1a14), 0, .36, 0, head);
    put(lathe([[.5, 0], [.85, -.01], [1.02, .06], [1.04, .1]], 32), dark, 0, .3, 0, head).rotation.x = .1;
    const feather = put(new THREE.BoxGeometry(.04, .32, .1), std(0x2d4a3a), .5, .5, -.1, head); feather.rotation.z = -.5;
  } else if (style === 'bun') {
    put(new THREE.SphereGeometry(.28, 14, 10), hr, 0, .45, -.45, head);
    put(new THREE.TorusGeometry(.12, .04, 6, 12), std(0x8a2a2a), 0, .3, -.47, head).rotation.x = -.6;
    for (const sx of [-1, 1]) { const s = put(new THREE.CapsuleGeometry(.05, .5, 3, 6), hr, sx * .46, -.2, .22, head); s.rotation.z = sx * .15; }
  }
  if (glasses) {
    const frame = std(0x111111, { roughness: .3, metalness: .6 }), glint = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: .55, toneMapped: false });
    for (const sx of [-1, 1]) { put(new THREE.TorusGeometry(.13, .022, 6, 16), frame, sx * .2, .04, .55, head); put(new THREE.CircleGeometry(.12, 14), glint, sx * .2, .04, .552, head); }
    put(new THREE.BoxGeometry(.14, .02, .02), frame, 0, .06, .56, head);
  }

  // Braços: ombro → cotovelo → mão, conforme o gesto; mangas dobradas e relógio
  const arms = { rest: [[.95, .65, .7], [.55, .35, 1.55]], chin: [[.8, .6, 1.0], [.2, 2.15, .62]], drink: [[1.05, .6, .65], [.5, 1.05, 1.25]], cig: [[.95, .65, .8], [.28, 2.1, .7]] };
  const poses = pose === 'rest' ? ['rest', 'rest'] : [pose, 'rest'];
  [1, -1].forEach((sx, i) => {
    const [e, hh] = arms[poses[i]], S = V3(sx * .9, 1.55, 0), E = V3(sx * e[0], e[1], e[2]), H = V3(sx * hh[0], hh[1], hh[2]);
    const dir = H.clone().sub(E).normalize(), mid = E.clone().lerp(H, .35);
    g.add(limb(S, E, .25, shirt));
    put(new THREE.SphereGeometry(.245, 12, 10), shirt, E.x, E.y, E.z);
    g.add(limb(E, mid, .235, shirt));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(.235, .065, 6, 14), shirt); cuff.position.copy(mid); cuff.quaternion.setFromUnitVectors(V3(0, 0, 1), dir); g.add(cuff);
    g.add(limb(mid, H, .19, sk));
    if (watch && sx === -1) { const w = new THREE.Mesh(new THREE.TorusGeometry(.2, .05, 6, 14), gold); w.position.copy(H.clone().lerp(E, .14)); w.quaternion.setFromUnitVectors(V3(0, 0, 1), dir); g.add(w); }
    g.add(makeHand(H, dir, sk, sx, poses[i] === 'rest' ? .35 : poses[i] === 'chin' ? .9 : 1.1));
    if (poses[i] === 'drink') {
      const glass = new THREE.MeshStandardMaterial({ color: 0xdfeef0, roughness: .05, transparent: true, opacity: .25, depthWrite: false });
      put(lathe([[0, 0], [.2, 0], [.21, .02], [.22, .42]], 18), glass, H.x - sx * .05, H.y - .12, H.z + .12);
      put(new THREE.CylinderGeometry(.19, .18, .22, 16), std(0xc87a1e, { roughness: .2, emissive: 0x4a2200, transparent: true, opacity: .9 }), H.x - sx * .05, H.y - .01, H.z + .12);
      for (const d of [-.06, .07]) put(new THREE.BoxGeometry(.11, .11, .11), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .5, roughness: .1 }), H.x - sx * .05 + d, H.y + .1, H.z + .12 + d);
    }
    if (poses[i] === 'cig') {
      const c = put(new THREE.CylinderGeometry(.03, .03, .42, 8), std(0xf2eee6), H.x - sx * .08, H.y + .05, H.z + .3); c.rotation.x = Math.PI / 2 - .3;
      const em = put(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a20, toneMapped: false }), H.x - sx * .08, H.y + .11, H.z + .5);
      g.userData.ember = em;
    }
  });
  g.userData = { ...g.userData, torso, head, shirt, phase: Math.random() * 6 };
  return g;
}

function buildMidLights() {
  const s = V.midScene;
  s.add(new THREE.HemisphereLight(0x8a6440, 0x070403, .35));
  const spill = new THREE.SpotLight(0xffd39a, 1500, 0, .95, .8, 2); spill.position.set(0, 15, .6); spill.target.position.set(0, 0, -4); s.add(spill, spill.target);
  const rim = new THREE.DirectionalLight(0xffa060, 1.8); rim.position.set(0, 24, -80); s.add(rim);
  const pink = new THREE.PointLight(0xff4f86, 900, 110, 2); pink.position.set(-34, 26, -50); s.add(pink);
  const amber = new THREE.PointLight(0xffa53a, 700, 110, 2); amber.position.set(34, 26, -50); s.add(amber);
}

/* ---------- A turma da mesa em estilo cartum (sombra chapada + contorno de tinta) ---------- */
const TOON_GRAD = (() => { const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]); const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: TOON_GRAD, ...o });
const INK = new THREE.MeshBasicMaterial({ color: 0x0b0806, side: THREE.BackSide });

// Contorno por "casca invertida": cópia preta um pouco maior, só com as faces de trás.
function outline(root, t = .045) {
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.userData.noInk && !(o.material && o.material.isMeshBasicMaterial)) meshes.push(o); });
  for (const m of meshes) {
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox();
    const k = 1 + t / Math.max(.05, g.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z));
    const hull = new THREE.Mesh(g, INK); hull.userData.noInk = true;
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    hull.scale.setScalar(k); hull.position.copy(c).multiplyScalar(1 - k);
    m.add(hull);
  }
  return root;
}

// Corpo caricato: ombros largos, cintura fina, braços grossos e mãos de luva.
function toonBody({ width = 1, shirt, jacket, vest, coat, skin, armR = .27, pose = 'rest' }) {
  const g = new THREE.Group();
  const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const torsoProf = [[0, -.2], [.6, -.2], [.64, .3], [.7, .8], [.9, 1.25], [1.1, 1.55], [1.04, 1.8], [.62, 1.96], [.36, 2.02], [0, 2.02]];
  const torso = put(lathe(torsoProf, 30), shirt, 0, 0, 0); torso.scale.set(width, 1, .7);
  const outer = jacket || vest || coat;
  if (outer) {
    const prof = (vest ? torsoProf.slice(1, 7) : torsoProf.slice(1)).map(([x, y]) => new THREE.Vector2(x + .05, y));
    const j = put(new THREE.LatheGeometry(prof, 30, vest ? .5 : .38, Math.PI * 2 - (vest ? 1 : .76)), outer, 0, 0, 0); j.scale.set(width, 1, .74);
    if (jacket || coat) for (const sx of [-1, 1]) {
      const lap = put(new THREE.BoxGeometry(.38, .95, .05), outer, sx * .34 * width, 1.45, .66); lap.rotation.set(-.3, sx * .45, sx * .38);
      const flap = put(new THREE.BoxGeometry(.5, .3, .06), outer, sx * .5 * width, 1.88, .38); flap.rotation.set(-.9, sx * .3, sx * .5);
    }
  }
  const sleeve = jacket || coat || shirt;
  for (const sx of [-1, 1]) put(new THREE.SphereGeometry(.4, 16, 12), outer || shirt, sx * 1.02 * width, 1.62, 0);
  const arms = { rest: [[1.05, .62, .75], [.62, .35, 1.6]], chin: [[.85, .6, 1.0], [.2, 2.15, .66]], cig: [[1.0, .65, .8], [.32, 2.05, .72]], fist: [[1.1, .6, .8], [.5, .45, 1.55]] };
  const poses = pose === 'rest' || pose === 'fist' ? [pose, pose] : [pose, 'rest'];
  [1, -1].forEach((sx, i) => {
    const [e, h] = arms[poses[i]], S = V3(sx * 1.0 * width, 1.58, 0), E = V3(sx * e[0] * width, e[1], e[2]), H = V3(sx * h[0], h[1], h[2]);
    g.add(limb(S, E, armR, sleeve));
    const el = new THREE.Mesh(new THREE.SphereGeometry(armR * 1.02, 12, 10), sleeve); el.position.copy(E); g.add(el);
    g.add(limb(E, H, armR * .82, sleeve));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(armR * .85, armR * .22, 6, 14), (jacket || coat) ? toon(0x222222) : shirt); cuff.position.copy(H.clone().lerp(E, .1)); cuff.quaternion.setFromUnitVectors(V3(0, 0, 1), H.clone().sub(E).normalize()); g.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(armR * 1.05, 14, 12), skin); hand.position.copy(H); hand.scale.set(1, .8, 1.15); g.add(hand);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(armR * .3, armR * .5, 3, 6), skin); th.position.copy(H).add(V3(-sx * armR * .9, armR * .3, armR * .2)); th.rotation.z = sx * .8; g.add(th);
    g.userData['hand' + i] = H;
  });
  g.userData.torso = torso;
  return g;
}

// Cabeça caricata: crânio pequeno, mandíbula grande em bloco, nariz redondo, orelhas.
function toonHead(skin, { jaw = 1, jawW = 1, crown = 1 } = {}) {
  const h = new THREE.Group();
  const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); h.add(m); return m; };
  put(new THREE.SphereGeometry(.5, 24, 18), skin, 0, .18, -.02).scale.set(.92 * crown, 1, .95);
  put(new THREE.SphereGeometry(.5, 24, 16), skin, 0, -.22, .07).scale.set(.94 * jawW, .7 * jaw, .84);
  put(new THREE.SphereGeometry(.13, 14, 12), skin, 0, -.02, .52).scale.set(1.05, 1.15, 1.1);
  for (const sx of [-1, 1]) put(new THREE.SphereGeometry(.13, 10, 8), skin, sx * .47 * jawW, .02, .02).scale.set(.45, 1, .8);
  return { h, put };
}
const eyesSquint = (put, ink, y = .12, tilt = .12) => { for (const sx of [-1, 1]) { const e = put(new THREE.CapsuleGeometry(.03, .14, 3, 6), ink, sx * .19, y, .46); e.rotation.z = Math.PI / 2 + sx * tilt; e.userData.noInk = true; } };
const brows = (put, mat, y = .24, angle = .25, w = .3, th = .09) => { for (const sx of [-1, 1]) { const b = put(new RoundedBoxGeometry(w, th, .1, 2, .03), mat, sx * .2, y, .45); b.rotation.z = -sx * angle; } };
const mouthLine = (put, ink, y = -.34, smile = -1, w = .15) => { const m = put(new THREE.TorusGeometry(w, .022, 6, 14, Math.PI * .6), ink, 0, y, .48); m.rotation.z = smile > 0 ? Math.PI + Math.PI * .2 : Math.PI * .2; m.userData.noInk = true; return m; };

function makeTiao() {
  const skin = toon(0xd9a07a), white = toon(0xe9e4dc), cap = toon(0x3a3f4a), ink = new THREE.MeshBasicMaterial({ color: 0x1a120c });
  const shirt = toon(0xf0ead8), vest = toon(0x5a4632);
  const body = toonBody({ width: .95, shirt, vest, skin, pose: 'chin', armR: .25 });
  const { h, put } = toonHead(skin, { jaw: .95 });
  for (const sx of [-1, 1]) put(new THREE.SphereGeometry(.2, 12, 10), white, sx * .43, .12, -.12).scale.set(.7, 1.1, 1.2);
  const c = put(new THREE.SphereGeometry(.6, 22, 12, 0, Math.PI * 2, 0, Math.PI * .5), cap, 0, .4, .02); c.scale.set(1.08, .5, 1.15); c.rotation.x = .2;
  put(new THREE.CylinderGeometry(.44, .46, .05, 18, 1, false, -Math.PI / 2, Math.PI), cap, 0, .4, .42).rotation.x = .25;
  put(new THREE.SphereGeometry(.05, 8, 6), cap, 0, .7, .1);
  eyesSquint(put, ink, .14, .05); brows(put, white, .25, -.15, .3, .11);
  for (const sx of [-1, 1]) { const m = put(new THREE.SphereGeometry(.17, 14, 10), white, sx * .13, -.2, .5); m.scale.set(1.3, .7, .7); m.rotation.z = sx * -.45; }
  for (const y of [.34, .4]) { const w = put(new THREE.BoxGeometry(.32, .015, .01), ink, 0, y, .43); w.userData.noInk = true; }
  return { body, head: h, shirt };
}

function makeMarreta() {
  const skin = toon(0xb97c55), stub = toon(0x8f8a8c), leather = toon(0x26221f), ink = new THREE.MeshBasicMaterial({ color: 0x120c08 });
  const shirt = toon(0xd9c28a), gold = toon(0xe0b04a, { emissive: 0x3a2400 }), stud = toon(0xc9c9c9);
  const body = toonBody({ width: 1.28, shirt, jacket: leather, skin, pose: 'fist', armR: .33 });
  for (const [x, y] of [[-.55, 1.2], [.55, 1.2], [-.62, 1.6], [.62, 1.6], [-.4, .7], [.4, .7]]) { const s = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), stud); s.position.set(x, y, .7); body.add(s); }
  const chain = new THREE.Mesh(new THREE.TorusGeometry(.42, .04, 6, 24), gold); chain.position.set(0, 1.82, .22); chain.rotation.x = Math.PI / 2 - .5; body.add(chain);
  const { h, put } = toonHead(skin, { jaw: 1.25, jawW: 1.2, crown: .88 });
  const st = put(new THREE.SphereGeometry(.5, 24, 16, 0, Math.PI * 2, Math.PI * .42, Math.PI * .58), stub, 0, -.22, .08); st.scale.set(1.15, .9, .88); st.userData.noInk = true;
  put(new RoundedBoxGeometry(.5, .1, .1, 2, .04), ink, 0, -.18, .5).userData.noInk = true;
  for (const sx of [-1, 1]) { const d = put(new RoundedBoxGeometry(.09, .32, .09, 2, .03), ink, sx * .25, -.32, .48); d.userData.noInk = true; }
  const lens = new THREE.MeshToonMaterial({ color: 0x0a0a0a, gradientMap: TOON_GRAD });
  for (const sx of [-1, 1]) {
    put(new THREE.CylinderGeometry(.16, .16, .05, 20), lens, sx * .2, .12, .5).rotation.x = Math.PI / 2;
    const gl = put(new THREE.CircleGeometry(.05, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), sx * .2 + .05, .17, .53); gl.userData.noInk = true;
  }
  put(new THREE.BoxGeometry(.14, .03, .03), lens, 0, .14, .52);
  brows(put, toon(0x1a1410), .32, .3, .34, .1);
  const pick = put(new THREE.CylinderGeometry(.012, .012, .3, 6), toon(0xe0c890), .2, -.34, .55); pick.rotation.set(Math.PI / 2 - .2, 0, -.6); pick.userData.noInk = true;
  return { body, head: h, shirt };
}

function makeNeide() {
  const skin = toon(0xf0c9a8), hair = toon(0xa8402a), coat = toon(0x2e2a33), fur = toon(0x8a7a6a), ink = new THREE.MeshBasicMaterial({ color: 0x140c0a });
  const shirt = toon(0x7a2a3a), red = toon(0xc0202a), frame = toon(0x8a1a2a), gold = toon(0xe0b04a);
  const body = toonBody({ width: .86, shirt, coat, skin, pose: 'cig', armR: .22 });
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.55, .17, 10, 20), fur); collar.position.set(0, 1.86, 0); collar.rotation.x = Math.PI / 2 - .15; collar.scale.set(.9 * 1, 1, 1); body.add(collar);
  const { h, put } = toonHead(skin, { jaw: .82, jawW: .82 });
  const bob = put(new THREE.SphereGeometry(.62, 24, 18, Math.PI / 2 + .85, Math.PI * 2 - 1.7, 0, Math.PI * .7), hair, 0, .12, -.1); bob.scale.set(1.05, 1.05, 1.0);
  put(new THREE.SphereGeometry(.6, 24, 12, 0, Math.PI * 2, 0, Math.PI * .3), hair, 0, .16, -.06);
  put(new THREE.SphereGeometry(.3, 16, 12), hair, 0, .66, -.22);
  const bang = put(new THREE.CylinderGeometry(.5, .52, .22, 20, 1, false, -Math.PI / 2.6, Math.PI / 1.3), hair, 0, .4, .1); bang.rotation.x = .25;
  eyesSquint(put, ink, .12, .22); brows(put, ink, .24, .35, .24, .05);
  for (const sx of [-1, 1]) {
    const fr = put(new THREE.TorusGeometry(.12, .025, 6, 16), frame, sx * .2, .13, .5); fr.scale.set(1.25, .85, 1);
    const wing = put(new THREE.BoxGeometry(.12, .03, .03), frame, sx * .36, .2, .46); wing.rotation.z = sx * .6;
    put(new THREE.SphereGeometry(.05, 8, 6), gold, sx * .42, -.08, .02);
  }
  for (const [y, sy] of [[-.31, .7], [-.37, .6]]) { const l = put(new THREE.SphereGeometry(.09, 12, 8), red, 0, y, .46); l.scale.set(1.3, sy * .6, .5); l.userData.noInk = true; }
  const hand = body.userData.hand0;
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .6, 6), toon(0x111111)); holder.position.copy(hand).add(V3(-.12, .08, .32)); holder.rotation.x = Math.PI / 2 - .35; body.add(holder);
  const em = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a20, toneMapped: false })); em.position.copy(hand).add(V3(-.12, .19, .6)); body.add(em);
  body.userData.ember = em;
  return { body, head: h, shirt };
}

function assemble({ body, head, shirt }) {
  const g = new THREE.Group(); g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.26, .32, .4, 12), head.children[0].material); neck.position.set(0, 2.05, .03); g.add(neck);
  head.position.set(0, 2.72, .08); head.scale.setScalar(1.28); head.rotation.order = 'YXZ'; head.rotation.x = -.38; g.add(head);
  outline(g, .05);
  g.userData = { torso: body.userData.torso, head, shirt, ember: body.userData.ember, phase: Math.random() * 6 };
  return g;
}

function buildPlayers() {
  const makers = { N: makeTiao, E: makeMarreta, W: makeNeide };
  const smokeTex = canvasTex(64, 64, (g, W) => { const rg = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, W); });
  V.chairs = {}; V.midSmoke = [];
  for (const pos of ['N', 'E', 'W']) {
    const yaw = Math.atan2(-PL[pos].x, -PL[pos].z);
    const chair = outline(makeChair(), .035); chair.position.set(PL[pos].x, .12, PL[pos].z); chair.scale.setScalar(ROOM_K); chair.rotation.y = yaw;
    V.midScene.add(chair); V.chairs[pos] = chair;
    const p = assemble(makers[pos]());
    p.position.set(PL[pos].x, -.5, PL[pos].z); p.scale.setScalar(3.0);
    p.rotation.order = 'YXZ'; p.rotation.y = yaw;
    V.midScene.add(p); V.players[pos] = p;
    if (p.userData.ember) for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xd9d2c8, transparent: true, opacity: 0, depthWrite: false }));
      sp.userData = { phase: i / 6, src: p.userData.ember }; V.midScene.add(sp); V.midSmoke.push(sp);
    }
  }
}

function updatePlayers() {
  const seats = SEATPOS[G.mode];
  for (const pos of ['N', 'E', 'W']) {
    const p = seats.indexOf(pos), pl = V.players[pos];
    pl.visible = p >= 0;
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
      const sp = Math.min(1.12, 10.4 / Math.max(n, 1));
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
  const pts = [[-7.7, .3, 8.1], [7.7, .3, 8.1], [-7.7, .3, -8.1], [7.7, .3, -8.1], [-5.2, 2.1, 6.25], [5.2, 2.1, 6.25], [0, 8.5, -11.4]].map(p => new THREE.Vector3(...p));
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
  V.fg.setSize(V.W, V.H, false); V.bg.setSize(V.W, V.H, false); V.mid.setSize(V.W, V.H, false);
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
  for (const f of V.bgAnim || []) f(now / 1000);
  for (const f of V.fgAnim || []) f(now / 1000);
  V.fg.render(V.fgScene, V.cam);
  V.mid.render(V.midScene, V.cam);
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
    const lean = turnPos === pos ? .1 : 0;
    u.head.rotation.x += ((turnPos === pos ? -.12 : -.38) - u.head.rotation.x) * .05;
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
  for (const sp of V.midSmoke || []) {
    const t = ((now / 3800) + sp.userData.phase) % 1;
    sp.userData.src.getWorldPosition(v3s);
    sp.position.set(v3s.x + Math.sin(t * 5 + sp.userData.phase * 7) * .3 * t, v3s.y + .1 + t * 2.4, v3s.z + Math.cos(t * 3) * .2 * t);
    sp.scale.setScalar(.2 + t * 1.1); sp.material.opacity = .2 * Math.sin(Math.PI * t);
  }
}
const v3s = new THREE.Vector3();

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
  const watch = G.play !== 'solo';
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
      const intro = G.handNo === 1 ? `<div class="p-why">${G.n === 4 ? 'Na mesa: <b>Seu Tião</b> é seu parceiro. <b>Marreta</b> e <b>Dona Neide</b> jogam contra.' : 'Seu rival hoje: <b>Seu Tião</b>, 40 anos de mesa.'}</div>` : '';
      return prof(`Rodada ${G.handNo}`, `${nameOf(ev.p)} começa`, intro + `<div class="p-why">${ev.why}</div>` + (teach ? `<div class="p-row"><span class="tag">Dica</span><span class="p-why">${TIPS[(G.handNo - 1) % TIPS.length]}</span></div>` : ''));
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
      const ch = CHARS[nameOf(ev.p)], line = ch ? ch.pass[(G.handNo + ev.p + G.board.length) % ch.pass.length] : 'Passo!';
      return say(ev.p, line, `Não tenho ${endsTxt(ev.ends)}.`, tip ? `<div class="p-row"><span class="tag">Leitura</span><span class="p-why">${tip}</span></div>` : '');
    }
    case 'draw':
      return say(ev.p, `Comprei ${ev.drawn} ${ev.drawn > 1 ? 'pedras' : 'pedra'}`, `Estava sem ${endsTxt(ev.ends)}. Restam ${ev.left} no dorme.`,
        teach && ev.p !== 0 ? `<div class="p-row"><span class="tag">Leitura</span><span class="p-why">Deixe ${list(ev.ends)} nas pontas para apertar.</span></div>` : '');
    case 'play': {
      UI.popEv = ev;
      const t = ev.chosen.m.t, side = G.board.length === 1 ? '' : (ev.chosen.m.side === 'L' ? ' na esquerda' : ' na direita');
      if (ev.user) return null;
      const train = G.play === 'train', verb = train && ev.p === 0 ? 'Jogo por você' : 'Joguei';
      if (!teach) return say(ev.p, `Joguei ${mini(t, 13)}`, '');
      if (ev.forced) return say(ev.p, `${train && ev.p === 0 ? 'Abro por você' : 'Abro'} com ${mini(t, 13)}`, 'Regra: a maior carroça abre a primeira rodada.');
      if (ev.only) return say(ev.p, `${verb} ${mini(t, 13)}${side}`, 'Era a única pedra que servia.');
      const rs = reasonsFor(ev.chosen, ev.p);
      const tags = [...new Set(rs.filter(r => r.cls === 'pos').slice(0, 2).map(r => TAG[r.tag]))].map(x => `<span class="tag">${x}</span>`).join('');
      if (!train) return say(ev.p, `${verb} ${mini(t, 13)}${side}`, rs[0].short, whyRow(tags));
      const alt = ev.evals.find(x => x !== ev.chosen);
      const altLine = alt ? `<div class="p-alt">Por que não ${mini(alt.m.t)}? ${altReason(ev.chosen, alt).replace(/^./, c => c.toUpperCase())}.</div>` : '';
      return say(ev.p, `${verb} ${mini(t, 13)}${side}`, '', `<ul class="p-list">${rs.slice(0, 2).map(r => `<li class="${r.cls}">${r.short}</li>`).join('')}</ul>${altLine}` + whyRow(tags));
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
  let delay = menu ? (G.over ? 3800 : SPEED.demo) : SPEED[G.play];
  if (!menu && G.play === 'train') {
    // tempo de leitura conforme o tamanho do balão, com barra de progresso
    const len = POP.hidden ? 0 : POP.textContent.length;
    delay = Math.max(4000, Math.min(11000, 2600 + len * 55));
    POP.querySelector('.p-timer')?.remove();
    if (!POP.hidden) POP.insertAdjacentHTML('beforeend', `<div class="p-timer"><i style="animation-duration:${delay}ms"></i></div>`);
  }
  UI.timer = setTimeout(tick, delay);
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
  else if (c === 'pause') { UI.paused = !UI.paused; if (UI.paused) POP.querySelector('.p-timer')?.remove(); render(); schedule(); }
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
  const intro = { solo: 'Você joga contra o computador. Use Dica quando travar.', train: 'O professor joga a sua mão e explica cada lance, com pausa para você ler. Pausar segura a jogada na tela.', watch: 'Partida corrida: o professor joga por todos com explicações rápidas.' }[play];
  sheet(`<h3>${PLAY_NAME[play]}</h3><p>${intro}</p>
    <div class="mode-pick">
      <button class="mode-card" data-mode="1x1"><div class="mc-num">1<span>×</span>1</div><div><h5>Mano a mano</h5><p>Contra o Seu Tião. 14 pedras no dorme: sem jogada, compra até encaixar.</p></div></button>
      <button class="mode-card" data-mode="2x2"><div class="mc-num">2<span>×</span>2</div><div><h5>Duplas</h5><p>Você e o Seu Tião contra Marreta e Dona Neide. Sem compra e sem conversa: só a jogada comunica.</p></div></button>
    </div>
    <button class="linkbtn" data-close>Voltar</button>`);
  document.querySelectorAll('.mode-card').forEach(b => b.addEventListener('click', () => startGame(b.dataset.mode, play)));
}

function showRules() {
  sheet(`<h3>Dominó clássico</h3>
  <h4>Modos</h4>
  <ul>
    <li><strong>Jogar solo:</strong> você contra o computador, sem explicações. O botão Dica mostra a melhor jogada.</li>
    <li><strong>Treino:</strong> o professor joga a sua mão e a dos outros, explicando cada lance com pausa para leitura. Pausar segura a jogada; Próxima avança.</li>
    <li><strong>Assistir:</strong> partida corrida, com uma explicação rápida por lance. Toque em "Por quê?" para ver tudo.</li>
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
    <h4>A turma da mesa</h4>
    <ul>${Object.values(CHARS).map(c => `<li><strong>${c.full}:</strong> ${c.bio}</li>`).join('')}</ul>
    <h4>Sobre</h4>
    <ul>
      <li>Dominó clássico de 28 pedras, mano a mano e em duplas.</li>
      <li>Mesa 3D feita com Three.js.</li>
    </ul>
    <p class="s-count" style="text-align:center">Versão ${APP_VERSION} · atualiza sozinho</p>
    <button class="primary" data-close>Fechar</button>`);
}

function showDetail(ev) {
  if (!ev) return;
  const p = ev.p, e = ev.chosen, best = ev.evals[0];
  let html = `<h3>${nameOf(p)} jogou ${mini(e.m.t, 14)}</h3>`;
  html += `<h4>Por que esta jogada</h4>`;
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
  const quote = r.kind === 'bateu' && CHARS[nameOf(r.p)] ? `<p><em>“${CHARS[nameOf(r.p)].win}”</em></p>` : '';
  const sub = r.win < 0 ? 'Empate na contagem: ninguém marca.' : `${T[r.win]} ${G.n === 4 ? 'marcam' : 'marca'} ${r.pts} pontos${r.kind === 'trancou' ? ` (menos pontos na mão: ${r.tp[r.win]} contra ${r.tp[1 - r.win]})` : ''}.`;
  const rows = [...Array(G.n).keys()].map(p => `<div class="res-row"><div><strong><span class="dot t${team(p)}"></span> ${nameOf(p)}</strong><div class="tiles">${G.hands[p].map(t => tileSVG(t[0], t[1], { s: 10, v: true })).join('') || '<span class="s-count">sem pedras</span>'}</div></div><span class="s-count">${handPips(G.hands[p])} pts</span></div>`).join('');
  const champ = G.matchOver ? `<p><strong>${T[G.score[0] >= G.score[1] ? 0 : 1]} ${G.n === 4 ? 'vencem' : 'vence'} a partida!</strong></p>` : '';
  sheet(`<h3>${title}</h3>${quote}<p>${sub}</p>
    <div class="big-score"><div>${G.score[0]}<small>${T[0]}</small></div><span style="color:var(--ink-faint)">·</span><div>${G.score[1]}<small>${T[1]}</small></div></div>
    ${champ}<div>${rows}</div>
    <button class="primary" id="resNext">${G.matchOver ? 'Nova partida' : 'Próxima rodada'}</button>
    <button class="linkbtn" data-close>Ver a mesa</button>`);
  $('#resNext').addEventListener('click', onNext);
}

/* ================== Instalar e atualizar ================== */
const APP_VERSION = '2.4.0'; // manter igual a VERSION em sw.js
const isStandalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installEvt = null;
function refreshInstall() { $('#btnInstall').hidden = isStandalone() || !(installEvt || isIOS); }
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${msg}</span>` + (action ? `<button>${action.label}</button>` : '');
  if (action) t.querySelector('button').onclick = action.run;
  t.hidden = false; clearTimeout(toast.tm);
  if (!action) toast.tm = setTimeout(() => { t.hidden = true; }, 4500);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; refreshInstall(); });
window.addEventListener('appinstalled', () => { installEvt = null; refreshInstall(); toast('App instalado! Procure a Pedra Mestra na tela inicial.'); });
$('#btnInstall').addEventListener('click', async () => {
  if (installEvt) {
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice;
    installEvt = null; refreshInstall();
    if (outcome === 'accepted') toast('Instalando a Pedra Mestra…');
    return;
  }
  sheet(`<h3>Instalar no iPhone</h3>
    <ol>
      <li>Toque em <strong>Compartilhar</strong> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7h14v-7"/></svg> na barra do Safari.</li>
      <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
      <li>Toque em <strong>Adicionar</strong>.</li>
    </ol>
    <p>O app abre em tela cheia, funciona sem internet e se atualiza sozinho.</p>
    <button class="primary" data-close>Entendi</button>`);
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  let hadController = !!navigator.serviceWorker.controller; // na 1ª visita, a 1ª ativação não é atualização
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    const apply = () => { reloading = true; try { sessionStorage.setItem('pm-updated', '1'); } catch (e) {} location.reload(); };
    if (UI.screen === 'menu' && !sheetOpen()) apply();
    else toast('Nova versão da Pedra Mestra disponível.', { label: 'Atualizar', run: apply });
  });
  try { if (sessionStorage.getItem('pm-updated')) { sessionStorage.removeItem('pm-updated'); setTimeout(() => toast(`Pedra Mestra atualizada para a versão ${APP_VERSION}.`), 900); } } catch (e) {}
}

/* ================== Música e configurações ================== */
const MUSIC = ['musicas/01.mp3', 'musicas/02.mp3'];
const audio = new Audio(); audio.preload = 'none';
let track = 0, musicStarted = false, volume = 40;
try { const v = localStorage.getItem('pm-volume'); if (v !== null && !isNaN(+v)) volume = +v; } catch (e) {}
function fadeTo(target, ms = 1200) {
  const from = audio.volume, t0 = performance.now();
  const stepF = () => { const k = Math.min(1, (performance.now() - t0) / ms); audio.volume = from + (target - from) * k; if (k < 1) requestAnimationFrame(stepF); };
  requestAnimationFrame(stepF);
}
function playTrack(i) {
  track = (i + MUSIC.length) % MUSIC.length;
  audio.src = MUSIC[track]; audio.volume = 0;
  if (volume > 0) audio.play().then(() => fadeTo(volume / 100)).catch(() => {});
}
function setVolume(v) {
  volume = v; audio.volume = v / 100;
  try { localStorage.setItem('pm-volume', String(v)); } catch (e) {}
  if (v === 0) audio.pause();
  else if (musicStarted && audio.paused && !document.hidden) { if (!audio.src) playTrack(track); else audio.play().catch(() => {}); }
}
audio.addEventListener('ended', () => playTrack(track + 1));
const startMusic = () => { if (musicStarted) return; musicStarted = true; playTrack(0); };
for (const ev of ['pointerup', 'touchend', 'keydown', 'click']) window.addEventListener(ev, startMusic, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (!musicStarted) return;
  if (document.hidden) audio.pause(); else if (volume > 0) audio.play().catch(() => {});
});
function showSettings() {
  sheet(`<h3>Configurações</h3>
    <label class="set-row" for="volMusic"><span>Volume da música</span><b id="volVal">${volume}%</b></label>
    <input class="set-range" type="range" id="volMusic" min="0" max="100" step="5" value="${volume}">
    <div class="set-row"><span id="trackName">Música ${track + 1} de ${MUSIC.length}</span><button class="set-btn" id="btnTrack">Próxima música</button></div>
    <button class="primary" data-close>Pronto</button>`);
  $('#volMusic').addEventListener('input', e => { setVolume(+e.target.value); $('#volVal').textContent = volume + '%'; });
  $('#btnTrack').addEventListener('click', () => { musicStarted = true; playTrack(track + 1); $('#trackName').textContent = `Música ${track + 1} de ${MUSIC.length}`; });
}
$('#btnSettings').addEventListener('click', showSettings);

/* ================== Início ================== */
init3D();
toMenu();
refreshInstall();
