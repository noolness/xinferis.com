'use strict';
// Procedural loot: weapons, armor, implants.

const RARITIES = [
  { name: 'Common', color: 0xb8c0cc, css: '#b8c0cc', mult: 1.0, affixes: 0, value: 1, weight: 55 },
  { name: 'Uncommon', color: 0x5aff8a, css: '#5aff8a', mult: 1.15, affixes: 1, value: 2, weight: 28 },
  { name: 'Rare', color: 0x3fa0ff, css: '#3fa0ff', mult: 1.35, affixes: 2, value: 4, weight: 12 },
  { name: 'Epic', color: 0xb05aff, css: '#b05aff', mult: 1.6, affixes: 3, value: 8, weight: 4 },
  { name: 'Legendary', color: 0xff9a1a, css: '#ff9a1a', mult: 2.0, affixes: 4, value: 16, weight: 1 },
];

const WEAPON_BASES = [
  { base: 'pistol', names: ['Sidearm', 'Blaster', 'Hand Cannon'], dmg: 13, rate: 3.6, speed: 22, spread: 0.03, pellets: 1, pierce: 0, aoe: 0, color: 0x66ccff, size: 0.11, sfx: 'pistol' },
  { base: 'smg', names: ['Carbine', 'Autorifle', 'Needler'], dmg: 6, rate: 10, speed: 24, spread: 0.1, pellets: 1, pierce: 0, aoe: 0, color: 0x9aff6a, size: 0.08, sfx: 'smg' },
  { base: 'shotgun', names: ['Scattergun', 'Breacher', 'Flak Gun'], dmg: 7, rate: 1.5, speed: 19, spread: 0.32, pellets: 6, pierce: 0, aoe: 0, color: 0xffcc55, size: 0.08, sfx: 'shotgun' },
  { base: 'rail', names: ['Railgun', 'Lance', 'Accelerator'], dmg: 42, rate: 0.95, speed: 48, spread: 0, pellets: 1, pierce: 4, aoe: 0, color: 0xff66ff, size: 0.1, sfx: 'rail' },
  { base: 'launcher', names: ['Plasma Mortar', 'Ion Launcher', 'Fusion Lobber'], dmg: 30, rate: 0.85, speed: 13, spread: 0.02, pellets: 1, pierce: 0, aoe: 2.3, color: 0xff8a2a, size: 0.2, sfx: 'launcher' },
];

const MAKERS = ['Kessler', 'Helix', 'Ozymandias', 'Nakamura', 'Vantage', 'Black Lotus', 'Tyr Dynamics', 'Okonkwo-Reyes'];
const LEGENDARY_NAMES = ['Last Rites', 'Event Horizon', 'Widowmaker', 'The Quiet', 'Saint of Ash', 'Null Hymn', 'Requiem', 'Pale Lantern', 'Undertow'];

const AFFIXES = {
  dmg: { label: (v) => `+${Math.round(v * 100)}% Damage`, roll: (r, l) => r.range(0.06, 0.12) + l * 0.01 },
  rate: { label: (v) => `+${Math.round(v * 100)}% Fire Rate`, roll: (r) => r.range(0.06, 0.16) },
  crit: { label: (v) => `+${Math.round(v * 100)}% Crit Chance`, roll: (r) => r.range(0.04, 0.1) },
  lifesteal: { label: (v) => `${(v * 100).toFixed(1)}% Lifesteal`, roll: (r) => r.range(0.01, 0.03) },
  hp: { label: (v) => `+${Math.round(v)} Max Hull`, roll: (r, l) => Math.round(r.range(10, 20) + l * 3) },
  armor: { label: (v) => `+${Math.round(v)} Armor`, roll: (r, l) => Math.round(r.range(3, 7) + l * 1.2) },
  regen: { label: (v) => `+${v.toFixed(1)} Energy/s`, roll: (r) => r.range(1.5, 4) },
  speed: { label: (v) => `+${Math.round(v * 100)}% Move Speed`, roll: (r) => r.range(0.04, 0.1) },
  energy: { label: (v) => `+${Math.round(v)} Max Energy`, roll: (r, l) => Math.round(r.range(10, 25) + l * 2) },
  ability: { label: (v) => `+${Math.round(v * 100)}% Ability Power`, roll: (r) => r.range(0.1, 0.25) },
};
const WEAPON_AFFIX_POOL = ['dmg', 'dmg', 'rate', 'crit', 'crit', 'lifesteal', 'speed'];
const ARMOR_AFFIX_POOL = ['hp', 'hp', 'armor', 'regen', 'speed', 'energy', 'lifesteal'];
const IMPLANT_AFFIX_POOL = ['crit', 'regen', 'regen', 'energy', 'ability', 'ability', 'dmg', 'speed', 'lifesteal'];

let _itemId = 1;

function rollRarity(rng, luck = 0) {
  return rng.weighted(RARITIES.map((r, i) => [r, r.weight * (i === 0 ? Math.max(0.15, 1 - luck) : 1 + luck * i)]));
}

function rollAffixes(rng, pool, n, ilvl) {
  const out = [];
  const used = new Set();
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const k = rng.pick(pool);
    if (used.has(k)) continue;
    used.add(k);
    out.push({ k, v: AFFIXES[k].roll(rng, ilvl) });
  }
  return out;
}

function makeWeapon(rng, ilvl, rarity, baseKey) {
  const b = baseKey ? WEAPON_BASES.find((w) => w.base === baseKey) : rng.pick(WEAPON_BASES);
  rarity = rarity || rollRarity(rng);
  const scale = (1 + 0.2 * (ilvl - 1)) * rarity.mult * rng.range(0.92, 1.08);
  const model = rng.pick(b.names);
  const name = rarity.name === 'Legendary'
    ? `"${rng.pick(LEGENDARY_NAMES)}" ${model}`
    : `${rng.pick(MAKERS)} ${rng.pick(['Mk-', 'X', 'V', 'R-'])}${rng.int(1, 9)} ${model}`;
  return {
    id: _itemId++, kind: 'weapon', slot: 'weapon', base: b.base, name, rarity, ilvl,
    dmg: Math.round(b.dmg * scale * 10) / 10, rate: b.rate * rng.range(0.92, 1.08), speed: b.speed, spread: b.spread,
    pellets: b.pellets, pierce: b.pierce, aoe: b.aoe, color: b.color, size: b.size, sfx: b.sfx,
    affixes: rollAffixes(rng, WEAPON_AFFIX_POOL, rarity.affixes, ilvl),
  };
}

function makeArmor(rng, ilvl, rarity) {
  rarity = rarity || rollRarity(rng);
  const type = rng.pick(['Exosuit', 'Hardshell', 'Vacsuit', 'Carapace', 'Rig']);
  const name = rarity.name === 'Legendary' ? `"${rng.pick(LEGENDARY_NAMES)}" ${type}` : `${rng.pick(MAKERS)} ${rng.pick(['Light', 'Plated', 'Reinforced', 'Ablative', 'Sealed'])} ${type}`;
  return {
    id: _itemId++, kind: 'armor', slot: 'armor', name, rarity, ilvl,
    armor: Math.round((6 + ilvl * 3) * rarity.mult * rng.range(0.85, 1.15)),
    affixes: rollAffixes(rng, ARMOR_AFFIX_POOL, rarity.affixes, ilvl),
  };
}

function makeImplant(rng, ilvl, rarity) {
  rarity = rarity || rollRarity(rng);
  const type = rng.pick(['Neural Lace', 'Cortex Chip', 'Synapse Booster', 'Reflex Coil', 'Ghost Module']);
  const name = rarity.name === 'Legendary' ? `"${rng.pick(LEGENDARY_NAMES)}" ${type}` : `${rng.pick(MAKERS)} ${type}`;
  return {
    id: _itemId++, kind: 'implant', slot: 'implant', name, rarity, ilvl,
    affixes: rollAffixes(rng, IMPLANT_AFFIX_POOL, Math.max(1, rarity.affixes), ilvl),
  };
}

function makeRandomItem(rng, ilvl, luck = 0) {
  const rarity = rollRarity(rng, luck);
  const kind = rng.weighted([['weapon', 5], ['armor', 3], ['implant', 2]]);
  if (kind === 'weapon') return makeWeapon(rng, ilvl, rarity);
  if (kind === 'armor') return makeArmor(rng, ilvl, rarity);
  return makeImplant(rng, ilvl, rarity);
}

function itemValue(it) {
  return Math.round(8 * it.ilvl * it.rarity.value + 5);
}

function affixSum(it, k) {
  let s = 0;
  for (const a of it.affixes) if (a.k === k) s += a.v;
  return s;
}

function weaponDPS(w, stats) {
  const dmgMult = (stats ? stats.dmgMult : 1) * (1 + affixSum(w, 'dmg'));
  const rate = w.rate * (stats ? stats.rateMult : 1) * (1 + affixSum(w, 'rate'));
  const crit = (stats ? stats.crit : 0.05) + affixSum(w, 'crit');
  return w.dmg * w.pellets * dmgMult * rate * (1 + crit);
}

function itemTooltipHTML(it, equipped, stats) {
  const r = it.rarity;
  let h = `<div class="tt-name" style="color:${r.css}">${it.name}</div>`;
  h += `<div class="tt-sub">${r.name} ${it.kind === 'weapon' ? it.base.toUpperCase() : it.kind.toUpperCase()} · Item Level ${it.ilvl}</div>`;
  if (it.kind === 'weapon') {
    const dps = weaponDPS(it, stats);
    h += `<div class="tt-main">${it.dmg}${it.pellets > 1 ? ' × ' + it.pellets : ''} damage · ${it.rate.toFixed(1)}/s</div>`;
    if (it.pierce) h += `<div class="tt-line">Pierces ${it.pierce} targets</div>`;
    if (it.aoe) h += `<div class="tt-line">Blast radius ${it.aoe.toFixed(1)}m</div>`;
    let cmp = '';
    if (equipped && equipped !== it) {
      const d = dps - weaponDPS(equipped, stats);
      cmp = ` <span class="${d >= 0 ? 'up' : 'down'}">(${d >= 0 ? '+' : ''}${d.toFixed(0)})</span>`;
    }
    h += `<div class="tt-line">≈ ${dps.toFixed(0)} DPS${cmp}</div>`;
  } else if (it.kind === 'armor') {
    let cmp = '';
    if (equipped && equipped !== it) {
      const d = it.armor - equipped.armor;
      cmp = ` <span class="${d >= 0 ? 'up' : 'down'}">(${d >= 0 ? '+' : ''}${d})</span>`;
    }
    h += `<div class="tt-main">${it.armor} Armor${cmp}</div>`;
  }
  for (const a of it.affixes) h += `<div class="tt-affix">${AFFIXES[a.k].label(a.v)}</div>`;
  h += `<div class="tt-value">Scrap value: ${itemValue(it)} cr</div>`;
  return h;
}
