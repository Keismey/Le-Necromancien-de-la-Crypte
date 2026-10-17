/* Le Nécromancien de la Crypte — game.js
   Un seul fichier, organisé en modules :
   Core · Save · I18n · Sfx · UI · FX · Art · Logic · Scènes (Menu, Carte, Boutique, Atelier, Crypte, Bestiaire, Réglages, Fin) */
(function () {
'use strict';
const D = window.GAME_DATA, LANG = window.LANG;

// ============================== Core ==============================
const W = 360, H = 640;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let view = { s: 1, ox: 0, oy: 0, dpr: 1 };
let time = 0;            // temps global (s)
let scene = null;
const Scenes = {};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const iw = window.innerWidth, ih = window.innerHeight;
  cv.width = Math.round(iw * dpr); cv.height = Math.round(ih * dpr);
  cv.style.width = iw + 'px'; cv.style.height = ih + 'px';
  const s = Math.min(iw / W, ih / H);
  view = { s, ox: (iw - W * s) / 2, oy: (ih - H * s) / 2, dpr };
}
window.addEventListener('resize', resize);

const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const ease = t => 1 - Math.pow(1 - t, 3);
function weighted(obj) {
  let tot = 0; for (const k in obj) tot += obj[k];
  let r = Math.random() * tot;
  for (const k in obj) { r -= obj[k]; if (r <= 0) return k; }
  return Object.keys(obj)[0];
}

// Entrées : un seul doigt à la fois (pointer events = tactile + souris)
const ptr = { id: null, x: 0, y: 0, sx: 0, sy: 0, t0: 0, down: false };
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
}
cv.addEventListener('pointerdown', e => {
  if (ptr.id !== null) return;
  e.preventDefault();
  Sfx.unlock();
  ptr.id = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  const p = toLogical(e);
  Object.assign(ptr, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: time, down: true });
  if (fade.t > 0.5) return;
  if (scene && scene.down) scene.down(p);
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== ptr.id) return;
  const p = toLogical(e); ptr.x = p.x; ptr.y = p.y;
  if (scene && scene.move) scene.move(p);
});
function endPtr(e, cancel) {
  if (e.pointerId !== ptr.id) return;
  const p = toLogical(e); ptr.id = null; ptr.down = false;
  if (scene && scene.up) scene.up(p, cancel);
}
cv.addEventListener('pointerup', e => endPtr(e, false));
cv.addEventListener('pointercancel', e => endPtr(e, true));
cv.addEventListener('contextmenu', e => e.preventDefault());

// Transition entre scènes (fondu)
const fade = { t: 0, dir: 0, next: null, arg: null };
function go(name, arg) {
  if (fade.dir === 1) return;
  fade.dir = 1; fade.next = name; fade.arg = arg;
}
function goNow(name, arg) {
  if (scene && scene.exit) scene.exit();
  scene = Scenes[name]; scene.id = name;
  UI.pressed = null; Toast.list = [];
  if (scene.enter) scene.enter(arg);
}

// ============================== Save ==============================
const SAVE_KEY = 'necro_crypte_save', SAVE_VER = 1;
let S = null;
function newState() {
  const nav = (navigator.language || 'fr').toLowerCase();
  return {
    v: SAVE_VER,
    lang: nav.startsWith('fr') ? 'fr' : 'en',
    set: { sound: true, music: true, vib: true, auto: true, big: false, easy: false },
    nextId: 1,
    cleared: 0,                 // dernière nuit terminée
    stars: {},                  // nuit → étoiles
    souls: 0,
    inv: [],                    // pièces dans le tiroir
    creatures: [],              // créatures de la crypte
    draft: null,                // créature en cours d'assemblage sur l'autel
    owned: { traps: { spikes: 1 }, fluids: {}, altar: 0, grim: {} },
    stock: {},                  // doses de fluides restantes cette nuit
    trapSlots: ['spikes', 'spikes', 'spikes'],
    relics: {},
    best: { creatures: [], recipes: {}, heroes: {}, made: 0 },
    tuto: 0,                    // étape du tutoriel (99 = fini)
    run: null,                  // nuit en cours (pour reprendre)
    titan: false, endless: 0,
    hints: {}
  };
}
const Save = {
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.v === SAVE_VER) {
          const b = newState();
          for (const k in o) {
            const d = b[k], v = o[k];
            b[k] = (d && v && typeof d === 'object' && typeof v === 'object' && !Array.isArray(d) && !Array.isArray(v)) ? Object.assign(d, v) : v;
          }
          S = b; return true;
        }
      }
    } catch (_) {}
    S = newState(); return false;
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (_) {} },
  exists() { try { return !!localStorage.getItem(SAVE_KEY); } catch (_) { return false; } },
  reset() { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} S = newState(); }
};
function uid() { return S.nextId++; }

// ============================== I18n ==============================
function t(key, p) {
  const tab = LANG[S ? S.lang : 'fr'] || LANG.fr;
  let s = tab[key];
  if (s === undefined) s = LANG.fr[key];
  if (s === undefined) return key;
  if (p) for (const k in p) s = s.split('{' + k + '}').join(p[k]);
  return s;
}

// ============================== Sfx (sons synthétisés, WebAudio) ==============================
const Sfx = (function () {
  let ac = null, master = null, musicGain = null, music = null, noiseBuf = null;
  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.18; musicGain.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      Music.apply();
    } catch (_) { ac = null; }
  }
  function env(g, t0, a, d, v) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(type, f1, f2, dur, vol, delay) {
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    env(g, t0, 0.01, dur, vol); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(freq, q, dur, vol, delay, type) {
    const t0 = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); env(g, t0, 0.005, dur, vol);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }
  const lib = {
    tap: () => tone('triangle', 520, 380, 0.06, 0.15),
    bone: () => { noise(1800, 6, 0.05, 0.5); noise(1200, 8, 0.05, 0.4, 0.06); },
    sew: () => noise(4200, 2, 0.08, 0.15),
    stitch: () => { tone('square', 900, 1400, 0.05, 0.06); },
    good: () => { tone('triangle', 520, 0, 0.12, 0.2); tone('triangle', 780, 0, 0.18, 0.2, 0.1); },
    perfect: () => { tone('triangle', 660, 0, 0.1, 0.2); tone('triangle', 880, 0, 0.1, 0.2, 0.08); tone('triangle', 1320, 0, 0.25, 0.2, 0.16); },
    bad: () => tone('sawtooth', 220, 140, 0.25, 0.12),
    vial: () => { tone('sine', 300, 900, 0.15, 0.15); tone('sine', 500, 1200, 0.1, 0.1, 0.12); },
    zap: () => { noise(3000, 0.7, 0.5, 0.5); tone('sawtooth', 80, 40, 0.6, 0.25); },
    roar: () => { tone('sawtooth', 140, 70, 0.9, 0.3); tone('square', 95, 60, 0.9, 0.15); noise(400, 1, 0.8, 0.3); },
    hit: () => noise(900, 1.5, 0.08, 0.35),
    hurt: () => tone('square', 300, 150, 0.12, 0.1),
    die: () => { tone('triangle', 400, 90, 0.35, 0.18); },
    trap: () => { noise(600, 2, 0.15, 0.5); tone('square', 160, 80, 0.15, 0.15); },
    fire: () => noise(500, 0.5, 0.6, 0.35, 0, 'lowpass'),
    coin: () => { tone('square', 990, 0, 0.06, 0.08); tone('square', 1320, 0, 0.1, 0.08, 0.06); },
    grind: () => { noise(250, 1, 0.4, 0.5); noise(1500, 3, 0.3, 0.2, 0.1); },
    error: () => tone('square', 180, 160, 0.15, 0.1),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, 0, 0.25, 0.2, i * 0.12)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, 0, 0.3, 0.2, i * 0.18)),
    power: () => { tone('sine', 200, 800, 0.6, 0.25); noise(2000, 1, 0.6, 0.2); },
    boom: () => { noise(120, 0.8, 0.9, 0.7, 0, 'lowpass'); tone('sine', 90, 30, 0.8, 0.4); }
  };
  function play(name) {
    if (!ac || !S || !S.set.sound || !lib[name]) return;
    try { lib[name](); } catch (_) {}
  }
  // Musique procédurale (en attendant les musiques générées)
  const Music = {
    cur: null, timer: null,
    set(name) { this.cur = name; this.apply(); },
    apply() {
      if (!ac) return;
      clearInterval(this.timer); this.timer = null;
      if (music) { try { music.forEach(n => n.stop()); } catch (_) {} music = null; }
      if (this.audio) { this.audio.pause(); this.audio = null; }
      if (!S.set.music || !this.cur) return;
      const name = this.cur;
      if ((window.MUSIC_LIST || []).indexOf(name) >= 0) {
        const a = new Audio('assets/music_' + name + '.mp3'); a.loop = true; a.volume = 0.45; this.audio = a;
        a.play().catch(() => {}); return;
      }
      const base = name === 'atelier' ? 65.4 : name === 'titan' ? 73.4 : 55;
      music = [];
      [1, 1.5, 2.01].forEach((m, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = name === 'atelier' ? 'sine' : 'triangle'; o.frequency.value = base * m;
        g.gain.value = [0.5, 0.25, 0.15][i]; o.connect(g); g.connect(musicGain); o.start(); music.push(o);
      });
      const notes = name === 'titan' ? [0, 3, 7, 10, 12, 15] : [0, 3, 7, 8, 12];
      this.timer = setInterval(() => {
        if (!S.set.music || document.hidden) return;
        const t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.type = name === 'atelier' ? 'triangle' : 'sine';
        o.frequency.value = base * 4 * Math.pow(2, pick(notes) / 12);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.5);
        o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + 2.6);
        if (name === 'atelier' && Math.random() < 0.5) { // goutte-à-goutte
          const d = ac.createOscillator(), dg = ac.createGain(); d.type = 'sine';
          d.frequency.setValueAtTime(1400, t0 + 0.7); d.frequency.exponentialRampToValueAtTime(500, t0 + 0.8);
          dg.gain.setValueAtTime(0.0001, t0 + 0.7); dg.gain.exponentialRampToValueAtTime(0.4, t0 + 0.71);
          dg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85); d.connect(dg); dg.connect(musicGain); d.start(t0 + 0.7); d.stop(t0 + 0.9);
        }
      }, name === 'titan' ? 700 : 1800);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (Music.audio) { if (document.hidden) Music.audio.pause(); else Music.audio.play().catch(() => {}); }
    if (!ac) return;
    if (document.hidden) ac.suspend(); else ac.resume();
  });
  return { unlock, play, Music };
})();
function vib(ms) { if (S && S.set.vib && navigator.vibrate) try { navigator.vibrate(ms); } catch (_) {} }

// ============================== Palette & texte ==============================
const C = {
  ink: '#1a0f24', bone: '#ece0c3', boneD: '#c2ad84', violet: '#6b3fa0', violetD: '#3d2160', violetL: '#9b6fd0',
  toxic: '#7dff4a', toxicD: '#3fae1e', steel: '#9aa8bc', steelD: '#5d6a7e', gold: '#f2c14e', goldD: '#b07f1a',
  red: '#d22b3a', stone: '#7a7482', stoneD: '#4e4956', bg: '#140b1e', panel: '#24163a', panelL: '#352252',
  text: '#f3eaff', dim: '#a596bf', rare: '#4aa8ff', legend: '#ffb627'
};
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
function font(size, bold) { return (bold === false ? '' : 'bold ') + size + 'px ' + FONT; }
function txt(s, x, y, size, color, align, opt) {
  opt = opt || {};
  ctx.font = font(size, opt.bold);
  ctx.textAlign = align || 'center'; ctx.textBaseline = opt.base || 'middle';
  if (opt.stroke !== false) { ctx.lineWidth = opt.sw || Math.max(2, size / 5); ctx.strokeStyle = opt.strokeColor || C.ink; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color || C.text; ctx.fillText(s, x, y);
}
function wrap(s, maxW, size) {
  ctx.font = font(size);
  const out = [];
  String(s).split('\n').forEach(par => {
    let line = '';
    par.split(' ').forEach(w => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    });
    out.push(line);
  });
  return out;
}
function txtWrap(s, x, y, maxW, size, color, align, lh) {
  const lines = wrap(s, maxW, size); lh = lh || size * 1.25;
  lines.forEach((l, i) => txt(l, x, y + i * lh, size, color, align));
  return lines.length * lh;
}
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function panel(x, y, w, h, col, r) {
  // panneau en image (ui_panel) pour les fonds sombres standard
  const pim = w >= 120 && h >= 44 && (!col || col === C.panel || /^rgba\(36,22,58/.test(col)) && Art.img('ui_panel');
  if (pim) { nine(pim, x - 2, y - 2, w + 4, h + 4, Math.min(16, h / 2), 40); return; }
  rr(x, y, w, h, r === undefined ? 10 : r);
  ctx.fillStyle = col || C.panel; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
}

// image étirée en 9 morceaux : coins intacts, bords et centre étirés (boutons, bannières, levier)
function nine(im, x, y, w, h, corner, srcCorner) {
  const iw = im.naturalWidth, ih = im.naturalHeight, sc = srcCorner || Math.round(Math.min(iw, ih) * 0.42);
  const d = Math.min(corner, w / 2, h / 2), xs = [0, sc, iw - sc, iw], ys = [0, sc, ih - sc, ih], xd = [x, x + d, x + w - d, x + w], yd = [y, y + d, y + h - d, y + h];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const sw = xs[i + 1] - xs[i], sh = ys[j + 1] - ys[j], dw = xd[i + 1] - xd[i], dh = yd[j + 1] - yd[j];
    if (sw > 0 && sh > 0 && dw > 0 && dh > 0) ctx.drawImage(im, xs[i], ys[j], sw, sh, xd[i], yd[j], dw + (i < 2 ? 0.5 : 0), dh + (j < 2 ? 0.5 : 0));
  }
}

// Barre du haut commune : fond sombre dégradé, liseré os, ombre portée
function topBar(h) {
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(10,5,18,0.97)'); g.addColorStop(1, 'rgba(30,18,46,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
  const sh = ctx.createLinearGradient(0, h, 0, h + 10); sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.fillRect(0, h, W, 10);
  ctx.fillStyle = C.ink; ctx.fillRect(0, h - 3, W, 3); ctx.fillStyle = 'rgba(236,224,195,0.35)'; ctx.fillRect(0, h - 4, W, 1);
}
// Bannière de titre : image ui_banner si présente, sinon ruban violet à queues fourchues
function banner(title, cx, cy, size) {
  ctx.font = font(size || 18); const tw = ctx.measureText(title).width, w = Math.max(130, tw + 40), h = 32, x = cx - w / 2, y = cy - h / 2;
  const im = Art.img('ui_banner');
  if (im) { const bh = 40, wi = tw + 124; three(im, cx - wi / 2, cy - bh / 2 - 2, wi, bh, 135); }
  else {
    // queues
    [-1, 1].forEach(d => {
      const ex = cx + d * (w / 2 + 11), ix = cx + d * (w / 2 - 8);
      ctx.beginPath(); ctx.moveTo(ix, y + 6); ctx.lineTo(ex, y + 6); ctx.lineTo(ex - d * 7, y + h / 2 + 4); ctx.lineTo(ex, y + h + 2); ctx.lineTo(ix, y + h + 2); ctx.closePath();
      ctx.fillStyle = '#3a2160'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    });
    rr(x, y, w, h, 6);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#8a5cc4'); g.addColorStop(1, '#4a2a7a');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.strokeStyle = 'rgba(236,224,195,0.45)'; ctx.lineWidth = 1.5; rr(x + 4, y + 4, w - 8, h - 8, 4); ctx.stroke();
  }
  txt(title, cx, cy + 1, size || 18, C.text, 'center', { sw: 5 });
}
// Compteur d'âmes dans une pastille
function soulPill(x, y) {
  ctx.font = font(14); const w = ctx.measureText(String(S.souls)).width + 34;
  rr(x - w, y - 13, w, 26, 13); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(125,255,74,0.45)'; ctx.stroke();
  Art.icon('soul', x - w + 13, y, 19); txt(String(S.souls), x - w + 25, y + 1, 14, C.toxic, 'left');
}

// image étirée en 3 morceaux horizontaux (boutons, bannière) : extrémités intactes, milieu étiré
function three(im, x, y, w, h, cap) {
  const iw = im.naturalWidth, ih = im.naturalHeight, k = h / ih, d = Math.min(cap * k, w / 2);
  ctx.drawImage(im, 0, 0, cap, ih, x, y, d + 0.5, h);
  ctx.drawImage(im, cap, 0, iw - cap * 2, ih, x + d, y, w - d * 2 + 0.5, h);
  ctx.drawImage(im, iw - cap, 0, cap, ih, x + w - d, y, d, h);
}
// idem en vertical (glissière du levier)
function threeV(im, x, y, w, h, cap) {
  const iw = im.naturalWidth, ih = im.naturalHeight, k = w / iw, d = Math.min(cap * k, h / 2);
  ctx.drawImage(im, 0, 0, iw, cap, x, y, w, d + 0.5);
  ctx.drawImage(im, 0, cap, iw, ih - cap * 2, x, y + d, w, h - d * 2 + 0.5);
  ctx.drawImage(im, 0, ih - cap, iw, cap, x, y + h - d, w, d);
}

// ============================== UI (boutons) ==============================
const UI = {
  pressed: null,
  btn(o) { return Object.assign({ x: 0, y: 0, w: 120, h: 46, label: '', icon: null, on: null, show: true, off: false, style: 'main', pulse: false, size: 16 }, o); },
  bigH(h) { return S.set.big ? Math.max(h, 54) : h; },
  hit(b, p) { return b.show && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; },
  down(list, p) {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (this.hit(b, p)) { if (b.off) { Sfx.play('error'); return true; } this.pressed = b; return true; }
    }
    return false;
  },
  up(list, p) {
    const b = this.pressed; this.pressed = null;
    if (b && this.hit(b, p) && !b.off && list.indexOf(b) >= 0) { Sfx.play('tap'); vib(10); if (b.on) b.on(); return true; }
    return !!b;
  },
  draw(list) { list.forEach(b => { if (b.show) this.drawBtn(b); }); },
  drawBtn(b) {
    const pr = this.pressed === b ? 2 : 0;
    const cols = { main: [C.violet, C.violetL], green: [C.toxicD, C.toxic], dark: [C.panel, C.panelL], gold: [C.goldD, C.gold], red: ['#7a1f2a', '#c33a4a'] }[b.style] || [C.violet, C.violetL];
    let x = b.x, y = b.y + pr;
    if (b.pulse) { const k = 1 + Math.sin(time * 6) * 0.04; ctx.save(); ctx.translate(x + b.w / 2, y + b.h / 2); ctx.scale(k, k); ctx.translate(-x - b.w / 2, -y - b.h / 2); }
    const bim = Art.img('btn_' + (b.off ? 'dark' : (b.style || 'main')));
    // zone utile (face intérieure du bouton) où se placent texte et icône
    let fx0 = x + 6, fx1 = x + b.w - 6, fy0 = y + 3, fy1 = y + b.h - 4;
    if (bim) {
      ctx.save(); if (b.off) ctx.globalAlpha *= 0.7;
      const X = x - 3, Y = y - 2, BW = b.w + 6, BH = b.h + 5, k = BH / bim.naturalHeight;
      three(bim, X, Y, BW, BH, b.off || b.style === 'dark' ? 60 : 75); ctx.restore();
      const side = Math.min(41 * k, BW * 0.2);
      fx0 = X + side; fx1 = X + BW - side; fy0 = Y + 30 * k; fy1 = Y + 87 * k;
    } else {
      rr(x, y + 4 - pr, b.w, b.h, 12); ctx.fillStyle = C.ink; ctx.fill();
      rr(x, y, b.w, b.h, 12);
      const g = ctx.createLinearGradient(0, y, 0, y + b.h); g.addColorStop(0, cols[1]); g.addColorStop(1, cols[0]);
      ctx.fillStyle = b.off ? '#4a4252' : g; ctx.fill();
      // reflet en haut et ombre interne en bas, pour du relief
      ctx.save(); rr(x, y, b.w, b.h, 12); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; rr(x + 4, y + 3, b.w - 8, b.h * 0.38, 9); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, y + b.h - 5, b.w, 5);
      ctx.restore();
      rr(x, y, b.w, b.h, 12); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    }
    const fw = fx1 - fx0, fh = fy1 - fy0, fcx = (fx0 + fx1) / 2, fcy = (fy0 + fy1) / 2, tcol = b.off ? '#999' : C.text;
    // texte réduit s'il déborde de la face
    const fit = (s, maxW, size) => { ctx.font = font(size); const tw = ctx.measureText(s).width; return tw > maxW ? Math.max(9, Math.floor(size * maxW / tw)) : size; };
    if (b.icon && (b.sub || !b.label)) Art.icon(b.icon, fcx, fcy, Math.min(b.h * 0.62, fh * 1.35, fw * 0.9));
    else if (b.icon) {
      // icône + texte centrés ensemble dans la face, l'icône ne dépasse pas du cadre doré
      const isz = Math.min(b.h * 0.6, fh * 1.12), gap = 6;
      const sz = fit(b.label, fw - isz - gap - 10, b.size || 16); ctx.font = font(sz);
      const tw = ctx.measureText(b.label).width, gx = fcx - (isz + gap + tw) / 2;
      Art.icon(b.icon, gx + isz / 2, fcy, isz);
      txt(b.label, gx + isz + gap + tw / 2, fcy + 1, sz, tcol);
    } else txt(b.label, fcx, fcy + 1, fit(b.label, fw - 8, b.size || 16), tcol);
    if (b.badge) { ctx.beginPath(); ctx.arc(x + b.w - 4, y + 4, 9, 0, 7); ctx.fillStyle = C.red; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke(); txt(b.badge, x + b.w - 4, y + 5, 11); }
    if (b.pulse) ctx.restore();
  }
};

// Message éphémère (toast) et bulle de tutoriel
const Toast = {
  list: [],
  show(s, col) { this.list.push({ s, col: col || C.text, t: 2.4 }); if (this.list.length > 3) this.list.shift(); },
  update(dt) { this.list.forEach(m => m.t -= dt); this.list = this.list.filter(m => m.t > 0); },
  draw() {
    let y = 102;
    this.list.forEach(m => {
      const a = Math.min(1, m.t * 2), lines = wrap(m.s, 300, 14);
      ctx.globalAlpha = a; ctx.font = font(14);
      const w = Math.min(330, Math.max(...lines.map(l => ctx.measureText(l).width)) + 30), h = lines.length * 18 + 14;
      panel(W / 2 - w / 2, y, w, h, 'rgba(26,15,36,0.92)', 14);
      lines.forEach((l, i) => txt(l, W / 2, y + 16 + i * 18, 14, m.col));
      ctx.globalAlpha = 1; y += h + 6;
    });
  }
};
const Hint = {
  cur: null,
  show(text, x, y, opt) { this.cur = Object.assign({ text, x, y, t: 0 }, opt || {}); },
  clear() { this.cur = null; },
  update(dt) { if (this.cur) this.cur.t += dt; },
  draw() {
    const h = this.cur; if (!h) return;
    const by = h.boxY !== undefined ? h.boxY : (h.y > 330 ? h.y - 130 : h.y + 60);
    const lines = wrap(h.text, 280, 15); const bh = lines.length * 19 + 18;
    ctx.globalAlpha = Math.min(1, h.t * 3);
    panel(30, by, 300, bh, 'rgba(36,22,58,0.96)', 12);
    ctx.strokeStyle = C.toxic; ctx.lineWidth = 2; rr(30, by, 300, bh, 12); ctx.stroke();
    lines.forEach((l, i) => txt(l, W / 2, by + 18 + i * 19, 15, C.text));
    if (h.x !== null && h.x !== undefined) {
      let hx = h.x, hy = h.y;
      if (h.dragTo) { const k = (h.t % 1.6) / 1.2; const e = ease(clamp(k, 0, 1)); hx = lerp(h.x, h.dragTo.x, e); hy = lerp(h.y, h.dragTo.y, e); }
      else hy += Math.sin(h.t * 6) * 6;
      Art.hand(hx, hy);
    }
    ctx.globalAlpha = 1;
  }
};

// ============================== FX (particules, textes flottants, secousse) ==============================
const FX = {
  parts: [], texts: [], bolts: [], shakeT: 0, shakeA: 0, flash: 0,
  spark(x, y, col, n, spd, life) {
    for (let i = 0; i < (n || 10); i++) {
      const a = Math.random() * 6.283, v = rnd(0.3, 1) * (spd || 120);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: life || rnd(0.4, 0.8), t: 0, col, r: rnd(1.5, 3.5), g: 200 });
    }
  },
  puff(x, y, col, n) {
    for (let i = 0; i < (n || 6); i++) this.parts.push({ x: x + rnd(-8, 8), y: y + rnd(-6, 6), vx: rnd(-20, 20), vy: rnd(-40, -10), life: rnd(0.5, 0.9), t: 0, col, r: rnd(4, 8), g: -20, puff: true });
  },
  text(x, y, s, col, size) { this.texts.push({ x, y, s, col: col || C.text, t: 0, size: size || 14 }); },
  bolt(x1, y1, x2, y2, col, life) {
    const pts = []; const n = 9;
    for (let i = 0; i <= n; i++) { const k = i / n; pts.push([lerp(x1, x2, k) + (i && i < n ? rnd(-14, 14) : 0), lerp(y1, y2, k) + (i && i < n ? rnd(-6, 6) : 0)]); }
    this.bolts.push({ pts, col: col || C.toxic, t: 0, life: life || 0.25 });
  },
  shake(a, t) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = Math.max(this.shakeT, t); },
  update(dt) {
    this.parts.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; });
    this.parts = this.parts.filter(p => p.t < p.life);
    if (this.parts.length > 260) this.parts.splice(0, this.parts.length - 260);
    this.texts.forEach(p => { p.t += dt; p.y -= 26 * dt; });
    this.texts = this.texts.filter(p => p.t < 1);
    this.bolts.forEach(b => b.t += dt); this.bolts = this.bolts.filter(b => b.t < b.life);
    this.shakeT = Math.max(0, this.shakeT - dt); if (!this.shakeT) this.shakeA = 0;
    this.flash = Math.max(0, this.flash - dt * 2);
  },
  draw() {
    this.parts.forEach(p => {
      const a = 1 - p.t / p.life; ctx.globalAlpha = p.puff ? a * 0.5 : a;
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.puff ? 1 + p.t : 1), 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    this.bolts.forEach(b => {
      const a = 1 - b.t / b.life;
      ctx.globalAlpha = a; ctx.lineJoin = 'round';
      [[7, b.col, 0.35], [3, '#fff', 1]].forEach(([w, c, al]) => {
        ctx.globalAlpha = a * al; ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath();
        b.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      });
    });
    ctx.globalAlpha = 1;
    this.texts.forEach(p => { ctx.globalAlpha = 1 - p.t; txt(p.s, p.x, p.y, p.size, p.col); });
    ctx.globalAlpha = 1;
  },
  clear() { this.parts = []; this.texts = []; this.bolts = []; }
};

// ============================== Art (dessins procéduraux en attendant les planches Gemini) ==============================
const Art = (function () {
  let c = ctx;
  const LW = 0.055;            // demi-épaisseur de contour, en unités de la boîte
  const PI = Math.PI, TAU = PI * 2;
  function fillOut(fill, lw) { c.lineJoin = 'round'; c.lineWidth = (lw || LW) * 2; c.strokeStyle = C.ink; c.stroke(); c.fillStyle = fill; c.fill(); }
  function circ(x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  function ell(x, y, rx, ry, rot) { c.moveTo(x + rx * Math.cos(rot || 0), y + rx * Math.sin(rot || 0)); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rrect(x, y, w, h, r) {
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function line(pts, w, col) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.lineWidth = w + LW * 2; c.strokeStyle = C.ink; c.stroke();
    c.lineWidth = w; c.strokeStyle = col; c.stroke();
  }
  function bone(x1, y1, x2, y2, w, col) {
    const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
    c.save(); c.translate(x1, y1); c.rotate(a);
    c.beginPath(); c.rect(0, -w * 0.32, L, w * 0.64);
    circ(0, -w * 0.3, w * 0.36); circ(0, w * 0.3, w * 0.36); circ(L, -w * 0.3, w * 0.36); circ(L, w * 0.3, w * 0.36);
    fillOut(col || C.bone); c.restore();
  }
  function dot(x, y, r, col) { c.beginPath(); circ(x, y, r); c.fillStyle = col; c.fill(); }
  function glowDot(x, y, r, col) {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); circ(x, y, r); c.fill();
  }
  function heartPath(s) {
    c.moveTo(0, 0.36 * s); c.bezierCurveTo(-0.52 * s, 0.02 * s, -0.32 * s, -0.42 * s, 0, -0.16 * s);
    c.bezierCurveTo(0.32 * s, -0.42 * s, 0.52 * s, 0.02 * s, 0, 0.36 * s); c.closePath();
  }

  // ---- Têtes ----
  function skull(o, scale, eyeCol) {
    const s = scale || 1;
    c.beginPath(); circ(0, -0.08 * s, 0.3 * s); rrect(-0.17 * s, 0.06 * s, 0.34 * s, 0.24 * s, 0.07 * s); fillOut(C.bone);
    c.globalAlpha = 0.35; c.beginPath(); c.arc(0, -0.08 * s, 0.26 * s, -0.6, 1.2); c.lineWidth = 0.06 * s; c.strokeStyle = C.boneD; c.stroke(); c.globalAlpha = 1;
    c.fillStyle = C.ink; c.beginPath(); ell(-0.11 * s, -0.05 * s, 0.085 * s, 0.1 * s); ell(0.11 * s, -0.05 * s, 0.085 * s, 0.1 * s); c.fill();
    c.beginPath(); c.moveTo(0, 0.04 * s); c.lineTo(-0.04 * s, 0.11 * s); c.lineTo(0.04 * s, 0.11 * s); c.closePath(); c.fill();
    c.lineWidth = 0.025 * s; c.strokeStyle = C.ink; c.beginPath();
    [-0.08, 0, 0.08].forEach(x => { c.moveTo(x * s, 0.17 * s); c.lineTo(x * s, 0.29 * s); }); c.stroke();
    const ec = eyeCol || (o.eye || C.toxic);
    if (!o.noEyes) { glowDot(-0.11 * s, -0.04 * s, 0.09 * s, ec); glowDot(0.11 * s, -0.04 * s, 0.09 * s, ec); dot(-0.11 * s, -0.04 * s, 0.03 * s, '#fff'); dot(0.11 * s, -0.04 * s, 0.03 * s, '#fff'); }
  }
  const A = {};
  A.skull = o => skull(o);
  A.helm = o => {
    skull(o);
    c.beginPath(); c.moveTo(-0.36, -0.1); c.arc(0, -0.12, 0.36, PI, 0); c.lineTo(0.36, -0.08); c.lineTo(-0.36, -0.08); c.closePath(); fillOut(C.steel);
    c.beginPath(); rrect(-0.045, -0.14, 0.09, 0.2, 0.03); fillOut(C.steelD);
    c.beginPath(); ell(0, -0.46, 0.09, 0.07); fillOut(C.red);
    dot(-0.24, -0.13, 0.025, C.steelD); dot(0.24, -0.13, 0.025, C.steelD);
  };
  A.hood = o => {
    c.beginPath(); c.moveTo(0, -0.5); c.quadraticCurveTo(0.46, -0.32, 0.42, 0.4); c.lineTo(-0.42, 0.4); c.quadraticCurveTo(-0.46, -0.32, 0, -0.5); fillOut(C.violetD);
    c.beginPath(); ell(0, 0.04, 0.22, 0.26); c.fillStyle = '#0b0512'; c.fill();
    c.fillStyle = o.eye || C.toxic;
    c.beginPath(); c.moveTo(-0.15, -0.02); c.lineTo(-0.04, 0.02); c.lineTo(-0.14, 0.05); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0.15, -0.02); c.lineTo(0.04, 0.02); c.lineTo(0.14, 0.05); c.closePath(); c.fill();
    c.lineWidth = 0.03; c.strokeStyle = C.violet; c.beginPath(); c.moveTo(-0.3, 0.38); c.lineTo(-0.22, -0.1); c.moveTo(0.3, 0.38); c.lineTo(0.22, -0.1); c.stroke();
  };
  A.runeskull = o => {
    skull(o, 1, '#58f0ff');
    c.strokeStyle = '#58f0ff'; c.lineWidth = 0.03; c.lineCap = 'round'; c.beginPath();
    c.moveTo(-0.05, -0.33); c.lineTo(0, -0.24); c.lineTo(0.05, -0.33); c.moveTo(0, -0.24); c.lineTo(0, -0.17);
    c.moveTo(-0.24, -0.2); c.lineTo(-0.17, -0.25); c.lineTo(-0.2, -0.15); c.moveTo(0.24, -0.2); c.lineTo(0.17, -0.25); c.lineTo(0.2, -0.15); c.stroke();
    glowDot(0, -0.27, 0.12, 'rgba(88,240,255,0.5)');
  };
  A.halo = o => {
    c.lineWidth = 0.12; c.strokeStyle = C.ink; c.beginPath(); ell(0, -0.43, 0.27, 0.07); c.stroke();
    c.lineWidth = 0.06; c.strokeStyle = C.gold; c.stroke();
    skull(o, 1, '#ffe9a0');
    glowDot(0, -0.43, 0.3, 'rgba(255,220,120,0.25)');
  };
  A.gargoyle = o => {
    c.beginPath(); c.moveTo(-0.2, -0.24); c.lineTo(-0.44, -0.5); c.lineTo(-0.32, -0.16); c.closePath();
    c.moveTo(0.2, -0.24); c.lineTo(0.44, -0.5); c.lineTo(0.32, -0.16); c.closePath(); fillOut(C.stoneD);
    c.beginPath(); c.moveTo(-0.32, -0.08); c.lineTo(-0.46, -0.16); c.lineTo(-0.36, 0.06); c.moveTo(0.32, -0.08); c.lineTo(0.46, -0.16); c.lineTo(0.36, 0.06); fillOut(C.stone);
    c.beginPath(); rrect(-0.32, -0.32, 0.64, 0.66, 0.18); fillOut(C.stone);
    c.fillStyle = C.stoneD; c.beginPath(); c.moveTo(-0.28, -0.1); c.lineTo(0.28, -0.1); c.lineTo(0.2, -0.02); c.lineTo(-0.2, -0.02); c.fill();
    c.fillStyle = o.eye || '#ff4a3a'; c.beginPath(); c.moveTo(-0.2, -0.04); c.lineTo(-0.06, -0.01); c.lineTo(-0.18, 0.04); c.closePath(); c.moveTo(0.2, -0.04); c.lineTo(0.06, -0.01); c.lineTo(0.18, 0.04); c.closePath(); c.fill();
    c.beginPath(); rrect(-0.2, 0.12, 0.4, 0.14, 0.05); c.fillStyle = '#211a28'; c.fill();
    c.fillStyle = C.bone; c.beginPath(); c.moveTo(-0.15, 0.12); c.lineTo(-0.1, 0.22); c.lineTo(-0.05, 0.12); c.moveTo(0.15, 0.12); c.lineTo(0.1, 0.22); c.lineTo(0.05, 0.12); c.fill();
    c.strokeStyle = C.stoneD; c.lineWidth = 0.025; c.beginPath(); c.moveTo(0.1, -0.3); c.lineTo(0.16, -0.2); c.lineTo(0.12, -0.14); c.stroke();
  };
  A.crownskull = o => {
    skull(o, 1.1, '#ffd84a');
    c.beginPath(); c.moveTo(-0.3, -0.26); c.lineTo(-0.34, -0.5); c.lineTo(-0.17, -0.36); c.lineTo(0, -0.54); c.lineTo(0.17, -0.36); c.lineTo(0.34, -0.5); c.lineTo(0.3, -0.26); c.closePath(); fillOut(C.gold);
    dot(0, -0.34, 0.045, C.red); dot(-0.2, -0.32, 0.03, C.rare); dot(0.2, -0.32, 0.03, C.rare);
  };
  // ---- Torses ----
  A.ribcage = o => {
    line([[-0.38, -0.36], [0.38, -0.36]], 0.09, C.bone);
    for (let i = 0; i < 4; i++) {
      const y = -0.27 + i * 0.16, w = 0.36 - i * 0.04;
      line([[0, y], [-w * 0.7, y - 0.03], [-w, y + 0.08], [-w * 0.75, y + 0.14]], 0.06, C.bone);
      line([[0, y], [w * 0.7, y - 0.03], [w, y + 0.08], [w * 0.75, y + 0.14]], 0.06, C.bone);
    }
    line([[0, -0.44], [0, 0.4]], 0.1, C.boneD);
    c.beginPath(); ell(0, 0.4, 0.2, 0.08); fillOut(C.bone);
  };
  function platePath() { c.moveTo(-0.38, -0.38); c.lineTo(0.38, -0.38); c.lineTo(0.33, 0.1); c.quadraticCurveTo(0.28, 0.44, 0, 0.47); c.quadraticCurveTo(-0.28, 0.44, -0.33, 0.1); c.closePath(); }
  A.plate = o => {
    c.beginPath(); platePath(); fillOut(C.steel);
    c.globalAlpha = 0.5; c.beginPath(); c.moveTo(-0.3, -0.34); c.lineTo(-0.1, -0.34); c.lineTo(-0.16, 0.3); c.closePath(); c.fillStyle = '#d7e0ec'; c.fill(); c.globalAlpha = 1;
    line([[0, -0.36], [0, 0.42]], 0.035, C.steelD);
    c.beginPath(); circ(-0.4, -0.34, 0.15); circ(0.4, -0.34, 0.15); fillOut(C.steelD);
    [[-0.26, -0.28], [0.26, -0.28], [-0.22, 0.22], [0.22, 0.22]].forEach(p => dot(p[0], p[1], 0.025, C.ink));
  };
  A.holyplate = o => {
    c.beginPath(); platePath(); fillOut('#ece8f3');
    c.lineWidth = 0.04; c.strokeStyle = C.gold; c.beginPath(); c.moveTo(-0.3, -0.3); c.lineTo(0.3, -0.3); c.lineTo(0.27, 0.1); c.quadraticCurveTo(0.23, 0.38, 0, 0.4); c.quadraticCurveTo(-0.23, 0.38, -0.27, 0.1); c.closePath(); c.stroke();
    c.beginPath(); circ(-0.4, -0.34, 0.15); circ(0.4, -0.34, 0.15); fillOut(C.gold);
    c.strokeStyle = C.goldD; c.lineWidth = 0.035; c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * PI / 4; c.moveTo(Math.cos(a) * 0.1, -0.03 + Math.sin(a) * 0.1); c.lineTo(Math.cos(a) * 0.18, -0.03 + Math.sin(a) * 0.18); } c.stroke();
    c.beginPath(); circ(0, -0.03, 0.08); fillOut(C.gold, 0.03);
  };
  A.golemtorso = o => {
    c.beginPath(); rrect(-0.45, -0.42, 0.9, 0.86, 0.2); fillOut(C.stone);
    c.beginPath(); circ(-0.45, -0.36, 0.16); circ(0.45, -0.36, 0.16); fillOut(C.stoneD);
    c.strokeStyle = C.stoneD; c.lineWidth = 0.03; c.beginPath(); c.moveTo(-0.3, -0.3); c.lineTo(-0.2, -0.1); c.lineTo(-0.28, 0.1); c.moveTo(0.25, 0.2); c.lineTo(0.32, 0.36); c.moveTo(0.2, -0.36); c.lineTo(0.14, -0.22); c.stroke();
    const pulse = 0.7 + Math.sin((o.t || 0) * 3) * 0.3;
    glowDot(0, 0, 0.28 * pulse, 'rgba(125,255,74,0.55)');
    c.lineWidth = 0.04; c.strokeStyle = C.toxic; c.beginPath(); circ(0, 0, 0.13); c.moveTo(0, -0.13); c.lineTo(0, 0.13); c.moveTo(-0.11, -0.06); c.lineTo(0.11, 0.06); c.stroke();
  };
  A.titantorso = o => {
    c.beginPath(); rrect(-0.46, -0.44, 0.92, 0.9, 0.22); fillOut(C.steelD);
    A.ribcage(o);
    c.beginPath(); circ(-0.46, -0.38, 0.17); circ(0.46, -0.38, 0.17); fillOut(C.gold);
    glowDot(0, 0, 0.25, 'rgba(125,255,74,0.6)');
  };
  // ---- Bras (épaule en haut, main en bas) ----
  function hand(y) {
    c.beginPath(); circ(0, y, 0.085); fillOut(C.bone);
    line([[-0.05, y + 0.05], [-0.07, y + 0.14]], 0.035, C.bone); line([[0, y + 0.06], [0, y + 0.16]], 0.035, C.bone); line([[0.05, y + 0.05], [0.07, y + 0.14]], 0.035, C.bone);
  }
  A.bonearm = o => { bone(0, -0.42, 0.03, 0.0, 0.13); bone(0.03, 0.0, 0, 0.3, 0.12); hand(0.35); };
  function steelArm(col, colD) {
    c.beginPath(); rrect(-0.12, -0.44, 0.24, 0.44, 0.09); fillOut(col);
    c.beginPath(); rrect(-0.11, -0.03, 0.22, 0.34, 0.08); fillOut(col);
    c.beginPath(); circ(0, -0.02, 0.1); fillOut(colD);
    c.beginPath(); rrect(-0.13, 0.28, 0.26, 0.19, 0.07); fillOut(colD);
    c.beginPath(); ell(0, -0.42, 0.2, 0.1); fillOut(col);
  }
  A.steelarm = o => steelArm(C.steel, C.steelD);
  A.bladearm = o => {
    bone(0, -0.42, 0.03, 0.0, 0.13); bone(0.03, 0.0, 0, 0.26, 0.12);
    c.beginPath(); c.moveTo(-0.04, 0.2); c.quadraticCurveTo(0.36, 0.26, 0.14, 0.5); c.quadraticCurveTo(0.16, 0.32, -0.04, 0.32); c.closePath(); fillOut('#cfd8e4');
    c.beginPath(); rrect(-0.08, 0.18, 0.16, 0.08, 0.03); fillOut(C.violet, 0.03);
  };
  A.arcanehand = o => {
    bone(0, -0.42, 0.03, 0.0, 0.13); bone(0.03, 0.0, 0, 0.26, 0.12);
    const t = o.t || 0;
    glowDot(0, 0.36, 0.22, 'rgba(190,110,255,0.6)');
    c.beginPath(); circ(0, 0.36, 0.11); fillOut('#c58bff', 0.03);
    dot(-0.03, 0.33, 0.035, '#fff');
    for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1; dot(Math.cos(a) * 0.18, 0.36 + Math.sin(a) * 0.1, 0.025, '#f0d8ff'); }
  };
  A.swordarm = o => {
    line([[0.02, 0.38], [0.44, -0.02]], 0.08, '#e3e9f2');
    line([[-0.06, 0.28], [0.12, 0.46]], 0.05, C.gold);
    steelArm('#c9d2e0', C.steelD);
  };
  A.golemarm = o => {
    c.beginPath(); rrect(-0.17, -0.46, 0.34, 0.42, 0.11); fillOut(C.stone);
    c.beginPath(); rrect(-0.15, -0.08, 0.3, 0.34, 0.1); fillOut(C.stone);
    c.beginPath(); circ(0, 0.33, 0.17); fillOut(C.stoneD);
    c.strokeStyle = C.stoneD; c.lineWidth = 0.025; c.beginPath(); c.moveTo(-0.08, -0.36); c.lineTo(0.02, -0.24); c.moveTo(0.05, 0.02); c.lineTo(-0.04, 0.14); c.stroke();
    glowDot(0, -0.2, 0.08, 'rgba(125,255,74,0.8)');
  };
  A.captainarm = o => {
    steelArm(C.gold, C.goldD);
    c.beginPath(); circ(0.14, 0.08, 0.17); fillOut(C.red);
    c.lineWidth = 0.035; c.strokeStyle = C.gold; c.beginPath(); circ(0.14, 0.08, 0.12); c.stroke();
  };
  // ---- Jambes (bassin en haut) ----
  A.bonelegs = o => {
    c.beginPath(); ell(0, -0.4, 0.24, 0.09); fillOut(C.bone);
    [-1, 1].forEach(d => { const x = d * 0.14; bone(x, -0.36, x, 0.04, 0.13); bone(x, 0.04, x, 0.36, 0.12); c.beginPath(); ell(x + d * 0.05, 0.42, 0.11, 0.055); fillOut(C.bone); });
  };
  A.greaves = o => {
    c.beginPath(); rrect(-0.26, -0.46, 0.52, 0.14, 0.05); fillOut(C.steelD);
    [-1, 1].forEach(d => {
      const x = d * 0.14;
      c.beginPath(); rrect(x - 0.1, -0.36, 0.2, 0.4, 0.07); fillOut(C.steel);
      c.beginPath(); circ(x, 0.03, 0.09); fillOut(C.steelD);
      c.beginPath(); c.moveTo(x - 0.11, 0.08); c.lineTo(x + 0.11, 0.08); c.lineTo(x + 0.11, 0.38); c.lineTo(x + d * 0.2, 0.48); c.lineTo(x - 0.11, 0.48); c.closePath(); fillOut(C.steel);
    });
  };
  function agileLegs(wrap, fur) {
    c.beginPath(); ell(0, -0.4, 0.22, 0.08); fillOut(fur);
    [-1, 1].forEach(d => {
      const x = d * 0.13;
      line([[x, -0.36], [x + d * 0.08, -0.04], [x - d * 0.04, 0.18], [x + d * 0.04, 0.42]], 0.09, fur);
      line([[x + d * 0.04, 0.42], [x + d * 0.17, 0.46]], 0.07, fur);
      c.beginPath(); rrect(x + d * 0.08 - 0.06, -0.12, 0.12, 0.06, 0.02); rrect(x - d * 0.02 - 0.06, 0.24, 0.12, 0.06, 0.02); fillOut(wrap, 0.025);
    });
  }
  A.agilelegs = o => agileLegs(C.violet, C.bone);
  A.queenlegs = o => agileLegs(C.gold, '#3a2a4a');
  A.golemlegs = o => {
    c.beginPath(); rrect(-0.3, -0.46, 0.6, 0.18, 0.06); fillOut(C.stoneD);
    [-1, 1].forEach(d => { const x = d * 0.15; c.beginPath(); rrect(x - 0.13, -0.32, 0.26, 0.78, 0.08); fillOut(C.stone); });
    c.strokeStyle = C.stoneD; c.lineWidth = 0.025; c.beginPath(); c.moveTo(-0.2, -0.1); c.lineTo(-0.1, 0.05); c.moveTo(0.12, 0.2); c.lineTo(0.2, 0.32); c.stroke();
  };
  // ---- Dos ----
  function wing(mem, edge) {
    c.beginPath(); c.moveTo(-0.06, -0.18); c.quadraticCurveTo(-0.25, -0.56, -0.5, -0.36);
    c.quadraticCurveTo(-0.44, -0.14, -0.48, 0.06); c.quadraticCurveTo(-0.36, 0.0, -0.32, 0.12);
    c.quadraticCurveTo(-0.22, 0.04, -0.16, 0.16); c.quadraticCurveTo(-0.12, 0.02, -0.04, 0.06); c.closePath(); fillOut(mem);
    c.lineWidth = 0.03; c.strokeStyle = edge; c.lineCap = 'round'; c.beginPath();
    c.moveTo(-0.08, -0.16); c.lineTo(-0.48, -0.34); c.moveTo(-0.1, -0.12); c.lineTo(-0.46, 0.04); c.moveTo(-0.1, -0.1); c.lineTo(-0.3, 0.1); c.moveTo(-0.08, -0.08); c.lineTo(-0.16, 0.13); c.stroke();
  }
  A.wings = o => { const f = Math.sin((o.t || 0) * 4) * 0.05; c.save(); c.rotate(-f); wing(C.violet, C.bone); c.restore(); c.save(); c.scale(-1, 1); c.rotate(-f); wing(C.violet, C.bone); c.restore(); };
  A.archwings = o => { const f = Math.sin((o.t || 0) * 4) * 0.05; c.save(); c.rotate(-f); wing('#3d5bd6', C.gold); c.restore(); c.save(); c.scale(-1, 1); c.rotate(-f); wing('#3d5bd6', C.gold); c.restore(); };
  A.cape = o => {
    c.beginPath(); c.moveTo(-0.28, -0.42); c.lineTo(0.28, -0.42); c.lineTo(0.42, 0.36); c.lineTo(0.3, 0.46); c.lineTo(0.2, 0.36); c.lineTo(0.08, 0.48); c.lineTo(-0.04, 0.36); c.lineTo(-0.16, 0.47); c.lineTo(-0.28, 0.36); c.lineTo(-0.42, 0.44); c.closePath(); fillOut('#2a1840');
    c.beginPath(); c.moveTo(-0.2, -0.38); c.lineTo(0.2, -0.38); c.lineTo(0.28, 0.2); c.lineTo(-0.28, 0.2); c.closePath(); c.fillStyle = C.violetD; c.fill();
    c.beginPath(); circ(0, -0.4, 0.06); fillOut(C.toxic, 0.03);
  };
  // ---- Noyaux ----
  A.rottenheart = o => {
    const k = 1 + Math.sin((o.t || 0) * 5) * 0.05;
    c.save(); c.scale(k, k); c.beginPath(); heartPath(1); fillOut('#8a1f2e');
    c.fillStyle = '#b8344a'; c.beginPath(); ell(-0.12, -0.1, 0.07, 0.05, -0.5); c.fill();
    c.beginPath(); c.moveTo(0.1, 0.2); c.quadraticCurveTo(0.14, 0.34, 0.1, 0.42); c.quadraticCurveTo(0.06, 0.34, 0.1, 0.2); c.fillStyle = C.toxic; c.fill();
    c.lineWidth = 0.025; c.strokeStyle = C.ink; c.beginPath(); c.moveTo(-0.05, -0.05); c.lineTo(0.05, 0.12); c.moveTo(-0.03, 0.06); c.lineTo(0.05, 0.02); c.stroke(); c.restore();
  };
  A.sacredheart = o => {
    const k = 1 + Math.sin((o.t || 0) * 4) * 0.05;
    glowDot(0, 0, 0.45, 'rgba(255,214,110,0.45)');
    c.save(); c.scale(k, k); c.beginPath(); heartPath(1); fillOut('#ff6b8a');
    c.beginPath(); c.moveTo(0, -0.18); c.quadraticCurveTo(-0.08, -0.32, 0, -0.44); c.quadraticCurveTo(0.08, -0.32, 0, -0.18); fillOut(C.gold, 0.025);
    c.fillStyle = '#ffd0dc'; c.beginPath(); ell(-0.13, -0.08, 0.07, 0.05, -0.5); c.fill(); c.restore();
  };
  A.priestheart = o => {
    const t = o.t || 0;
    c.strokeStyle = C.gold; c.lineWidth = 0.03; c.beginPath();
    for (let i = 0; i < 12; i++) { const a = i * PI / 6 + t * 0.5; c.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3); c.lineTo(Math.cos(a) * 0.48, Math.sin(a) * 0.48); } c.stroke();
    glowDot(0, 0, 0.45, 'rgba(255,214,110,0.6)');
    c.save(); const k = 1.15 + Math.sin(t * 4) * 0.05; c.scale(k, k); c.beginPath(); heartPath(1); fillOut(C.gold);
    c.fillStyle = '#fff2c0'; c.beginPath(); ell(-0.13, -0.08, 0.07, 0.05, -0.5); c.fill(); c.restore();
  };
  A.soulgem = o => {
    glowDot(0, 0, 0.42, 'rgba(125,255,74,0.4)');
    c.beginPath(); c.moveTo(0, -0.42); c.lineTo(0.28, -0.1); c.lineTo(0, 0.42); c.lineTo(-0.28, -0.1); c.closePath(); fillOut(C.toxic);
    c.fillStyle = C.toxicD; c.beginPath(); c.moveTo(0, -0.42); c.lineTo(0.28, -0.1); c.lineTo(0, 0.42); c.closePath(); c.fill();
    c.lineWidth = 0.02; c.strokeStyle = C.ink; c.beginPath(); c.moveTo(-0.28, -0.1); c.lineTo(0.28, -0.1); c.moveTo(0, -0.42); c.lineTo(0, 0.42); c.stroke();
    dot(-0.08, -0.16, 0.04, '#eaffd8');
  };

  // Images (assets/<clé>.png, listées dans js/assets.js) : elles remplacent les dessins procéduraux
  const imgs = {};
  (window.ASSET_LIST || []).forEach(k => { const im = new Image(); im.src = 'assets/' + k + (k.startsWith('bg_') ? '.jpg' : '.png'); imgs[k] = im; });
  function img(k) { const im = imgs[k]; return im && im.complete && im.naturalWidth ? im : null; }
  // part des images déjà chargées (ou en échec), pour l'écran de démarrage
  function progress() { const l = Object.values(imgs); return l.length ? l.filter(im => im.complete).length / l.length : 1; }
  // dessine l'image dans une boîte size×size centrée, en gardant les proportions
  function sprite(art, x, y, size) {
    const im = img(art); if (!im) return false;
    const k = size / Math.max(im.naturalWidth, im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k;
    c.drawImage(im, x - w / 2, y - h / 2, w, h); return true;
  }

  function drawArt(art, x, y, size, o) {
    o = o || {};
    c.save(); c.translate(x, y);
    if (o.rot) c.rotate(o.rot);
    if (o.flip) c.scale(-1, 1);
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    if (!sprite(art, 0, 0, size)) {
      c.scale(size, size);
      (A[art] || A.skull)(o);
    }
    c.restore();
  }
  // Une pièce (instance) : halo de rareté + fluide + dessin
  function piece(p, x, y, size, o) {
    o = Object.assign({ t: time }, o || {});
    const tp = D.pieces[p.k];
    if (!o.noGlow) {
      if (p.r === 1) glowAt(x, y, size * 0.62, 'rgba(74,168,255,0.45)');
      if (p.r === 2) glowAt(x, y, size * 0.7, 'rgba(255,182,39,0.55)');
      if (p.fl) glowAt(x, y, size * (0.55 + p.fl.d * 0.06), hexA(D.fluids[p.fl.t].color, p.fl.d >= 3 ? 0.35 + Math.sin(time * 8) * 0.2 : 0.35));
    }
    drawArt(tp ? tp.art : p.k, x, y, size, o);
  }
  function glowAt(x, y, r, col) { c.save(); c.translate(x, y); glowDot(0, 0, r, col); c.restore(); }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }

  // ---- Créature assemblée : (x,y) = centre du torse, size = taille du torse ----
  const LAYOUT = {
    back: [0, -0.22, 1.5, 0], head: [0, -0.74, 0.78, 0], arm0: [-0.5, -0.06, 0.85, 0.15], arm1: [0.5, -0.06, 0.85, -0.15],
    arm2: [-0.6, 0.2, 0.75, 0.5], arm3: [0.6, 0.2, 0.75, -0.5], legs: [0, 0.7, 0.92, 0], core: [0, -0.04, 0.36, 0]
  };
  function creatureFoot(parts) { return parts.legs ? 1.14 : 0.5; }
  function creature(parts, x, y, size, o) {
    o = o || {}; const t = o.t !== undefined ? o.t : time;
    const bob = o.still ? 0 : Math.sin(t * 3 + (o.seed || 0)) * size * 0.03;
    c.save(); c.translate(x, y + bob);
    if (o.flip) c.scale(-1, 1);
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    if (o.ghost) c.globalAlpha *= 0.55;
    const sw = o.atk ? Math.sin(o.atk * PI) * 0.7 : Math.sin(t * 3 + (o.seed || 0)) * 0.08;
    const order = ['back', 'legs', 'arm2', 'arm3', 'torso', 'core', 'head', 'arm0', 'arm1'];
    const po = { t, noGlow: o.noGlow, eye: o.eye };
    if (parts.torso && img(D.pieces[parts.torso.k].art)) { creatureSprites(parts, size, sw, po, order); c.restore(); return; }
    order.forEach(k => {
      const p = parts[k]; if (!p) return;
      if (k === 'torso') { piece(p, 0, 0, size, po); return; }
      const L = LAYOUT[k]; const ps = size * L[2];
      let rot = L[3];
      if (k.startsWith('arm')) rot += (L[0] < 0 ? sw : -sw) * (k === 'arm0' || k === 'arm1' ? 1 : 0.6);
      const ax = L[0] * size, ay = L[1] * size;
      if (k.startsWith('arm')) {
        // pivot à l'épaule
        c.save(); c.translate(ax, ay - ps * 0.42); c.rotate(rot);
        piece(p, 0, ps * 0.42, ps, Object.assign({ flip: L[0] > 0 }, po)); c.restore();
      } else if (k === 'core') {
        c.save(); c.globalAlpha *= 0.85; piece(p, ax, ay, ps, po); c.restore();
      } else piece(p, ax, ay, ps, po);
    });
    if (!parts.torso) { c.globalAlpha = 0.3; drawArt('ribcage', 0, 0, size, { t }); }
    c.restore();
  }

  // ---- Créature en images : chaque pièce est accrochée à un point du torse ----
  // ANCH : point d'attache dans l'image (fraction largeur, hauteur). Bras : épaule ; tête : cou ; jambes : bassin.
  const ANCH = { arm: [0.5, 0.06], head: [0.5, 0.94], legs: [0.5, 0.04], back: [0.5, 0.42], core: [0.5, 0.5] };
  function pieceAt(p, x, y, fit, dim, ax, ay, o, rot, flip) {
    const im = img(D.pieces[p.k].art); if (!im) return;
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const k = fit === 'w' ? dim / iw : fit === 'h' ? dim / ih : dim / Math.max(iw, ih);
    const w = iw * k, h = ih * k;
    if (!o.noGlow) {
      if (p.r === 1) glowAt(x, y + (0.5 - ay) * h, Math.max(w, h) * 0.6, 'rgba(74,168,255,0.4)');
      if (p.r === 2) glowAt(x, y + (0.5 - ay) * h, Math.max(w, h) * 0.65, 'rgba(255,182,39,0.5)');
      if (p.fl) glowAt(x, y + (0.5 - ay) * h, Math.max(w, h) * (0.5 + p.fl.d * 0.06), hexA(D.fluids[p.fl.t].color, 0.35));
    }
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (flip) c.scale(-1, 1);
    c.drawImage(im, -w * ax, -h * ay, w, h);
    c.restore();
  }
  function creatureSprites(parts, size, sw, po, order) {
    const ti = img(D.pieces[parts.torso.k].art);
    const th = size * 1.08, tw = Math.min(size * 1.15, ti.naturalWidth * th / ti.naturalHeight);
    const top = -th / 2, bot = th / 2;
    const sh = Math.max(tw * 0.4, size * 0.3);       // demi-écart des épaules
    order.forEach(k => {
      const p = parts[k]; if (!p) return;
      const sl = D.pieces[p.k].slot;
      if (k === 'torso') { pieceAt(p, 0, 0, 'h', th, 0.5, 0.5, po); return; }
      if (k === 'head') { pieceAt(p, 0, top + size * 0.16, 'w', size * 0.64, ANCH.head[0], ANCH.head[1], po); return; }
      if (k === 'legs') { pieceAt(p, 0, bot - size * 0.2, 'h', size * 0.98, ANCH.legs[0], ANCH.legs[1], po); return; }
      if (k === 'back') { pieceAt(p, 0, top + th * 0.42, 'w', size * 1.75, ANCH.back[0], ANCH.back[1], po); return; }
      if (k === 'core') { c.save(); c.globalAlpha *= 0.92; pieceAt(p, 0, size * 0.04, 'w', size * 0.36, 0.5, 0.5, po); c.restore(); return; }
      if (sl === 'arm' || k.startsWith('arm')) {
        const left = k === 'arm0' || k === 'arm2', low = k === 'arm2' || k === 'arm3';
        const x = (left ? -1 : 1) * (low ? sh * 0.92 : sh), y = top + (low ? th * 0.42 : th * 0.13);
        let rot = (left ? 1 : -1) * (low ? 0.55 : 0.12) + (left ? sw : -sw) * (low ? 0.6 : 1);
        const ai = img(D.pieces[p.k].art);
        if (ai && ai.naturalWidth > ai.naturalHeight * 0.9) {
          // bras coudé (avant-bras horizontal vers la droite) : épaule en haut à gauche, avant-bras vers l'extérieur
          pieceAt(p, x, y, 'w', size * (low ? 0.75 : 0.85), 0.12, 0.1, po, rot * 0.4, left);
        } else pieceAt(p, x, y, 'h', size * (low ? 0.8 : 0.92), ANCH.arm[0], ANCH.arm[1], po, rot, !left);
      }
    });
  }

  // ---- Héros (pieds en x,y ; size = hauteur) ----
  const HC = {
    peasant: { body: '#8a5a32', leg: '#5a3a20' }, warrior: { body: '#b8323c', leg: '#555' }, rogue: { body: '#2f6b3a', leg: '#2a2a2a' },
    mage: { body: '#3550b8', leg: '#3550b8' }, priest: { body: '#f0ecf6', leg: '#d8d0e4' }, paladin: { body: '#c9d2e0', leg: '#8e9bb0' },
    captain: { body: '#b8323c', leg: '#444' }, archmage: { body: '#5a2fb8', leg: '#5a2fb8' }, queen: { body: '#1f4a2a', leg: '#222' },
    highpriest: { body: '#fff8e8', leg: '#e8dcc0' }, archangel: { body: '#f4f0ff', leg: '#d8d0e4' }
  };
  function hero(type, x, y, size, o) {
    o = o || {}; const t = o.t || 0; const col = HC[type] || HC.peasant;
    const im = img('hero_' + type);
    if (im) {
      const k = size * 1.1 / im.naturalHeight, w = im.naturalWidth * k, h = im.naturalHeight * k;
      const bob = o.walk ? Math.abs(Math.sin(t * 10)) * size * 0.04 : 0, lean = o.atk ? Math.sin(o.atk * PI) * 0.25 : 0;
      c.save(); c.translate(x, y); if (o.flip) c.scale(-1, 1); c.rotate(lean); if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
      c.drawImage(im, -w / 2, -h - bob, w, h);
      c.restore();
      if (o.hurt) tinted(x, y + 2, w * 1.6, h * 1.3, 'rgba(255,50,50,0.55)', () => { c.save(); if (o.flip) c.scale(-1, 1); c.rotate(lean); c.drawImage(im, -w / 2, -h - bob - 2, w, h); c.restore(); });
      return;
    }
    c.save(); c.translate(x, y); c.scale(size, size); if (o.flip) c.scale(-1, 1);
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    const walk = o.walk ? Math.sin(t * 10) : 0;
    const robe = type === 'mage' || type === 'priest' || type === 'archmage' || type === 'highpriest';
    if (type === 'archangel') {
      c.save(); c.translate(0, -0.55); c.scale(1.1, 1.1);
      c.save(); wing('#fffaf0', C.gold); c.restore(); c.save(); c.scale(-1, 1); wing('#fffaf0', C.gold); c.restore(); c.restore();
    }
    if (type === 'captain') { c.beginPath(); c.moveTo(-0.16, -0.62); c.lineTo(0.16, -0.62); c.lineTo(0.24, -0.06); c.lineTo(-0.24, -0.06); c.closePath(); fillOut('#7a1020', 0.04); }
    // jambes
    if (!robe) {
      line([[-0.07, -0.3], [-0.07 + walk * 0.08, -0.02]], 0.1, col.leg);
      line([[0.07, -0.3], [0.07 - walk * 0.08, -0.02]], 0.1, col.leg);
    }
    // corps
    c.beginPath();
    if (robe) { c.moveTo(-0.14, -0.62); c.lineTo(0.14, -0.62); c.lineTo(0.22, 0); c.lineTo(-0.22, 0); c.closePath(); }
    else rrect(-0.15, -0.64, 0.3, 0.38, 0.08);
    fillOut(col.body, 0.035);
    if (type === 'priest' || type === 'highpriest') { line([[0, -0.58], [0, -0.1]], 0.04, C.gold); line([[-0.08, -0.45], [0.08, -0.45]], 0.04, C.gold); }
    if (type === 'paladin' || type === 'archangel') { c.beginPath(); circ(0, -0.46, 0.06); fillOut(C.gold, 0.025); }
    // bras + arme
    const atk = o.atk ? Math.sin(o.atk * PI) : 0;
    c.save(); c.translate(0.14, -0.56); c.rotate(-0.4 - atk * 1.4);
    line([[0, 0], [0, 0.22]], 0.07, col.body);
    weapon(type);
    c.restore();
    line([[-0.14, -0.56], [-0.2, -0.36]], 0.07, col.body);
    if (type === 'warrior' || type === 'captain') { c.beginPath(); circ(-0.2, -0.38, 0.11); fillOut(type === 'captain' ? C.gold : '#a0522d', 0.03); }
    // tête
    c.beginPath(); circ(0, -0.76, 0.15); fillOut('#f2c9a0', 0.035);
    if (o.hurt) { c.fillStyle = 'rgba(255,60,60,0.6)'; c.beginPath(); circ(0, -0.76, 0.15); c.fill(); }
    dot(0.05, -0.78, 0.022, C.ink); dot(-0.05, -0.78, 0.022, C.ink);
    hat(type);
    c.restore();
  }
  function weapon(type) {
    switch (type) {
      case 'peasant': line([[0, 0.2], [0, -0.3]], 0.035, '#8a6a3a'); line([[-0.06, -0.3], [-0.06, -0.4]], 0.025, C.steel); line([[0, -0.3], [0, -0.42]], 0.025, C.steel); line([[0.06, -0.3], [0.06, -0.4]], 0.025, C.steel); line([[-0.06, -0.3], [0.06, -0.3]], 0.025, C.steel); break;
      case 'warrior': case 'captain': case 'paladin': case 'archangel':
        line([[0, 0.22], [0, -0.28 - (type === 'paladin' || type === 'archangel' ? 0.12 : 0)]], 0.055, type === 'archangel' ? '#fff3b0' : '#dfe6ee'); line([[-0.07, 0.18], [0.07, 0.18]], 0.035, C.gold); break;
      case 'rogue': case 'queen': line([[0, 0.22], [0, 0.0]], 0.045, '#dfe6ee'); break;
      case 'mage': case 'archmage': line([[0, 0.3], [0, -0.3]], 0.035, '#6b4a2a'); glowDot(0, -0.32, 0.1, 'rgba(120,200,255,0.9)'); dot(0, -0.32, 0.04, '#fff'); break;
      case 'priest': case 'highpriest': line([[0, 0.3], [0, -0.3]], 0.035, C.gold); c.beginPath(); circ(0, -0.34, 0.06); fillOut(C.gold, 0.025); break;
    }
  }
  function hat(type) {
    switch (type) {
      case 'peasant': c.beginPath(); ell(0, -0.86, 0.24, 0.05); fillOut('#e8c860', 0.03); c.beginPath(); ell(0, -0.9, 0.12, 0.07); fillOut('#e8c860', 0.03); break;
      case 'warrior': c.beginPath(); c.moveTo(-0.16, -0.78); c.arc(0, -0.8, 0.16, PI, 0); c.closePath(); fillOut(C.steel, 0.03); break;
      case 'captain': c.beginPath(); c.moveTo(-0.17, -0.78); c.arc(0, -0.8, 0.17, PI, 0); c.closePath(); fillOut(C.gold, 0.03); c.beginPath(); ell(0, -1.0, 0.05, 0.08); fillOut(C.red, 0.025); break;
      case 'rogue': c.beginPath(); c.moveTo(-0.17, -0.72); c.quadraticCurveTo(-0.16, -0.98, 0.05, -0.97); c.quadraticCurveTo(0.18, -0.9, 0.17, -0.72); c.lineTo(0.1, -0.84); c.lineTo(-0.1, -0.84); c.closePath(); fillOut('#2f6b3a', 0.03); line([[-0.13, -0.74], [0.13, -0.74]], 0.05, '#222'); break;
      case 'queen': c.beginPath(); c.moveTo(-0.13, -0.88); c.lineTo(-0.15, -1.02); c.lineTo(-0.06, -0.94); c.lineTo(0, -1.06); c.lineTo(0.06, -0.94); c.lineTo(0.15, -1.02); c.lineTo(0.13, -0.88); c.closePath(); fillOut(C.gold, 0.025); line([[-0.13, -0.76], [0.13, -0.76]], 0.05, '#222'); break;
      case 'mage': case 'archmage': c.beginPath(); c.moveTo(-0.2, -0.84); c.lineTo(0.2, -0.84); c.lineTo(0.04, -1.2); c.closePath(); fillOut(type === 'mage' ? '#3550b8' : '#5a2fb8', 0.03); dot(0.02, -1.0, 0.03, C.gold); break;
      case 'priest': case 'highpriest': c.beginPath(); c.moveTo(-0.12, -0.84); c.lineTo(0.12, -0.84); c.lineTo(0.08, type === 'highpriest' ? -1.12 : -1.02); c.lineTo(0, type === 'highpriest' ? -1.2 : -1.08); c.lineTo(-0.08, type === 'highpriest' ? -1.12 : -1.02); c.closePath(); fillOut('#fff', 0.03); line([[0, -0.88], [0, -1.0]], 0.025, C.gold); break;
      case 'paladin': c.beginPath(); c.moveTo(-0.16, -0.7); c.arc(0, -0.8, 0.16, PI * 0.9, PI * 0.1 + TAU); c.closePath(); fillOut('#dfe6ee', 0.03); line([[-0.12, -0.78], [0.12, -0.78]], 0.03, C.ink); c.beginPath(); ell(0, -1.0, 0.04, 0.08); fillOut(C.rare, 0.02); break;
      case 'archangel': c.lineWidth = 0.04; c.strokeStyle = C.gold; c.beginPath(); ell(0, -1.02, 0.14, 0.04); c.stroke(); c.beginPath(); c.moveTo(-0.16, -0.72); c.arc(0, -0.8, 0.16, PI * 0.9, PI * 0.1 + TAU); c.closePath(); fillOut('#fff8dc', 0.03); break;
    }
  }

  // ---- Pièges (posés au sol en x,y) ----
  function trap(type, x, y, s, ready, frac, open) {
    c.save(); c.translate(x, y); c.scale(s, s);
    if (ready) { glowDot(0, -0.15, 0.6 + Math.sin(time * 5) * 0.06, 'rgba(125,255,74,0.35)'); }
    const im = img('trap_' + type);
    if (im) { const k = (open ? 1.15 : 1) / Math.max(im.naturalWidth, im.naturalHeight); const w = im.naturalWidth * k, h = im.naturalHeight * k; c.drawImage(im, -w / 2, 0.08 - h, w, h); type = ''; }
    switch (type) {
      case 'spikes': {
        c.beginPath(); rrect(-0.45, -0.08, 0.9, 0.14, 0.04); fillOut(C.stoneD, 0.04);
        const up = open ? 0.45 : 0.12;
        c.beginPath(); for (let i = 0; i < 5; i++) { const sx = -0.36 + i * 0.18; c.moveTo(sx - 0.07, -0.06); c.lineTo(sx, -0.06 - up); c.lineTo(sx + 0.07, -0.06); }
        fillOut('#dfe6ee', 0.035); break;
      }
      case 'trapdoor': {
        c.beginPath(); rrect(-0.45, -0.1, 0.9, 0.16, 0.03); fillOut(open ? '#0b0512' : '#7a5230', 0.04);
        if (!open) { c.strokeStyle = C.ink; c.lineWidth = 0.03; c.beginPath(); c.moveTo(-0.15, -0.1); c.lineTo(-0.15, 0.06); c.moveTo(0.15, -0.1); c.lineTo(0.15, 0.06); c.stroke(); dot(0, -0.02, 0.03, C.steel); }
        break;
      }
      case 'brasero': {
        line([[-0.2, 0.04], [-0.12, -0.3]], 0.05, C.steelD); line([[0.2, 0.04], [0.12, -0.3]], 0.05, C.steelD);
        c.beginPath(); c.moveTo(-0.3, -0.36); c.lineTo(0.3, -0.36); c.quadraticCurveTo(0.25, -0.18, 0, -0.18); c.quadraticCurveTo(-0.25, -0.18, -0.3, -0.36); fillOut(C.steel, 0.035);
        const f = open ? 1.6 : 0.8, fl = Math.sin(time * 12) * 0.04;
        c.beginPath(); c.moveTo(-0.2, -0.38); c.quadraticCurveTo(-0.24, -0.38 - 0.35 * f, 0 + fl, -0.38 - 0.55 * f); c.quadraticCurveTo(0.24, -0.38 - 0.35 * f, 0.2, -0.38); c.closePath(); fillOut(C.toxic, 0.03);
        c.beginPath(); c.moveTo(-0.1, -0.38); c.quadraticCurveTo(-0.1, -0.38 - 0.2 * f, fl, -0.38 - 0.32 * f); c.quadraticCurveTo(0.1, -0.38 - 0.2 * f, 0.1, -0.38); c.fillStyle = '#e6ffd0'; c.fill();
        break;
      }
      case 'coffin': {
        c.save(); if (open) c.rotate(-0.5);
        c.beginPath(); c.moveTo(-0.14, -0.9); c.lineTo(0.14, -0.9); c.lineTo(0.22, -0.66); c.lineTo(0.14, 0.04); c.lineTo(-0.14, 0.04); c.lineTo(-0.22, -0.66); c.closePath(); fillOut('#5a3a2a', 0.04);
        line([[0, -0.78], [0, -0.4]], 0.04, C.bone); line([[-0.08, -0.66], [0.08, -0.66]], 0.04, C.bone);
        c.restore(); break;
      }
    }
    if (!ready && frac !== undefined) {
      c.lineWidth = 0.08; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(0, 0.28, 0.16, 0, TAU); c.stroke();
      c.strokeStyle = C.toxic; c.beginPath(); c.arc(0, 0.28, 0.16, -PI / 2, -PI / 2 + TAU * frac); c.stroke();
    }
    c.restore();
  }

  // ---- Icônes ----
  function icon(name, x, y, s) {
    if (sprite('ic_' + name, x, y, s)) return;
    if (name === 'shop') name = 'skull';
    c.save(); c.translate(x, y); c.scale(s, s);
    switch (name) {
      case 'soul':
        c.beginPath(); c.moveTo(0, 0.45); c.quadraticCurveTo(-0.4, 0.3, -0.3, -0.05); c.quadraticCurveTo(-0.2, -0.3, 0, -0.48); c.quadraticCurveTo(0.08, -0.25, 0.25, -0.15); c.quadraticCurveTo(0.42, 0.25, 0, 0.45); fillOut(C.toxic, 0.06);
        dot(-0.1, 0.08, 0.06, C.ink); dot(0.1, 0.08, 0.06, C.ink); break;
      case 'skull': skull({ noEyes: false, eye: C.toxic }, 1.2); break;
      case 'book':
        c.beginPath(); rrect(-0.36, -0.42, 0.72, 0.84, 0.06); fillOut(C.violet, 0.06);
        c.beginPath(); rrect(-0.26, -0.42, 0.06, 0.84, 0.0); c.fillStyle = C.violetD; c.fill();
        c.beginPath(); circ(0.06, 0, 0.14); fillOut(C.toxic, 0.04); dot(0.06, 0, 0.05, C.ink); break;
      case 'gear':
        c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * PI / 4; c.lineTo(Math.cos(a - 0.2) * 0.44, Math.sin(a - 0.2) * 0.44); c.lineTo(Math.cos(a + 0.2) * 0.44, Math.sin(a + 0.2) * 0.44); c.lineTo(Math.cos(a + 0.4) * 0.32, Math.sin(a + 0.4) * 0.32); }
        c.closePath(); fillOut(C.steel, 0.06); c.beginPath(); circ(0, 0, 0.13); fillOut(C.panel, 0.05); break;
      case 'sound': case 'mute':
        c.beginPath(); c.moveTo(-0.4, -0.14); c.lineTo(-0.18, -0.14); c.lineTo(0.06, -0.38); c.lineTo(0.06, 0.38); c.lineTo(-0.18, 0.14); c.lineTo(-0.4, 0.14); c.closePath(); fillOut(C.bone, 0.06);
        if (name === 'sound') { c.lineWidth = 0.07; c.strokeStyle = C.bone; c.beginPath(); c.arc(0.1, 0, 0.2, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(0.1, 0, 0.36, -0.8, 0.8); c.stroke(); }
        else line([[0.16, -0.2], [0.42, 0.2]], 0.07, C.red);
        break;
      case 'flag': c.beginPath(); rrect(-0.4, -0.3, 0.8, 0.6, 0.06); fillOut('#fff', 0.06); c.fillStyle = '#2a4fd6'; c.fillRect(-0.36, -0.26, 0.24, 0.52); c.fillStyle = C.red; c.fillRect(0.12, -0.26, 0.24, 0.52); break;
      case 'back': line([[0.3, 0], [-0.3, 0]], 0.13, C.bone); line([[-0.05, -0.25], [-0.3, 0], [-0.05, 0.25]], 0.13, C.bone); break;
      case 'play': c.beginPath(); c.moveTo(-0.25, -0.36); c.lineTo(0.38, 0); c.lineTo(-0.25, 0.36); c.closePath(); fillOut(C.toxic, 0.06); break;
      case 'pause': c.beginPath(); rrect(-0.3, -0.34, 0.2, 0.68, 0.05); rrect(0.1, -0.34, 0.2, 0.68, 0.05); fillOut(C.bone, 0.06); break;
      case 'altar':
        c.beginPath(); rrect(-0.44, -0.08, 0.88, 0.2, 0.05); fillOut(C.stone, 0.06); c.beginPath(); rrect(-0.32, 0.1, 0.16, 0.32, 0.03); rrect(0.16, 0.1, 0.16, 0.32, 0.03); fillOut(C.stoneD, 0.06);
        c.beginPath(); circ(0, -0.28, 0.16); fillOut(C.bone, 0.05); dot(-0.05, -0.29, 0.04, C.ink); dot(0.05, -0.29, 0.04, C.ink); break;
      case 'map': c.beginPath(); c.moveTo(-0.42, -0.3); c.lineTo(-0.14, -0.4); c.lineTo(0.14, -0.3); c.lineTo(0.42, -0.4); c.lineTo(0.42, 0.3); c.lineTo(0.14, 0.4); c.lineTo(-0.14, 0.3); c.lineTo(-0.42, 0.4); c.closePath(); fillOut('#d8c49a', 0.06);
        c.setLineDash([0.06, 0.06]); c.lineWidth = 0.05; c.strokeStyle = C.red; c.beginPath(); c.moveTo(-0.3, 0.2); c.quadraticCurveTo(0, -0.3, 0.28, 0.1); c.stroke(); c.setLineDash([]); break;
      case 'auto':
        line([[-0.32, 0.36], [0.2, -0.16]], 0.1, '#6b4a2a');
        c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * PI / 5 - PI / 2, r = i % 2 ? 0.1 : 0.24; c.lineTo(0.24 + Math.cos(a) * r, -0.22 + Math.sin(a) * r); } c.closePath(); fillOut(C.gold, 0.05); break;
      case 'star': case 'star0':
        c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * PI / 5 - PI / 2, r = i % 2 ? 0.2 : 0.46; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); fillOut(name === 'star' ? C.gold : '#3a2d4a', 0.06); break;
      case 'bin':
        c.beginPath(); c.moveTo(-0.34, -0.2); c.lineTo(0.34, -0.2); c.lineTo(0.26, 0.42); c.lineTo(-0.26, 0.42); c.closePath(); fillOut(C.stoneD, 0.06);
        c.beginPath(); rrect(-0.4, -0.34, 0.8, 0.14, 0.04); fillOut(C.stone, 0.05);
        c.fillStyle = C.bone; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 0.16 - 0.06, -0.2); c.lineTo(i * 0.16, 0.0); c.lineTo(i * 0.16 + 0.06, -0.2); c.fill(); } break;
      case 'heart': c.beginPath(); heartPath(1.05); fillOut(C.toxic, 0.06); break;
      case 'speed': c.beginPath(); c.moveTo(-0.4, -0.3); c.lineTo(0, 0); c.lineTo(-0.4, 0.3); c.closePath(); c.moveTo(0, -0.3); c.lineTo(0.4, 0); c.lineTo(0, 0.3); c.closePath(); fillOut(C.bone, 0.05); break;
      case 'lock': c.lineWidth = 0.1; c.strokeStyle = C.ink; c.beginPath(); c.arc(0, -0.12, 0.2, PI, 0); c.stroke(); c.lineWidth = 0.05; c.strokeStyle = C.steel; c.stroke();
        c.beginPath(); rrect(-0.3, -0.12, 0.6, 0.48, 0.06); fillOut(C.steel, 0.06); dot(0, 0.1, 0.06, C.ink); break;
      case 'check': line([[-0.3, 0], [-0.08, 0.24], [0.32, -0.26]], 0.13, C.toxic); break;
      case 'music': line([[-0.18, 0.28], [-0.18, -0.32], [0.26, -0.4], [0.26, 0.2]], 0.07, C.bone); c.beginPath(); ell(-0.26, 0.3, 0.12, 0.09); ell(0.18, 0.22, 0.12, 0.09); fillOut(C.bone, 0.05); break;
      case 'vib': c.beginPath(); rrect(-0.18, -0.36, 0.36, 0.72, 0.06); fillOut(C.steelD, 0.06); line([[-0.32, -0.16], [-0.38, 0], [-0.32, 0.16]], 0.05, C.bone); line([[0.32, -0.16], [0.38, 0], [0.32, 0.16]], 0.05, C.bone); break;
      case 'needle': line([[-0.36, 0.36], [0.3, -0.3]], 0.07, '#dfe6ee'); c.lineWidth = 0.04; c.strokeStyle = C.red; c.beginPath(); c.moveTo(0.3, -0.3); c.quadraticCurveTo(0.5, -0.1, 0.2, 0.1); c.stroke(); break;
      case 'big': c.beginPath(); rrect(-0.4, -0.25, 0.8, 0.5, 0.1); fillOut(C.violetL, 0.06); txtIn('A+', 0, 0.02, 0.36); break;
      case 'trophy': c.beginPath(); c.moveTo(-0.3, -0.38); c.lineTo(0.3, -0.38); c.quadraticCurveTo(0.3, 0.08, 0, 0.12); c.quadraticCurveTo(-0.3, 0.08, -0.3, -0.38); fillOut(C.gold, 0.06); c.beginPath(); rrect(-0.2, 0.24, 0.4, 0.14, 0.03); rrect(-0.05, 0.1, 0.1, 0.16, 0.0); fillOut(C.goldD, 0.05); break;
    }
    c.restore();
  }
  function txtIn(s, x, y, size) { c.font = 'bold ' + size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = C.ink; c.fillText(s, x, y); }

  function handPtr(x, y) {
    c.save(); c.translate(x, y); c.rotate(-0.4); c.scale(30, 30);
    c.beginPath(); rrect(-0.09, -0.02, 0.18, 0.5, 0.09); rrect(-0.22, 0.28, 0.44, 0.42, 0.14); fillOut('#ffffff', 0.05);
    c.restore();
  }
  // Fiole
  function vial(type, x, y, s, n) {
    if (sprite('vial_' + type, x, y, s)) return;
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-0.08, -0.42); c.lineTo(0.08, -0.42); c.lineTo(0.08, -0.15); c.quadraticCurveTo(0.32, -0.05, 0.3, 0.18); c.quadraticCurveTo(0.28, 0.44, 0, 0.44); c.quadraticCurveTo(-0.28, 0.44, -0.3, 0.18); c.quadraticCurveTo(-0.32, -0.05, -0.08, -0.15); c.closePath(); fillOut('rgba(220,235,255,0.35)', 0.05);
    c.beginPath(); c.moveTo(-0.27, 0.08); c.quadraticCurveTo(0, 0.0, 0.27, 0.08); c.quadraticCurveTo(0.28, 0.4, 0, 0.4); c.quadraticCurveTo(-0.28, 0.4, -0.27, 0.08); c.fillStyle = D.fluids[type].color; c.fill();
    c.beginPath(); rrect(-0.1, -0.5, 0.2, 0.1, 0.03); fillOut('#8a6a3a', 0.04);
    dot(-0.1, 0.2, 0.04, 'rgba(255,255,255,0.7)');
    c.restore();
  }
  // Silhouette (inconnu dans le bestiaire)
  // Rendue une seule fois dans un canevas hors écran, puis noircie (ctx.filter est très lent sur mobile).
  // draw(x, y) dessine la figure ancrée en (x, y) ; le cadre va de (x-ax, y-ay) sur w×h.
  const silCache = {};
  // Teinte (rouge de coup, etc.) appliquée uniquement sur les pixels du modèle : on redessine dans un calque, on colore, on superpose
  const tintCv = document.createElement('canvas');
  function tinted(x, y, w, h, col, draw) {
    const k = Math.min(3, view.dpr * view.s), cw = Math.ceil(w * k), ch = Math.ceil(h * k);
    if (tintCv.width < cw || tintCv.height < ch) { tintCv.width = Math.max(tintCv.width, cw); tintCv.height = Math.max(tintCv.height, ch); }
    const g = tintCv.getContext('2d'), prev = c;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, cw, ch);
    g.setTransform(k, 0, 0, k, (w / 2) * k, h * k);
    c = g; try { draw(); } finally { c = prev; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, cw, ch);
    c.drawImage(tintCv, 0, 0, cw, ch, x - w / 2, y - h, w, h);
  }
  function silhouette(key, x, y, w, h, ax, ay, draw) {
    const k = Math.min(3, view.dpr * view.s), id = key + '@' + k;
    let oc = silCache[id];
    if (!oc) {
      oc = document.createElement('canvas'); oc.width = Math.ceil(w * k); oc.height = Math.ceil(h * k);
      const oc2 = oc.getContext('2d'), prev = c;
      oc2.setTransform(k, 0, 0, k, ax * k, ay * k);
      c = oc2; try { draw(0, 0); } finally { c = prev; }
      oc2.setTransform(1, 0, 0, 1, 0, 0); oc2.globalCompositeOperation = 'source-in';
      oc2.fillStyle = '#000'; oc2.fillRect(0, 0, oc.width, oc.height);
      silCache[id] = oc;
    }
    c.drawImage(oc, x - ax, y - ay, w, h);
  }

  return { A, progress, tinted, deco: sprite, art: drawArt, piece, creature, creatureFoot, hero, trap, icon, hand: handPtr, vial, glowAt, hexA, silhouette, img, LAYOUT };
})();

// ============================== Logic (pièces, créatures, stats) ==============================
// Pièces du Titan (reliques), ajoutées aux modèles pour le dessin
D.pieces.R_capt = { slot: 'arm', src: 'titan', art: 'captainarm', st: { str: 20, def: 10 } };
D.pieces.R_arch = { slot: 'back', src: 'titan', art: 'archwings', st: { mag: 20, spd: 10 } };
D.pieces.R_queen = { slot: 'legs', src: 'titan', art: 'queenlegs', st: { spd: 15, hp: 50 } };
D.pieces.R_priest = { slot: 'core', src: 'titan', art: 'priestheart', st: { hp: 100, mag: 10 } };
D.pieces.R_angel = { slot: 'head', src: 'titan', art: 'crownskull', st: { hp: 60, mag: 20, def: 20 } };
D.pieces.R_torso = { slot: 'torso', src: 'titan', art: 'titantorso', st: { hp: 300, def: 40 } };
const STATS = ['hp', 'str', 'mag', 'spd', 'def'];
const SLOT_ORDER = { head: 0, torso: 1, arm: 2, legs: 3, back: 4, core: 5 };

const Logic = {
  newPiece(k, r) {
    const tp = D.pieces[k];
    return { id: uid(), k, r: r !== undefined ? r : (tp.src === 'boss' || tp.src === 'titan' ? 2 : 0), q: null, fl: null };
  },
  slotsFor(arms) {
    const s = ['back', 'head', 'torso', 'arm0', 'arm1'];
    if (arms >= 3) s.push('arm2'); if (arms >= 4) s.push('arm3');
    s.push('legs', 'core'); return s;
  },
  fits(p, slot) { return D.pieces[p.k].slot === D.slotType[slot]; },
  pieceStats(p) {
    const tp = D.pieces[p.k], m = D.rarityMult[p.r] * (p.q || 1), o = {};
    for (const s in tp.st) o[s] = tp.st[s] * m;
    return o;
  },
  score(p) {
    const tp = D.pieces[p.k], m = D.rarityMult[p.r]; const st = tp.st;
    return ((st.hp || 0) * 0.3 + (st.str || 0) * 1.6 + (st.mag || 0) * 1.5 + (st.spd || 0) * 0.8 + (st.def || 0) * 0.9) * m;
  },
  stats(parts) {
    const b = Object.assign({}, D.creatureBase);
    const fx = { blood: 0, poison: 0, ice: 0, fire: 0, lightning: 0, soul: 0 }, mut = {}, src = {}, keys = {};
    let fly = false, heal = false, n = 0;
    for (const k in parts) {
      const p = parts[k]; if (!p) continue; n++;
      const tp = D.pieces[p.k], m = D.rarityMult[p.r] * (p.q || 1);
      for (const s in tp.st) b[s] += tp.st[s] * m;
      if (p.fl) { fx[p.fl.t] += p.fl.d; if (p.fl.d >= 3) mut[p.fl.t] = true; }
      src[tp.src] = (src[tp.src] || 0) + 1; keys[p.k] = (keys[p.k] || 0) + 1;
      if (tp.fly) fly = true; if (tp.heal) heal = true;
    }
    for (const f in fx) fx[f] = Math.min(3, fx[f]);
    const sets = Object.keys(src).filter(s => src[s] >= 3 && D.sets[s]);
    const recipe = D.recipes.find(r => Object.keys(r.need).every(k => (keys[k] || 0) >= r.need[k])) || null;
    let hpMul = 1, strMul = 1, magMul = 1, defMul = 1;
    if (fx.blood) hpMul *= 1 + 0.15 * fx.blood;
    if (fx.fire) strMul *= 1 + 0.15 * fx.fire;
    if (fx.soul) { magMul *= 1 + 0.15 * fx.soul; b.mag += 3 * fx.soul; }
    if (fx.lightning) b.spd += 6 * fx.lightning;
    if (sets.indexOf('peasant') >= 0) hpMul *= D.sets.peasant.hpMul;
    if (sets.indexOf('golem') >= 0) defMul *= D.sets.golem.defMul;
    if (recipe && recipe.hpMul) hpMul *= recipe.hpMul;
    if (recipe && recipe.magMul) magMul *= recipe.magMul;
    if (mut.soul) hpMul *= 0.6;
    if (mut.ice) b.spd *= 0.6;
    if (mut.blood) b.str += 5;   // membre en plus (instable)
    const st = {
      hp: Math.round(b.hp * hpMul), str: Math.round(b.str * strMul), mag: Math.round(b.mag * magMul),
      spd: Math.round(b.spd), def: Math.round(b.def * defMul), fx, mut, sets, recipe, fly, heal, n
    };
    st.rate = 1.8 * 30 / (30 + Math.max(0, st.spd)) * (recipe && recipe.rate ? recipe.rate : 1);
    st.move = 24 + Math.max(0, st.spd) * 1.2;
    st.ranged = (recipe && recipe.ranged) || (st.mag >= 6 && st.mag > st.str * 1.2);
    st.range = st.ranged ? 95 : 24;
    st.crit = Math.max(sets.indexOf('rogue') >= 0 ? D.sets.rogue.crit : 0, recipe && recipe.crit ? recipe.crit : 0);
    st.critMul = recipe && recipe.critMul ? recipe.critMul : 2;
    st.aura = (sets.indexOf('priest') >= 0 ? D.sets.priest.aura : 0) + (recipe && recipe.aura ? recipe.aura : 0) + (heal ? 1 + st.mag * 0.05 : 0);
    st.taunt = sets.indexOf('golem') >= 0 || !!(recipe && recipe.taunt);
    st.dmgTaken = sets.indexOf('warrior') >= 0 ? D.sets.warrior.dmgTaken : 1;
    st.splash = sets.indexOf('mage') >= 0 ? D.sets.mage.splash : 0;
    st.stun = sets.indexOf('paladin') >= 0 ? D.sets.paladin.stun : 0;
    st.push = !!(recipe && recipe.push);
    return st;
  },
  makeName() {
    const a = t('name_a').split(','), b = t('name_b').split(',');
    return pick(a) + pick(b);
  },
  creatureHp(cr) { const st = Logic.stats(cr.parts); return Math.max(0, st.hp - (cr.dmg || 0)); },
  invSorted(filter) {
    return S.inv.filter(p => !filter || filter === 'all' || D.pieces[p.k].slot === filter)
      .sort((a, b) => (SLOT_ORDER[D.pieces[a.k].slot] - SLOT_ORDER[D.pieces[b.k].slot]) || (b.r - a.r) || a.k.localeCompare(b.k) || (a.id - b.id));
  },
  invRemove(p) { const i = S.inv.indexOf(p); if (i >= 0) S.inv.splice(i, 1); },
  invAdd(p) { p.q = null; S.inv.push(p); },
  pieceName(p) { return t('pc_' + p.k); },
  statLine(st) { return STATS.filter(s => st[s]).map(s => t('st_' + s) + ' +' + Math.round(st[s])).join('  '); },
  // Place une créature dans la première place libre de la crypte
  autoPlace(cr) {
    const used = {}; S.creatures.forEach(c => { if (c.pos) used[c.pos.join(',')] = 1; });
    for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) if (!used[r + ',' + i]) { cr.pos = [r, i]; return; }
    cr.pos = null;
  }
};

// ============================== Scène : Atelier (table d'autel) ==============================
const ALT = {
  torso: { x: 180, y: 252, s: 92 },
  head:  { x: 180, y: 152, s: 72, j: [180, 198] },
  arm0:  { x: 98,  y: 246, s: 72, j: [137, 222] },
  arm1:  { x: 262, y: 246, s: 72, j: [223, 222] },
  arm2:  { x: 94,  y: 334, s: 64, j: [140, 288] },
  arm3:  { x: 266, y: 334, s: 64, j: [220, 288] },
  legs:  { x: 180, y: 364, s: 80, j: [180, 306] },
  back:  { x: 292, y: 142, s: 66, j: [212, 210] },
  core:  { x: 68,  y: 142, s: 54, j: [180, 250] }
};
const BIN = { x: 34, y: 404, r: 26 };
const LEVER = { x: 334, y0: 292, y1: 404 };
const DRAWER_Y = 512, CELL = 50, ROSTER_Y = 50;
const TABS = ['all', 'head', 'torso', 'arm', 'legs', 'back', 'core'];

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let k = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; k = clamp(k, 0, 1);
  return dist(px, py, ax + dx * k, ay + dy * k);
}
function distToPath(px, py, pts) {
  let m = 1e9; for (let i = 1; i < pts.length; i++) m = Math.min(m, distToSeg(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return m;
}

Scenes.atelier = {
  enter(arg) {
    arg = arg || {};
    this.from = arg.from || 'map'; this.titan = !!arg.titan;
    this.tab = 'all'; this.scroll = 0; this.info = null; this.drag = null; this.press = null; this.sew = null;
    this.wake = null; this.card = null; this.lever = 0; this.leverDrag = false; this.leverAuto = false; this.confirm = -1e9;
    this.pop = {}; this.vial = null; this.flash = {};
    if (!S.draft) S.draft = { parts: {} };
    if (this.titan) this.setupTitan();
    this.target = null; this.active = null;
    if (arg.creature) this.select(arg.creature);
    else if (!this.titan) this.fullRoster();
    this.makeButtons();
    Sfx.Music.set(this.titan ? 'titan' : 'atelier');
    this.tutoHint();
  },
  exit() { this.cleanupUnsewn(); Save.save(); },
  // crypte pleine : pas de nouvel assemblage, on édite une créature existante
  fullRoster() {
    if (S.creatures.length < D.maxCreatures || this.target) return;
    for (const k in S.draft.parts) Logic.invAdd(S.draft.parts[k]);
    S.draft = { parts: {} };
    this.select(S.creatures[S.creatures.length - 1]);
  },
  setupTitan() {
    if (!S.titanDraft) {
      S.titanDraft = { parts: {} };
      S.titanInv = ['R_torso', 'R_capt', 'R_capt', 'R_arch', 'R_queen', 'R_priest', 'R_angel'].map(k => Logic.newPiece(k, 2));
    }
  },
  get parts() { return this.titan ? S.titanDraft.parts : this.target ? this.target.parts : S.draft.parts; },
  inv() { return this.titan ? S.titanInv : S.inv; },
  arms() { return this.titan ? 2 : D.altarArms[S.owned.altar]; },
  slots() { return Logic.slotsFor(this.arms()); },
  makeButtons() {
    this.btns = [
      UI.btn({ x: 6, y: 4, w: 46, h: 40, icon: 'back', style: 'dark', on: () => this.leave() }),
      UI.btn({ x: 222, y: 4, w: 62, h: 40, icon: 'auto', label: '', style: 'gold', on: () => this.autoBuild(), show: S.set.auto }),
      this.dismantleBtn = UI.btn({ x: 286, y: 336, w: 72, h: 40, label: t('dismantle'), size: 10, style: 'red', on: () => this.dismantle(), show: false })
    ];
    this.cardBtns = [UI.btn({ x: 120, y: 470, w: 120, h: 46, label: t('ok'), style: 'green', on: () => this.closeCard() })];
  },
  leave() {
    if (this.titan) { Toast.show(t('titan_finish')); return; }
    if (S.tuto >= 3 && S.tuto < 6) { Sfx.play('error'); return; }
    if (S.tuto === 6) { S.tuto = 7; Hint.clear(); }
    go(this.from === 'crypt' ? 'crypt' : 'map', { resume: true });
  },
  select(cr) {
    this.cleanupUnsewn();
    this.target = cr; this.info = null; this.sew = null; this.active = null; this.confirm = -1e9;
  },
  cleanupUnsewn() {
    if (!this.target) return;
    let n = 0;
    for (const k in this.target.parts) { const p = this.target.parts[k]; if (p && p.q === null && k !== 'torso') { Logic.invAdd(p); delete this.target.parts[k]; n++; } }
    if (n) Toast.show(t('unsewn_back'));
  },
  seamSlots() { const P = this.parts; return this.slots().filter(s => s !== 'torso' && P[s] && P[s].q === null); },
  needRepair() { return this.target && ((this.target.dmg || 0) > 0 || this.target.fallen); },
  activeSeam() {
    const list = this.seamSlots();
    if (this.active && list.indexOf(this.active) >= 0) return this.active;
    if (list.length) return list[list.length - 1];
    if (this.needRepair()) return 'repair';
    return null;
  },
  seamPath(slot) {
    let J, d, L = 96;
    if (slot === 'repair') { J = [180, 256]; d = [0, 1]; L = 110; }
    else if (slot === 'core') { J = ALT.core.j; d = [0, 1]; L = 80; }
    else { const a = ALT[slot]; J = a.j; const dx = a.x - J[0], dy = a.y - J[1], l = Math.hypot(dx, dy); d = [dx / l, dy / l]; }
    const perp = [-d[1], d[0]], pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = -L / 2 + L * i / 24, w = Math.sin(i / 24 * Math.PI * 3) * 7;
      pts.push([J[0] + perp[0] * u + d[0] * w, J[1] + perp[1] * u + d[1] * w]);
    }
    return pts;
  },
  sewMul() { return S.tuto < 99 ? D.sew.tutoMul : S.set.easy ? D.sew.easyMul : 1; },

  // ---- Actions ----
  place(p, slot, from) {
    const P = this.parts; const old = P[slot];
    if (old && old !== p) { Logic.invAdd(old); }
    if (from === 'inv') { const inv = this.inv(); const i = inv.indexOf(p); if (i >= 0) inv.splice(i, 1); }
    p.q = slot === 'torso' ? 1 : null;
    P[slot] = p; this.pop[slot] = time; this.active = slot === 'torso' ? this.active : slot;
    Sfx.play('bone'); vib(15); FX.spark(ALT[slot].x, ALT[slot].y, C.bone, 8, 80);
    if (S.tuto === 3 && slot !== 'torso') { S.tuto = 4; this.tutoHint(); }
    Save.save();
  },
  toInv(p) { if (this.titan) { p.q = null; S.titanInv.push(p); } else Logic.invAdd(p); },
  grind(p) {
    if (this.titan) { this.toInv(p); return; }
    Logic.invRemove(p); S.souls += D.grindSouls[p.r]; Sfx.play('grind'); vib(30);
    if (!S.hints.grinder) { S.hints.grinder = 1; Toast.show(t('hint_grinder')); }
    FX.spark(BIN.x, BIN.y, C.bone, 14, 100); FX.text(BIN.x + 10, BIN.y - 30, '+' + D.grindSouls[p.r], C.toxic, 16);
    Save.save();
  },
  autoBuild() {
    const P = this.parts, inv = this.inv();
    let n = 0;
    this.slots().forEach(slot => {
      if (P[slot]) return;
      let best = null;
      inv.forEach(p => { if (Logic.fits(p, slot) && (!best || Logic.score(p) > Logic.score(best))) best = p; });
      if (best) { inv.splice(inv.indexOf(best), 1); best.q = slot === 'torso' ? 1 : null; P[slot] = best; this.pop[slot] = time + n * 0.08; n++; }
    });
    // la couture reste au joueur : on active la première jointure à coudre
    const seams = this.seamSlots();
    if (seams.length && !this.active) this.active = seams[0];
    if (n) { Sfx.play('bone'); Toast.show(t(seams.length ? 'auto_sew' : 'auto_done')); }
    else Toast.show(t(seams.length ? 'auto_sew' : 'auto_none'));
    Save.save();
  },
  dismantle() {
    if (!this.target) return;
    if (time - this.confirm > 3) { this.confirm = time; Toast.show(t('confirm_again')); return; }
    const cr = this.target;
    for (const k in cr.parts) if (cr.parts[k]) Logic.invAdd(cr.parts[k]);
    S.creatures.splice(S.creatures.indexOf(cr), 1);
    this.target = null; Sfx.play('grind'); Save.save();
  },
  tryWake() {
    const P = this.parts;
    let err = null;
    if (!P.torso) err = 'need_torso';
    else if (this.seamSlots().length) err = 'need_sew';
    else if (!this.titan && S.creatures.length >= D.maxCreatures) err = 'roster_full';
    if (err) { Toast.show(t(err), '#ffb0b0'); Sfx.play('error'); return false; }
    this.wake = { t: 0, done: false }; Hint.clear();
    Sfx.play('zap'); vib([40, 60, 40]);
    return true;
  },
  finishWake() {
    if (this.titan) return;
    const st = Logic.stats(S.draft.parts);
    const cr = { id: uid(), name: Logic.makeName(), parts: S.draft.parts, dmg: 0, fallen: false, pos: null, born: Date.now() };
    S.creatures.push(cr); Logic.autoPlace(cr);
    S.draft = { parts: {} };
    S.best.made++;
    S.best.creatures.unshift({ name: cr.name, parts: Object.keys(cr.parts).reduce((o, k) => (o[k] = { k: cr.parts[k].k, r: cr.parts[k].r }, o), {}), recipe: st.recipe ? st.recipe.id : null, hp: st.hp, str: st.str, mag: st.mag, spd: st.spd, def: st.def });
    if (S.best.creatures.length > 30) S.best.creatures.length = 30;
    if (st.recipe && !S.best.recipes[st.recipe.id]) { S.best.recipes[st.recipe.id] = 1; this.newRecipe = st.recipe.id; }
    this.card = { cr, st };
    if (S.tuto === 5) S.tuto = 6;
    Save.save();
  },
  closeCard() {
    this.card = null; this.wake = null; this.lever = 0;
    if (this.titan) return;
    this.fullRoster();
    if (S.tuto === 6) this.tutoHint();
  },
  tutoHint() {
    Hint.clear();
    const inv = this.inv();
    if (S.tuto === 3) {
      const i = Logic.invSorted('all').findIndex(p => D.pieces[p.k].slot === 'arm');
      const cx = 6 + Math.floor(Math.max(0, i) / 2) * CELL + CELL / 2, cy = DRAWER_Y + 30 + (Math.max(0, i) % 2) * CELL + CELL / 2;
      Hint.show(t('tuto_drag'), cx, cy, { dragTo: { x: ALT.arm0.x, y: ALT.arm0.y }, boxY: 474 });
    } else if (S.tuto === 4) {
      const s = this.activeSeam(); if (!s) return; const pts = this.seamPath(s);
      Hint.show(t('tuto_sew'), pts[0][0], pts[0][1], { dragTo: { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] }, boxY: 474 });
    } else if (S.tuto === 5) Hint.show(t('tuto_lever'), LEVER.x, LEVER.y0, { dragTo: { x: LEVER.x, y: LEVER.y1 }, boxY: 430 });
    else if (S.tuto === 6) Hint.show(t('tuto_back'), 28, 28, { boxY: 110 });
    void inv;
  },

  // ---- Entrées ----
  hitPlaced(p) {
    const P = this.parts; let best = null, bd = 1e9;
    this.slots().forEach(s => { if (!P[s]) return; const a = ALT[s], d = dist(p.x, p.y, a.x, a.y); if (d < a.s * 0.55 && d < bd) { bd = d; best = s; } });
    return best;
  },
  cellAt(p) {
    if (p.y < DRAWER_Y + 30 || p.y > DRAWER_Y + 30 + CELL * 2) return null;
    const col = Math.floor((p.x - 6 + this.scroll) / CELL), row = Math.floor((p.y - DRAWER_Y - 30) / CELL);
    const i = col * 2 + row; const list = this.list();
    return i >= 0 && col >= 0 && i < list.length ? list[i] : null;
  },
  list() { return this.titan ? S.titanInv : Logic.invSorted(this.tab); },
  owned() { return D.fluidOrder.filter(f => S.owned.fluids[f]); },
  vialAt(p) {
    if (this.titan || p.y < 474 || p.y > 510) return null;
    const o = this.owned(); const i = Math.floor((p.x - 8) / 50);
    return i >= 0 && i < o.length ? o[i] : null;
  },
  down(p) {
    if (this.card) { UI.down(this.cardBtns, p); return; }
    if (this.wake) return;
    if (UI.down(this.btns, p)) return;
    // seam en cours ?
    const seam = this.activeSeam();
    if (seam) {
      const pts = this.seamPath(seam), r = 32 * Math.min(1.6, this.sewMul());
      const a = pts[0], b = pts[pts.length - 1];
      if (dist(p.x, p.y, a[0], a[1]) < r || dist(p.x, p.y, b[0], b[1]) < r) {
        this.sew = { slot: seam, pts, smp: [{ x: p.x, y: p.y }], len: 0 }; Sfx.play('sew'); return;
      }
    }
    // levier
    if (!this.target && Math.abs(p.x - LEVER.x) < 26 && p.y > LEVER.y0 - 30 && p.y < LEVER.y1 + 20) { this.leverDrag = true; this.press = { kind: 'lever', x: p.x, y: p.y }; return; }
    // roster
    if (!this.titan && p.y >= ROSTER_Y && p.y <= ROSTER_Y + 50) { this.press = { kind: 'roster', x: p.x, y: p.y }; return; }
    // broyeur : un appui ouvre le broyage en masse
    if (!this.titan && S.tuto >= 99 && dist(p.x, p.y, BIN.x, BIN.y) < BIN.r + 4) { this.press = { kind: 'bin', x: p.x, y: p.y }; return; }
    // pièce posée
    const ps = this.hitPlaced(p);
    if (ps) { this.press = { kind: 'slot', slot: ps, x: p.x, y: p.y }; return; }
    // fiole
    const v = this.vialAt(p);
    if (v) { if ((S.stock[v] || 0) <= 0) { Toast.show(t('no_dose')); Sfx.play('error'); return; } this.vial = { type: v, x: p.x, y: p.y, target: null, fill: 0, ax: p.x, ay: p.y }; Sfx.play('vial'); return; }
    // onglets
    if (p.y >= DRAWER_Y && p.y < DRAWER_Y + 28 && !this.titan) { const i = Math.floor(p.x / (W / TABS.length)); this.tab = TABS[clamp(i, 0, TABS.length - 1)]; this.scroll = 0; Sfx.play('tap'); return; }
    // tiroir
    if (p.y >= DRAWER_Y + 28) { const c = this.cellAt(p); this.press = { kind: 'inv', piece: c, x: p.x, y: p.y, scroll0: this.scroll }; return; }
  },
  move(p) {
    if (this.sew) {
      const s = this.sew, last = s.smp[s.smp.length - 1], d = dist(p.x, p.y, last.x, last.y);
      const n = Math.ceil(d / 5);
      for (let i = 1; i <= n; i++) s.smp.push({ x: lerp(last.x, p.x, i / n), y: lerp(last.y, p.y, i / n) });
      s.len += d; if (Math.floor(s.len / 18) !== Math.floor((s.len - d) / 18)) Sfx.play('stitch');
      return;
    }
    if (this.leverDrag) { this.lever = clamp((p.y - LEVER.y0) / (LEVER.y1 - LEVER.y0), 0, 1); return; }
    if (this.vial) {
      this.vial.x = p.x; this.vial.y = p.y;
      const tg = this.hitPlaced({ x: p.x, y: p.y - 24 });
      if (tg !== this.vial.target || dist(p.x, p.y, this.vial.ax, this.vial.ay) > 14) { this.vial.target = tg; this.vial.fill = 0; this.vial.ax = p.x; this.vial.ay = p.y; }
      return;
    }
    if (this.drag) { this.drag.x = p.x; this.drag.y = p.y; this.drag.snap = this.snapSlot(p, this.drag.p); return; }
    const pr = this.press; if (!pr) return;
    const dx = p.x - pr.x, dy = p.y - pr.y;
    if (pr.kind === 'inv') {
      if (pr.scrolling) { this.scroll = clamp(pr.scroll0 - dx, 0, this.maxScroll()); return; }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { pr.scrolling = true; return; }
      if (pr.piece && (Math.abs(dy) > 10 || Math.abs(dx) > 14)) { this.drag = { p: pr.piece, from: 'inv', x: p.x, y: p.y }; this.press = null; Sfx.play('bone'); }
    } else if (pr.kind === 'slot') {
      if (Math.hypot(dx, dy) > 8) {
        const P = this.parts, piece = P[pr.slot];
        if (this.target && pr.slot === 'torso') { Toast.show(t('torso_needed')); this.press = null; return; }
        if (S.tuto < 99 && S.tuto >= 3) { this.press = null; return; }
        delete P[pr.slot];
        this.drag = { p: piece, from: 'slot', fromSlot: pr.slot, x: p.x, y: p.y }; this.press = null;
      }
    }
  },
  snapSlot(p, piece) {
    const y = p.y - 26; let best = null, bd = 64;
    this.slots().forEach(s => { if (!Logic.fits(piece, s)) return; const a = ALT[s], d = dist(p.x, y, a.x, a.y); if (d < bd) { bd = d; best = s; } });
    return best;
  },
  maxScroll() { return Math.max(0, Math.ceil(this.list().length / 2) * CELL + 12 - W); },
  up(p) {
    if (this.card) { UI.up(this.cardBtns, p); return; }
    if (UI.pressed) { UI.up(this.btns, p); return; }
    if (this.sew) { this.finishSew(); return; }
    if (this.leverDrag) {
      this.leverDrag = false; const pr = this.press; this.press = null;
      if (pr && Math.hypot(p.x - pr.x, p.y - pr.y) < 8 && this.lever < 0.3) { this.leverAuto = true; return; }
      if (this.lever >= 0.8) { if (!this.tryWake()) this.lever = 0.99; }
      return;
    }
    if (this.vial) {
      const v = this.vial; this.vial = null;
      const doses = Math.floor(v.fill);
      if (v.target && doses >= 1) this.inoculate(v.target, v.type, doses);
      return;
    }
    if (this.drag) { this.drop(p); return; }
    const pr = this.press; this.press = null; if (!pr) return;
    if (pr.kind === 'inv' && !pr.scrolling && pr.piece) { this.info = { p: pr.piece, t: time }; Sfx.play('tap'); }
    if (pr.kind === 'bin') { if (dist(p.x, p.y, BIN.x, BIN.y) < BIN.r + 10) { Sfx.play('tap'); go('grinder', { from: this.from }); } return; }
    if (pr.kind === 'slot') { const pc = this.parts[pr.slot]; if (pc) { this.info = { p: pc, t: time }; if (pc.q === null) this.active = pr.slot; } }
    if (pr.kind === 'roster') {
      const i = Math.floor((p.x - 6) / 50);
      if (i >= 0 && i < S.creatures.length) { this.select(S.creatures[i] === this.target ? null : S.creatures[i]); Sfx.play('tap'); }
      else if (i === S.creatures.length && i < D.maxCreatures) { this.select(null); Sfx.play('tap'); }
    }
  },
  drop(p) {
    const d = this.drag; this.drag = null;
    if (dist(p.x, p.y - 26, BIN.x, BIN.y) < BIN.r + 14 && !this.titan && S.tuto >= 99) { this.grind(d.p); return; }
    const slot = this.snapSlot(p, d.p);
    if (slot && p.y < 440) {
      if (this.target && slot === 'torso' && d.from === 'slot') { this.parts.torso = d.p; return; }
      this.place(d.p, slot, d.from);
      return;
    }
    // hors de la table : retour au tiroir
    if (d.from === 'slot') {
      this.toInv(d.p); Sfx.play('bone');
      if (this.target && !this.target.parts.torso) this.target.parts.torso = d.p;
    }
    Save.save();
  },
  finishSew() {
    const s = this.sew; this.sew = null;
    const mul = this.sewMul(), tol = D.sew.tol * mul;
    let cov = 0; s.pts.forEach(q => { if (s.smp.some(m => dist(m.x, m.y, q[0], q[1]) < tol * 1.6)) cov++; }); cov /= s.pts.length;
    let dev = 0; s.smp.forEach(m => dev += distToPath(m.x, m.y, s.pts)); dev /= s.smp.length;
    const mid = s.pts[12];
    if (s.smp.length < 5 || cov < D.sew.minCover) { FX.text(mid[0], mid[1] - 20, t('sew_short'), '#ffb0b0', 15); Sfx.play('error'); return; }
    if (dev > tol * 2.2) { FX.text(mid[0], mid[1] - 20, t('sew_off'), '#ffb0b0', 15); Sfx.play('error'); return; }
    let q, key;
    if (dev <= D.sew.perfect * mul) { q = D.quality.perfect; key = 'perfect'; }
    else if (dev <= D.sew.good * mul) { q = D.quality.good; key = 'good'; }
    else { q = D.quality.bad; key = 'bad'; }
    if (s.slot === 'repair') {
      this.target.dmg = 0; this.target.fallen = false; Sfx.play('good'); vib(30);
      FX.text(mid[0], mid[1] - 20, t('repaired'), C.toxic, 16); FX.spark(mid[0], mid[1], C.toxic, 16, 120);
      Save.save(); return;
    }
    const pc = this.parts[s.slot]; if (!pc) return;
    pc.q = q; this.active = null;
    Sfx.play(key); vib(key === 'bad' ? [60, 40, 60] : 30);
    FX.text(mid[0], mid[1] - 22, t('sew_' + key) + (q !== 1 ? ' ' + (q > 1 ? '+' : '') + Math.round((q - 1) * 100) + '%' : ''), key === 'perfect' ? C.gold : key === 'good' ? C.toxic : '#ff7a7a', key === 'perfect' ? 19 : 16);
    FX.spark(mid[0], mid[1], key === 'perfect' ? C.gold : key === 'good' ? C.bone : C.red, key === 'perfect' ? 26 : 12, 130);
    if (key === 'perfect') this.flash[s.slot] = time;
    if (S.tuto === 4) { S.tuto = 5; this.tutoHint(); }
    Save.save();
  },
  inoculate(slot, type, doses) {
    const pc = this.parts[slot]; if (!pc) return;
    let d = doses;
    if (pc.fl && pc.fl.t === type) d = Math.min(3, pc.fl.d + doses);
    else if (pc.fl) Toast.show(t('fluid_replaced'));
    const used = d - (pc.fl && pc.fl.t === type ? pc.fl.d : 0);
    pc.fl = { t: type, d: Math.min(3, d) };
    S.stock[type] = Math.max(0, (S.stock[type] || 0) - used);
    const a = ALT[slot];
    Sfx.play('vial'); vib(20); FX.spark(a.x, a.y, D.fluids[type].color, 14, 90);
    if (pc.fl.d >= 3) { Toast.show(t('overdose') + ' ' + t('mut_' + type), '#ffd27a'); FX.shake(4, 0.3); Sfx.play('zap'); }
    else FX.text(a.x, a.y - 30, t('fl_' + type) + ' ×' + pc.fl.d, D.fluids[type].color, 15);
    Save.save();
  },

  // ---- Mise à jour ----
  update(dt) {
    if (this.leverAuto) { this.lever = Math.min(1, this.lever + dt * 3); if (this.lever >= 1) { this.leverAuto = false; if (!this.tryWake()) this.lever = 0.99; } }
    else if (!this.leverDrag && !this.wake && this.lever > 0) this.lever = Math.max(0, this.lever - dt * 2.5);
    if (this.vial && this.vial.target) {
      const pc = this.parts[this.vial.target];
      const cur = pc && pc.fl && pc.fl.t === this.vial.type ? pc.fl.d : 0;
      const max = Math.min(3 - cur, S.stock[this.vial.type] || 0);
      const before = Math.floor(this.vial.fill);
      this.vial.fill = Math.min(max + 0.001, this.vial.fill + dt / D.inoculateTime);
      if (Math.floor(this.vial.fill) > before && Math.floor(this.vial.fill) <= max) { Sfx.play('tap'); vib(15); }
    }
    if (this.wake) {
      const w = this.wake; w.t += dt;
      if (w.t < 1.2 && Math.random() < dt * 14) { FX.bolt(rnd(60, 300), 96, rnd(140, 220), rnd(170, 330), C.toxic); FX.flash = 0.6; }
      if (w.t >= 1.2 && !w.done) {
        w.done = true; FX.shake(8, 0.5); Sfx.play('roar'); vib(200);
        FX.spark(180, 250, C.toxic, 40, 200); FX.spark(180, 250, C.bone, 20, 160);
        if (this.titan) { S.titan = true; Save.save(); } else this.finishWake();
      }
      if (this.titan && w.t > 3) { this.wake = null; go('ending'); }
    }
    this.dismantleBtn.show = !!this.target && !this.titan;
    this.dismantleBtn.label = time - this.confirm < 3 ? t('sure') : t('dismantle');
    if (S.tuto === 4 && Hint.cur && !this.sew && Hint.cur.t > 0.1) {
      const s = this.activeSeam(); if (s) { const pts = this.seamPath(s); Hint.cur.x = pts[0][0]; Hint.cur.y = pts[0][1]; Hint.cur.dragTo = { x: pts[24][0], y: pts[24][1] }; }
    }
    if (this.sew && Hint.cur && S.tuto === 4) Hint.cur.t = 0;
  },

  // ---- Dessin ----
  draw() {
    const P = this.parts;
    // fond
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d1030'); g.addColorStop(1, '#0d0716');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // barre du haut
    txt(this.titan ? t('titan_altar') : t('atelier'), 140, 18, 18, C.text);
    if (!this.titan) txt(this.target ? this.target.name : t('new_creature'), 140, 37, 11, this.target ? C.toxic : C.dim);
    Art.icon('soul', 300, 24, 22); txt(String(S.souls), 316, 25, 16, C.toxic, 'left');
    // roster
    if (!this.titan) this.drawRoster();
    // table d'autel
    this.drawTable();
    const wakeK = this.wake ? clamp((this.wake.t - 0.6) / 0.6, 0, 1) : 0;
    if (this.wake && this.wake.t > 0.6) this.drawWake(wakeK);
    else {
      // emplacements
      this.slots().forEach(s => this.drawSlot(s, P[s]));
      // coutures
      // couture réussie : la couleur du fil indique la qualité (or = parfait, os = bien, rouge = raté)
      const seam = this.activeSeam();
      this.seamSlots().forEach(s => { if (s !== seam) this.drawSeam(s, false); });
      if (seam && !this.drag && !this.vial) this.drawSeam(seam, true);
    }
    // broyeur & levier
    if (!this.titan) {
      const hot = this.drag && dist(this.drag.x, this.drag.y - 26, BIN.x, BIN.y) < BIN.r + 14;
      ctx.globalAlpha = S.tuto >= 99 ? 1 : 0.35;
      Art.icon('bin', BIN.x, BIN.y, hot ? 52 : 42); txt(t('grinder'), BIN.x + 2, BIN.y - 27, 10, S.tuto >= 99 && !this.titan ? C.text : C.dim);
      ctx.globalAlpha = 1;
    }
    if (!this.target) this.drawLever();
    // stats
    this.drawStats();
    // fioles
    this.drawVials();
    // tiroir
    this.drawDrawer();
    UI.draw(this.btns);
    // pièce tirée
    if (this.drag) {
      const sn = this.drag.snap;
      if (sn) { const a = ALT[sn]; ctx.globalAlpha = 0.5; Art.piece(this.drag.p, a.x, a.y, a.s, { flip: a.x > 180 && sn.startsWith('arm') }); ctx.globalAlpha = 1; }
      Art.piece(this.drag.p, this.drag.x, this.drag.y - 26, 58, {});
    }
    if (this.vial) {
      const v = this.vial;
      Art.vial(v.type, v.x, v.y - 24, 44);
      if (v.target) {
        const a = ALT[v.target]; const k = v.fill;
        ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(a.x, a.y, a.s * 0.62, 0, 7); ctx.stroke();
        ctx.strokeStyle = k >= 2.99 ? '#ff5a5a' : D.fluids[v.type].color; ctx.beginPath(); ctx.arc(a.x, a.y, a.s * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(3, k) / 3); ctx.stroke();
        for (let i = 0; i < 3; i++) { const an = -Math.PI / 2 + i * Math.PI * 2 / 3; ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(a.x + Math.cos(an) * a.s * 0.62, a.y + Math.sin(an) * a.s * 0.62, 4, 0, 7); ctx.fill(); }
        txt(t('dose') + ' ' + Math.floor(k), a.x, a.y - a.s * 0.62 - 14, 13, k >= 3 ? '#ff7a7a' : C.text);
      }
    }
    if (this.sew) this.drawTrace();
    if (this.card) this.drawCard();
  },
  drawRoster() {
    const y = ROSTER_Y;
    S.creatures.forEach((cr, i) => {
      const x = 6 + i * 50, sel = this.target === cr;
      panel(x, y, 46, 46, sel ? C.violet : C.panel, 8);
      ctx.save(); rr(x, y, 46, 46, 8); ctx.clip();
      Art.creature(cr.parts, x + 23, y + 20, 15, { still: true, noGlow: true, alpha: cr.fallen ? 0.4 : 1 });
      ctx.restore();
      const st = Logic.stats(cr.parts), hp = Math.max(0, st.hp - (cr.dmg || 0));
      ctx.fillStyle = '#300'; ctx.fillRect(x + 5, y + 39, 36, 4); ctx.fillStyle = cr.fallen ? '#555' : hp < st.hp ? '#e0b030' : C.toxic; ctx.fillRect(x + 5, y + 39, 36 * hp / st.hp, 4);
    });
    if (S.creatures.length < D.maxCreatures) {
      const x = 6 + S.creatures.length * 50, sel = !this.target;
      panel(x, y, 46, 46, sel ? C.violet : C.panel, 8); txt('+', x + 23, y + 22, 26, sel ? C.toxic : C.dim);
    }
  },
  drawTable() {
    const bgi = Art.img('bg_altar');
    if (bgi) { ctx.save(); rr(14, 108, 332, 322, 18); ctx.clip(); const k = Math.max(332 / bgi.naturalWidth, 322 / bgi.naturalHeight); ctx.drawImage(bgi, 180 - bgi.naturalWidth * k / 2, 269 - bgi.naturalHeight * k / 2, bgi.naturalWidth * k, bgi.naturalHeight * k); ctx.fillStyle = 'rgba(8,4,16,0.3)'; ctx.fillRect(14, 108, 332, 322); ctx.restore(); rr(14, 108, 332, 322, 18); ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke(); return; }
    // dalle de pierre
    rr(14, 108, 332, 322, 18);
    const g = ctx.createRadialGradient(180, 260, 40, 180, 260, 240); g.addColorStop(0, '#5a5266'); g.addColorStop(1, '#2c2634');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, 190); ctx.lineTo(70, 210); ctx.moveTo(300, 380); ctx.lineTo(320, 360); ctx.moveTo(250, 120); ctx.lineTo(262, 140); ctx.stroke();
    // silhouette à la craie
    ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.arc(180, 150, 30, 0, 7); ctx.moveTo(150, 205); ctx.lineTo(210, 205); ctx.lineTo(220, 300); ctx.lineTo(140, 300); ctx.closePath();
    ctx.moveTo(150, 210); ctx.lineTo(100, 290); ctx.moveTo(210, 210); ctx.lineTo(260, 290); ctx.moveTo(165, 300); ctx.lineTo(160, 400); ctx.moveTo(195, 300); ctx.lineTo(200, 400); ctx.stroke(); ctx.restore();
    // bougies
    [[30, 124], [330, 124], [30, 418]].forEach(([x, y], i) => {
      if (i === 2 && !this.titan) return;
      ctx.fillStyle = '#1a1420'; ctx.fillRect(x - 5, y - 10, 10, 18); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(x - 5, y - 10, 10, 18);
      const f = Math.sin(time * 9 + i) * 1.5;
      Art.glowAt(x, y - 16, 16, 'rgba(125,255,74,0.35)');
      ctx.fillStyle = C.toxic; ctx.beginPath(); ctx.ellipse(x + f * 0.3, y - 16, 3.5, 7 + f, 0, 0, 7); ctx.fill();
    });
  },
  drawSlot(s, pc) {
    const a = ALT[s];
    if (!pc) {
      const can = this.drag && Logic.fits(this.drag.p, s);
      const snap = this.drag && this.drag.snap === s;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = snap ? 4 : 2.5;
      ctx.strokeStyle = snap ? C.toxic : can ? 'rgba(125,255,74,0.8)' : 'rgba(236,224,195,0.35)';
      ctx.beginPath(); ctx.arc(a.x, a.y, a.s * 0.42, 0, 7); ctx.stroke(); ctx.restore();
      txt(t('slot_' + D.slotType[s]), a.x, a.y, 11, can ? C.toxic : 'rgba(236,224,195,0.55)', 'center', { stroke: false });
      return;
    }
    // fil vers le torse
    if (s !== 'torso' && P0(this.parts)) {
      ctx.strokeStyle = 'rgba(30,15,40,0.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.j[0], a.j[1]); ctx.stroke();
      ctx.strokeStyle = pc.q === null ? 'rgba(236,224,195,0.4)' : pc.q >= D.quality.perfect ? C.gold : pc.q >= D.quality.good ? '#c8b89a' : '#d23a4a'; ctx.lineWidth = pc.q === null ? 2 : 2.5; ctx.stroke();
    }
    const k = this.pop[s] ? clamp((time - this.pop[s]) / 0.35, 0, 1) : 1;
    const sc = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1;
    if (this.flash[s] && time - this.flash[s] < 1.5) Art.glowAt(a.x, a.y, a.s * 0.8, 'rgba(242,193,78,' + (0.7 * (1 - (time - this.flash[s]) / 1.5)) + ')');
    if (pc.q === D.quality.perfect) Art.glowAt(a.x, a.y, a.s * 0.66, 'rgba(242,193,78,0.35)');
    Art.piece(pc, a.x, a.y, a.s * sc, { flip: s.startsWith('arm') && a.x > 180, eye: this.target && this.target.fallen ? '#555' : undefined });
    if (pc.fl) { Art.vial(pc.fl.t, a.x + a.s * 0.38, a.y + a.s * 0.36, 18); txt('×' + pc.fl.d, a.x + a.s * 0.38 + 12, a.y + a.s * 0.4, 11, pc.fl.d >= 3 ? '#ff7a7a' : C.text, 'left'); }
  },
  drawSeam(s, active) {
    const pts = this.seamPath(s);
    ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = -time * 20;
    ctx.lineCap = 'round'; ctx.lineWidth = active ? 8 : 4; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
    ctx.lineWidth = active ? 4 : 2; ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.4)'; ctx.stroke();
    ctx.restore();
    if (active) {
      const r = 10 + Math.sin(time * 6) * 2;
      ctx.fillStyle = 'rgba(125,255,74,0.35)'; ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], r + 6, 0, 7); ctx.fill();
      Art.icon('needle', pts[0][0], pts[0][1], 26);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(pts[24][0], pts[24][1], 5, 0, 7); ctx.fill();
      if (s === 'repair') txt(t('resew'), pts[12][0], pts[12][1] - 22, 13, C.toxic);
    }
  },
  drawStitches(s, q) {
    const pts = this.seamPath(s);
    const col = q >= D.quality.perfect ? C.gold : q >= D.quality.good ? C.bone : '#ff6a6a';
    // points de croix fins le long du fil
    ctx.lineCap = 'round';
    const draw = () => { ctx.beginPath(); for (let i = 7; i <= 17; i += 2) { const a = pts[i - 1], b = pts[i + 1]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; const ux = dx / l * 2.5, uy = dy / l * 2.5, nx = -dy / l * 3.5, ny = dx / l * 3.5; ctx.moveTo(pts[i][0] - nx - ux, pts[i][1] - ny - uy); ctx.lineTo(pts[i][0] + nx + ux, pts[i][1] + ny + uy); ctx.moveTo(pts[i][0] - nx + ux, pts[i][1] - ny + uy); ctx.lineTo(pts[i][0] + nx - ux, pts[i][1] + ny - uy); } ctx.stroke(); };
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; draw(); ctx.strokeStyle = col; ctx.lineWidth = 1.4; draw();
  },
  drawTrace() {
    const s = this.sew; if (s.smp.length < 2) return;
    const mul = this.sewMul(), tol = D.sew.tol * mul;
    const last = s.smp[s.smp.length - 1]; const dv = distToPath(last.x, last.y, s.pts);
    const col = dv <= D.sew.perfect * mul ? C.gold : dv <= D.sew.good * mul ? C.toxic : dv <= tol * 2 ? '#ffb030' : '#ff4a4a';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.beginPath(); s.smp.forEach((m, i) => i ? ctx.lineTo(m.x, m.y) : ctx.moveTo(m.x, m.y)); ctx.stroke();
    ctx.strokeStyle = '#a01e2e'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(last.x, last.y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  },
  drawLever() {
    const x = LEVER.x, hy = lerp(LEVER.y0, LEVER.y1, this.lever);
    const base = Art.img('lever_base'), knob = Art.img('lever_knob');
    if (base) threeV(base, x - 13, LEVER.y0 - 20, 26, LEVER.y1 - LEVER.y0 + 40, 60);
    else { ctx.fillStyle = '#2a2232'; rr(x - 7, LEVER.y0 - 10, 14, LEVER.y1 - LEVER.y0 + 20, 7); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke(); }
    const ready = this.parts.torso && !this.seamSlots().length;
    if (ready && !this.wake) Art.glowAt(x, hy, 30 + Math.sin(time * 5) * 4, 'rgba(125,255,74,0.45)');
    ctx.strokeStyle = C.ink; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, LEVER.y0 - 6); ctx.lineTo(x, hy); ctx.stroke();
    ctx.strokeStyle = C.steel; ctx.lineWidth = 5; ctx.stroke();
    if (knob) Art.deco('lever_knob', x, hy, 40);
    else {
      ctx.beginPath(); ctx.arc(x, hy, 15, 0, 7); ctx.fillStyle = C.red; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - 4, hy - 4, 4, 0, 7); ctx.fill();
    }
    // éclair
    ctx.save(); ctx.translate(x, LEVER.y0 - 26); ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(3, -10); ctx.lineTo(-6, 2); ctx.lineTo(0, 2); ctx.lineTo(-3, 11); ctx.lineTo(7, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  },
  drawWake(k) {
    const P = this.parts, e = ease(k);
    const cx = 180, cy = 236, size = 78;
    if (k >= 1) {
      const rise = clamp((this.wake.t - 1.2) / 0.5, 0, 1);
      Art.glowAt(cx, cy + 20, 150, 'rgba(125,255,74,' + (0.4 * (1 - rise * 0.5)) + ')');
      Art.creature(P, cx, cy + 10 - rise * 10, size * (0.9 + rise * 0.1), { eye: '#d6ffb8' });
      return;
    }
    // les pièces convergent vers la silhouette
    const L = Art.LAYOUT;
    ['back', 'legs', 'arm2', 'arm3', 'torso', 'core', 'head', 'arm0', 'arm1'].forEach(s => {
      const pc = P[s]; if (!pc) return;
      const a = ALT[s];
      const tx = s === 'torso' ? cx : cx + L[s][0] * size, ty = s === 'torso' ? cy : cy + L[s][1] * size;
      const ts = s === 'torso' ? size : size * L[s][2];
      Art.piece(pc, lerp(a.x, tx, e) + rnd(-2, 2), lerp(a.y, ty, e) + rnd(-2, 2), lerp(a.s, ts, e), { flip: s.startsWith('arm') && a.x > 180 });
    });
  },
  drawStats() {
    const y = 436;
    panel(6, y, 348, 34, 'rgba(36,22,58,0.9)', 8);
    if (this.info && time - this.info.t < 4) {
      const p = this.info.p, st = Logic.pieceStats(p);
      txt(Logic.pieceName(p), 14, y + 10, 12, [C.text, C.rare, C.legend][p.r], 'left');
      txt(t('rar_' + p.r) + (p.fl ? ' · ' + t('fl_' + p.fl.t) + ' ×' + p.fl.d : '') + (p.q ? ' · ' + t('q_' + (p.q >= 1.2 ? 'perfect' : p.q >= 1 ? 'good' : 'bad')) : ''), 346, y + 10, 10, C.dim, 'right');
      txt(Logic.statLine(st), 14, y + 25, 11, C.bone, 'left', { stroke: false });
      return;
    }
    const P = this.parts;
    if (!Object.keys(P).some(k => P[k])) { txt(t('altar_empty'), W / 2, y + 17, 12, C.dim); return; }
    const st = Logic.stats(P);
    const vals = [['hp', this.target ? Math.max(0, st.hp - (this.target.dmg || 0)) + '/' + st.hp : st.hp], ['str', st.str], ['mag', st.mag], ['spd', st.spd], ['def', st.def]];
    vals.forEach((v, i) => { const x = 12 + i * 46 + (i ? 22 : 0); txt(t('st_' + v[0]), x, y + 10, 10, C.dim, 'left', { stroke: false }); txt(String(v[1]), x, y + 24, 13, C.text, 'left'); });
    const tags = [];
    if (st.recipe) tags.push(t('rc_' + st.recipe.id));
    st.sets.forEach(s => tags.push(t('set_' + s)));
    if (st.fly) tags.push(t('tag_fly'));
    if (st.ranged) tags.push(t('tag_ranged'));
    if (tags.length) txtWrap(tags.slice(0, 2).join(' · '), 302, y + (tags.length > 1 || tags[0].length > 16 ? 11 : 17), 96, 9, st.recipe ? C.legend : C.toxic, 'center', 11);
  },
  drawVials() {
    const o = this.titan ? [] : this.owned();
    if (!o.length) { txt(this.titan ? '' : t('fluids_locked'), W / 2, 492, 11, 'rgba(165,150,191,0.6)', 'center', { stroke: false }); return; }
    o.forEach((f, i) => {
      const x = 33 + i * 50, n = S.stock[f] || 0;
      ctx.globalAlpha = n > 0 ? 1 : 0.35; Art.vial(f, x, 492, 34); ctx.globalAlpha = 1;
      txt(String(n), x + 15, 503, 12, n > 0 ? C.text : C.dim);
    });
    if (o.length < 5) txt(t('hold_to_inject'), 352, 492, 10, C.dim, 'right', { stroke: false });
  },
  drawDrawer() {
    const y = DRAWER_Y;
    ctx.fillStyle = '#2a1a1a'; rr(0, y, W, H - y + 10, 14); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#3a2420'; ctx.fillRect(4, y + 28, W - 8, CELL * 2 + 4);
    if (!this.titan) {
      const tw = W / TABS.length;
      TABS.forEach((tb, i) => {
        const on = this.tab === tb;
        ctx.fillStyle = on ? C.violet : 'rgba(0,0,0,0.25)'; rr(i * tw + 2, y + 3, tw - 4, 22, 6); ctx.fill();
        txt(tb === 'all' ? t('tab_all') : t('slot_' + tb), i * tw + tw / 2, y + 14, 10, on ? C.text : C.dim, 'center', { stroke: false });
      });
    } else txt(t('relics'), W / 2, y + 14, 12, C.legend);
    const list = this.list();
    ctx.save(); ctx.beginPath(); ctx.rect(4, y + 28, W - 8, CELL * 2 + 4); ctx.clip();
    if (!list.length) txt(this.titan ? t('titan_all_placed') : t('drawer_empty'), W / 2, y + 28 + CELL, 13, C.dim);
    list.forEach((p, i) => {
      const col = Math.floor(i / 2), row = i % 2, x = 6 + col * CELL - this.scroll, cy = y + 30 + row * CELL;
      if (x < -CELL || x > W) return;
      if (this.drag && this.drag.p === p) return;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x + 2, cy + 2, CELL - 4, CELL - 4, 8); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = [C.stoneD, C.rare, C.legend][p.r]; ctx.stroke();
      if (this.info && this.info.p === p && time - this.info.t < 4) { ctx.strokeStyle = C.toxic; ctx.lineWidth = 3; ctx.stroke(); }
      Art.piece(p, x + CELL / 2, cy + CELL / 2, 38, { noGlow: true });
      if (p.fl) Art.vial(p.fl.t, x + CELL - 10, cy + CELL - 12, 14);
    });
    ctx.restore();
    const ms = this.maxScroll();
    if (ms > 0) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; const bw = W * W / (W + ms); ctx.fillRect(4 + (W - 8 - bw) * this.scroll / ms, H - 4, bw, 3); }
  },
  drawCard() {
    ctx.fillStyle = 'rgba(10,5,16,0.75)'; ctx.fillRect(0, 0, W, H);
    const { cr, st } = this.card;
    panel(30, 120, 300, 410, C.panel, 16);
    Art.glowAt(180, 250, 110, 'rgba(125,255,74,0.3)');
    Art.creature(cr.parts, 180, 240, 64, {});
    txt(t('awakened'), 180, 146, 15, C.toxic);
    txt(cr.name, 180, 340, 24, C.text);
    const vals = [['hp', st.hp], ['str', st.str], ['mag', st.mag], ['spd', st.spd], ['def', st.def]];
    vals.forEach((v, i) => { const x = 62 + i * 59; txt(t('st_' + v[0]), x, 372, 11, C.dim); txt(String(v[1]), x, 390, 17, C.text); });
    const tags = [];
    if (st.recipe) tags.push(t('rc_' + st.recipe.id));
    st.sets.forEach(s => tags.push(t('set_' + s)));
    Object.keys(st.mut).forEach(m => tags.push(t('mut_' + m)));
    txtWrap(tags.join(' · ') || t('no_bonus'), 180, 420, 270, 12, st.recipe ? C.legend : C.toxic);
    if (this.newRecipe) { txt(t('recipe_found'), 180, 452, 13, C.legend); }
    this.cardBtns[0].y = 470; UI.draw(this.cardBtns);
  }
};
function P0(parts) { return !!parts.torso; }

// ============================== Scène : Crypte (défense) ==============================
const ROOM_TOP = [54, 202, 350], ROOM_H = 148;
const FLOOR = ROOM_TOP.map(y => y + 132);
const PATH = [[-14, FLOOR[0], 0], [318, FLOOR[0], 0], [336, FLOOR[1], -1], [28, FLOOR[1], 1], [22, FLOOR[2], -1], [298, FLOOR[2], 2]];
const SEGS = []; let PATH_LEN = 0;
for (let i = 1; i < PATH.length; i++) {
  const a = PATH[i - 1], b = PATH[i], l = dist(a[0], a[1], b[0], b[1]);
  SEGS.push({ a, b, l, s0: PATH_LEN, room: b[2] }); PATH_LEN += l;
}
const TRAP_X = [172, 186, 160];
const POST_X = [[132, 250], [232, 112], [118, 232]];
const ROOM_DIR = [1, -1, 1];
// recul minimal : un héros repoussé reste à portée des créatures (bord gauche de l'étage 1 à x≈26)
// Marge d'entrée : un héros repoussé ne recule pas jusqu'au bord par où arrivent les suivants (le combat reste visible)
const PUSH_MIN_S = 40, ENTRY_MARGIN = 72;
const ROOM_S0 = [0, 1, 2].map(r => SEGS.find(g => g.room === r).s0);
function pushBack(h, d) {
  const floor = h.room >= 0 ? ROOM_S0[h.room] + ENTRY_MARGIN + (h.room === 0 ? 14 : 0) : PUSH_MIN_S;
  h.s = Math.max(Math.min(h.s, floor), h.s - d); const p = pathPos(h.s); h.x = p.x; h.y = p.y; h.room = p.room;
}
function pathPos(s) {
  for (const g of SEGS) if (s <= g.s0 + g.l) { const k = (s - g.s0) / g.l; return { x: lerp(g.a[0], g.b[0], k), y: lerp(g.a[1], g.b[1], k), room: g.room }; }
  const g = SEGS[SEGS.length - 1]; return { x: g.b[0], y: g.b[1], room: g.room };
}
const POWER = { x: 40, y: 578, r: 30 };

Scenes.crypt = {
  enter(arg) {
    arg = arg || {};
    this.paused = false; this.powerSel = false; this.drag = null; this.press = null; this.speed = this.speed || 1;
    if (arg.resume && this.run && S.run) { this.syncUnits(); }
    else if (arg.resume && S.run) { this.run = S.run; this.setupNight(true); }
    else { this.startNight(arg.night || 1, !!arg.endless); }
    this.makeButtons();
    Sfx.Music.set('crypt');
    if (!this.bg) this.bg = this.renderBg();
    this.tutoHint();
  },
  exit() { Hint.clear(); },
  startNight(n, endless) {
    this.run = { night: n, wave: 0, hp: D.cryptHp, kills: 0, invaded: false, destroyed: false, endless, waves: endless ? 9999 : D.wavesPerNight };
    S.run = this.run;
    S.creatures.forEach(c => { c.dmg = 0; c.fallen = false; });
    for (const f in S.owned.fluids) S.stock[f] = D.fluidStock;
    if (n >= 4 && !S.owned.fluids.blood) { S.owned.fluids.blood = 1; S.stock.blood = D.fluidStock; this.newsFluids = true; }
    this.setupNight(false);
    Save.save();
  },
  setupNight(resumed) {
    if (S.tuto === 1) { S.inv.push(Logic.newPiece('p_arm', 0)); S.tuto = 2; }
    this.phase = (this.run.night === 1 && S.tuto === 0 && !this.run.endless) ? 'tuto' : 'prep';
    this.heroes = []; this.drops = []; this.zones = []; this.shots = []; this.queue = []; this.lost = [];
    this.gauge = this.gauge || 0; this.trapCd = [0, 0, 0]; this.trapAnim = [0, 0, 0]; this.result = null; this.waveHeroes = 0; this.boss = null;
    this.syncUnits();
    if (this.phase === 'tuto') this.startWave(true);
    if (!resumed && this.run.night === 2 && !S.hints.boss) { S.hints.boss = 1; Toast.show(t('hint_boss')); }
    if (this.newsFluids) { this.newsFluids = false; Hint.show(t('hint_fluids'), null, null, { boxY: 380 }); setTimeout(() => { if (Hint.cur && Hint.cur.text === t('hint_fluids')) Hint.clear(); }, 7000); }
    if (!resumed && this.run.night === 3 && !S.hints.shop) { S.hints.shop = 1; Toast.show(t('hint_shop')); }
  },
  syncUnits() {
    this.units = S.creatures.filter(c => c.pos).map(c => this.makeUnit(c));
  },
  makeUnit(c) {
    const st = Logic.stats(c.parts), r = c.pos[0];
    return { cr: c, st, room: r, x: POST_X[r][c.pos[1]], post: POST_X[r][c.pos[1]], cd: rnd(0, 0.5), atk: 0, stun: 0, dead: c.fallen, revive: 0, usedRevive: false, seed: rnd(0, 6), flip: ROOM_DIR[r] > 0 };
  },
  makeButtons() {
    this.btns = [
      this.bPause = UI.btn({ x: 6, y: 6, w: 40, h: 38, icon: 'pause', style: 'dark', on: () => { this.paused = true; } }),
      this.bAtelier = UI.btn({ x: 8, y: 574, w: 140, h: UI.bigH(54), icon: 'altar', label: t('atelier'), style: 'main', on: () => this.toAtelier() }),
      this.bWave = UI.btn({ x: 156, y: 574, w: 196, h: UI.bigH(54), icon: 'play', label: '', style: 'green', on: () => this.startWave(false) }),
      this.bSpeed = UI.btn({ x: 300, y: 574, w: 52, h: 50, label: 'x1', style: 'dark', on: () => { this.speed = this.speed === 1 ? 2 : 1; } })
    ];
    this.pauseBtns = [
      UI.btn({ x: 90, y: 240, w: 180, h: 52, label: t('resume'), style: 'green', on: () => { this.paused = false; } }),
      UI.btn({ x: 90, y: 304, w: 180, h: 52, label: t('settings'), style: 'main', on: () => { this.paused = false; go('settings', { back: 'crypt' }); } }),
      UI.btn({ x: 90, y: 368, w: 180, h: 52, label: t('quit_map'), style: 'red', on: () => { this.paused = false; this.saveRun(); go('map'); } })
    ];
    this.endBtns = [];
  },
  saveRun() { if (this.run && this.phase !== 'result' && this.phase !== 'lost') { S.run = this.run; } Save.save(); },
  toAtelier() {
    if (S.tuto === 2) { S.tuto = 3; this.prepTutoDraft(); }
    if (S.tuto >= 3 && S.tuto < 7 && S.tuto !== 3) return;
    this.saveRun(); go('atelier', { from: 'crypt' });
  },
  prepTutoDraft() {
    // le premier torse est déjà sur l'autel
    if (!S.draft) S.draft = { parts: {} };
    if (!S.draft.parts.torso) { const tp = Logic.newPiece('p_ribs'); tp.q = 1; S.draft.parts.torso = tp; }
  },

  // ---- Vagues ----
  composition() {
    const n = this.run.endless ? 10 : this.run.night;
    return D.nights[clamp(n, 1, 10) - 1];
  },
  power() { // multiplicateurs de difficulté
    const n = this.run.endless ? 10 + this.run.wave * 0.6 : this.run.night;
    const k = n - 1; return { hp: 1 + D.heroHp[0] * k + D.heroHp[1] * k * k, dmg: 1 + D.heroDmg[0] * k + D.heroDmg[1] * k * k };
  },
  startWave(tuto) {
    if (this.phase !== 'prep' && !tuto) return;
    if (!tuto && S.tuto > 0 && S.tuto < 7) { Sfx.play('error'); this.tutoHint(); return; }
    if (!tuto && S.tuto === 7) { S.tuto = 8; }
    this.phase = tuto ? 'tuto' : 'wave';
    this.syncUnits();
    this.units.forEach(u => { if (u.st.mut.lightning) { u.stun = 4; FX.text(u.x, FLOOR[u.room] - 60, t('stunned'), C.gold); } });
    const n = this.run.night;
    this.queue = [];
    if (tuto) this.queue.push('peasant');
    else {
      const count = this.run.endless ? 10 + this.run.wave * 2 : Math.round(D.waveCount[0] + D.waveCount[1] * n + D.waveCount[2] * n * n);
      const comp = this.composition();
      for (let i = 0; i < count; i++) this.queue.push(weighted(comp));
      const last = this.run.wave === this.run.waves - 1;
      if (!this.run.endless && last) {
        if (D.bosses[n]) this.queue.push('boss');
        else if (n >= 3) this.queue.push('elite');
      }
      if (this.run.endless && this.run.wave % 4 === 3) this.queue.push('elite');
    }
    this.waveHeroes = this.queue.length; this.spawnT = 0.5;
    this.gap = lerp(D.spawnGap[0], D.spawnGap[1], (clamp(n, 1, 10) - 1) / 9);
    this.waveLost = false;
    Hint.clear(); this.tutoHint();
    if (!tuto) Toast.show(this.run.endless ? t('wave_n', { n: this.run.wave + 1 }) : t('wave_x', { n: this.run.wave + 1, m: this.run.waves }));
  },
  spawn(kind) {
    const pw = this.power();
    let type = kind, base, boss = null, elite = false;
    if (kind === 'boss') { boss = D.bosses[this.run.night]; type = boss.id; base = boss; }
    else if (kind === 'elite') { type = weighted(this.composition()); base = D.heroes[type]; elite = true; }
    else base = D.heroes[type];
    const hpMul = boss ? 1 : pw.hp * (elite ? D.elite.hpMul : 1), dmgMul = boss ? 1 : pw.dmg * (elite ? D.elite.dmgMul : 1);
    const h = {
      type, kind, boss, elite, s: 0, hp: base.hp * hpMul, maxHp: base.hp * hpMul, str: base.str * dmgMul, mag: base.mag * dmgMul, def: base.def,
      move: base.move * rnd(0.92, 1.08), rate: base.rate, range: base.range, cd: 0, atk: 0, stun: 0, slow: 0, slowK: 0, burn: null, poison: null,
      trapHits: 0, disarm: base.disarm || 0, crit: base.crit || 0, heal: base.heal || 0, healAll: !!base.healAll, healCd: 2, darkResist: base.darkResist || 0,
      boneBurn: base.boneBurn || (boss && boss.base === 'mage' ? 1.5 : 0), ignoreLight: !!base.ignoreLight || !!boss, dodge: base.dodge || 0, splash: !!base.splash,
      size: boss ? 58 : elite ? 48 : 40, hurt: 0, t: rnd(0, 5)
    };
    if (boss) { this.boss = h; Toast.show(t('boss_' + boss.id), C.legend); Sfx.play('roar'); FX.shake(5, 0.4); }
    if (elite) Toast.show(t('elite_comes'), C.rare);
    S.best.heroes[type] = S.best.heroes[type] || 0;
    const p = pathPos(0); h.x = p.x; h.y = p.y; h.room = p.room;
    this.heroes.push(h);
  },

  // ---- Combat ----
  heroDmgTo(u, h) {
    let d = h.str * 100 / (100 + u.st.def) + h.mag * 100 / (100 + 0.5 * u.st.def);
    if (h.boneBurn) d *= h.boneBurn;
    if (h.crit && Math.random() < h.crit) d *= 2;
    return d * u.st.dmgTaken;
  },
  hitCreature(u, d, melee) {
    if (u.dead) return;
    if (u.st.mut.soul && Math.random() < 0.4) { FX.text(u.x, FLOOR[u.room] - 50, t('dodge'), C.dim, 11); return; }
    if (melee && u.st.fly && Math.random() < 0.25) { FX.text(u.x, FLOOR[u.room] - 50, t('dodge'), C.dim, 11); return; }
    const c = u.cr;
    c.dmg = (c.dmg || 0) + d; u.hurt = 0.15;
    FX.text(u.x + rnd(-6, 6), FLOOR[u.room] - 55, '-' + Math.round(d), '#ff8a8a', 12);
    // membre instable (surdose de sang) : perdu au premier coup
    if (u.st.mut.blood && !u.extraLost) { u.extraLost = true; u.st.str = Math.max(1, u.st.str - 5); FX.spark(u.x, FLOOR[u.room] - 30, C.red, 8); }
    // lien fragile
    const fragile = Object.keys(c.parts).filter(k => k !== 'torso' && c.parts[k] && c.parts[k].q !== null && c.parts[k].q < 0.8);
    if (fragile.length && Math.random() < D.fragileLoss) {
      const k = pick(fragile), pc = c.parts[k]; delete c.parts[k];
      this.lost.push(pc);
      const oldMax = u.st.hp; u.st = Logic.stats(c.parts); c.dmg = Math.max(0, c.dmg - (oldMax - u.st.hp));
      this.drops.push({ p: pc, x: u.x, y: FLOOR[u.room] - 40, vy: -120, vx: rnd(-50, 50), ground: FLOOR[u.room] - 6, t: 0, lost: true });
      FX.text(u.x, FLOOR[u.room] - 70, t('limb_lost'), '#ffb030', 13); Sfx.play('bone');
    }
    if (c.dmg >= u.st.hp) this.creatureFalls(u);
  },
  creatureFalls(u) {
    const c = u.cr;
    if (u.st.fx.soul && !u.usedRevive) { u.usedRevive = true; u.dead = true; u.revive = 1.5; c.dmg = u.st.hp; FX.puff(u.x, FLOOR[u.room] - 30, '#f2f0ff', 10); return; }
    u.dead = true; c.fallen = true; c.dmg = u.st.hp;
    Sfx.play('bone'); FX.spark(u.x, FLOOR[u.room] - 20, C.bone, 14, 120);
    if (u.st.mut.fire) {
      Sfx.play('boom'); FX.shake(5, 0.3); FX.spark(u.x, FLOOR[u.room] - 30, '#ff8a2a', 30, 180);
      this.heroes.forEach(h => { if (h.room === u.room && Math.abs(h.x - u.x) < 70) this.hitHero(h, 30 + u.st.str, null); });
    }
  },
  hitHero(h, d, u, kind) {
    if (h.dead) return;
    if (h.dodge && Math.random() < h.dodge) { FX.text(h.x, h.y - h.size - 8, t('dodge'), C.dim, 11); return; }
    h.hp -= d; h.hurt = 0.15;
    FX.text(h.x + rnd(-6, 6), h.y - h.size - 6, '-' + Math.round(d), kind === 'crit' ? C.gold : '#fff', kind === 'crit' ? 15 : 12);
    if (h.hp <= 0) this.heroDies(h);
  },
  heroDies(h) {
    h.dead = true; this.run.kills++; S.best.heroes[h.type] = (S.best.heroes[h.type] || 0) + 1;
    this.gauge = Math.min(100, this.gauge + (h.boss ? D.soulGaugeBoss : D.soulGaugeKill));
    Sfx.play('die'); FX.puff(h.x, h.y - 16, '#cfc6dd', 8);
    // butin
    const out = [];
    const tutoDrop = this.phase === 'tuto';
    if (tutoDrop) out.push(Logic.newPiece('p_arm', 0));
    else if (h.boss) {
      if (h.boss.legend) out.push(Logic.newPiece(h.boss.legend, 2));
      out.push(Logic.newPiece(pick(D.drops[h.boss.base]), 1));
      out.push({ relic: h.boss.relic });
    } else if (h.elite) {
      out.push(Logic.newPiece(pick(D.drops.elite), 1)); out.push(Logic.newPiece(pick(D.drops.elite), Math.random() < 0.3 ? 1 : 0));
    } else {
      const r = Math.random(); const n = r < D.dropCount[0] ? 1 : r < D.dropCount[0] + D.dropCount[1] ? 2 : 3;
      const rare = D.rareChance + D.rareChancePerNight * (this.run.night - 1);
      for (let i = 0; i < n; i++) out.push(Logic.newPiece(pick(D.drops[h.type]), Math.random() < rare ? 1 : 0));
    }
    out.forEach((p, i) => this.drops.push({ p: p.relic ? null : p, relic: p.relic, x: h.x + (i - (out.length - 1) / 2) * 16, y: h.y - 20, vy: rnd(-170, -120), vx: rnd(-30, 30) + (i - (out.length - 1) / 2) * 20, ground: h.y - 6, t: 0 }));
    if (h === this.boss) { FX.shake(8, 0.6); Sfx.play('win'); }
  },
  creatureAttack(u, h) {
    let d = u.st.str * 100 / (100 + h.def) + u.st.mag * 100 / (100 + 0.5 * h.def) * (1 - h.darkResist);
    let kind = null;
    if (u.st.crit && Math.random() < u.st.crit) { d *= u.st.critMul; kind = 'crit'; }
    const fx = u.st.fx;
    this.hitHero(h, d, u, kind);
    if (fx.poison) h.poison = { dps: 2 * fx.poison + u.st.str * 0.05, t: 4 };
    if (fx.fire) h.burn = { dps: 1.5 * fx.fire + u.st.str * 0.05, t: 3 };
    if (fx.ice) { h.slow = 2; h.slowK = Math.min(0.6, 0.25 * fx.ice); }
    if (u.st.stun && Math.random() < u.st.stun) { h.stun = Math.max(h.stun, 1); FX.text(h.x, h.y - h.size - 18, '★', C.gold, 14); }
    if (u.st.push) pushBack(h, 18);
    if (u.st.splash) this.heroes.forEach(o => { if (o !== h && !o.dead && o.room === h.room && Math.abs(o.x - h.x) < 50) this.hitHero(o, d * u.st.splash, u); });
    if (fx.lightning) {
      const others = this.heroes.filter(o => o !== h && !o.dead && o.room === h.room && Math.abs(o.x - h.x) < 90).slice(0, fx.lightning);
      others.forEach(o => { FX.bolt(h.x, h.y - 18, o.x, o.y - 18, C.gold, 0.2); this.hitHero(o, d * 0.5, u); });
    }
    if (u.st.ranged) { this.shots.push({ x: u.x, y: FLOOR[u.room] - 34, tx: h.x, ty: h.y - 18, t: 0, col: fx.fire ? '#ff8a2a' : '#c58bff' }); }
    else Sfx.play('hit');
  },
  update(dt) {
    if (this.paused || this.phase === 'result' || this.phase === 'lost') { this.bSpeed.label = 'x' + this.speed; return; }
    const tutoPause = this.phase === 'tuto' && S.tuto === 0 && this.heroes.some(h => !h.dead && h.room === 0 && h.x > TRAP_X[0] - 24);
    const sp = tutoPause ? 0 : dt * ((this.phase === 'wave') ? this.speed : 1);
    this.bSpeed.label = 'x' + this.speed;
    // pièges
    for (let i = 0; i < 3; i++) { this.trapCd[i] = Math.max(0, this.trapCd[i] - sp); this.trapAnim[i] = Math.max(0, this.trapAnim[i] - dt); }
    if (this.phase === 'wave' || this.phase === 'tuto') this.updateCombat(sp);
    // butin
    this.drops.forEach(d => {
      d.t += dt;
      if (d.fly) { d.fly += dt * 2.5; return; }
      d.vy += 500 * dt; d.y += d.vy * dt; d.x = clamp(d.x + d.vx * dt, 16, 344);
      if (d.y >= d.ground) { d.y = d.ground; d.vy = d.vy > 60 ? -d.vy * 0.4 : 0; d.vx *= 0.7; }
    });
    this.drops = this.drops.filter(d => !d.fly || d.fly < 1);
    if (this.phase === 'tuto' && S.tuto === 0 && tutoPause && (!Hint.cur || Hint.cur.text !== t('tuto_trap'))) this.tutoHint();
    if (this.phase === 'tuto' && S.tuto === 0 && this.heroes.length && this.heroes.every(h => h.dead) && this.drops.length) { S.tuto = 1; this.tutoHint(); }
    if (this.phase === 'tuto' && S.tuto === 1 && !this.drops.length) { S.tuto = 2; this.phase = 'prep'; this.tutoHint(); }
    // fin de vague
    if (this.phase === 'wave' && !this.queue.length && this.heroes.every(h => h.dead)) {
      this.clearT = (this.clearT || 0) + dt;
      if (this.clearT > 1.8) { this.clearT = 0; this.endWave(); }
    }
  },
  updateCombat(dt) {
    if (dt <= 0) return;
    // apparition
    if (this.queue.length) { this.spawnT -= dt; if (this.spawnT <= 0) { this.spawn(this.queue.shift()); this.spawnT = this.gap * rnd(0.7, 1.3); } }
    const alive = this.heroes.filter(h => !h.dead);
    // créatures
    this.units.forEach(u => {
      u.atk = Math.max(0, u.atk - dt * 3); u.hurt = Math.max(0, (u.hurt || 0) - dt);
      if (u.dead) {
        if (u.revive > 0) { u.revive -= dt; if (u.revive <= 0) { u.dead = false; u.cr.fallen = false; u.cr.dmg = u.st.hp * 0.5; FX.spark(u.x, FLOOR[u.room] - 30, '#f2f0ff', 20, 120); FX.text(u.x, FLOOR[u.room] - 70, t('revived'), '#f2f0ff', 13); } }
        return;
      }
      const st = u.st, c = u.cr;
      if (st.fx.blood) c.dmg = Math.max(0, c.dmg - st.hp * 0.005 * st.fx.blood * dt);
      if (st.mut.poison) c.dmg = Math.min(st.hp - 1, c.dmg + dt);
      if (st.aura) this.units.forEach(o => { if (!o.dead && o.room === u.room) o.cr.dmg = Math.max(0, o.cr.dmg - st.aura * dt); });
      if (u.stun > 0) { u.stun -= dt; return; }
      const inRoom = alive.filter(h => h.room === u.room && !h.dead);
      let tg = null, bd = 1e9; inRoom.forEach(h => { const d = Math.abs(h.x - u.x); if (d < bd) { bd = d; tg = h; } });
      const spd = st.move * (st.mut.ice ? 0.6 : 1);
      if (tg) {
        u.flip = tg.x > u.x;
        if (bd > st.range) u.x += Math.sign(tg.x - u.x) * spd * dt;
        else { u.cd -= dt; if (u.cd <= 0) { u.cd = st.rate; u.atk = 1; this.creatureAttack(u, tg); } }
      } else {
        u.cd = Math.max(0, u.cd - dt);
        if (Math.abs(u.x - u.post) > 2) { u.x += Math.sign(u.post - u.x) * spd * dt; u.flip = u.post > u.x; } else u.flip = ROOM_DIR[u.room] < 0;
      }
      u.x = clamp(u.x, 22, 338);
    });
    // héros
    alive.forEach(h => {
      h.t += dt; h.atk = Math.max(0, h.atk - dt * 3); h.hurt = Math.max(0, h.hurt - dt);
      if (h.poison) { h.poison.t -= dt; this.dot(h, h.poison.dps * dt); if (h.poison.t <= 0) h.poison = null; }
      if (h.burn) { h.burn.t -= dt; this.dot(h, h.burn.dps * dt); if (h.burn.t <= 0) h.burn = null; }
      if (h.dead) return;
      if (h.slow > 0) h.slow -= dt;
      // soins des prêtres
      if (h.heal) {
        h.healCd -= dt;
        if (h.healCd <= 0) {
          h.healCd = 2.2;
          const mates = alive.filter(o => !o.dead && o.hp < o.maxHp && (h.healAll || o.room === h.room));
          mates.forEach(o => { o.hp = Math.min(o.maxHp, o.hp + h.heal); o.burn = null; o.poison = null; });
          if (mates.length) FX.spark(h.x, h.y - 30, C.gold, 6, 60);
        }
      }
      if (h.stun > 0) { h.stun -= dt; return; }
      const units = h.room >= 0 ? this.units.filter(u => !u.dead && u.room === h.room) : [];
      const dir = ROOM_DIR[h.room] || 1;
      let tg = null;
      const taunt = units.find(u => u.st.taunt && Math.abs(u.x - h.x) < 120);
      if (h.range > 40) { let bd = 1e9; units.forEach(u => { const d = Math.abs(u.x - h.x); if (d <= h.range && d < bd) { bd = d; tg = u; } }); if (taunt && Math.abs(taunt.x - h.x) <= h.range) tg = taunt; }
      else { tg = (taunt && (taunt.x - h.x) * dir > -12 && (taunt.x - h.x) * dir < h.range + 10) ? taunt : units.find(u => (u.x - h.x) * dir > -12 && (u.x - h.x) * dir < h.range + 10); }
      if (h.room === 0 && h.x < 24) tg = null; // à l'entrée, hors de portée des créatures : il avance d'abord
      if (tg) {
        h.cd -= dt;
        if (h.cd <= 0) {
          h.cd = h.rate; h.atk = 1;
          const d = this.heroDmgTo(tg, h);
          if (h.range > 40) this.shots.push({ x: h.x, y: h.y - h.size * 0.8, tx: tg.x, ty: FLOOR[tg.room] - 30, t: 0, col: h.heal ? C.gold : '#7fd6ff' });
          this.hitCreature(tg, d, h.range <= 40);
          if (h.splash) this.units.forEach(o => { if (o !== tg && !o.dead && o.room === tg.room && Math.abs(o.x - tg.x) < 50) this.hitCreature(o, d * 0.6, false); });
          Sfx.play('hurt');
        }
      } else {
        const v = h.move * (h.slow > 0 ? 1 - h.slowK : 1);
        h.s += v * dt;
        const p = pathPos(h.s); h.x = p.x; h.y = p.y; h.room = p.room;
        if (h.s >= PATH_LEN) this.invade(h);
      }
    });
    // brasero
    this.zones.forEach(z => { z.t -= dt; this.heroes.forEach(h => { if (!h.dead && h.room === z.room && Math.abs(h.x - z.x) < D.trapZone + 6) this.dot(h, z.dps * dt); }); });
    this.zones = this.zones.filter(z => z.t > 0);
    this.shots.forEach(s => s.t += dt * 4); this.shots = this.shots.filter(s => s.t < 1);
    this.heroes = this.heroes.filter(h => !h.dead || h.deadT === undefined || h.deadT > 0);
    this.heroes.forEach(h => { if (h.dead) h.deadT = (h.deadT === undefined ? 0.5 : h.deadT) - dt; });
  },
  dot(h, d) { if (h.dead) return; h.hp -= d; if (h.hp <= 0) this.heroDies(h); },
  invade(h) {
    h.dead = true; h.deadT = 0; const dmg = h.boss ? 3 : 1;
    this.run.hp -= dmg; this.run.invaded = true;
    FX.shake(6, 0.3); vib(80); Sfx.play('hurt'); FX.spark(322, FLOOR[2] - 30, C.red, 16, 140);
    Toast.show(t('invaded'), '#ff9a9a');
    if (this.run.hp <= 0) this.lose();
  },
  triggerTrap(i) {
    if (this.trapCd[i] > 0) { Sfx.play('error'); return; }
    const type = S.trapSlots[i], tp = D.traps[type];
    const k = this.run.endless ? 10 + this.run.wave * 0.6 : this.run.night;
    const mul = 1 + D.trapDmgPerNight * (k - 1);
    this.trapCd[i] = tp.cd; this.trapAnim[i] = 0.5;
    Sfx.play(type === 'brasero' ? 'fire' : 'trap'); vib(25);
    const x = TRAP_X[i];
    let disarmed = false;
    if (type === 'brasero') this.zones.push({ room: i, x, t: tp.dur, dps: tp.burn * mul });
    this.heroes.forEach(h => {
      if (h.dead || h.room !== i || Math.abs(h.x - x) > D.trapZone) return;
      if (h.disarm) { h.trapHits++; if (h.trapHits % h.disarm === 0) { disarmed = true; FX.text(h.x, h.y - h.size - 14, t('disarmed'), '#ffd27a', 13); return; } }
      if (type === 'spikes') { if (h.ignoreLight) { FX.text(h.x, h.y - h.size - 14, t('ignored'), C.dim, 12); return; } this.hitHero(h, tp.dmg * mul); }
      if (type === 'trapdoor') { h.stun = Math.max(h.stun, tp.stun); FX.text(h.x, h.y - h.size - 14, t('trapped'), C.toxic, 12); }
      if (type === 'coffin') { this.hitHero(h, tp.dmg * mul); pushBack(h, tp.push); }
    });
    if (disarmed) this.trapCd[i] *= 2;
    FX.spark(x, FLOOR[i] - 10, type === 'brasero' ? C.toxic : C.bone, 10, 90);
    if (S.tuto === 0) { Hint.clear(); }
  },
  rally(room) {
    const fallen = this.units.filter(u => u.dead && u.room === room && u.revive <= 0);
    if (!fallen.length) { Toast.show(t('no_fallen')); Sfx.play('error'); return false; }
    fallen.forEach(u => { u.dead = false; u.cr.fallen = false; u.cr.dmg = u.st.hp * (1 - D.rallyHp); FX.bolt(u.x, ROOM_TOP[room], u.x, FLOOR[room] - 20, C.toxic, 0.4); FX.spark(u.x, FLOOR[room] - 20, C.toxic, 20, 140); });
    this.gauge = 0; Sfx.play('power'); FX.flash = 0.4; vib(60);
    return true;
  },
  collect(d) {
    if (d.fly) return;
    d.fly = 0.001; d.fx0 = d.x; d.fy0 = d.y;
    if (d.relic) { S.relics[d.relic] = 1; Toast.show(t('relic_got'), C.legend); Sfx.play('win'); }
    else { S.inv.push(d.p); d.p.q = null; Sfx.play('coin'); }
    if (S.tuto === 1) Hint.clear();
  },
  endWave() {
    this.drops.forEach(d => this.collect(d));
    // les membres perdus reviennent au tiroir
    this.lost.forEach(p => { if (S.inv.indexOf(p) < 0) Logic.invAdd(p); }); this.lost = [];
    this.units.forEach(u => { if (u.dead) { u.cr.fallen = true; this.run.destroyed = true; } });
    this.run.wave++;
    if (S.tuto === 8) { S.tuto = 99; Hint.show(t('tuto_done'), null, null, { boxY: 420 }); setTimeout(() => { if (Hint.cur && Hint.cur.text === t('tuto_done')) Hint.clear(); }, 6000); }
    if (this.run.wave >= this.run.waves) this.win();
    else {
      this.phase = 'prep'; S.run = this.run;
      if (this.run.endless) { S.endless = Math.max(S.endless || 0, this.run.wave); }
      Toast.show(t('wave_clear'), C.toxic);
      Save.save();
    }
  },
  win() {
    const n = this.run.night;
    const stars = 1 + (this.run.invaded ? 0 : 1) + (this.run.destroyed ? 0 : 1);
    const prev = S.stars[n] || 0;
    const souls = this.run.kills + D.starSouls * Math.max(0, stars - prev);
    S.stars[n] = Math.max(prev, stars); S.souls += souls;
    const first = S.cleared < n; S.cleared = Math.max(S.cleared, n);
    S.creatures.forEach(c => { c.dmg = 0; c.fallen = false; });
    S.run = null; this.phase = 'result'; this.result = { stars, souls, first, n };
    Sfx.play('win'); vib([50, 50, 100]);
    const bw = 150;
    this.endBtns = [UI.btn({ x: W / 2 - bw / 2, y: 430, w: bw, h: 52, label: n === 10 && !S.titan ? t('build_titan') : t('continue'), style: 'green', on: () => {
      if (n === 10 && !S.titan) go('atelier', { titan: true }); else go('map');
    } })];
    Save.save();
  },
  lose() {
    this.phase = 'lost'; Sfx.play('lose');
    const endless = this.run.endless;
    if (endless) { S.endless = Math.max(S.endless || 0, this.run.wave); S.souls += this.run.kills; }
    S.creatures.forEach(c => { c.dmg = 0; c.fallen = false; });
    this.drops.forEach(d => { if (d.p && S.inv.indexOf(d.p) < 0) S.inv.push(d.p); }); this.drops = [];
    this.lost.forEach(p => { if (S.inv.indexOf(p) < 0) Logic.invAdd(p); }); this.lost = [];
    S.run = null;
    this.endBtns = [
      UI.btn({ x: 40, y: 430, w: 136, h: 52, label: t('retry'), style: 'green', on: () => go('crypt', { night: this.run.night, endless }) }),
      UI.btn({ x: 184, y: 430, w: 136, h: 52, label: t('map'), style: 'main', on: () => go('map') })
    ];
    Save.save();
  },

  // ---- Entrées ----
  postAt(p) {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) if (dist(p.x, p.y, POST_X[r][i], FLOOR[r] - 30) < 36) return [r, i];
    return null;
  },
  cardAt(p) { if (p.y < 506 || p.y > 556) return null; const i = Math.floor((p.x - 8) / 50); return S.creatures[i] || null; },
  down(p) {
    if (this.paused) { UI.down(this.pauseBtns, p); return; }
    if (this.phase === 'result' || this.phase === 'lost') { UI.down(this.endBtns, p); return; }
    this.bAtelier.show = this.phase === 'prep'; this.bWave.show = this.phase === 'prep'; this.bSpeed.show = this.phase === 'wave';
    if (UI.down(this.btns, p)) return;
    const fighting = this.phase === 'wave' || this.phase === 'tuto';
    // pouvoir
    if (fighting && dist(p.x, p.y, POWER.x, POWER.y) < POWER.r + 6 && this.phase === 'wave') {
      if (this.gauge >= 100) { this.powerSel = !this.powerSel; Sfx.play('tap'); } else { Toast.show(t('power_charging')); Sfx.play('error'); }
      return;
    }
    if (this.powerSel && p.y > ROOM_TOP[0] && p.y < ROOM_TOP[2] + ROOM_H) {
      const r = clamp(Math.floor((p.y - ROOM_TOP[0]) / ROOM_H), 0, 2);
      if (this.rally(r)) this.powerSel = false; return;
    }
    // butin
    const d = this.drops.find(d => !d.fly && dist(p.x, p.y, d.x, d.y - 8) < 28);
    if (d) { this.collect(d); return; }
    // pièges
    for (let i = 0; i < 3; i++) {
      if (Math.abs(p.x - TRAP_X[i]) < 32 && p.y > FLOOR[i] - 56 && p.y < FLOOR[i] + 16) {
        if (fighting) { if (this.phase === 'tuto' && S.tuto !== 0) return; this.triggerTrap(i); }
        else if (this.phase === 'prep' && S.tuto >= 99) this.cycleTrap(i);
        return;
      }
    }
    // placement des créatures (préparation)
    if (this.phase === 'prep') {
      const c = this.cardAt(p);
      if (c) { this.press = { c, x: p.x, y: p.y }; return; }
      const post = this.postAt(p);
      if (post) { const c2 = S.creatures.find(c => c.pos && c.pos[0] === post[0] && c.pos[1] === post[1]); if (c2) this.press = { c: c2, x: p.x, y: p.y }; }
    }
  },
  move(p) {
    if (this.press && !this.drag && Math.hypot(p.x - this.press.x, p.y - this.press.y) > 8) { this.drag = { c: this.press.c, x: p.x, y: p.y }; this.press = null; }
    if (this.drag) { this.drag.x = p.x; this.drag.y = p.y; }
  },
  up(p) {
    if (this.paused) { UI.up(this.pauseBtns, p); return; }
    if (this.phase === 'result' || this.phase === 'lost') { UI.up(this.endBtns, p); return; }
    if (UI.pressed) { UI.up(this.btns, p); return; }
    if (this.drag) {
      const c = this.drag.c, post = this.postAt(p); this.drag = null;
      if (post) {
        const other = S.creatures.find(o => o !== c && o.pos && o.pos[0] === post[0] && o.pos[1] === post[1]);
        if (other) other.pos = c.pos;
        c.pos = post; Sfx.play('bone');
      } else if (p.y < 500) { c.pos = null; Sfx.play('tap'); }
      this.syncUnits(); Save.save(); return;
    }
    this.press = null;
  },
  cycleTrap(i) {
    const owned = Object.keys(D.traps).filter(k => S.owned.traps[k]);
    if (owned.length < 2) { Toast.show(t('more_traps')); return; }
    S.trapSlots[i] = owned[(owned.indexOf(S.trapSlots[i]) + 1) % owned.length];
    Sfx.play('trap'); FX.text(TRAP_X[i], FLOOR[i] - 60, t('tr_' + S.trapSlots[i]), C.toxic, 13); Save.save();
  },
  tutoHint() {
    if (S.tuto >= 99) return;
    Hint.clear();
    if (S.tuto === 0 && this.phase === 'tuto') {
      if (this.heroes.some(h => !h.dead && h.x > TRAP_X[0] - 24)) Hint.show(t('tuto_trap'), TRAP_X[0], FLOOR[0] - 20, { boxY: 230 });
      else Hint.show(t('tuto_intro'), null, null, { boxY: 230 });
    } else if (S.tuto === 1 && this.drops[0]) Hint.show(t('tuto_pick'), this.drops[0].x, this.drops[0].y - 8, { boxY: 230 });
    else if (S.tuto === 2) Hint.show(t('tuto_atelier'), 78, 600, { boxY: 380 });
    else if (S.tuto === 7 && this.phase === 'prep') Hint.show(t('tuto_wave'), 254, 600, { boxY: 380 });
    else if (S.tuto === 8 && this.phase === 'wave') Hint.show(t('tuto_traps'), null, null, { boxY: 360 });
  },

  // ---- Dessin ----
  renderBg() {
    const k = 2, oc = document.createElement('canvas'); oc.width = W * k; oc.height = H * k;
    const c = oc.getContext('2d'); c.scale(k, k);
    c.fillStyle = '#0d0716'; c.fillRect(0, 0, W, H);
    // terre au-dessus
    const g0 = c.createLinearGradient(0, 0, 0, 54); g0.addColorStop(0, '#1a2a1a'); g0.addColorStop(1, '#2a1f1a'); c.fillStyle = g0; c.fillRect(0, 0, W, 54);
    for (let r = 0; r < 3; r++) {
      const y = ROOM_TOP[r];
      const g = c.createLinearGradient(0, y, 0, y + ROOM_H); g.addColorStop(0, '#2b2036'); g.addColorStop(1, '#1a1222');
      c.fillStyle = g; c.fillRect(8, y + 4, W - 16, ROOM_H - 14);
      // briques
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
      for (let by = y + 8; by < y + ROOM_H - 16; by += 16) { c.beginPath(); c.moveTo(8, by); c.lineTo(W - 8, by); c.stroke(); for (let bx = 8 + ((by / 16) % 2) * 18; bx < W - 8; bx += 36) { c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by + 16); c.stroke(); } }
      // sol
      c.fillStyle = '#3d3348'; c.fillRect(8, FLOOR[r], W - 16, 10);
      c.fillStyle = '#120c18'; c.fillRect(0, FLOOR[r] + 10, W, y + ROOM_H - FLOOR[r] - 10 + 4);
      c.strokeStyle = C.ink; c.lineWidth = 3; c.strokeRect(8, y + 4, W - 16, ROOM_H - 4);
      // os décoratifs
      c.fillStyle = 'rgba(236,224,195,0.25)';
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(30 + i * 85 + (r * 23) % 40, FLOOR[r] + 4, 3, 0, 7); c.fill(); }
      // cadre
      c.font = 'bold 10px ' + FONT; c.fillStyle = 'rgba(165,150,191,0.35)'; c.textAlign = 'left'; c.fillText(['I', 'II', 'III'][r], 14, y + 18);
    }
    // entrée
    c.fillStyle = '#05030a'; c.fillRect(0, FLOOR[0] - 46, 14, 46);
    return oc;
  },
  draw() {
    ctx.drawImage(this.bg, 0, 0, W, H);
    const bgi = Art.img('bg_crypt');
    if (bgi) ROOM_TOP.forEach((y, r) => {
      const rw = W - 16, rh = FLOOR[r] - y - 4, k = Math.max(rw / bgi.naturalWidth, rh / bgi.naturalHeight);
      ctx.save(); ctx.beginPath(); ctx.rect(8, y + 4, rw, rh); ctx.clip(); ctx.globalAlpha = 0.9;
      ctx.drawImage(bgi, 180 - bgi.naturalWidth * k / 2, y + 4 + rh / 2 - bgi.naturalHeight * k / 2, bgi.naturalWidth * k, bgi.naturalHeight * k);
      // assombrir pour garder les personnages lisibles
      ctx.globalAlpha = 1; const g = ctx.createLinearGradient(0, y, 0, FLOOR[r]); g.addColorStop(0, 'rgba(8,4,16,0.6)'); g.addColorStop(1, 'rgba(8,4,16,0.25)'); ctx.fillStyle = g; ctx.fillRect(8, y + 4, rw, rh); ctx.restore();
    });
    this.drawStructure();
    // torches
    [[60, 0], [300, 0], [200, 1], [60, 2], [250, 2]].forEach(([x, r], i) => {
      const y = ROOM_TOP[r] + 44, f = Math.sin(time * 10 + i * 2) * 1.5;
      if (drawTorch(x, y, i)) return;
      Art.glowAt(x, y - 8, 52 + f * 3, 'rgba(125,255,74,0.22)');
      ctx.fillStyle = '#5a4030'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 4); ctx.lineTo(x + 6, y - 4); ctx.lineTo(x + 3, y + 16); ctx.lineTo(x - 3, y + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a3440'; ctx.fillRect(x - 8, y - 6, 16, 4); ctx.strokeRect(x - 8, y - 6, 16, 4);
      ctx.fillStyle = C.toxic; ctx.beginPath(); ctx.ellipse(x + f * 0.4, y - 14, 6, 11 + f, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e6ffd0'; ctx.beginPath(); ctx.ellipse(x, y - 11, 3, 6, 0, 0, 7); ctx.fill();
    });
    // phylactère
    this.drawPhylactery();
    // zones de brasero
    this.zones.forEach(z => { Art.glowAt(z.x, FLOOR[z.room] - 10, 40, 'rgba(125,255,74,0.35)'); for (let i = 0; i < 2; i++) FX.parts.length < 200 && Math.random() < 0.3 && FX.parts.push({ x: z.x + rnd(-28, 28), y: FLOOR[z.room] - 4, vx: 0, vy: -40, life: 0.6, t: 0, col: C.toxic, r: 2.5, g: -30 }); });
    // pièges
    for (let i = 0; i < 3; i++) {
      const type = S.trapSlots[i], cd = this.trapCd[i], ready = cd <= 0 && (this.phase === 'wave' || this.phase === 'tuto');
      const fight = this.phase === 'wave' || this.phase === 'tuto';
      Art.trap(type, TRAP_X[i], FLOOR[i] + 2, 40, ready, fight ? 1 - cd / D.traps[type].cd : undefined, this.trapAnim[i] > 0);
      if (this.phase === 'prep' && S.tuto >= 99) txt(t('tr_' + type), TRAP_X[i], FLOOR[i] - 30, 10, C.bone, 'center');
    }
    // postes de garde
    if (this.phase === 'prep') for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = this.drag && dist(this.drag.x, this.drag.y, POST_X[r][i], FLOOR[r] - 30) < 36 ? C.toxic : 'rgba(236,224,195,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(POST_X[r][i], FLOOR[r] + 2, 20, 6, 0, 0, 7); ctx.stroke(); ctx.restore();
    }
    // créatures
    this.units.forEach(u => this.drawUnit(u));
    // héros
    this.heroes.forEach(h => this.drawHero(h));
    // tirs
    this.shots.forEach(s => { const x = lerp(s.x, s.tx, s.t), y = lerp(s.y, s.ty, s.t) - Math.sin(s.t * Math.PI) * 16; Art.glowAt(x, y, 10, s.col); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); });
    // butin
    this.drops.forEach(d => {
      let x = d.x, y = d.y;
      if (d.fly) { const k = ease(Math.min(1, d.fly)); x = lerp(d.fx0, 30, k); y = lerp(d.fy0, 620, k); }
      if (!d.fly) Art.glowAt(x, y - 8, 20 + Math.sin(time * 6 + d.x) * 3, d.relic ? 'rgba(255,182,39,0.6)' : d.p.r ? 'rgba(74,168,255,0.5)' : 'rgba(236,224,195,0.35)');
      if (d.relic) Art.art(D.relics[d.relic].art, x, y - 10, 30, { t: time });
      else Art.piece(d.p, x, y - 10, 28, { noGlow: true });
    });
    // sélection de salle (pouvoir)
    if (this.powerSel) for (let r = 0; r < 3; r++) {
      const has = this.units.some(u => u.dead && u.room === r);
      ctx.strokeStyle = has ? C.toxic : 'rgba(125,255,74,0.3)'; ctx.lineWidth = 4; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -time * 30;
      ctx.strokeRect(12, ROOM_TOP[r] + 8, W - 24, ROOM_H - 12); ctx.setLineDash([]);
      if (has) txt(t('tap_room'), W / 2, ROOM_TOP[r] + 30, 13, C.toxic);
    }
    this.drawHud();
    this.drawBottom();
    if (this.drag) { const c = this.drag.c; Art.creature(c.parts, this.drag.x, this.drag.y - 30, 18, { still: true, noGlow: true }); }
    if (this.paused) this.drawPause();
    if (this.phase === 'result' || this.phase === 'lost') this.drawEnd();
  },
  // sols et échelles par-dessus le mur (images deco_floor / deco_ladder si présentes)
  drawStructure() {
    const fl = Art.img('deco_floor'), la = Art.img('deco_ladder');
    for (let r = 0; r < 3; r++) {
      const y = FLOOR[r];
      if (fl) {
        const h = 18, w = fl.naturalWidth * h / fl.naturalHeight;
        ctx.save(); ctx.beginPath(); ctx.rect(8, y - 3, W - 16, h); ctx.clip();
        for (let x = 8 - (r * 17) % w; x < W - 8; x += w - 0.5) ctx.drawImage(fl, x, y - 3, w + 0.5, h);
        ctx.restore(); continue;
      }
      ctx.fillStyle = '#4a3d58'; ctx.fillRect(8, y, W - 16, 11);
      ctx.fillStyle = '#6e5e80'; ctx.fillRect(8, y, W - 16, 3);
      ctx.strokeStyle = 'rgba(10,6,16,0.7)'; ctx.lineWidth = 2;
      for (let x = 8 + (r * 13) % 34; x < W - 8; x += 34) { ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 11); ctx.stroke(); }
      ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(W - 8, y); ctx.stroke();
    }
    [[333, FLOOR[0] + 8, FLOOR[1] + 2], [25, FLOOR[1] + 8, FLOOR[2] + 2]].forEach(([x, y0, y1]) => {
      if (la) { const w = 26; ctx.save(); ctx.beginPath(); ctx.rect(x - w, y0, w * 2, y1 - y0); ctx.clip(); const h = la.naturalHeight * w / la.naturalWidth; for (let y = y0; y < y1; y += h - 0.5) ctx.drawImage(la, x - w / 2, y, w, h + 0.5); ctx.restore(); return; }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 6;
      [-9, 9].forEach(d => { ctx.beginPath(); ctx.moveTo(x + d, y0); ctx.lineTo(x + d, y1); ctx.stroke(); });
      for (let y = y0 + 8; y < y1 - 2; y += 12) { ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.stroke(); }
      ctx.strokeStyle = '#8a6440'; ctx.lineWidth = 3;
      [-9, 9].forEach(d => { ctx.beginPath(); ctx.moveTo(x + d, y0); ctx.lineTo(x + d, y1); ctx.stroke(); });
      for (let y = y0 + 8; y < y1 - 2; y += 12) { ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.stroke(); }
    });
  },
  drawPhylactery() {
    const x = 326, y = FLOOR[2] - 30, hp = this.run ? this.run.hp : D.cryptHp;
    if (drawCrystal(x - 8, FLOOR[2] + 1, hp <= 3)) return;
    Art.glowAt(x, y, 34 + Math.sin(time * 3) * 4, hp > 3 ? 'rgba(125,255,74,0.4)' : 'rgba(255,90,50,0.5)');
    ctx.fillStyle = C.stoneD; ctx.fillRect(x - 14, y + 18, 28, 14); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(x - 14, y + 18, 28, 14);
    ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x + 13, y); ctx.lineTo(x, y + 18); ctx.lineTo(x - 13, y); ctx.closePath();
    ctx.fillStyle = hp > 3 ? C.toxic : '#ff6a3a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(x - 4, y - 12); ctx.lineTo(x, y - 18); ctx.lineTo(x, y - 4); ctx.fill();
  },
  drawUnit(u) {
    const c = u.cr, fy = FLOOR[u.room];
    if (u.dead) {
      ctx.globalAlpha = 0.8;
      if (c.parts.torso) Art.piece(c.parts.torso, u.x, fy - 6, 22, { rot: Math.PI / 2, noGlow: true });
      if (c.parts.head) Art.piece(c.parts.head, u.x + 12, fy - 6, 14, { noGlow: true, eye: '#333' });
      ctx.globalAlpha = 1;
      if (u.revive > 0) Art.glowAt(u.x, fy - 20, 30, 'rgba(242,240,255,0.5)');
      return;
    }
    const size = 24, foot = Art.creatureFoot(c.parts);
    const co = { t: time, seed: u.seed, flip: !u.flip, atk: u.atk > 0 ? 1 - u.atk : 0, ghost: u.st.mut.soul, noGlow: true }, cy = fy - foot * size - 1;
    Art.creature(c.parts, u.x, cy, size, co);
    if (u.hurt > 0) Art.tinted(u.x, fy + 4, size * 4, size * 4, 'rgba(255,50,50,0.55)', () => Art.creature(c.parts, 0, cy - fy - 4, size, co));
    if (u.stun > 0) txt('✦', u.x, fy - foot * size - size * 1.3, 12, C.gold);
    const hp = Math.max(0, u.st.hp - c.dmg), k = hp / u.st.hp;
    if (k < 1) { const y = fy - foot * size - size * 1.25; ctx.fillStyle = '#300'; ctx.fillRect(u.x - 14, y, 28, 4); ctx.fillStyle = k > 0.5 ? C.toxic : k > 0.25 ? '#e0b030' : C.red; ctx.fillRect(u.x - 14, y, 28 * k, 4); }
  },
  drawHero(h) {
    if (h.dead) { ctx.globalAlpha = Math.max(0, (h.deadT || 0) * 2); }
    const dir = ROOM_DIR[h.room] || (h.room === -1 ? 1 : 1);
    Art.hero(h.type, h.x, h.y, h.size, { t: h.t, walk: !h.stun && !h.atk, flip: dir < 0, atk: h.atk > 0 ? 1 - h.atk : 0, hurt: h.hurt > 0 });
    ctx.globalAlpha = 1;
    if (h.dead) return;
    if (h.elite && !h.boss) Art.glowAt(h.x, h.y - h.size * 0.5, h.size * 0.7, 'rgba(74,168,255,0.25)');
    if (h.stun > 0) txt('✦', h.x, h.y - h.size - 10, 12, C.gold);
    if (h.burn || h.poison) ctx.fillStyle = h.burn ? '#ff8a2a' : C.toxic, ctx.beginPath(), ctx.arc(h.x + 8, h.y - h.size - 4, 3, 0, 7), ctx.fill();
    if (h.hp < h.maxHp && !h.boss) { const k = h.hp / h.maxHp; ctx.fillStyle = '#300'; ctx.fillRect(h.x - 12, h.y - h.size - 8, 24, 3); ctx.fillStyle = '#ff5050'; ctx.fillRect(h.x - 12, h.y - h.size - 8, 24 * k, 3); }
  },
  drawHud() {
    topBar(52);
    const r = this.run;
    const title = r.endless ? t('endless') + ' · ' + t('wave_n', { n: r.wave + 1 }) : t('night_n', { n: r.night }) + ' · ' + (this.phase === 'tuto' ? t('tutorial') : t('wave_x', { n: Math.min(r.wave + 1, r.waves), m: r.waves }));
    txt(title, 180, 16, 15, C.text);
    const left = this.queue.length + this.heroes.filter(h => !h.dead).length;
    if (this.phase === 'wave') txt(t('heroes_left', { n: left }), 180, 36, 11, C.dim);
    else txt(t('souls_n', { n: S.souls }), 180, 36, 11, C.toxic);
    Art.icon('heart', 312, 25, 22); txt(String(Math.max(0, r.hp)), 330, 26, 16, r.hp > 3 ? C.text : '#ff7a7a', 'left');
    if (this.boss && !this.boss.dead) {
      const k = this.boss.hp / this.boss.maxHp;
      panel(56, 52, 248, 22, 'rgba(26,15,36,0.9)', 6); ctx.fillStyle = '#5a1a1a'; ctx.fillRect(60, 64, 240, 6); ctx.fillStyle = C.legend; ctx.fillRect(60, 64, 240 * k, 6);
      txt(t('boss_' + this.boss.boss.id), 180, 58, 10, C.legend);
    }
  },
  drawBottom() {
    const y = 500;
    ctx.fillStyle = '#160d20'; ctx.fillRect(0, y, W, H - y); ctx.fillStyle = C.ink; ctx.fillRect(0, y, W, 3);
    this.bAtelier.show = this.phase === 'prep'; this.bWave.show = this.phase === 'prep'; this.bSpeed.show = this.phase === 'wave';
    this.bWave.label = this.run.endless ? t('wave_n', { n: this.run.wave + 1 }) : t('launch_wave', { n: this.run.wave + 1, m: this.run.waves });
    this.bAtelier.pulse = S.tuto === 2; this.bWave.pulse = S.tuto === 7;
    this.bAtelier.badge = this.phase === 'prep' && S.creatures.some(c => c.fallen || (c.dmg || 0) > 0) ? '!' : null;
    this.bWave.off = S.tuto > 0 && S.tuto < 7;
    // cartes des créatures
    if (this.phase === 'prep' || this.phase === 'tuto') {
      S.creatures.forEach((c, i) => {
        const x = 8 + i * 50, out = !c.pos;
        panel(x, 506, 46, 46, out ? '#2a2030' : C.panel, 8);
        ctx.save(); rr(x, 506, 46, 46, 8); ctx.clip();
        Art.creature(c.parts, x + 23, 526, 15, { still: true, noGlow: true, alpha: c.fallen ? 0.4 : out ? 0.6 : 1 }); ctx.restore();
        if (c.pos) txt(['I', 'II', 'III'][c.pos[0]], x + 38, 515, 9, C.dim);
        else txt(t('reserve'), x + 23, 545, 8, C.dim);
        const st = Logic.stats(c.parts), hp = Math.max(0, st.hp - (c.dmg || 0));
        ctx.fillStyle = '#300'; ctx.fillRect(x + 5, y + 46, 36, 3); ctx.fillStyle = c.fallen ? '#555' : C.toxic; ctx.fillRect(x + 5, y + 46, 36 * hp / st.hp, 3);
      });
      if (!S.creatures.length) txt(t('no_creature'), W / 2, 530, 12, C.dim);
      else if (this.phase === 'prep' && S.tuto >= 99) txt(t('drag_hint'), 352, 560, 9, C.dim, 'right', { stroke: false });
    } else {
      // pouvoir du nécromancien
      const k = this.gauge / 100, full = k >= 1;
      if (full) Art.glowAt(POWER.x, POWER.y, 46 + Math.sin(time * 6) * 4, 'rgba(125,255,74,0.5)');
      ctx.beginPath(); ctx.arc(POWER.x, POWER.y, POWER.r, 0, 7); ctx.fillStyle = this.powerSel ? C.violetL : C.panel; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = full ? C.toxic : C.violetL; ctx.beginPath(); ctx.arc(POWER.x, POWER.y, POWER.r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      Art.icon('skull', POWER.x, POWER.y, 30);
      txt(t('rally'), POWER.x, POWER.y + 44, 10, full ? C.toxic : C.dim);
      // état des créatures
      this.units.forEach((u, i) => {
        const x = 84 + (i % 3) * 70, yy = 512 + Math.floor(i / 3) * 56;
        panel(x, yy, 64, 50, u.dead ? '#2a1a1a' : C.panel, 8);
        ctx.save(); rr(x, yy, 64, 50, 8); ctx.clip(); Art.creature(u.cr.parts, x + 20, yy + 22, 13, { still: true, noGlow: true, alpha: u.dead ? 0.35 : 1 }); ctx.restore();
        const hp = Math.max(0, u.st.hp - u.cr.dmg);
        txt(u.dead ? '✝' : String(Math.round(hp)), x + 48, yy + 18, 12, u.dead ? '#ff7a7a' : C.text);
        ctx.fillStyle = '#300'; ctx.fillRect(x + 6, yy + 42, 52, 4); ctx.fillStyle = C.toxic; ctx.fillRect(x + 6, yy + 42, 52 * hp / u.st.hp, 4);
      });
    }
    UI.draw(this.btns.filter(b => b !== this.bPause));
    UI.drawBtn(this.bPause);
  },
  drawPause() {
    ctx.fillStyle = 'rgba(10,5,16,0.8)'; ctx.fillRect(0, 0, W, H);
    txt(t('pause'), W / 2, 200, 28, C.text);
    UI.draw(this.pauseBtns);
  },
  drawEnd() {
    ctx.fillStyle = 'rgba(10,5,16,0.82)'; ctx.fillRect(0, 0, W, H);
    panel(30, 150, 300, 350, C.panel, 16);
    if (this.phase === 'lost') {
      Art.icon('skull', W / 2, 220, 70);
      txt(this.run.endless ? t('endless_over') : t('crypt_fell'), W / 2, 290, 20, '#ff9a9a');
      txtWrap(this.run.endless ? t('endless_score', { n: this.run.wave }) : t('lost_tip'), W / 2, 330, 250, 13, C.dim);
    } else {
      const r = this.result;
      txt(t('night_won', { n: r.n }), W / 2, 185, 22, C.toxic);
      for (let i = 0; i < 3; i++) { const on = i < r.stars; const k = clamp((time - (this.resT || (this.resT = time))) * 2 - i * 0.5, 0, 1); Art.icon(on && k > 0 ? 'star' : 'star0', W / 2 - 70 + i * 70, 245, 50 * (on ? 0.6 + ease(k) * 0.4 : 1)); }
      const lines = [t('star1'), t('star2') + (this.run.invaded ? ' ✗' : ' ✓'), t('star3') + (this.run.destroyed ? ' ✗' : ' ✓')];
      lines.forEach((l, i) => txt(l, W / 2, 292 + i * 20, 12, C.dim));
      Art.icon('soul', W / 2 - 40, 370, 26); txt('+' + r.souls, W / 2 - 22, 371, 20, C.toxic, 'left');
      txt(t('kills_n', { n: this.run.kills }), W / 2, 402, 12, C.dim);
    }
    UI.draw(this.endBtns);
  }
};

// ============================== Scène : Menu ==============================
// Bruit doux (somme de sinus) pour des animations organiques, sans saccades
const wobble = (t, a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.2;
// Torche murale en image : le corps reste fixe, la flamme (haut de l'image) ondule depuis sa base
const TORCH_CUT = 0.286;
function drawTorch(x, y, seed) {
  const im = Art.img('deco_torch'); if (!im) return false;
  const iw = im.naturalWidth, ih = im.naturalHeight, h = 58, s = h / ih, w = iw * s, y0 = y - h / 2 - 6;
  const cut = Math.round(ih * TORCH_CUT), ch = cut * s, t = time + seed * 3.7;
  const n1 = wobble(t, 5.3, 8.9, 14.7), n2 = wobble(t, 3.1, 6.7, 11.3);
  Art.glowAt(x, y0 + ch * 0.7, 44 + n1 * 4, 'rgba(125,255,74,' + (0.2 + n1 * 0.05).toFixed(3) + ')');
  ctx.drawImage(im, 0, cut, iw, ih - cut, x - w / 2, y0 + ch, w, h - ch);
  ctx.save(); ctx.translate(x, y0 + ch);
  ctx.transform(1, 0, n2 * 0.16, 1 + n1 * 0.1, 0, 0);
  ctx.drawImage(im, 0, 0, iw, cut, -w / 2, -ch, w, ch);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.1 + 0.12 * (n1 + 1) / 2;
  ctx.drawImage(im, 0, 0, iw, cut, -w / 2, -ch, w, ch);
  ctx.restore();
  return true;
}
// Phylactère en image : halo qui respire, reflet qui balaie la gemme, petites étincelles ; rouge quand la crypte est presque détruite
const sheenCv = document.createElement('canvas');
function drawCrystal(x, bottom, danger) {
  const im = Art.img('deco_crystal'); if (!im) return false;
  const gem = Art.img(danger ? 'deco_crystal_red' : 'deco_crystal_gem');
  const iw = im.naturalWidth, ih = im.naturalHeight, h = 72, s = h / ih, w = iw * s, x0 = x - w / 2, y0 = bottom - h * 0.87; // socle en perspective : le centre de sa base (87 % de l'image) pose sur le sol
  const p = (Math.sin(time * (danger ? 6 : 2.2)) + 1) / 2, gy = y0 + h * 0.34;
  Art.glowAt(x, gy, 40 + p * 8, danger ? 'rgba(255,60,40,' + (0.3 + p * 0.25).toFixed(3) + ')' : 'rgba(125,255,74,' + (0.22 + p * 0.16).toFixed(3) + ')');
  ctx.drawImage(im, x0, y0, w, h);
  if (gem) {
    if (danger) ctx.drawImage(gem, x0, y0, w, h);
    // reflet : une bande claire traverse la gemme toutes les 3,5 s
    const k = (time % 3.5) / 1.2;
    if (k < 1) {
      sheenCv.width = iw; sheenCv.height = ih; const g = sheenCv.getContext('2d');
      g.drawImage(gem, 0, 0); g.globalCompositeOperation = 'source-in';
      const bx = -iw + k * iw * 3, gr = g.createLinearGradient(bx, 0, bx + iw * 0.8, ih * 0.5);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, iw, ih);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; ctx.drawImage(sheenCv, x0, y0, w, h); ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.08 + p * 0.18; ctx.drawImage(gem, x0, y0, w, h); ctx.restore();
  }
  // étincelles qui scintillent sur les arêtes
  [[-0.32, 0.22, 0], [0.3, 0.38, 2.1], [0.05, 0.05, 4.2]].forEach(([dx, dy, ph]) => {
    const a = Math.max(0, Math.sin(time * 1.6 + ph)) ** 6; if (a < 0.02) return;
    const sx = x + dx * w, sy = y0 + dy * h, r = 2 + a * 3;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = danger ? '#ffd0c0' : '#f0ffe0';
    ctx.beginPath(); ctx.moveTo(sx, sy - r * 1.6); ctx.lineTo(sx + r * 0.35, sy - r * 0.35); ctx.lineTo(sx + r * 1.6, sy); ctx.lineTo(sx + r * 0.35, sy + r * 0.35);
    ctx.lineTo(sx, sy + r * 1.6); ctx.lineTo(sx - r * 0.35, sy + r * 0.35); ctx.lineTo(sx - r * 1.6, sy); ctx.lineTo(sx - r * 0.35, sy - r * 0.35); ctx.fill(); ctx.restore();
  });
  return true;
}
function bgNight(top, bot) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top || '#1d1030'); g.addColorStop(1, bot || '#0a0510');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // mur de crypte très assombri en fond, s'il existe
  const bgi = Art.img('bg_crypt');
  if (bgi) {
    const k = H / bgi.naturalHeight; ctx.globalAlpha = 0.28;
    ctx.drawImage(bgi, W / 2 - bgi.naturalWidth * k / 2, 0, bgi.naturalWidth * k, H); ctx.globalAlpha = 1;
  }
}
function graveyard(y) {
  ctx.fillStyle = '#0a0610';
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, y);
  for (let x = 0; x <= W; x += 30) ctx.lineTo(x, y + Math.sin(x * 0.05) * 8);
  ctx.lineTo(W, H); ctx.fill();
  [[40, 0], [110, 1], [250, 0], [320, 1]].forEach(([x, k]) => {
    if (Art.deco(k ? 'deco_cross' : 'deco_tomb', x, y - 14, 44)) return;
    ctx.fillStyle = '#1c1426'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    if (k) { ctx.fillRect(x - 3, y - 34, 6, 30); ctx.fillRect(x - 12, y - 26, 24, 6); ctx.strokeRect(x - 3, y - 34, 6, 30); }
    else { rr(x - 12, y - 30, 24, 32, 10); ctx.fill(); ctx.stroke(); }
  });
}
const DEMO = { back: { k: 'm_wings', r: 0 }, head: { k: 'g_head', r: 1 }, torso: { k: 'p_ribs', r: 0 }, arm0: { k: 'r_blade', r: 0 }, arm1: { k: 'm_hand', r: 0 }, legs: { k: 'r_legs', r: 0 }, core: { k: 'p_heart', r: 0 } };
// Écran de démarrage : illustration (bg_splash si présente), titre, chargement des images, puis « Touche pour commencer »
Scenes.splash = {
  enter() { this.t = 0; this.ready = false; },
  update(dt) { this.t += dt; if (!this.ready && (Art.progress() >= 1 || this.t > 10) && this.t > 0.6) { this.ready = true; this.readyT = this.t; } },
  up() { if (this.ready) { Sfx.play('tap'); go('menu'); } },
  draw() {
    const im = Art.img('bg_splash');
    if (im) {
      const k = Math.max(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k;
      ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(8,4,16,0.75)'); g.addColorStop(0.28, 'rgba(8,4,16,0)'); g.addColorStop(0.72, 'rgba(8,4,16,0)'); g.addColorStop(1, 'rgba(8,4,16,0.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else {
      bgNight();
      Art.glowAt(180, 330, 150, 'rgba(125,255,74,0.16)');
      if (Art.progress() >= 1) Art.creature(DEMO, 180, 330, 70, { t: time });
    }
    const a = Math.min(1, this.t * 1.5);
    ctx.globalAlpha = a;
    txt(t('title1'), W / 2, 78, 32, C.text, 'center', { sw: 7 });
    txt(t('title2'), W / 2, 116, 26, C.toxic, 'center', { sw: 6 });
    if (!this.ready) {
      const p = Art.progress();
      rr(80, 560, 200, 12, 6); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
      if (p > 0) { rr(82, 562, 196 * p, 8, 4); ctx.fillStyle = C.toxic; ctx.fill(); }
      txt(t('loading'), W / 2, 590, 12, C.dim);
    } else {
      ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin((this.t - this.readyT) * 3.5));
      txt(t('tap_start'), W / 2, 572, 18, C.bone, 'center', { sw: 5 });
    }
    ctx.globalAlpha = 1;
  }
};
Scenes.menu = {
  enter() {
    const has = Save.exists() && (S.tuto > 0 || S.cleared > 0);
    const bh = UI.bigH(52);
    this.btns = [
      UI.btn({ x: 70, y: 380, w: 220, h: bh, label: has ? t('continue') : t('play'), style: 'green', size: 19, on: () => this.play() }),
      UI.btn({ x: 70, y: 380 + bh + 12, w: 220, h: bh, icon: 'book', label: t('bestiary'), style: 'main', on: () => go('bestiary', { back: 'menu' }) }),
      UI.btn({ x: 70, y: 380 + (bh + 12) * 2, w: 220, h: bh, icon: 'gear', label: t('settings'), style: 'main', on: () => go('settings', { back: 'menu' }) })
    ];
    Sfx.Music.set('crypt');
  },
  play() {
    if (S.tuto === 0 && S.cleared === 0) { go('crypt', { night: 1 }); return; }
    if (S.tuto > 0 && S.tuto < 99) {
      if (S.tuto >= 3 && S.tuto <= 6) { go('atelier', { from: 'crypt' }); return; }
      go('crypt', S.run ? { resume: true } : { night: 1 }); return;
    }
    go('map');
  },
  update() {},
  draw() {
    bgNight();
    // lune
    Art.glowAt(305, 190, 60, 'rgba(200,255,180,0.15)');
    if (!Art.deco('deco_moon', 305, 190, 60)) {
      ctx.fillStyle = '#e8f5d8'; ctx.beginPath(); ctx.arc(305, 190, 24, 0, 7); ctx.fill();
      ctx.fillStyle = '#1b0f2c'; ctx.beginPath(); ctx.arc(316, 183, 21, 0, 7); ctx.fill();
    }
    graveyard(330);
    Art.glowAt(180, 250, 120, 'rgba(125,255,74,0.18)');
    Art.creature(DEMO, 180, 240, 52, { t: time });
    txt(t('title1'), W / 2, 70, 30, C.text, 'center', { sw: 6 });
    txt(t('title2'), W / 2, 106, 24, C.toxic, 'center', { sw: 5 });
    txt(t('tagline'), W / 2, 136, 12, C.dim);
    UI.draw(this.btns);
    txt('v1.0 · ' + t('no_ads'), W / 2, 628, 10, 'rgba(165,150,191,0.5)', 'center', { stroke: false });
  },
  down(p) { UI.down(this.btns, p); },
  up(p) { UI.up(this.btns, p); }
};

// ============================== Scène : Carte des nuits ==============================
const NODES = [[92, 512], [238, 476], [120, 432], [262, 392], [104, 348], [236, 306], [96, 264], [244, 222], [124, 178], [210, 128]];
Scenes.map = {
  enter() {
    this.sel = null;
    Hint.clear();
    const bw = 84, y = 566, bh = UI.bigH(46);
    this.btns = [
      UI.btn({ x: 4, y: 4, w: 46, h: 40, icon: 'back', style: 'dark', on: () => go('menu') }),
      UI.btn({ x: 6, y, w: bw, h: bh, icon: 'altar', label: '', sub: true, style: 'main', on: () => go('atelier', { from: 'map' }) }),
      UI.btn({ x: 94, y, w: bw, h: bh, icon: 'shop', label: '', sub: true, style: 'gold', on: () => go('shop'), badge: this.canBuy() ? '!' : null }),
      UI.btn({ x: 182, y, w: bw, h: bh, icon: 'book', label: '', sub: true, style: 'main', on: () => go('bestiary', { back: 'map' }) }),
      UI.btn({ x: 270, y, w: bw, h: bh, icon: 'gear', label: '', sub: true, style: 'main', on: () => go('settings', { back: 'map' }) })
    ];
    this.labels = [t('atelier'), t('shop'), t('bestiary'), t('settings')];
    this.goBtn = UI.btn({ x: 200, y: 0, w: 130, h: 46, label: t('defend'), style: 'green', on: () => this.launch() });
    this.resumeBtn = UI.btn({ x: 60, y: 54, w: 240, h: 40, label: '', style: 'gold', size: 14, on: () => go('crypt', { resume: true }), show: !!S.run });
    if (S.run) this.resumeBtn.label = S.run.endless ? t('resume_endless') : t('resume_night', { n: S.run.night });
    this.endlessBtn = UI.btn({ x: 60, y: 54, w: 240, h: 40, label: t('endless'), style: 'red', size: 14, on: () => go('crypt', { night: 10, endless: true }), show: S.titan && !S.run });
    if (S.cleared >= 10 && !S.titan && !S.run) { this.endlessBtn.show = true; this.endlessBtn.style = 'gold'; this.endlessBtn.label = t('build_titan'); this.endlessBtn.on = () => go('atelier', { titan: true }); }
    Sfx.Music.set('crypt');
  },
  canBuy() { return D.shop.some(it => S.cleared >= it.req && !this.owns(it) && S.souls >= it.cost && (!it.needs || this.owns(D.shop.find(o => o.id === it.needs)))); },
  owns(it) { return Scenes.shop.owns(it); },
  launch() { if (this.sel) go('crypt', { night: this.sel }); },
  update() {},
  draw() {
    bgNight('#1a1028', '#0c0714');
    // chemin
    this.drawPath();
    // cathédrale
    this.drawCathedral(300, 120);
    NODES.forEach((n, i) => this.drawNode(i + 1, n[0], n[1]));
    // barre du haut
    topBar(52);
    banner(t('map_title'), 172, 25, 14);
    soulPill(354, 25);
    this.btns[2].badge = this.canBuy() ? '!' : null;
    UI.draw(this.btns);
    this.btns.slice(1).forEach((b, i) => txt(this.labels[i], b.x + b.w / 2, b.y + b.h + 10, 11, C.text, 'center'));
    if (this.endlessBtn.show) { UI.drawBtn(this.endlessBtn); if (S.titan && S.endless) txt(t('best_n', { n: S.endless }), 180, 102, 10, C.dim); }
    if (S.run) UI.drawBtn(this.resumeBtn);
    if (this.sel) this.drawInfo();
  },
  // chemin de dalles entre les nuits ; les dalles déjà franchies sont éclairées en vert
  drawPath() {
    const st = Art.img('path_stone'), pts = [[NODES[0][0], NODES[0][1] + 44]].concat(NODES);
    let k = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round((len - 44) / 24));
      const lit = i - 1 <= S.cleared;
      for (let j = 0; j <= n; j++) {
        const f = (22 + j * (len - 44) / n) / len, x = lerp(x0, x1, f), y = lerp(y0, y1, f), h = Math.sin(++k * 12.9898) * 43758.5453 % 1;
        const rot = h * 0.8, rx = 7 + Math.abs(h) * 2, ry = 4.5 + Math.abs(h) * 1.2;
        if (st) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = lit ? 1 : 0.45; ctx.drawImage(st, -rx * 1.1, -ry * 1.1, rx * 2.2, ry * 2.2); ctx.restore(); continue; }
        ctx.save(); ctx.translate(x, y + 1.5); ctx.rotate(rot);
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill();
        ctx.translate(0, -1.5);
        ctx.fillStyle = lit ? '#6b6478' : '#3e3748'; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
        ctx.fillStyle = lit ? 'rgba(200,255,170,0.35)' : 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.5, ry * 0.35, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
    }
  },
  drawCathedral(x, y) {
    if (Art.img('deco_castle')) { Art.glowAt(x, y + 10, 30, S.titan ? 'rgba(125,255,74,0.4)' : 'rgba(255,240,180,0.35)'); Art.deco('deco_castle', x, y, 92); return; }
    ctx.fillStyle = '#2a2440'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 30, y + 30); ctx.lineTo(x - 30, y - 10); ctx.lineTo(x - 18, y - 40); ctx.lineTo(x - 6, y - 10); ctx.lineTo(x + 6, y - 10); ctx.lineTo(x + 18, y - 40); ctx.lineTo(x + 30, y - 10); ctx.lineTo(x + 30, y + 30); ctx.closePath(); ctx.fill(); ctx.stroke();
    Art.glowAt(x, y + 10, 20, S.titan ? 'rgba(125,255,74,0.4)' : 'rgba(255,240,180,0.5)');
    ctx.fillStyle = S.titan ? '#140b1e' : '#ffe9a0'; ctx.beginPath(); ctx.arc(x, y + 14, 8, Math.PI, 0); ctx.lineTo(x + 8, y + 30); ctx.lineTo(x - 8, y + 30); ctx.fill();
  },
  drawNode(n, x, y) {
    const open = n <= S.cleared + 1, done = S.cleared >= n, sel = this.sel === n;
    if (open && !done) Art.glowAt(x, y, 36 + Math.sin(time * 4) * 4, 'rgba(125,255,74,0.38)');
    if (sel) Art.glowAt(x, y, 34, 'rgba(242,240,255,0.35)');
    const r = sel ? 24 : 21, med = Art.img(done ? 'node_done' : open ? 'node_open' : 'node_lock');
    if (med) ctx.drawImage(med, x - r * 1.25, y - r * 1.25, r * 2.5, r * 2.5);
    else {
      // médaillon de pierre : anneau sombre, disque coloré, liseré os
      ctx.beginPath(); ctx.arc(x, y + 3, r, 0, 7); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#2a2236'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
      const g = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, r - 4);
      const cs = done ? ['#9dff6a', '#2f8a2a'] : open ? ['#b48ae0', '#4a2a78'] : ['#5a5262', '#2e2836'];
      g.addColorStop(0, cs[0]); g.addColorStop(1, cs[1]);
      ctx.beginPath(); ctx.arc(x, y, r - 4, 0, 7); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = sel ? C.toxic : (open ? C.bone : '#6a6272'); ctx.stroke();
    }
    if (open) txt(String(n), x, y + 1, sel ? 21 : 19, done ? '#f4ffe8' : C.bone, 'center', { sw: 5 }); else Art.icon('lock', x, y, 22);
    if (D.bosses[n]) { Art.icon('skull', x + 18, y - 16, 18); }
    const st = S.stars[n] || 0;
    if (done) for (let i = 0; i < 3; i++) Art.icon(i < st ? 'star' : 'star0', x - 16 + i * 16, y + 29 - (i === 1 ? 3 : 0), i === 1 ? 16 : 14);
  },
  drawInfo() {
    const n = this.sel, y = n > 5 ? 330 : 120;
    panel(20, y, 320, 150, 'rgba(36,22,58,0.97)', 14);
    txt(t('night_n', { n }) + (D.bosses[n] ? ' · ' + t('boss_' + D.bosses[n].id) : ''), 34, y + 22, 15, D.bosses[n] ? C.legend : C.text, 'left');
    txtWrap(t('night_desc_' + n), 34, y + 48, 290, 12, C.dim, 'left');
    const comp = D.nights[n - 1]; let hx = 40;
    Object.keys(comp).forEach(h => { Art.hero(h, hx, y + 142, 30, { t: time }); hx += 26; });
    txt(t('waves_info', { w: D.wavesPerNight, h: 4 + 2 * n }), 34, y + 92, 11, C.text, 'left', { stroke: false });
    this.goBtn.y = y + 94; this.goBtn.x = 200;
    UI.drawBtn(this.goBtn);
  },
  down(p) {
    if (this.sel && UI.down([this.goBtn], p)) return;
    if (UI.down(this.btns.concat([this.resumeBtn, this.endlessBtn].filter(b => b.show)), p)) return;
    this.press = p;
  },
  up(p) {
    if (UI.pressed) { UI.up(this.btns.concat([this.goBtn, this.resumeBtn, this.endlessBtn]), p); return; }
    const i = NODES.findIndex(n => dist(p.x, p.y, n[0], n[1]) < 30);
    if (i >= 0 && i + 1 <= S.cleared + 1) { this.sel = this.sel === i + 1 ? null : i + 1; Sfx.play('tap'); }
    else if (i >= 0) { Toast.show(t('locked_night')); Sfx.play('error'); }
    else if (this.sel) { const n = this.sel, y = n > 5 ? 330 : 120; if (p.y < y || p.y > y + 150) this.sel = null; }
  }
};

// ============================== Scène : Boutique ==============================
Scenes.shop = {
  enter() { this.scroll = 0; this.back = UI.btn({ x: 4, y: 4, w: 46, h: 40, icon: 'back', style: 'dark', on: () => go('map') }); },
  owns(it) {
    const [cat, id] = it.id.split('_');
    if (cat === 'trap') return !!S.owned.traps[id];
    if (cat === 'fluid') return !!S.owned.fluids[id];
    if (cat === 'altar') return S.owned.altar >= +id;
    if (cat === 'grim') return !!S.owned.grim[id];
    return false;
  },
  buy(it) {
    const [cat, id] = it.id.split('_');
    if (this.owns(it)) return;
    if (S.cleared < it.req) { Toast.show(t('need_night', { n: it.req })); Sfx.play('error'); return; }
    if (it.needs && !this.owns(D.shop.find(o => o.id === it.needs))) { Toast.show(t('need_prev')); Sfx.play('error'); return; }
    if (S.souls < it.cost) { Toast.show(t('not_enough')); Sfx.play('error'); return; }
    S.souls -= it.cost;
    if (cat === 'trap') S.owned.traps[id] = 1;
    if (cat === 'fluid') { S.owned.fluids[id] = 1; S.stock[id] = D.fluidStock; }
    if (cat === 'altar') S.owned.altar = +id;
    if (cat === 'grim') S.owned.grim[id] = 1;
    Sfx.play('coin'); vib(30); Toast.show(t('bought'), C.toxic); FX.spark(300, 24, C.toxic, 16, 100);
    Save.save();
  },
  items() { return D.shop; },
  rowY(i) { return 64 + i * 70 - this.scroll; },
  update() {},
  draw() {
    bgNight('#1f1226', '#0c0714');
    const list = this.items();
    ctx.save(); ctx.beginPath(); ctx.rect(0, 52, W, H - 52); ctx.clip();
    list.forEach((it, i) => {
      const y = this.rowY(i); if (y < -70 || y > H) return;
      const own = this.owns(it), locked = S.cleared < it.req;
      panel(8, y, 344, 62, own ? '#1d2a1d' : C.panel, 10);
      const [cat, id] = it.id.split('_');
      if (cat === 'trap') Art.trap(id, 40, y + 46, 34, false);
      else if (cat === 'fluid') Art.vial(id, 40, y + 31, 40);
      else if (cat === 'altar') Art.icon('altar', 40, y + 31, 40);
      else Art.icon('book', 40, y + 31, 36);
      txt(t('shop_' + it.id), 70, y + 18, 14, locked ? C.dim : C.text, 'left');
      txtWrap(locked ? t('need_night', { n: it.req }) : t('shopd_' + it.id), 70, y + 38, 190, 10, C.dim, 'left', 12);
      if (own) Art.icon('check', 320, y + 31, 30);
      else {
        const can = !locked && S.souls >= it.cost;
        rr(268, y + 14, 76, 34, 10); ctx.fillStyle = can ? C.toxicD : '#3a3044'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.stroke();
        Art.icon('soul', 286, y + 31, 18); txt(String(it.cost), 318, y + 32, 15, can ? C.text : C.dim);
      }
    });
    ctx.restore();
    topBar(52);
    banner(t('shop'), 172, 25, 17);
    soulPill(354, 25);
    UI.drawBtn(this.back);
  },
  maxScroll() { return Math.max(0, 64 + this.items().length * 70 - H + 10); },
  down(p) { if (UI.down([this.back], p)) return; this.press = { x: p.x, y: p.y, s0: this.scroll, moved: false }; },
  move(p) { if (!this.press) return; const dy = p.y - this.press.y; if (Math.abs(dy) > 8) this.press.moved = true; if (this.press.moved) this.scroll = clamp(this.press.s0 - dy, 0, this.maxScroll()); },
  up(p) {
    if (UI.pressed) { UI.up([this.back], p); return; }
    const pr = this.press; this.press = null; if (!pr || pr.moved) return;
    this.items().forEach((it, i) => { const y = this.rowY(i); if (p.y > y && p.y < y + 62 && p.x > 260) this.buy(it); });
  }
};

// ============================== Scène : Bestiaire / Grimoire ==============================
const HERO_LIST = ['peasant', 'warrior', 'rogue', 'mage', 'priest', 'paladin', 'captain', 'archmage', 'queen', 'highpriest', 'archangel'];
Scenes.bestiary = {
  enter(arg) { this.backTo = (arg && arg.back) || 'map'; this.tab = this.tab || 0; this.scroll = 0; this.back = UI.btn({ x: 4, y: 4, w: 46, h: 40, icon: 'back', style: 'dark', on: () => go(this.backTo) }); },
  update() {},
  rows() { return this.tab === 0 ? S.best.creatures.length : this.tab === 1 ? D.recipes.length : HERO_LIST.length; },
  rowH() { return this.tab === 1 ? 96 : 74; },
  draw() {
    bgNight('#1a1028', '#0c0714');
    const top = 92;
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, H - top); ctx.clip();
    const rh = this.rowH();
    if (this.tab === 0) {
      if (!S.best.creatures.length) txt(t('no_creature_yet'), W / 2, 200, 13, C.dim);
      S.best.creatures.forEach((c, i) => {
        const y = top + 6 + i * rh - this.scroll; if (y < top - rh || y > H) return;
        panel(8, y, 344, rh - 8, C.panel, 10);
        Art.creature(c.parts, 50, y + 26, 18, { still: true, noGlow: true });
        txt(c.name, 96, y + 20, 15, c.recipe ? C.legend : C.text, 'left');
        txt(['hp', 'str', 'mag', 'spd', 'def'].filter(k => c[k] !== undefined).map(k => t('st_' + k) + ' ' + Math.round(c[k])).join('  '), 96, y + 42, 11, C.dim, 'left', { stroke: false });
        if (c.recipe) txt(t('rc_' + c.recipe), 96, y + 56, 10, C.legend, 'left', { stroke: false });
      });
    } else if (this.tab === 1) {
      D.recipes.forEach((r, i) => {
        const y = top + 6 + i * rh - this.scroll; if (y < top - rh || y > H) return;
        const known = S.owned.grim[i] || S.best.recipes[r.id];
        panel(8, y, 344, rh - 8, known ? C.panel : '#1e1628', 10);
        const parts = {}; let ai = 0;
        Object.keys(r.need).forEach(k => { for (let n = 0; n < r.need[k]; n++) { const sl = D.pieces[k].slot; const key = sl === 'arm' ? 'arm' + (ai++) : sl; parts[key] = { k, r: 0 }; } });
        if (!parts.torso) parts.torso = { k: 'p_ribs', r: 0 };
        if (known) Art.creature(parts, 52, y + 34, 20, { still: true, noGlow: true });
        else Art.silhouette('rc_' + r.id, 52, y + 34, 100, 90, 50, 50, (x0, y0) => Art.creature(parts, x0, y0, 20, { still: true, noGlow: true }));
        txt(known ? t('rc_' + r.id) : '???', 100, y + 18, 15, known ? C.legend : C.dim, 'left');
        if (known) {
          const need = Object.keys(r.need).map(k => (r.need[k] > 1 ? r.need[k] + '× ' : '') + t('pc_' + k)).join(', ');
          txtWrap(need, 100, y + 38, 240, 10, C.text, 'left', 12);
          txtWrap(t('rcd_' + r.id), 100, y + 66, 240, 10, C.toxic, 'left', 12);
          if (S.best.recipes[r.id]) Art.icon('check', 336, y + 18, 20);
        } else txt(t('grim_hint'), 100, y + 42, 11, C.dim, 'left', { stroke: false });
      });
    } else {
      HERO_LIST.forEach((h, i) => {
        const y = top + 6 + i * rh - this.scroll; if (y < top - rh || y > H) return;
        const seen = S.best.heroes[h] !== undefined;
        panel(8, y, 344, rh - 8, C.panel, 10);
        if (seen) Art.hero(h, 46, y + 60, 46, { t: time }); else Art.silhouette('h_' + h, 46, y + 60, 90, 80, 45, 72, (x0, y0) => Art.hero(h, x0, y0, 46, { t: 0 }));
        txt(seen ? t('hero_' + h) : '???', 90, y + 22, 15, i >= 6 ? C.legend : C.text, 'left');
        if (seen) { txtWrap(t('herod_' + h), 90, y + 42, 250, 10, C.dim, 'left', 12); txt(t('kills_n', { n: S.best.heroes[h] }), 342, y + 22, 11, C.toxic, 'right'); }
      });
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(13,7,22,0.94)'; ctx.fillRect(0, 0, W, top);
    topBar(52);
    banner(t('bestiary'), 172, 25, 17);
    txt(t('made_n', { n: S.best.made }), 350, 25, 11, C.dim, 'right');
    [t('tab_creatures'), t('tab_grimoire'), t('tab_heroes')].forEach((l, i) => {
      const on = this.tab === i; rr(8 + i * 116, 52, 112, 34, 10); ctx.fillStyle = on ? C.violet : C.panel; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.stroke();
      txt(l, 64 + i * 116, 69, 13, on ? C.text : C.dim);
    });
    UI.drawBtn(this.back);
  },
  maxScroll() { return Math.max(0, this.rows() * this.rowH() + 100 - H + 10); },
  down(p) {
    if (UI.down([this.back], p)) return;
    if (p.y > 50 && p.y < 88) { this.tab = clamp(Math.floor((p.x - 8) / 116), 0, 2); this.scroll = 0; Sfx.play('tap'); return; }
    this.press = { y: p.y, s0: this.scroll };
  },
  move(p) { if (this.press) this.scroll = clamp(this.press.s0 - (p.y - this.press.y), 0, this.maxScroll()); },
  up(p) { if (UI.pressed) UI.up([this.back], p); this.press = null; }
};

// ============================== Scène : Broyeur (broyage en masse) ==============================
Scenes.grinder = {
  enter(arg) {
    this.from = (arg && arg.from) || 'map';
    this.slot = 'all'; this.rar = [true, true, false]; this.sel = new Set(); this.scroll = 0; this.press = null; this.confirm = -1e9;
    this.back = UI.btn({ x: 4, y: 4, w: 46, h: 40, icon: 'back', style: 'dark', on: () => go('atelier', { from: this.from }) });
    this.bAll = UI.btn({ x: 8, y: 538, w: 84, h: 38, label: t('gr_all'), size: 12, style: 'dark', on: () => { const l = this.list(); const allOn = l.every(p => this.sel.has(p.id)); l.forEach(p => allOn ? this.sel.delete(p.id) : this.sel.add(p.id)); } });
    this.bDup = UI.btn({ x: 98, y: 538, w: 108, h: 38, label: t('gr_dups'), size: 12, style: 'dark', on: () => this.selectDups() });
    this.bNone = UI.btn({ x: 212, y: 538, w: 140, h: 38, label: t('gr_none'), size: 12, style: 'dark', on: () => { this.sel.clear(); this.confirm = -1e9; } });
    this.bGo = UI.btn({ x: 8, y: 584, w: 344, h: 50, label: '', size: 15, style: 'red', on: () => this.grindSel() });
    this.btns = [this.back, this.bAll, this.bDup, this.bNone, this.bGo];
  },
  update() {},
  list() { return Logic.invSorted(this.slot).filter(p => this.rar[p.r]); },
  chosen() { return S.inv.filter(p => this.sel.has(p.id)); },
  // doublons : pour chaque type de pièce, garde le meilleur exemplaire (rareté, puis fluide) et sélectionne les autres
  selectDups() {
    const by = {};
    this.list().forEach(p => (by[p.k] = by[p.k] || []).push(p));
    let n = 0;
    Object.values(by).forEach(arr => {
      arr.sort((a, b) => (b.r - a.r) || ((b.fl ? b.fl.d : 0) - (a.fl ? a.fl.d : 0)));
      arr.slice(1).forEach(p => { this.sel.add(p.id); n++; });
    });
    if (!n) Toast.show(t('gr_no_dups'));
  },
  grindSel() {
    const ch = this.chosen(); if (!ch.length) return;
    if (ch.some(p => p.r >= 1) && time - this.confirm > 3) { this.confirm = time; Toast.show(t('gr_confirm'), C.legend); return; }
    let g = 0; ch.forEach(p => { g += D.grindSouls[p.r]; Logic.invRemove(p); });
    S.souls += g; this.sel.clear(); this.confirm = -1e9;
    Sfx.play('grind'); vib(40); FX.spark(W / 2, 600, C.bone, 30, 160); FX.text(W / 2, 560, '+' + g, C.toxic, 22);
    this.scroll = clamp(this.scroll, 0, this.maxScroll());
    Save.save();
  },
  GRID: { x: 8, y: 132, cols: 6, cell: 57, h: 396 },
  maxScroll() { const G = this.GRID; return Math.max(0, Math.ceil(this.list().length / G.cols) * G.cell - G.h); },
  draw() {
    bgNight('#1a1028', '#0c0714');
    const G = this.GRID, list = this.list();
    // grille
    ctx.save(); ctx.beginPath(); ctx.rect(0, G.y, W, G.h); ctx.clip();
    if (!list.length) txt(t('drawer_empty'), W / 2, G.y + 60, 13, C.dim);
    list.forEach((p, i) => {
      const x = G.x + (i % G.cols) * G.cell, y = G.y + Math.floor(i / G.cols) * G.cell - this.scroll;
      if (y < G.y - G.cell || y > G.y + G.h) return;
      const on = this.sel.has(p.id);
      rr(x + 2, y + 2, G.cell - 4, G.cell - 4, 8); ctx.fillStyle = on ? 'rgba(195,58,74,0.45)' : 'rgba(0,0,0,0.3)'; ctx.fill();
      ctx.lineWidth = on ? 3 : 2; ctx.strokeStyle = on ? '#ff6a7a' : [C.stoneD, C.rare, C.legend][p.r]; ctx.stroke();
      Art.piece(p, x + G.cell / 2, y + G.cell / 2, 40, { noGlow: true });
      if (p.fl) Art.vial(p.fl.t, x + G.cell - 11, y + G.cell - 13, 14);
      if (on) Art.icon('check', x + 14, y + 14, 16);
    });
    ctx.restore();
    const ms = this.maxScroll();
    if (ms > 0) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; const bh = G.h * G.h / (G.h + ms); ctx.fillRect(W - 5, G.y + (G.h - bh) * this.scroll / ms, 3, bh); }
    // en-tête et filtres
    ctx.fillStyle = 'rgba(13,7,22,0.94)'; ctx.fillRect(0, 0, W, G.y - 2);
    txt(t('grinder'), 180, 25, 19, C.text);
    Art.icon('soul', 312, 25, 22); txt(String(S.souls), 326, 26, 14, C.toxic, 'left');
    const tw = (W - 16) / TABS.length;
    TABS.forEach((tb, i) => {
      const on = this.slot === tb; rr(8 + i * tw + 1, 52, tw - 2, 32, 8); ctx.fillStyle = on ? C.violet : C.panel; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
      txt(tb === 'all' ? t('tab_all') : t('slot_' + tb), 8 + i * tw + tw / 2, 68, 10, on ? C.text : C.dim, 'center', { stroke: false });
    });
    [0, 1, 2].forEach(r => {
      const on = this.rar[r], x = 8 + r * 116; rr(x, 90, 112, 34, 8);
      ctx.fillStyle = on ? 'rgba(80,60,110,0.9)' : C.panel; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = on ? [C.bone, C.rare, C.legend][r] : C.ink; ctx.stroke();
      txt(t('rar_' + r), x + 56, 107, 12, on ? [C.text, C.rare, C.legend][r] : C.dim);
    });
    // barre d'actions
    ctx.fillStyle = 'rgba(13,7,22,0.94)'; ctx.fillRect(0, G.y + G.h + 2, W, H - G.y - G.h);
    const ch = this.chosen(), g = ch.reduce((a, p) => a + D.grindSouls[p.r], 0);
    this.bGo.off = !ch.length;
    this.bGo.label = ch.length ? (time - this.confirm < 3 ? t('sure') : t('gr_go', { n: ch.length, g })) : t('gr_pick');
    UI.draw(this.btns);
  },
  down(p) {
    if (UI.down(this.btns, p)) return;
    if (p.y >= 52 && p.y < 84) { const i = clamp(Math.floor((p.x - 8) / ((W - 16) / TABS.length)), 0, TABS.length - 1); this.slot = TABS[i]; this.scroll = 0; Sfx.play('tap'); return; }
    if (p.y >= 90 && p.y < 124) { const r = clamp(Math.floor((p.x - 8) / 116), 0, 2); this.rar[r] = !this.rar[r]; this.scroll = 0; Sfx.play('tap'); return; }
    const G = this.GRID;
    if (p.y >= G.y && p.y < G.y + G.h) this.press = { x: p.x, y: p.y, s0: this.scroll, moved: false };
  },
  move(p) {
    if (!this.press) return;
    if (Math.abs(p.y - this.press.y) > 8) this.press.moved = true;
    if (this.press.moved) this.scroll = clamp(this.press.s0 - (p.y - this.press.y), 0, this.maxScroll());
  },
  up(p) {
    if (UI.pressed) { UI.up(this.btns, p); return; }
    const pr = this.press; this.press = null;
    if (!pr || pr.moved) return;
    const G = this.GRID, col = Math.floor((p.x - G.x) / G.cell), row = Math.floor((p.y - G.y + this.scroll) / G.cell);
    if (col < 0 || col >= G.cols) return;
    const pc = this.list()[row * G.cols + col]; if (!pc) return;
    if (this.sel.has(pc.id)) this.sel.delete(pc.id); else this.sel.add(pc.id);
    this.confirm = -1e9; Sfx.play('tap');
  }
};

// ============================== Scène : Réglages ==============================
Scenes.settings = {
  enter(arg) {
    this.backTo = (arg && arg.back) || 'menu'; this.confirm = -1e9;
    this.back = UI.btn({ x: 4, y: 4, w: 46, h: 40, icon: 'back', style: 'dark', on: () => go(this.backTo, { resume: true }) });
    this.rows = [
      { k: 'lang', icon: 'flag' }, { k: 'sound', icon: 'sound' }, { k: 'music', icon: 'music' }, { k: 'vib', icon: 'vib' },
      { k: 'auto', icon: 'auto' }, { k: 'big', icon: 'big' }, { k: 'easy', icon: 'needle' }
    ];
  },
  update() {},
  rowY(i) { return 70 + i * 62; },
  draw() {
    bgNight();
    topBar(52);
    banner(t('settings'), 180, 25, 17);
    this.rows.forEach((r, i) => {
      const y = this.rowY(i);
      panel(10, y, 340, 54, C.panel, 10);
      Art.icon(r.icon, 38, y + 27, 30);
      txt(t('set_' + r.k), 64, y + 20, 15, C.text, 'left');
      txt(t('setd_' + r.k), 64, y + 39, 10, C.dim, 'left', { stroke: false });
      if (r.k === 'lang') { rr(262, y + 11, 78, 32, 10); ctx.fillStyle = C.violet; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.stroke(); txt(S.lang === 'fr' ? 'Français' : 'English', 301, y + 28, 12); }
      else {
        const on = S.set[r.k];
        rr(282, y + 13, 56, 28, 14); ctx.fillStyle = on ? C.toxicD : '#3a3044'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.stroke();
        ctx.beginPath(); ctx.arc(on ? 324 : 296, y + 27, 11, 0, 7); ctx.fillStyle = on ? C.toxic : C.dim; ctx.fill(); ctx.stroke();
      }
    });
    const y = this.rowY(this.rows.length) + 10;
    rr(90, y, 180, 44, 12); ctx.fillStyle = '#5a1a2a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    txt(time - this.confirm < 3 ? t('sure') : t('reset_save'), 180, y + 23, 14, '#ffc0c0');
    UI.drawBtn(this.back);
  },
  down(p) { if (UI.down([this.back], p)) return; },
  up(p) {
    if (UI.pressed) { UI.up([this.back], p); return; }
    this.rows.forEach((r, i) => {
      const y = this.rowY(i); if (p.y < y || p.y > y + 54) return;
      if (r.k === 'lang') S.lang = S.lang === 'fr' ? 'en' : 'fr';
      else S.set[r.k] = !S.set[r.k];
      if (r.k === 'music') Sfx.Music.apply();
      Sfx.play('tap'); vib(10); Save.save(); this.enter({ back: this.backTo });
    });
    const y = this.rowY(this.rows.length) + 10;
    if (p.y > y && p.y < y + 44 && p.x > 90 && p.x < 270) {
      if (time - this.confirm > 3) { this.confirm = time; Sfx.play('error'); }
      else { Save.reset(); Scenes.crypt.run = null; Toast.show(t('reset_done')); goNow('menu'); }
    }
  }
};

// ============================== Scène : Fin (le Titan d'Os) ==============================
Scenes.ending = {
  enter() { this.t = 0; this.broke = false; this.btn = UI.btn({ x: 80, y: 560, w: 200, h: 50, label: t('free_mode'), style: 'green', on: () => go('map'), show: false }); Sfx.Music.set('titan'); FX.clear(); },
  update(dt) {
    this.t += dt;
    const step = Math.floor(this.t / 0.8);
    if (this.t < 5 && step !== this.lastStep) { this.lastStep = step; FX.shake(3, 0.15); Sfx.play('hit'); vib(30); }
    if (this.t > 5.6 && !this.broke) { this.broke = true; FX.shake(14, 1); FX.flash = 1; Sfx.play('boom'); vib([100, 50, 200]); for (let i = 0; i < 30; i++) FX.spark(300, 380, pick(['#8a6a3a', '#ffe9a0', C.stone]), 2, 260, 1.2); }
    if (this.t > 9) this.btn.show = true;
  },
  draw() {
    bgNight('#140a22', '#060309');
    // ciel étoilé
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.3 * Math.sin(time * 2 + i)) + ')'; ctx.fillRect((i * 97) % W, (i * 53) % 300, 2, 2); }
    // cathédrale
    const cx = 300;
    ctx.fillStyle = '#2a2440'; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 80, 430); ctx.lineTo(cx - 80, 250); ctx.lineTo(cx - 50, 160); ctx.lineTo(cx - 20, 250); ctx.lineTo(cx + 20, 250); ctx.lineTo(cx + 50, 120); ctx.lineTo(cx + 80, 250); ctx.lineTo(cx + 80, 430); ctx.closePath(); ctx.fill(); ctx.stroke();
    Art.glowAt(cx, 360, this.broke ? 200 : 60, this.broke ? 'rgba(255,240,180,0.55)' : 'rgba(255,240,180,0.3)');
    if (!this.broke) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(cx - 30, 320, 60, 110); ctx.strokeRect(cx - 30, 320, 60, 110); ctx.beginPath(); ctx.moveTo(cx, 320); ctx.lineTo(cx, 430); ctx.stroke(); }
    else { ctx.fillStyle = '#fff6d0'; ctx.fillRect(cx - 30, 320, 60, 110); }
    // sol
    ctx.fillStyle = '#0d0716'; ctx.fillRect(0, 430, W, H - 430);
    // Titan
    const parts = S.titanDraft ? S.titanDraft.parts : DEMO;
    const k = clamp(this.t / 5.4, 0, 1);
    const x = lerp(-60, 196, k) + (this.t > 5.2 && this.t < 5.7 ? (this.t - 5.2) * 80 : 0);
    Art.creature(parts, x, 430 - 1.14 * 70, 70, { t: this.t, atk: this.t > 5.2 && this.t < 5.8 ? (this.t - 5.2) / 0.6 : 0, eye: '#d6ffb8' });
    if (this.t > 6.2) {
      const a = clamp((this.t - 6.2) / 1, 0, 1); ctx.globalAlpha = a;
      txtWrap(t('end_text'), W / 2, 80, 320, 18, C.text);
      ctx.globalAlpha = 1;
    }
    if (this.t > 8) { ctx.globalAlpha = clamp(this.t - 8, 0, 1); txtWrap(t('credits'), W / 2, 470, 320, 12, C.dim); ctx.globalAlpha = 1; }
    if (this.btn.show) UI.drawBtn(this.btn);
  },
  down(p) { if (this.btn.show) UI.down([this.btn], p); else if (this.t > 2) this.t = Math.max(this.t, 6.5); },
  up(p) { UI.up([this.btn], p); }
};

// ============================== Boucle principale ==============================
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (fade.dir === 1) { fade.t += dt * 5; if (fade.t >= 1) { fade.t = 1; fade.dir = -1; FX.clear(); Hint.clear(); goNow(fade.next, fade.arg); } }
  else if (fade.dir === -1) { fade.t -= dt * 5; if (fade.t <= 0) { fade.t = 0; fade.dir = 0; } }
  try {
    if (scene && scene.update) scene.update(dt);
    FX.update(dt); Toast.update(dt); Hint.update(dt);
    render();
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
function bandFill(x, y, w, h) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = '#0a0612'; ctx.fillRect(x, y, w, h);
  const bgi = Art.img('bg_crypt');
  if (bgi) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.globalAlpha = 0.18; const k = Math.max(w / bgi.naturalWidth, h / bgi.naturalHeight, cv.height / bgi.naturalHeight / 2); ctx.drawImage(bgi, x, y, bgi.naturalWidth * k, bgi.naturalHeight * k); ctx.restore(); }
  const g = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 40)); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, Math.min(h, 40));
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07040b'; ctx.fillRect(0, 0, cv.width, cv.height);
  let sx = 0, sy = 0; if (FX.shakeT > 0) { sx = rnd(-FX.shakeA, FX.shakeA); sy = rnd(-FX.shakeA, FX.shakeA); }
  const k = view.dpr * view.s;
  ctx.setTransform(k, 0, 0, k, view.dpr * view.ox + sx * k, view.dpr * view.oy + sy * k);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  if (scene) scene.draw();
  FX.draw(); Hint.draw(); Toast.draw();
  if (FX.flash > 0) { ctx.fillStyle = 'rgba(220,255,200,' + (FX.flash * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
  if (fade.t > 0) { ctx.fillStyle = 'rgba(7,4,11,' + fade.t + ')'; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  // écrans plus hauts/larges que 9:16 : on prolonge les bords de la scène au lieu de bandes noires
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const ox = Math.round(view.dpr * view.ox), oy = Math.round(view.dpr * view.oy), gw = Math.round(W * k), gh = Math.round(H * k);
  if (oy > 1) {
    // haut : la barre de titre se prolonge ; bas : fond sombre texturé
    ctx.drawImage(cv, ox, oy + 1, gw, 2, ox, 0, gw, oy + 1);
    bandFill(0, oy + gh, cv.width, cv.height - oy - gh);
  }
  if (ox > 1) { bandFill(0, 0, ox, cv.height); bandFill(ox + gw, 0, cv.width - ox - gw, cv.height); }
  // téléphone en paysage
  if (window.innerWidth > window.innerHeight * 1.15 && 'ontouchstart' in window) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = 'rgba(7,4,11,0.92)'; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.font = font(20); ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.fillText(t('rotate'), window.innerWidth / 2, window.innerHeight / 2);
  }
}

// Démarrage
Save.load();
try { const ql = new URLSearchParams(location.search).get('lang'); if (ql === 'fr' || ql === 'en') { S.lang = ql; Save.save(); } } catch (_) {}
resize();
document.title = t('title1') + ' ' + t('title2');
goNow(/[?&]nosplash/.test(location.search) ? 'menu' : 'splash');
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (scene === Scenes.crypt && Scenes.crypt.phase === 'wave') Scenes.crypt.paused = true; Save.save(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|anthropic|usercontent/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Accès de test (console) : window.NECRO
window.NECRO = { get S() { return S; }, Scenes, go: goNow, Logic, D, Art };
Scenes.icon = { draw() { ctx.fillStyle = '#140b1e'; ctx.fillRect(0, 0, W, H); Art.glowAt(180, 320, 200, 'rgba(125,255,74,0.35)'); Art.creature(DEMO, 180, 333, 128, { still: true, t: 0.4 }); } };
})();
