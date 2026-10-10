'use strict';

// ---------- Seeded RNG (mulberry32) ----------
function makeRNG(seed) {
  let a = seed >>> 0;
  const r = function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.weighted = (pairs) => {
    let total = 0;
    for (const p of pairs) total += p[1];
    let x = r() * total;
    for (const p of pairs) { if ((x -= p[1]) <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  };
  r.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return r;
}

// Runtime (non-deterministic) randomness for combat and loot rolls
const RND = makeRNG((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

// ---------- Procedural names & lore ----------
const NAMES = {
  shipPrefix: ['ISV', 'UCS', 'MSV', 'DSS', 'Hab-Station', 'Deepcore'],
  shipName: ['Erebus', 'Charon', 'Acheron', 'Styx', 'Lethe', 'Nyx', 'Thanatos', 'Hypnos', 'Moros', 'Keres',
    'Asphodel', 'Tartarus', 'Persephone', 'Orphne', 'Melinoe', 'Cocytus', 'Achlys'],
  first: ['Ana', 'Viktor', 'Lena', 'Oduya', 'Haruki', 'Mira', 'Teodor', 'Sana', 'Idris', 'Petra', 'Yusuf',
    'Ines', 'Kofi', 'Rhea', 'Malik', 'Juno', 'Elias', 'Noor', 'Dmitri', 'Ayla'],
  last: ['Okafor', 'Vasquez', 'Lindqvist', 'Tanaka', 'Mbeki', 'Novak', 'Reyes', 'Hale', 'Sorensen', 'Adeyemi',
    'Kowalski', 'Chen', 'Duarte', 'Ivanova', 'Halloran', 'Achebe', 'Moreau'],
};

const LORE = {
  kinds: ['Personal log', 'Maintenance report', 'Security bulletin', 'Medical note', 'Research journal',
    'Final transmission', 'Unsent message', 'Incident report'],
  bodies: [
    'The {thing} in {place} started {verb} again. {name} says it is just thermal stress. It is not.',
    'We sealed {place} after shift {num}. Something is still {verb} behind the bulkhead.',
    'Sample {code} has breached containment. If you are reading this, do not go to {place}.',
    'The drones stopped answering command codes at {time}. They answer to something else now.',
    '{name} has not slept in {num} days. Keeps drawing the same symbol on the walls of {place}.',
    'Reactor output is up {num}% with no load on the grid. The core is feeding something below us.',
    'I can hear the Signal through the hull. It knows my name. It knows all of our names.',
    'Escape pods {num} through {num2} launched empty. Who authorized that? Who is left to authorize anything?',
    'Biomass growth in {place} is now {num} meters. It responds to light. Keep your torch low.',
    'Override code for the lower decks: {code}. God help whoever needs it.',
    'The Warden units were built to keep us safe. Now they keep us in.',
    '{name} went down to {place} to reset the {thing}. Her suit beacon is still moving. She is not answering.',
    'Told command the {thing} readings were wrong. Told them twice. Nobody up there is listening anymore.',
    'The deeper decks are warmer. That should not be possible this far from the core.',
    'They are singing down there. All of them, together. I think it is calling it a choir.',
  ],
  things: ['coolant line', 'cryo array', 'hull plating', 'nav computer', 'hydro tanks', 'sensor mast', 'gravity ring', 'air scrubber'],
  places: ['Hydroponics', 'Cryo Bay {num}', 'Sublevel {num}', 'the Med Wing', 'Cargo Hold {num}', 'the Chapel', 'the Reactor Ring', 'the Observation Deck'],
  verbs: ['knocking', 'singing', 'breathing', 'moving', 'whispering', 'growing', 'scratching'],
  closers: ['- end of log -', '[RECORDING CORRUPTED]', '[SIGNAL LOST]', '...', '- {name}', '[AUDIO TRACK: 14 MIN OF STATIC]'],
};

function fillTemplate(str, rng) {
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    switch (key) {
      case 'name': return rng.pick(NAMES.first) + ' ' + rng.pick(NAMES.last);
      case 'thing': return rng.pick(LORE.things);
      case 'place': return fillTemplate(rng.pick(LORE.places), rng);
      case 'verb': return rng.pick(LORE.verbs);
      case 'num': return String(rng.int(2, 19));
      case 'num2': return String(rng.int(20, 40));
      case 'code': return rng.pick(['XK', 'V', 'Theta-', 'Omega-', 'NX-']) + rng.int(100, 999);
      case 'time': return String(rng.int(0, 23)).padStart(2, '0') + ':' + String(rng.int(0, 59)).padStart(2, '0');
      default: return key;
    }
  });
}

function makeLore(rng) {
  const author = rng.pick(NAMES.first) + ' ' + rng.pick(NAMES.last);
  const title = rng.pick(LORE.kinds) + ' // ' + author;
  const n = rng.int(1, 2);
  const lines = [];
  const pool = rng.shuffle(LORE.bodies.slice());
  for (let i = 0; i < n; i++) lines.push(fillTemplate(pool[i], rng));
  lines.push(fillTemplate(rng.pick(LORE.closers), rng));
  return { title, text: lines.join('\n\n') };
}

function makeStationName(rng) {
  return rng.pick(NAMES.shipPrefix) + ' ' + rng.pick(NAMES.shipName);
}

// ---------- Synth audio ----------
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null;
  const last = {};

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      startAmbient();
    } catch (e) { ctx = null; }
  }

  function startAmbient() {
    const g = ctx.createGain(); g.gain.value = 0.05;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    [41, 41.3, 61.7].forEach((fr) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start();
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 80;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    f.connect(g); g.connect(master);
  }

  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, f0, f1, type = 'lowpass', delay = 0) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function play(name) {
    if (!ctx) return;
    const now = performance.now();
    if (last[name] && now - last[name] < 35) return;
    last[name] = now;
    switch (name) {
      case 'pistol': tone('square', 880, 180, 0.09, 0.07); noise(0.06, 0.08, 4000, 800); break;
      case 'smg': tone('square', 1200, 300, 0.05, 0.05); noise(0.04, 0.06, 5000, 1200); break;
      case 'shotgun': noise(0.22, 0.25, 2500, 150); tone('sawtooth', 200, 50, 0.18, 0.08); break;
      case 'rail': tone('sawtooth', 2400, 120, 0.35, 0.09); tone('sine', 90, 40, 0.3, 0.2); break;
      case 'launcher': tone('triangle', 300, 80, 0.25, 0.15); noise(0.15, 0.08, 1200, 200); break;
      case 'enemyShot': tone('sawtooth', 520, 140, 0.14, 0.05); break;
      case 'hit': noise(0.05, 0.08, 3000, 600, 'bandpass'); break;
      case 'crit': tone('square', 1500, 700, 0.08, 0.06); noise(0.06, 0.1, 5000, 1000, 'bandpass'); break;
      case 'kill': tone('sawtooth', 300, 40, 0.3, 0.08); noise(0.25, 0.12, 1500, 100); break;
      case 'explode': noise(0.6, 0.35, 1800, 60); tone('sine', 120, 30, 0.5, 0.3); break;
      case 'hurt': tone('sawtooth', 160, 60, 0.2, 0.15); noise(0.1, 0.1, 900, 200); break;
      case 'pickup': tone('sine', 660, 1320, 0.12, 0.08); break;
      case 'loot': tone('sine', 520, 1040, 0.12, 0.08); tone('sine', 780, 1560, 0.15, 0.07, 0.08); break;
      case 'legendary': [0, 0.08, 0.16, 0.24].forEach((d, i) => tone('triangle', 440 * (1 + i * 0.25), 880 * (1 + i * 0.25), 0.25, 0.08, d)); break;
      case 'levelup': [0, 0.1, 0.2].forEach((d, i) => tone('square', 330 * (i + 2), 660 * (i + 2), 0.2, 0.06, d)); break;
      case 'dash': noise(0.18, 0.12, 600, 3000, 'bandpass'); break;
      case 'emp': tone('sine', 60, 900, 0.4, 0.2); noise(0.5, 0.2, 6000, 300, 'highpass'); break;
      case 'heal': tone('sine', 400, 800, 0.4, 0.1); tone('sine', 600, 1200, 0.4, 0.06, 0.1); break;
      case 'interact': tone('square', 1000, 1000, 0.04, 0.04); tone('square', 1500, 1500, 0.04, 0.04, 0.05); break;
      case 'deny': tone('square', 200, 150, 0.15, 0.08); break;
      case 'elevator': tone('sawtooth', 60, 200, 1.2, 0.15); noise(1.2, 0.08, 300, 1500); break;
      case 'boss': tone('sawtooth', 50, 35, 1.5, 0.3); tone('sawtooth', 75, 52, 1.5, 0.2); break;
    }
  }
  return { init, play };
})();
