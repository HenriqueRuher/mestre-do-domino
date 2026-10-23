/* Pedra Mestra — regras do dominó clássico e o professor (IA que escolhe e explica as jogadas).
   Sem dependências de tela: usado pelo app e pelos testes em Node. */

/* ================== Peças ================== */
const ALL = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) ALL.push([a, b]);
const key = t => Math.min(t[0], t[1]) + '-' + Math.max(t[0], t[1]);
const pips = t => t[0] + t[1];
const has = (t, n) => t[0] === n || t[1] === n;
const isDbl = t => t[0] === t[1];
const other = (t, n) => t[0] === n ? t[1] : t[0];
const sum = a => a.reduce((s, x) => s + x, 0);
const handPips = h => sum(h.map(pips));
const cmpTile = (x, y) => x[0] - y[0] || x[1] - y[1];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = n => n.toFixed(1).replace('.', ',');
const pct = p => Math.round(p * 100) + '%';
const list = ns => { ns = [...new Set(ns)].sort(); return ns.length < 2 ? String(ns[0]) : ns.slice(0, -1).join(', ') + ' e ' + ns[ns.length - 1]; };
const tname = t => t[0] + '|' + t[1];

// Posição dos pontos numa meia pedra (coordenadas 0–1, pedra em pé)
const PIP = {0:[],1:[[.5,.5]],2:[[.27,.27],[.73,.73]],3:[[.27,.27],[.5,.5],[.73,.73]],
  4:[[.27,.27],[.73,.27],[.27,.73],[.73,.73]],5:[[.27,.27],[.73,.27],[.27,.73],[.73,.73],[.5,.5]],
  6:[[.27,.24],[.27,.5],[.27,.76],[.73,.24],[.73,.5],[.73,.76]]};

/* ================== Estado ================== */
// A turma da mesa: Tião (Norte), Marreta (Leste) e Neide (Oeste). No 1×1, o rival é o Tião.
const SEATS = { '1x1': ['Você', 'Tião'], '2x2': ['Sul', 'Marreta', 'Tião', 'Neide'] };
const TEAMS = { '1x1': ['Você', 'Tião'], '2x2': ['Nós', 'Eles'] };
const CHARS = {
  'Tião': { full: 'Seu Tião', bio: 'Aposentado da estiva. Joga na mesma mesa há 40 anos e não resiste a uma carroça.',
            pass: ['Passo, meu filho.', 'Tô seco nessa.', 'Essa eu não tenho.'], win: 'Bati! Quarenta anos de mesa, meu filho.' },
  'Marreta': { full: 'Marreta', bio: 'Dono de oficina. Bate a pedra na mesa com força e odeia passar a vez.',
            pass: ['Hmpf. Passo.', 'Passo... por enquanto.', 'Tá de brincadeira. Passo.'], win: 'BATI! Ouviu a pedra cantar?' },
  'Neide': { full: 'Dona Neide', bio: 'Contadora aposentada. Conta cada pedra que sai e nunca esquece um passe.',
            pass: ['Passo, querido.', 'Anotado. Passo.', 'Hoje não. Passo.'], win: 'Bati. Eu tinha contado, querido.' }
};
const TARGET = 100;
let G = null;

const nameOf = p => (G.n === 4 && p === 0 && G.play !== 'watch') ? 'Você' : SEATS[G.mode][p];
const team = p => G.n === 4 ? p % 2 : p;
const isHuman = p => p === 0 && G.play === 'solo';

// play: 'watch' (professor joga tudo, ritmo corrido), 'train' (professor joga tudo e explica com pausas), 'solo' (você joga)
function newMatch(mode, play) {
  G = { mode, n: mode === '1x1' ? 2 : 4, play, reveal: play === 'watch', score: [0, 0], handNo: 0, starter: null, first: true,
        mid: Math.random().toString(36).slice(2) };
  newHand();
}

function newHand() {
  const deck = shuffle(ALL.map(t => [...t]));
  G.hands = []; for (let p = 0; p < G.n; p++) G.hands.push(deck.splice(0, 7).sort(cmpTile));
  G.bone = deck;
  G.board = []; G.ci = 0; G.L = null; G.R = null; G.over = false; G.matchOver = false; G.result = null; G.await = null; G.sel = null; G.hint = null;
  G.handNo++;
  G.know = { lacks: [...Array(G.n)].map(() => new Set()), exposed: [...Array(G.n)].map(() => ({})), opener: { L: null, R: null } };
  G.lastKey = null; G.forced = null;
  let why;
  if (G.first) {
    let best = null, holder = 0;
    for (let p = 0; p < G.n; p++) for (const t of G.hands[p]) {
      const score = (isDbl(t) ? 100 : 0) + pips(t);
      if (!best || score > best.score) { best = { t, score }; holder = p; }
    }
    G.turn = holder; G.forced = best.t;
    why = isDbl(best.t) ? (best.t[0] === 6 ? 'Tem a carroça de 6: abre a mesa.' : `Tem a maior carroça (${tname(best.t)}): abre a mesa.`) : 'Ninguém tem carroça: abre com a pedra mais pesada.';
  } else {
    G.turn = G.starter;
    why = 'Venceu a rodada anterior: sai com qualquer pedra.';
  }
  G.lastEv = { type: 'start', p: G.turn, why };
}

/* ================== Regras ================== */
function legal(hand) {
  if (!G.board.length) return hand.map(t => ({ t, side: 'L' }));
  const out = [];
  for (const t of hand) {
    if (has(t, G.L)) out.push({ t, side: 'L' });
    if (has(t, G.R) && G.L !== G.R) out.push({ t, side: 'R' });
  }
  return out;
}

function play(p, m) {
  const hand = G.hands[p], t = m.t;
  hand.splice(hand.indexOf(t), 1);
  const ex = G.know.exposed[p];
  if (!G.board.length) {
    G.board.push({ a: t[0], b: t[1] }); G.L = t[0]; G.R = t[1]; G.ci = 0;
    G.know.opener.L = p; G.know.opener.R = p;
    ex[t[0]] = (ex[t[0]] || 0) + 1; if (!isDbl(t)) ex[t[1]] = (ex[t[1]] || 0) + 1;
  } else if (m.side === 'L') {
    const o = other(t, G.L); G.board.unshift({ a: o, b: G.L }); G.ci++; G.L = o; G.know.opener.L = p; ex[o] = (ex[o] || 0) + 1;
  } else {
    const o = other(t, G.R); G.board.push({ a: G.R, b: o }); G.R = o; G.know.opener.R = p; ex[o] = (ex[o] || 0) + 1;
  }
  G.lastKey = key(t);
  G.forced = null;
  if (!hand.length) return endHand('bateu', p);
  if (locked()) return endHand('trancou', p);
  G.turn = (p + 1) % G.n;
}

function locked() { // verdade do jogo: nenhuma pedra fora da mesa encaixa
  const pool = [...G.hands.flat(), ...G.bone];
  return !pool.some(t => has(t, G.L) || has(t, G.R));
}

function endHand(kind, p) {
  const tp = [0, 0];
  for (let q = 0; q < G.n; q++) tp[team(q)] += handPips(G.hands[q]);
  let win;
  if (kind === 'bateu') win = team(p);
  else win = tp[0] < tp[1] ? 0 : tp[1] < tp[0] ? 1 : -1;
  const pts = win >= 0 ? tp[1 - win] : 0;
  if (win >= 0) G.score[win] += pts;
  if (kind === 'bateu') G.starter = p;
  else if (win >= 0) {
    let bestQ = null; for (let q = 0; q < G.n; q++) if (team(q) === win && (bestQ === null || handPips(G.hands[q]) < handPips(G.hands[bestQ]))) bestQ = q;
    G.starter = bestQ;
  } else G.starter = ((G.starter ?? p) + 1) % G.n;
  G.first = false; G.over = true; G.await = null;
  G.matchOver = G.score.some(s => s >= TARGET);
  G.result = { kind, p, win, pts, tp };
}

/* ================== O professor ================== */
// Chance de o jogador o NÃO ter pedra para as pontas, vista por quem decide (só informação pública + a própria mão).
function pNoPlay(o, nl, nr, unknown) {
  const lacks = [...G.know.lacks[o]];
  const pool = unknown.filter(x => !lacks.some(n => has(x, n)));
  const C = pool.length, M = pool.filter(x => has(x, nl) || has(x, nr)).length;
  const h = Math.min(G.hands[o].length, C);
  let pr = 1;
  for (let i = 0; i < h; i++) { pr *= (C - M - i) / (C - i); if (pr <= 0) return 0; }
  return pr;
}

function evaluate(p, moves) {
  const hand = G.hands[p];
  const onBoard = new Set(G.board.map(b => key([b.a, b.b])));
  const mine = new Set(hand.map(key));
  const unknown = ALL.filter(t => !onBoard.has(key(t)) && !mine.has(key(t)));
  const seen = n => ALL.filter(t => has(t, n) && (onBoard.has(key(t)) || mine.has(key(t)))).length;
  const opps = G.n === 2 ? [{ o: 1 - p, w: 1 }] : [{ o: (p + 1) % 4, w: 1 }, { o: (p + 3) % 4, w: .5 }];
  const partner = G.n === 4 ? (p + 2) % 4 : null;
  const avgUnknown = unknown.length ? handPips(unknown) / unknown.length : 0;

  const res = moves.map(m => {
    const t = m.t, rest = hand.filter(x => x !== t);
    let nl, nr;
    if (!G.board.length) { nl = t[0]; nr = t[1]; }
    else if (m.side === 'L') { nl = other(t, G.L); nr = G.R; }
    else { nl = G.L; nr = other(t, G.R); }
    const newEnd = m.side === 'L' ? nl : nr;
    const f = {}, d = {};
    if (!rest.length) f.win = 1000;
    f.peso = pips(t) * .45;
    if (isDbl(t)) { const s = seen(t[0]); f.carroca = 2.5 + .45 * s; d.carroca = { n: t[0], s }; }
    const k = rest.filter(x => has(x, nl) || has(x, nr)).length;
    if (rest.length) { f.controle = k === 0 ? -3.5 : 1.1 * Math.min(k, 4); d.controle = { k, nl, nr }; }
    const distinct = new Set(rest.flat()).size;
    f.variedade = .35 * distinct; d.variedade = distinct;
    let blk = 0; d.bloqueio = [];
    for (const { o, w } of opps) {
      const pr = pNoPlay(o, nl, nr, unknown); blk += 7 * w * pr;
      d.bloqueio.push({ o, w, pr, lack: [...G.know.lacks[o]].filter(x => x === nl || x === nr) });
    }
    f.bloqueio = blk;
    if (partner !== null) {
      const pr = pNoPlay(partner, nl, nr, unknown);
      let v = -4 * pr;
      const likes = G.know.exposed[partner][newEnd] || 0;
      const likeOk = G.board.length && likes;
      if (likeOk) v += 1.3 * Math.min(likes, 2);
      f.parceiro = v;
      d.parceiro = { pr, like: likeOk ? newEnd : null, lack: [...G.know.lacks[partner]].filter(x => x === nl || x === nr) };
    }
    if (G.board.length && !isDbl(t)) {
      const op = G.know.opener[m.side];
      if (op !== null && op !== p && team(op) !== team(p)) { f.cortar = 1.2; d.cortar = { o: op, n: m.side === 'L' ? G.L : G.R }; }
    }
    const boardAfter = new Set(onBoard); boardAfter.add(key(t));
    const locks = rest.length && ALL.every(x => boardAfter.has(key(x)) || !(has(x, nl) || has(x, nr)));
    if (locks) {
      let my = handPips(rest), est;
      if (G.n === 2) est = avgUnknown * G.hands[1 - p].length;
      else { my += avgUnknown * G.hands[partner].length; est = avgUnknown * (G.hands[(p + 1) % 4].length + G.hands[(p + 3) % 4].length); }
      f.tranca = my < est ? 12 : -12; d.tranca = { my: Math.round(my), est: Math.round(est) };
    }
    return { m, nl, nr, f, d, rest, total: sum(Object.values(f)) };
  });
  res.sort((a, b) => b.total - a.total || pips(b.m.t) - pips(a.m.t));
  return res;
}

const FL = { win: 'bater', peso: 'livrar peso', carroca: 'jogar a carroça', controle: 'controle das pontas', variedade: 'variedade na mão', bloqueio: 'bloqueio do adversário', parceiro: 'cuidado com o parceiro', cortar: 'fechar a ponta do rival', tranca: 'trancar o jogo' };
const TAG = { win: 'Batida', peso: 'Peso', carroca: 'Carroça', controle: 'Controle', variedade: 'Variedade', bloqueio: 'Bloqueio', parceiro: 'Parceria', cortar: 'Leitura', tranca: 'Tranca' };

// Cada motivo tem um texto curto (balão) e um completo (folha "Por quê?").
function reasonsFor(e, p) {
  const out = [], f = e.f, d = e.d;
  const draws = G.n === 2;
  const endsTxt = e.nl === e.nr ? `${e.nl}` : `${e.nl} nem ${e.nr}`;
  if (f.win) out.push({ w: 999, cls: 'pos', tag: 'win', short: 'Última pedra: bateu!', txt: 'Bate: é a última pedra da mão e a rodada acaba aqui.' });
  if (f.tranca) out.push({ w: Math.abs(f.tranca), cls: f.tranca > 0 ? 'pos' : 'neg', tag: 'tranca',
    short: f.tranca > 0 ? 'Tranca o jogo com a mão mais leve.' : 'Trancaria com a mão mais pesada.',
    txt: f.tranca > 0 ? `Tranca o jogo: nenhuma pedra que sobrou encaixa nas pontas ${e.nl} e ${e.nr}. Seu lado soma ${d.tranca.my} pontos contra cerca de ${d.tranca.est} do outro, então vence a contagem.`
                      : `Trancaria o jogo com o seu lado mais pesado (${d.tranca.my} contra cerca de ${d.tranca.est}). Perderia a contagem.` });
  for (const b of d.bloqueio || []) {
    const c = 7 * b.w * b.pr; if (c < 1.2) continue;
    const who = nameOf(b.o), fail = draws ? 'comprar' : 'passar';
    out.push({ w: c, cls: 'pos', tag: 'bloqueio',
      short: b.lack.length ? `${who} não tem ${list(b.lack)}: essa ponta trava.` : `${pct(b.pr)} de chance de ${who} ${fail}.`,
      txt: b.lack.length
        ? `${who} já mostrou que não tem ${list(b.lack)} (passou ou comprou nesse número). Deixar ${list(b.lack)} na ponta dá ${pct(b.pr)} de chance de ${who} ${draws ? 'ter que comprar no dorme' : 'passar a vez'}.`
        : `Pela contagem das pedras, ${who} tem ${pct(b.pr)} de chance de não ter ${endsTxt} e ${draws ? 'ter que comprar no dorme' : 'passar a vez'}.` });
  }
  if (d.carroca) out.push({ w: f.carroca, cls: 'pos', tag: 'carroca', short: 'Carroça sai cedo: só entra num número.',
    txt: `Carroça de ${d.carroca.n} só entra numa ponta ${d.carroca.n}. Já há ${d.carroca.s} das 7 pedras com ${d.carroca.n} na mesa ou na mão. Segurar carroça é risco de ficar com ela.` });
  if (d.controle) {
    const { k, nl, nr } = d.controle, ends = nl === nr ? `no ${nl}` : `no ${nl} ou no ${nr}`;
    if (k >= 2) out.push({ w: f.controle, cls: 'pos', tag: 'controle', short: `Guarda ${k} pedras para as pontas.`,
      txt: `Ficam ${k} pedras na mão que encaixam ${ends}. Você continua com o controle das pontas.` });
    else if (k === 0) out.push({ w: 3.5, cls: 'neg', tag: 'controle', short: 'Cuidado: fica sem pedra para as pontas.',
      txt: `Depois dela, nenhuma pedra sua encaixa ${ends}. Você passa a depender dos outros.` });
  }
  if (f.peso >= 3.6) out.push({ w: f.peso, cls: 'pos', tag: 'peso', short: `Livra ${pips(e.m.t)} pontos da mão.`,
    txt: `Livra ${pips(e.m.t)} pontos da mão. Se a rodada trancar ou o rival bater, pedra pesada conta contra você.` });
  if (d.parceiro) {
    const pp = nameOf((p + 2) % 4), dp = d.parceiro;
    if (dp.like) out.push({ w: 1.3, cls: 'pos', tag: 'parceiro', short: `Devolve o ${dp.like} que ${pp} abriu.`,
      txt: `Deixa o ${dp.like} na ponta, número que ${pp} vem abrindo. Quem abre um número costuma ter mais dele.` });
    if (dp.lack.length) out.push({ w: 4 * dp.pr, cls: 'neg', tag: 'parceiro', short: `Risco: ${pp} passou no ${list(dp.lack)}.`,
      txt: `Custo: ${pp} já passou no ${list(dp.lack)}. Essa ponta pode travar o parceiro.` });
    else if (dp.pr >= .3) out.push({ w: 4 * dp.pr, cls: 'neg', tag: 'parceiro', short: `Risco de travar ${pp} (${pct(dp.pr)}).`,
      txt: `Custo: ${pct(dp.pr)} de chance de ${pp} também ficar sem jogada nessas pontas.` });
  }
  if (d.cortar) out.push({ w: 1.2, cls: 'pos', tag: 'cortar', short: `Fecha o ${d.cortar.n} que ${nameOf(d.cortar.o)} abriu.`,
    txt: `Fecha o ${d.cortar.n} que ${nameOf(d.cortar.o)} abriu. Quem abre um número geralmente quer que ele volte.` });
  out.sort((a, b) => b.w - a.w);
  if (!out.length) out.push({ w: 0, cls: 'info', tag: 'variedade', short: 'Mantém a mão variada.',
    txt: `Jogada de equilíbrio: mantém ${d.variedade} números diferentes na mão para não ficar sem saída.` });
  return out.slice(0, 4);
}

function altReason(best, alt) {
  let worst = null, gap = 0;
  for (const k of new Set([...Object.keys(best.f), ...Object.keys(alt.f)])) {
    const g = (best.f[k] || 0) - (alt.f[k] || 0);
    if (g > gap) { gap = g; worst = k; }
  }
  if (alt.f.tranca < 0) return 'trancaria o jogo perdendo a contagem';
  if (alt.d.controle && alt.d.controle.k === 0) return 'você ficaria sem pedra para as pontas';
  return worst ? 'perde em ' + FL[worst] : 'praticamente equivalente';
}
const grade = (best, e) => Math.max(0, 10 - (best.total - e.total) * .8);

/* ================== Passo a passo ================== */
function step() {
  if (G.over || G.await) return;
  const p = G.turn, hand = G.hands[p];
  let moves = legal(hand);
  const forced = !!G.forced;
  if (forced) moves = moves.filter(m => key(m.t) === key(G.forced));
  if (!moves.length) {
    if (G.n === 2 && G.bone.length) {
      G.know.lacks[p] = new Set([G.L, G.R]);
      let drawn = 0;
      while (G.bone.length) { const t = G.bone.pop(); hand.push(t); drawn++; if (has(t, G.L) || has(t, G.R)) break; }
      hand.sort(cmpTile);
      G.lastEv = { type: 'draw', p, drawn, ends: [G.L, G.R], left: G.bone.length };
      return;
    }
    G.know.lacks[p].add(G.L); G.know.lacks[p].add(G.R);
    G.lastEv = { type: 'pass', p, ends: [G.L, G.R] };
    G.turn = (p + 1) % G.n;
    return;
  }
  const evals = evaluate(p, moves);
  if (isHuman(p)) {
    G.await = { evals, forced }; G.sel = null; G.hint = null;
    G.lastEv = { type: 'await' };
    return;
  }
  const chosen = evals[0];
  play(p, chosen.m);
  G.lastEv = { type: 'play', p, chosen, evals, forced, only: moves.length === 1 };
}

// Jogada do humano (modo solo).
function userMove(m) {
  const { evals, forced } = G.await;
  const chosen = evals.find(e => e.m.t === m.t && e.m.side === m.side);
  G.await = null; G.sel = null; G.hint = null;
  play(0, chosen.m);
  G.lastEv = { type: 'play', p: 0, chosen, evals, user: true, forced, only: evals.length === 1 };
}

const TIPS = [
  'Cada número aparece em 7 pedras. Conte o que já saiu.',
  'Passou ou comprou? Esse jogador não tem os números das pontas.',
  'Carroça só entra de um jeito. Jogue cedo.',
  'Na dupla, devolva o número que seu parceiro abriu.',
  'Pedra pesada na mão conta contra você no final.',
  'Só tranque o jogo se sua mão for a mais leve.',
  'Guarde números variados para não ficar sem saída.'
];

if (typeof module !== 'undefined') module.exports = { CHARS, newMatch, newHand, step, userMove, evaluate, getG: () => G };
