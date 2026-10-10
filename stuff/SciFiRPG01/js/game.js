'use strict';
// NULL DESCENT - main game: rendering, entities, combat, UI.

const $ = (id) => document.getElementById(id);

// ---------------- Renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x050608);
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
let viewSize = 10;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(1, 1.05, 1).normalize().multiplyScalar(60);
const camTarget = new THREE.Vector3();

function resize() {
  const a = window.innerWidth / window.innerHeight;
  camera.left = -viewSize * a; camera.right = viewSize * a;
  camera.top = viewSize; camera.bottom = -viewSize;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const ov = $('overlay');
  ov.width = window.innerWidth * Math.min(window.devicePixelRatio, 2);
  ov.height = window.innerHeight * Math.min(window.devicePixelRatio, 2);
}
window.addEventListener('resize', resize);

// Lights
const hemi = new THREE.HemisphereLight(0x5a6890, 0x0a0a12, 0.75);
scene.add(hemi);
const playerLight = new THREE.PointLight(0x9fb4ff, 0.9, 7, 1.5);
scene.add(playerLight);
const flashlight = new THREE.SpotLight(0xe6eeff, 1.9, 18, 0.55, 0.55, 1.2);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.camera.near = 0.3;
flashlight.shadow.camera.far = 20;
flashlight.shadow.bias = -0.002;
scene.add(flashlight, flashlight.target);
const flashFx = new THREE.PointLight(0xffaa55, 0, 9, 2);
scene.add(flashFx);
const FIXTURE_LIGHTS = 6;
const fixtureLights = [];
for (let i = 0; i < FIXTURE_LIGHTS; i++) {
  const l = new THREE.PointLight(0xffffff, 0, 10, 2);
  l.userData = { base: 0, f: null };
  scene.add(l);
  fixtureLights.push(l);
}

// Particles (single instanced mesh)
const PMAX = 500;
const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
pMesh.frustumCulled = false;
const _d = new THREE.Object3D();
const _c = new THREE.Color();
_d.scale.set(0, 0, 0); _d.updateMatrix();
for (let i = 0; i < PMAX; i++) { pMesh.setMatrixAt(i, _d.matrix); pMesh.setColorAt(i, _c.set(0xffffff)); }
scene.add(pMesh);
const particles = [];
const freeP = [];
for (let i = PMAX - 1; i >= 0; i--) freeP.push(i);

function spawnParticles(x, y, z, color, count, speed = 4, life = 0.5, size = 0.08, gravity = 9) {
  for (let n = 0; n < count && freeP.length; n++) {
    const i = freeP.pop();
    const a = RND() * Math.PI * 2, u = RND() * 2 - 1;
    const s = speed * (0.3 + RND() * 0.7);
    const h = Math.sqrt(1 - u * u);
    particles.push({ i, x, y, z, vx: Math.cos(a) * h * s, vy: Math.abs(u) * s + speed * 0.3, vz: Math.sin(a) * h * s, life: life * (0.5 + RND() * 0.5), max: life, size: size * (0.6 + RND() * 0.8), gravity });
    pMesh.setColorAt(i, _c.set(color));
  }
  pMesh.instanceColor.needsUpdate = true;
}

function updateParticles(dt) {
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    p.life -= dt;
    if (p.life <= 0) {
      _d.position.set(0, -100, 0); _d.scale.set(0, 0, 0); _d.updateMatrix();
      pMesh.setMatrixAt(p.i, _d.matrix);
      freeP.push(p.i);
      particles.splice(k, 1);
      continue;
    }
    p.vy -= p.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    const s = p.size * (p.life / p.max);
    _d.position.set(p.x, p.y, p.z); _d.scale.set(s, s, s); _d.rotation.set(p.life * 7, p.life * 5, 0); _d.updateMatrix();
    pMesh.setMatrixAt(p.i, _d.matrix);
  }
  _d.rotation.set(0, 0, 0);
  pMesh.instanceMatrix.needsUpdate = true;
}

// ---------------- Definitions ----------------
const ENEMY_DEFS = {
  crawler: { name: 'Crawler', hp: 24, dmg: 8, speed: 4.4, radius: 0.38, xp: 8, range: 0.95, atkCd: 0.8, melee: true, make: makeCrawler },
  husk: { name: 'Husk', hp: 50, dmg: 14, speed: 2.7, radius: 0.4, xp: 14, range: 1.1, atkCd: 1.2, melee: true, make: makeHusk },
  drone: { name: 'Seeker Drone', hp: 30, dmg: 9, speed: 3.2, radius: 0.4, xp: 12, range: 8.5, atkCd: 1.8, keep: 5.5, projSpeed: 9, burst: 1, make: makeDrone },
  sentinel: { name: 'Sentinel', hp: 125, dmg: 10, speed: 1.9, radius: 0.6, xp: 35, range: 9.5, atkCd: 2.6, keep: 6, projSpeed: 10, burst: 3, make: makeSentinel },
  warden: { name: 'WARDEN-9', hp: 1000, dmg: 14, speed: 2.1, radius: 1.1, xp: 450, range: 14, atkCd: 1, projSpeed: 8, boss: true, make: makeWarden },
  choir: { name: 'THE CHOIR', hp: 1900, dmg: 15, speed: 0, radius: 1.7, xp: 1500, range: 16, atkCd: 1, projSpeed: 7, boss: true, make: makeChoir },
};
const ELITE_COLORS = { Armored: 0xffd040, Swift: 0x40ffd0, Volatile: 0xff6a20, Vampiric: 0xff2a8a };

const G = {
  state: 'title', seedStr: '', seed: 0, depth: 1, time: 0, runTime: 0,
  deck: null, level: null, levelRoot: null,
  enemies: [], projectiles: [], pickups: [], fx: [], texts: [],
  explored: null, visitedRooms: new Set(), boss: null,
  flow: null, flowKey: -1, shake: 0, kills: 0, bigMap: false,
  focus: { x: 0, z: 0 }, lightT: 0, revealT: 0, mapT: 0, titleT: 0,
};

const keys = {};
const mouse = { x: 0, y: 0, down: false, world: new THREE.Vector3() };

// ---------------- Player ----------------
const playerMesh = makePlayerModel();
playerMesh.visible = false;
scene.add(playerMesh);

function newPlayer() {
  const rng = makeRNG(G.seed + 1);
  const p = {
    x: 0, z: 0, radius: 0.32, facing: 0, aimAng: 0,
    hp: 100, energy: 100, level: 1, xp: 0, points: 0,
    attrs: { vit: 0, pow: 0, tech: 0 },
    credits: 0, medkits: 2,
    inventory: [], equip: { weapon: makeWeapon(rng, 1, RARITIES[0], 'pistol'), armor: makeArmor(rng, 1, RARITIES[0]), implant: null },
    fireCd: 0, dashT: 0, dashCd: 0, empCd: 0, medCd: 0, invuln: 0, dashDir: [0, 0], walk: 0, stats: null, hurtFlash: 0,
  };
  p.stats = computeStats(p);
  p.hp = p.stats.maxHp; p.energy = p.stats.maxEnergy;
  return p;
}

function computeStats(p) {
  const a = p.attrs;
  const s = {
    maxHp: 100 + (p.level - 1) * 8 + a.vit * 12,
    maxEnergy: 100 + a.tech * 10,
    regen: 9 + a.tech * 0.8,
    dmgMult: 1 + a.pow * 0.07,
    crit: 0.05 + a.pow * 0.01,
    lifesteal: 0, rateMult: 1, armor: 0, speed: 5.2,
    abilityMult: 1 + a.tech * 0.06,
  };
  for (const slot of ['weapon', 'armor', 'implant']) {
    const it = p.equip[slot];
    if (!it) continue;
    if (it.kind === 'armor') s.armor += it.armor;
    for (const af of it.affixes) {
      // weapon-local damage/rate/crit are applied when firing
      if (it.kind === 'weapon' && (af.k === 'dmg' || af.k === 'rate' || af.k === 'crit')) continue;
      switch (af.k) {
        case 'dmg': s.dmgMult += af.v; break;
        case 'rate': s.rateMult += af.v; break;
        case 'crit': s.crit += af.v; break;
        case 'lifesteal': s.lifesteal += af.v; break;
        case 'hp': s.maxHp += af.v; break;
        case 'armor': s.armor += af.v; break;
        case 'regen': s.regen += af.v; break;
        case 'speed': s.speed *= 1 + af.v; break;
        case 'energy': s.maxEnergy += af.v; break;
        case 'ability': s.abilityMult += af.v; break;
      }
    }
  }
  return s;
}

function refreshStats() {
  const p = G.player;
  const ratio = p.hp / p.stats.maxHp;
  p.stats = computeStats(p);
  p.hp = Math.min(p.stats.maxHp, Math.max(1, ratio * p.stats.maxHp));
  p.energy = Math.min(p.energy, p.stats.maxEnergy);
  const w = p.equip.weapon;
  playerMesh.userData.muzzle.material = Glow(w.color, 2);
}

const xpNext = (lvl) => Math.floor(40 * Math.pow(lvl, 1.6));

// ---------------- Deck loading ----------------
function unloadDeck() {
  if (!G.levelRoot) return;
  scene.remove(G.levelRoot);
  for (const e of G.enemies) for (const m of e.mesh.userData.flash || []) m.dispose();
  G.level.dispose();
  G.levelRoot = null;
}

function loadDeck(depth, preview = false) {
  unloadDeck();
  G.depth = depth;
  G.deck = generateDeck(G.seed, depth);
  G.level = buildDeckScene(G.deck);
  G.levelRoot = new THREE.Group();
  G.levelRoot.add(G.level.group);
  scene.add(G.levelRoot);
  G.enemies = []; G.projectiles = []; G.pickups = []; G.fx = []; G.texts = [];
  G.explored = new Uint8Array(G.deck.W * G.deck.H);
  G.visitedRooms = new Set();
  G.flowKey = -1; G.boss = null;
  for (const l of fixtureLights) { l.intensity = 0; l.userData.f = null; }
  const st = G.deck.start;
  G.focus.x = st.cx + 0.5; G.focus.z = st.cy + 0.5;
  camTarget.set(G.focus.x, 0, G.focus.z);
  if (preview) return;

  for (const s of G.deck.spawns) spawnEnemy(s.type, s.x, s.z, s.elite, s.eliteKind);
  if (G.deck.boss) G.boss = spawnEnemy(G.deck.boss.type, G.deck.boss.x, G.deck.boss.z, false);
  const p = G.player;
  p.x = st.cx + 0.5; p.z = st.cy + 1.5;
  p.fireCd = 0.3;
  camTarget.set(p.x, 0, p.z);
  $('bossbar').classList.add('hidden');
  updateDeckInfo();
  showDeckTitle();
  G.lightT = 0;
}

function updateDeckInfo() {
  const d = G.deck;
  $('deckinfo').innerHTML = `<div class="dim">${G.stationName}</div><div class="deck">DECK ${G.depth} / ${FINAL_DECK}</div><div>${d.name}${d.isBoss ? ' · <span style="color:#ff6a8a">HOSTILE SIGNAL</span>' : ''}</div>`;
  $('mapseed').textContent = 'SEED ' + G.seedStr;
}

function showDeckTitle() {
  $('dt-a').textContent = `DECK ${G.depth}`;
  $('dt-b').textContent = G.deck.name.toUpperCase();
  const el = $('decktitle');
  el.style.opacity = 1;
  clearTimeout(showDeckTitle.t);
  showDeckTitle.t = setTimeout(() => { el.style.opacity = 0; }, 2400);
}

// ---------------- Enemies ----------------
function spawnEnemy(type, x, z, elite, eliteKind) {
  const def = ENEMY_DEFS[type];
  const d = G.depth;
  const hpS = 1 + 0.38 * (d - 1), dmgS = 1 + 0.18 * (d - 1);
  const mesh = def.make(elite ? ELITE_COLORS[eliteKind] : null);
  const e = {
    type, def, x, z, hp: def.hp * hpS, dmg: def.dmg * dmgS, speed: def.speed * (0.9 + RND() * 0.2), radius: def.radius,
    mesh, aware: false, atkCd: RND() * def.atkCd, stun: 0, flash: 0, anim: RND() * 10, elite, eliteKind,
    facing: RND() * 6.28, burstLeft: 0, burstT: 0, alive: true, los: false, losT: RND() * 0.2, lunge: 0,
    strafe: RND() < 0.5 ? 1 : -1, patT: 2, xpMult: 1, name: def.name, summonT: 8, spiralT: 0, spiralA: 0,
  };
  if (elite) {
    e.hp *= 2.2; e.xpMult = 3; e.name = `${eliteKind} ${def.name}`;
    mesh.scale.multiplyScalar(1.2);
    if (eliteKind === 'Armored') { e.hp *= 1.5; e.armored = true; }
    if (eliteKind === 'Swift') { e.speed *= 1.5; e.def = Object.assign({}, def, { atkCd: def.atkCd * 0.7 }); }
    const ring = new THREE.Mesh(Geo.torus(0.55, 0.03, 3, 10), Basic(ELITE_COLORS[eliteKind]));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05;
    mesh.add(ring);
  }
  e.maxHp = e.hp;
  mesh.position.set(x, 0, z);
  mesh.rotation.y = e.facing;
  mesh.visible = false;
  G.levelRoot.add(mesh);
  G.enemies.push(e);
  return e;
}

function flowDir(e) {
  const d = G.deck, W = d.W;
  const cx = Math.floor(e.x), cz = Math.floor(e.z);
  const here = G.flow[cz * W + cx];
  let best = here < 0 ? 1e9 : here, bx = 0, bz = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const nx = cx + dx, nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= d.H) continue;
    const v = G.flow[nz * W + nx];
    if (v < 0) continue;
    if (dx && dz && (!walkable(d, cx + dx, cz) || !walkable(d, cx, cz + dz))) continue;
    if (v < best) { best = v; bx = nx + 0.5 - e.x; bz = nz + 0.5 - e.z; }
  }
  const l = Math.hypot(bx, bz);
  return l > 0.001 ? [bx / l, bz / l] : null;
}

function alertNear(x, z, r) {
  for (const o of G.enemies) if (!o.aware && dist2(o.x, o.z, x, z) < r * r && !o.def.boss) o.aware = true;
}

function updateEnemy(e, dt) {
  const p = G.player, deck = G.deck;
  const dx = p.x - e.x, dz = p.z - e.z;
  const d = Math.hypot(dx, dz) || 0.001;
  e.anim += dt;
  e.losT -= dt;
  if (e.losT <= 0) { e.losT = 0.12 + RND() * 0.1; e.los = d < 18 && hasLOS(deck, e.x, e.z, p.x, p.z); }
  e.mesh.visible = e.los || d < 2.5 || (e.def.boss && e.aware);

  if (e.flash > 0) {
    e.flash -= dt;
    const v = Math.max(0, e.flash) * 8;
    for (const m of e.mesh.userData.flash) m.emissive.setRGB(v, v, v);
  }
  if (!e.aware && e.los && d < (e.def.boss ? 12 : 10)) {
    e.aware = true;
    alertNear(e.x, e.z, 6);
    if (e.def.boss) {
      $('bossbar').classList.remove('hidden');
      $('bossname').textContent = e.name;
      SFX.play('boss');
      G.shake = Math.max(G.shake, 0.5);
      addLog(`${e.name} has detected you.`, '#ff6a8a');
    }
  }
  animateEnemy(e, dt, d);
  if (e.stun > 0) {
    e.stun -= dt;
    if (RND() < dt * 10) spawnParticles(e.x, 1, e.z, 0x39d0ff, 1, 2, 0.3, 0.06, 0);
    return;
  }
  if (!e.aware) return;
  if (e.def.boss) { updateBoss(e, dt, d, dx, dz); return; }

  const def = e.def;
  let mx = 0, mz = 0;
  if (def.melee) {
    if (d > def.range * 0.7) {
      if (e.los && d < 7) { mx = dx / d; mz = dz / d; } else { const f = flowDir(e); if (f) { mx = f[0]; mz = f[1]; } }
    }
  } else {
    if (!e.los || d > def.keep + 1) {
      const f = e.los ? [dx / d, dz / d] : flowDir(e);
      if (f) { mx = f[0]; mz = f[1]; }
    } else if (d < def.keep - 1.5) { mx = -dx / d; mz = -dz / d; }
    else { mx = (-dz / d) * e.strafe * 0.6; mz = (dx / d) * e.strafe * 0.6; if (RND() < dt * 0.4) e.strafe *= -1; }
  }
  // separation
  for (const o of G.enemies) {
    if (o === e || !o.alive) continue;
    const ox = e.x - o.x, oz = e.z - o.z;
    const rr = e.radius + o.radius;
    const dd = ox * ox + oz * oz;
    if (dd < rr * rr && dd > 0.0001) { const l = Math.sqrt(dd); mx += (ox / l) * 0.8; mz += (oz / l) * 0.8; }
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 0.01) {
    const sp = e.speed * (e.lunge > 0 ? 0.3 : 1) * dt / Math.max(1, ml);
    const blocked = moveEntity(deck, e, mx * sp, mz * sp, e.radius * 0.75);
    if (blocked && !def.melee) e.strafe *= -1;
    e.moving = true;
  } else e.moving = false;
  // keep out of the player
  if (d < e.radius + p.radius) {
    moveEntity(deck, e, (-dx / d) * (e.radius + p.radius - d), (-dz / d) * (e.radius + p.radius - d), e.radius * 0.75);
  }
  const target = e.los ? Math.atan2(dx, dz) : (ml > 0.01 ? Math.atan2(mx, mz) : e.facing);
  e.facing = turnToward(e.facing, target, dt * 8);

  e.atkCd -= dt;
  if (e.lunge > 0) e.lunge -= dt;
  if (def.melee) {
    if (d < def.range + p.radius && e.atkCd <= 0) {
      e.atkCd = def.atkCd;
      e.lunge = 0.25;
      damagePlayer(e.dmg, e);
    }
  } else {
    if (e.los && d < def.range && e.atkCd <= 0 && e.burstLeft <= 0) {
      e.atkCd = def.atkCd * (0.8 + RND() * 0.4);
      e.burstLeft = def.burst; e.burstT = 0;
    }
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = 0.14; e.burstLeft--;
        const lead = d / def.projSpeed * 0.5;
        const ang = Math.atan2(p.x + (p.vx || 0) * lead - e.x, p.z + (p.vz || 0) * lead - e.z) + (RND() - 0.5) * 0.12;
        fireEnemyBullet(e.x + Math.sin(ang) * e.radius, e.z + Math.cos(ang) * e.radius, ang, def.projSpeed, e.dmg, e.type === 'sentinel' ? 0xff5a1a : 0xff3030, 0.13, e);
        SFX.play('enemyShot');
      }
    }
  }
}

function turnToward(a, b, max) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + clamp(diff, -max, max);
}

function animateEnemy(e, dt, d) {
  const u = e.mesh.userData, t = e.anim;
  e.mesh.position.set(e.x, 0, e.z);
  e.mesh.rotation.y = e.facing;
  const walkRate = e.moving ? 1 : 0.15;
  switch (e.type) {
    case 'crawler':
      u.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 18 * walkRate + i * 1.7) * 0.5 * walkRate; });
      e.mesh.position.y = e.lunge > 0 ? Math.sin(e.lunge * 12) * 0.25 : 0;
      break;
    case 'husk':
      u.legL.rotation.x = Math.sin(t * 7) * 0.6 * walkRate;
      u.legR.rotation.x = -Math.sin(t * 7) * 0.6 * walkRate;
      u.armL.rotation.x = -0.6 + Math.sin(t * 3) * 0.2 - (e.lunge > 0 ? 1.4 : 0);
      u.armR.rotation.x = -0.4 + Math.cos(t * 3) * 0.2 - (e.lunge > 0 ? 1.6 : 0);
      break;
    case 'drone':
      u.hover.position.y = 1.1 + Math.sin(t * 3) * 0.12;
      u.ring.rotation.z += dt * 4;
      break;
    case 'sentinel':
    case 'warden':
      u.legL.rotation.x = Math.sin(t * 5) * 0.4 * walkRate;
      u.legR.rotation.x = -Math.sin(t * 5) * 0.4 * walkRate;
      if (u.ring) u.ring.rotation.z += dt * 2;
      break;
    case 'choir': {
      const pulse = 1 + Math.sin(t * 2.4) * 0.06;
      u.core.scale.set(pulse, pulse, pulse);
      u.core.rotation.y += dt * 0.3;
      u.orbit.rotation.y -= dt * 1.2;
      e.mesh.rotation.y = 0;
      break;
    }
  }
}

function fireEnemyBullet(x, z, ang, speed, dmg, color, size, src) {
  const mesh = new THREE.Mesh(Geo.ico(size, 0), Basic(color));
  mesh.position.set(x, 0.95, z);
  G.levelRoot.add(mesh);
  G.projectiles.push({ x, z, vx: Math.sin(ang) * speed, vz: Math.cos(ang) * speed, dmg, owner: 'enemy', life: 4, mesh, size, color, src });
}

function bulletRing(e, n, speed, offset, color = 0xff2a6a) {
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    fireEnemyBullet(e.x + Math.sin(a) * e.radius, e.z + Math.cos(a) * e.radius, a, speed, e.dmg, color, 0.17, e);
  }
  SFX.play('enemyShot');
}

function summonMinions(e, n) {
  let near = 0;
  for (const o of G.enemies) if (o.alive && !o.def.boss && dist2(o.x, o.z, e.x, e.z) < 100) near++;
  if (near > 8) return;
  for (let i = 0; i < n; i++) {
    const a = RND() * Math.PI * 2;
    const x = e.x + Math.sin(a) * (e.radius + 1.2), z = e.z + Math.cos(a) * (e.radius + 1.2);
    if (!canStand(G.deck, x, z, 0.3)) continue;
    const m = spawnEnemy(RND() < 0.6 ? 'crawler' : 'husk', x, z, false);
    m.aware = true; m.xpMult = 0.3; m.noLoot = true;
    spawnParticles(x, 0.5, z, 0xc04dff, 12, 3, 0.6);
  }
}

function updateBoss(e, dt, d, dx, dz) {
  const p = G.player;
  const enraged = e.hp < e.maxHp * 0.5;
  e.patT -= dt;
  e.summonT -= dt;
  if (e.type === 'warden') {
    if (e.charge > 0) {
      e.charge -= dt;
      moveEntity(G.deck, e, e.chargeDir[0] * 12 * dt, e.chargeDir[1] * 12 * dt, 0.6);
      if (RND() < 0.6) spawnParticles(e.x, 0.3, e.z, 0xff2a6a, 2, 2, 0.4);
      if (!e.chargeHit && d < e.radius + p.radius + 0.2) { e.chargeHit = true; damagePlayer(e.dmg * 2, e); G.shake = 0.6; }
      e.moving = true;
    } else if (e.windup > 0) {
      e.windup -= dt;
      e.moving = false;
      if (e.windup <= 0) { e.charge = 0.8; e.chargeHit = false; }
    } else {
      e.facing = turnToward(e.facing, Math.atan2(dx, dz), dt * 4);
      if (d > 4.5) {
        const f = e.los ? [dx / d, dz / d] : flowDir(e);
        if (f) moveEntity(G.deck, e, f[0] * e.speed * dt, f[1] * e.speed * dt, 0.6);
        e.moving = true;
      } else e.moving = false;
    }
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = 0.16; e.burstLeft--;
        const base = Math.atan2(dx, dz);
        for (let k = -2; k <= 2; k++) fireEnemyBullet(e.x, e.z, base + k * 0.16, 10, e.dmg, 0xff5a1a, 0.15, e);
        SFX.play('enemyShot');
      }
    }
    if (e.patT <= 0 && !(e.charge > 0) && !(e.windup > 0)) {
      const pats = enraged ? ['ring', 'burst', 'charge', 'ring2'] : ['ring', 'burst', 'charge'];
      const pat = pats[Math.floor(RND() * pats.length)];
      if (pat === 'ring') { bulletRing(e, 18, 7, RND() * 6); e.patT = 2.1; }
      if (pat === 'ring2') { bulletRing(e, 18, 7, 0); setTimeout(() => e.alive && bulletRing(e, 18, 7, Math.PI / 18), 350); e.patT = 2.4; }
      if (pat === 'burst') { e.burstLeft = 4; e.burstT = 0.3; e.patT = 2.2; }
      if (pat === 'charge') {
        e.windup = 0.6; e.chargeDir = [dx / d, dz / d]; e.facing = Math.atan2(dx, dz); e.patT = 2.2;
        addText(e.x, 4.6, e.z, '!', '#ff2a6a', 34, 0.6);
      }
      if (enraged) e.patT *= 0.75;
    }
    if (enraged && e.summonT <= 0) { e.summonT = 11; summonMinions(e, 3); addLog('WARDEN-9 calls for reinforcements.', '#ff6a8a'); }
  } else { // choir: stationary horror
    if (d < e.radius + p.radius) {
      const push = (e.radius + p.radius - d);
      moveEntity(G.deck, p, (dx / d) * push, (dz / d) * push, p.radius);
    }
    if (e.spiralT > 0) {
      e.spiralT -= dt;
      e.spiralCd = (e.spiralCd || 0) - dt;
      if (e.spiralCd <= 0) {
        e.spiralCd = enraged ? 0.07 : 0.09;
        e.spiralA += 0.31;
        const arms = enraged ? 3 : 2;
        for (let k = 0; k < arms; k++) {
          const a = e.spiralA + (k / arms) * Math.PI * 2;
          fireEnemyBullet(e.x + Math.sin(a) * 1.6, e.z + Math.cos(a) * 1.6, a, 6, e.dmg * 0.8, 0xd04dff, 0.16, e);
        }
      }
    }
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = 0.2; e.burstLeft--;
        const base = Math.atan2(dx, dz);
        for (let k = -3; k <= 3; k++) fireEnemyBullet(e.x + Math.sin(base) * 1.6, e.z + Math.cos(base) * 1.6, base + k * 0.13, 9, e.dmg, 0xff4dd2, 0.15, e);
        SFX.play('enemyShot');
      }
    }
    if (e.patT <= 0) {
      const pat = ['spiral', 'ring', 'fan', 'spiral'][Math.floor(RND() * 4)];
      if (pat === 'spiral') { e.spiralT = 2.6; e.patT = 3.4; }
      if (pat === 'ring') { bulletRing(e, 28, 5.5, RND() * 6, 0xd04dff); setTimeout(() => e.alive && bulletRing(e, 28, 5.5, RND() * 6, 0xd04dff), 500); e.patT = 2.4; }
      if (pat === 'fan') { e.burstLeft = 4; e.burstT = 0; e.patT = 2.4; }
      if (enraged) e.patT *= 0.7;
    }
    if (e.summonT <= 0) { e.summonT = enraged ? 8 : 12; summonMinions(e, enraged ? 4 : 2); }
  }
}

// ---------------- Combat ----------------
function damageEnemy(e, dmg, crit, kx, kz) {
  if (!e.alive) return;
  if (e.armored) dmg *= 0.75;
  e.hp -= dmg;
  e.flash = 0.12;
  if (!e.aware) { e.aware = true; alertNear(e.x, e.z, 7); if (e.def.boss) { $('bossbar').classList.remove('hidden'); $('bossname').textContent = e.name; } }
  if (!e.def.boss && (kx || kz)) moveEntity(G.deck, e, kx * 0.12, kz * 0.12, e.radius * 0.75);
  addText(e.x + (RND() - 0.5) * 0.4, 1.8 + RND() * 0.4, e.z, Math.round(dmg) + (crit ? '!' : ''), crit ? '#ffd040' : '#ffffff', crit ? 20 : 14, 0.8);
  spawnParticles(e.x, 0.8, e.z, e.type === 'drone' || e.type === 'sentinel' || e.type === 'warden' ? 0xffc060 : 0x8aff4a, crit ? 8 : 4, 3, 0.4);
  SFX.play(crit ? 'crit' : 'hit');
  const p = G.player;
  if (p.stats.lifesteal > 0) p.hp = Math.min(p.stats.maxHp, p.hp + dmg * p.stats.lifesteal);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.alive = false;
  G.levelRoot.remove(e.mesh);
  for (const m of e.mesh.userData.flash || []) m.dispose();
  G.kills++;
  const big = e.def.boss ? 3 : 1;
  spawnParticles(e.x, 0.6, e.z, e.type === 'husk' || e.type === 'crawler' || e.type === 'choir' ? 0x6aff3a : 0xffa040, 22 * big, 5 * big, 0.9, 0.12);
  spawnParticles(e.x, 0.6, e.z, 0x30343d, 10 * big, 4, 1.2, 0.15);
  SFX.play('kill');
  if (e.eliteKind === 'Volatile') {
    explode(e.x, e.z, 2.6, e.dmg * 1.6, 'enemy');
  }
  gainXP(Math.round(e.def.xp * e.xpMult * (1 + 0.25 * (G.depth - 1))));
  if (!e.noLoot) dropLoot(e);
  if (e.def.boss) {
    $('bossbar').classList.add('hidden');
    G.shake = 1;
    explode(e.x, e.z, 4, 0, 'player');
    if (e.type === 'choir') {
      addLog('The Signal falls silent.', '#e6c8ff');
      for (const o of G.enemies) if (o.alive) { o.alive = false; G.levelRoot.remove(o.mesh); spawnParticles(o.x, 0.6, o.z, 0xc04dff, 10, 3, 0.8); }
      setTimeout(victory, 3000);
    } else {
      addLog(`${e.name} destroyed. The descent lift is unlocked.`, '#5aff8a');
    }
  }
}

function explode(x, z, radius, dmg, owner) {
  spawnParticles(x, 0.5, z, 0xffa030, 30, 7, 0.7, 0.14);
  spawnParticles(x, 0.5, z, 0xffffff, 10, 5, 0.3, 0.1);
  spawnParticles(x, 0.3, z, 0x202020, 12, 3, 1.4, 0.2, 2);
  flashFx.position.set(x, 1.5, z); flashFx.intensity = 4;
  SFX.play('explode');
  G.shake = Math.max(G.shake, 0.35);
  addRingFx(x, z, radius, 0xffa030, 0.35);
  if (dmg <= 0) return;
  if (owner === 'player') {
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < radius + e.radius) {
        const p = G.player;
        const crit = RND() < p.stats.crit;
        damageEnemy(e, dmg * (1 - 0.5 * d / (radius + e.radius)) * (crit ? 2 : 1), crit, (e.x - x) / (d || 1) * 4, (e.z - z) / (d || 1) * 4);
      }
    }
  } else {
    const p = G.player;
    if (Math.hypot(p.x - x, p.z - z) < radius) damagePlayer(dmg, null);
  }
}

function addRingFx(x, z, radius, color, dur) {
  const m = new THREE.Mesh(Geo.torus(1, 0.06, 3, 24), Basic(color, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }).clone());
  m.rotation.x = Math.PI / 2; m.position.set(x, 0.3, z);
  G.levelRoot.add(m);
  G.fx.push({ mesh: m, t: 0, dur, update(f) { const s = 0.2 + f * radius; m.scale.set(s, s, s); m.material.opacity = 0.9 * (1 - f); } });
}

function damagePlayer(amount, src) {
  const p = G.player;
  if (p.invuln > 0 || G.state !== 'play') return;
  const s = p.stats;
  const dmg = amount * (1 - s.armor / (s.armor + 60));
  p.hp -= dmg;
  p.hurtFlash = 0.35;
  G.shake = Math.max(G.shake, 0.25);
  addText(p.x, 2, p.z, '-' + Math.round(dmg), '#ff4a5a', 16, 0.8);
  spawnParticles(p.x, 0.9, p.z, 0xff3040, 6, 3, 0.4);
  SFX.play('hurt');
  if (src && src.eliteKind === 'Vampiric') src.hp = Math.min(src.maxHp, src.hp + dmg);
  if (p.hp <= 0) { p.hp = 0; die(src); }
}

function gainXP(n) {
  const p = G.player;
  p.xp += n;
  let leveled = false;
  while (p.xp >= xpNext(p.level)) {
    p.xp -= xpNext(p.level);
    p.level++; p.points++;
    leveled = true;
  }
  if (leveled) {
    refreshStats();
    p.hp = p.stats.maxHp; p.energy = p.stats.maxEnergy;
    SFX.play('levelup');
    addLog(`Level ${p.level} reached. Systems upgrade available.`, '#ffb020');
    addRingFx(p.x, p.z, 3, 0xffb020, 0.6);
    spawnParticles(p.x, 0.5, p.z, 0xffb020, 30, 5, 1, 0.1, 3);
    setTimeout(() => { if (G.state === 'play' && G.player.points > 0) openLevelUp(); }, 400);
  }
}

// ---------------- Loot ----------------
function dropLoot(e) {
  const d = G.depth;
  const boss = e.def.boss, elite = e.elite;
  const creditChance = boss ? 1 : elite ? 1 : 0.55;
  if (RND() < creditChance) {
    const piles = boss ? 8 : elite ? 3 : 1;
    for (let i = 0; i < piles; i++) spawnPickup('credits', e.x, e.z, { amount: Math.round((4 + d * 3) * (0.6 + RND() * 0.8)) });
  }
  if (RND() < (boss ? 1 : 0.05)) spawnPickup('medkit', e.x, e.z);
  const itemChance = boss ? 1 : elite ? 0.7 : 0.1;
  if (RND() < itemChance) spawnPickup('item', e.x, e.z, { item: makeRandomItem(RND, d, elite ? 0.4 : 0) });
  if (boss) {
    spawnPickup('item', e.x, e.z, { item: makeRandomItem(RND, d + 1, 0.9) });
    spawnPickup('item', e.x, e.z, { item: makeWeapon(RND, d + 1, RARITIES[4]) });
  }
}

function spawnPickup(kind, x, z, data = {}) {
  const color = kind === 'item' ? data.item.rarity.color : 0xffd84a;
  const mesh = makePickupModel(kind, color);
  const a = RND() * Math.PI * 2, r = 0.3 + RND() * 0.8;
  let px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
  if (!walkable(G.deck, px, pz)) { px = x; pz = z; }
  mesh.position.set(px, 0, pz);
  G.levelRoot.add(mesh);
  const pk = Object.assign({ kind, x: px, z: pz, mesh, t: RND() * 6, delay: 0.35 }, data);
  G.pickups.push(pk);
  if (kind === 'item' && data.item.rarity.name === 'Legendary') SFX.play('legendary');
  return pk;
}

function updatePickups(dt) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.t += dt; pk.delay -= dt;
    pk.mesh.userData.spin.rotation.y += dt * 2;
    pk.mesh.userData.spin.position.y = 0.45 + Math.sin(pk.t * 3) * 0.08;
    const d = Math.hypot(p.x - pk.x, p.z - pk.z);
    if (pk.kind === 'credits' && d < 2.5 && pk.delay <= 0) { // magnet
      pk.x += (p.x - pk.x) * Math.min(1, dt * 8); pk.z += (p.z - pk.z) * Math.min(1, dt * 8);
      pk.mesh.position.set(pk.x, 0, pk.z);
    }
    if (d > 0.8 || pk.delay > 0) continue;
    if (pk.kind === 'credits') {
      p.credits += pk.amount;
      addText(p.x, 1.8, p.z, `+${pk.amount} cr`, '#ffd84a', 13, 0.7);
      SFX.play('pickup');
    } else if (pk.kind === 'medkit') {
      p.medkits++;
      addLog('Picked up a medkit.', '#ff6a7a');
      SFX.play('pickup');
    } else {
      if (p.inventory.length >= 16) {
        if (!pk.warned) { addLog('Inventory full. Scrap gear with right-click [I].', '#ff6a7a'); pk.warned = true; }
        continue;
      }
      p.inventory.push(pk.item);
      addLog(`Acquired: ${pk.item.name}`, pk.item.rarity.css);
      SFX.play('loot');
    }
    G.levelRoot.remove(pk.mesh);
    G.pickups.splice(i, 1);
  }
}

// ---------------- Player update ----------------
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.95);
const _ndc = new THREE.Vector2();

function updateAim() {
  _ndc.set((mouse.x / window.innerWidth) * 2 - 1, -(mouse.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  raycaster.ray.intersectPlane(aimPlane, mouse.world);
}

function updatePlayer(dt) {
  const p = G.player, s = p.stats, deck = G.deck;
  p.energy = Math.min(s.maxEnergy, p.energy + s.regen * dt);
  p.fireCd -= dt; p.dashCd -= dt; p.empCd -= dt; p.medCd -= dt; p.invuln -= dt; p.hurtFlash -= dt;

  const ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  let mx = (ix - iy) * Math.SQRT1_2, mz = (-ix - iy) * Math.SQRT1_2;
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }

  updateAim();
  const ax = mouse.world.x - p.x, az = mouse.world.z - p.z;
  p.aimAng = Math.atan2(ax, az);
  p.facing = turnToward(p.facing, p.aimAng, dt * 20);

  const ox = p.x, oz = p.z;
  if (p.dashT > 0) {
    p.dashT -= dt;
    moveEntity(deck, p, p.dashDir[0] * 19 * dt, p.dashDir[1] * 19 * dt, p.radius);
    spawnParticles(p.x, 0.7, p.z, 0x39d0ff, 2, 1, 0.3, 0.1, 0);
  } else if (ml > 0) {
    moveEntity(deck, p, mx * s.speed * dt, mz * s.speed * dt, p.radius);
  }
  p.vx = (p.x - ox) / Math.max(dt, 1e-4); p.vz = (p.z - oz) / Math.max(dt, 1e-4);
  const moving = Math.hypot(p.vx, p.vz) > 0.5;
  if (moving) p.walk += dt * 11;

  if (mouse.down && p.fireCd <= 0 && p.dashT <= 0) fire();

  // model
  playerMesh.position.set(p.x, 0, p.z);
  playerMesh.rotation.y = p.facing;
  const u = playerMesh.userData;
  const sw = moving ? Math.sin(p.walk) * 0.6 : 0;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.gun.position.z = 0.15 - Math.max(0, p.recoil || 0) * 0.15;
  p.recoil = (p.recoil || 0) - dt * 8;
  playerMesh.visible = p.invuln <= 0 || p.dashT > 0 || Math.floor(G.time * 20) % 2 === 0;

  // lights follow
  playerLight.position.set(p.x, 1.6, p.z);
  flashlight.position.set(p.x + Math.sin(p.facing) * 0.3, 1.5, p.z + Math.cos(p.facing) * 0.3);
  const aimD = clamp(Math.hypot(ax, az), 3, 10);
  flashlight.target.position.set(p.x + Math.sin(p.facing) * aimD, 0, p.z + Math.cos(p.facing) * aimD);

  // flow field for enemy pathing
  const key = Math.floor(p.z) * deck.W + Math.floor(p.x);
  if (key !== G.flowKey) {
    G.flowKey = key;
    G.flow = bfs(deck.grid, deck.solid, deck.W, deck.H, Math.floor(p.x), Math.floor(p.z), 40);
  }
  G.focus.x = p.x; G.focus.z = p.z;

  // room entry
  const rid = deck.roomId[key];
  if (rid >= 0 && !G.visitedRooms.has(rid)) {
    G.visitedRooms.add(rid);
    const r = deck.rooms[rid];
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) G.explored[y * deck.W + x] = 1;
    if (r.type !== 'start') addLog(`Entering ${ROOM_LABEL[r.type] || 'Compartment'}.`, '#6f7f90');
  }
}

function fire() {
  const p = G.player, s = p.stats, w = p.equip.weapon;
  const rate = w.rate * s.rateMult * (1 + affixSum(w, 'rate'));
  p.fireCd = 1 / rate;
  p.recoil = 1;
  const dmg = w.dmg * s.dmgMult * (1 + affixSum(w, 'dmg'));
  const crit = s.crit + affixSum(w, 'crit');
  const th = p.facing, sn = Math.sin(th), cs = Math.cos(th);
  const lx = 0.28, lz = 0.85;
  const mx = p.x + lx * cs + lz * sn, mz = p.z - lx * sn + lz * cs;
  let base = th;
  if (Math.hypot(mouse.world.x - p.x, mouse.world.z - p.z) > 1.6) base = Math.atan2(mouse.world.x - mx, mouse.world.z - mz);
  if (G.deck.grid[Math.floor(mz) * G.deck.W + Math.floor(mx)] !== TILE.FLOOR) return; // muzzle inside wall
  for (let i = 0; i < w.pellets; i++) {
    const ang = base + (RND() - 0.5) * 2 * w.spread;
    const sp = w.speed * (w.pellets > 1 ? 0.85 + RND() * 0.3 : 1);
    const mesh = new THREE.Mesh(w.base === 'rail' ? Geo.box(0.07, 0.07, 0.9) : Geo.ico(w.size, 0), Basic(w.color));
    mesh.position.set(mx, 0.97, mz);
    mesh.rotation.y = ang;
    G.levelRoot.add(mesh);
    G.projectiles.push({ x: mx, z: mz, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, dmg, crit, owner: 'player', life: w.base === 'launcher' ? 1.2 : 1.1, mesh, size: w.size, pierce: w.pierce, aoe: w.aoe, hit: new Set(), color: w.color });
  }
  spawnParticles(mx, 0.97, mz, w.color, 3, 2, 0.15, 0.06, 0);
  flashFx.position.set(mx, 1.2, mz); flashFx.intensity = Math.max(flashFx.intensity, 1.2); flashFx.color.set(w.color);
  SFX.play(w.sfx);
  if (w.base === 'shotgun' || w.base === 'rail') G.shake = Math.max(G.shake, 0.12);
}

function dash() {
  const p = G.player;
  if (p.dashCd > 0 || p.energy < 20) { if (p.energy < 20) SFX.play('deny'); return; }
  const ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  let dx = (ix - iy) * Math.SQRT1_2, dz = (-ix - iy) * Math.SQRT1_2;
  if (!dx && !dz) { dx = Math.sin(p.facing); dz = Math.cos(p.facing); }
  const l = Math.hypot(dx, dz);
  p.dashDir = [dx / l, dz / l];
  p.dashT = 0.17; p.invuln = 0.3; p.dashCd = 0.55; p.energy -= 20;
  SFX.play('dash');
}

function emp() {
  const p = G.player;
  if (p.empCd > 0 || p.energy < 45) { SFX.play('deny'); return; }
  p.energy -= 45; p.empCd = 6;
  const radius = 4.8;
  const dmg = (28 + p.level * 6) * p.stats.abilityMult;
  addRingFx(p.x, p.z, radius, 0x39d0ff, 0.45);
  spawnParticles(p.x, 0.6, p.z, 0x39d0ff, 40, 9, 0.5, 0.08, 0);
  flashFx.position.set(p.x, 1.5, p.z); flashFx.intensity = 4; flashFx.color.set(0x39d0ff);
  SFX.play('emp');
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < radius + e.radius) {
      e.stun = e.def.boss ? 0.6 : 2.2;
      damageEnemy(e, dmg, false, (e.x - p.x) / (d || 1) * 6, (e.z - p.z) / (d || 1) * 6);
    }
  }
  for (const pr of G.projectiles) if (pr.owner === 'enemy' && Math.hypot(pr.x - p.x, pr.z - p.z) < radius) pr.life = 0;
}

function useMedkit() {
  const p = G.player;
  if (p.medkits <= 0 || p.medCd > 0 || p.hp >= p.stats.maxHp) { SFX.play('deny'); return; }
  p.medkits--; p.medCd = 1;
  const heal = p.stats.maxHp * 0.45;
  p.hp = Math.min(p.stats.maxHp, p.hp + heal);
  addText(p.x, 2, p.z, '+' + Math.round(heal), '#5aff8a', 16, 0.9);
  spawnParticles(p.x, 0.5, p.z, 0x5aff8a, 20, 3, 0.8, 0.08, -2);
  SFX.play('heal');
}

// ---------------- Projectiles ----------------
function updateProjectiles(dt) {
  const p = G.player, deck = G.deck;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    pr.life -= dt;
    let dead = pr.life <= 0;
    const sp = Math.hypot(pr.vx, pr.vz);
    const steps = Math.max(1, Math.ceil(sp * dt / 0.25));
    for (let s = 0; s < steps && !dead; s++) {
      pr.x += pr.vx * dt / steps; pr.z += pr.vz * dt / steps;
      const cx = Math.floor(pr.x), cz = Math.floor(pr.z);
      if (cx < 0 || cz < 0 || cx >= deck.W || cz >= deck.H || deck.grid[cz * deck.W + cx] !== TILE.FLOOR) {
        dead = true;
        spawnParticles(pr.x - pr.vx * 0.01, 0.95, pr.z - pr.vz * 0.01, pr.color, 4, 2.5, 0.3, 0.06);
        if (pr.aoe) explode(pr.x - pr.vx * 0.02, pr.z - pr.vz * 0.02, pr.aoe, pr.dmg, 'player');
        break;
      }
      if (pr.owner === 'player') {
        for (const e of G.enemies) {
          if (!e.alive || pr.hit.has(e)) continue;
          const r = e.radius + pr.size + 0.1;
          if (dist2(pr.x, pr.z, e.x, e.z) < r * r) {
            if (pr.aoe) { explode(pr.x, pr.z, pr.aoe, pr.dmg, 'player'); dead = true; break; }
            const crit = RND() < pr.crit;
            pr.hit.add(e);
            damageEnemy(e, pr.dmg * (crit ? 2 : 1), crit, pr.vx / sp, pr.vz / sp);
            if (pr.pierce > 0) pr.pierce--; else { dead = true; break; }
          }
        }
      } else if (dist2(pr.x, pr.z, p.x, p.z) < (p.radius + pr.size) ** 2) {
        damagePlayer(pr.dmg, pr.src);
        dead = true;
      }
    }
    if (dead) { G.levelRoot.remove(pr.mesh); G.projectiles.splice(i, 1); continue; }
    pr.mesh.position.set(pr.x, 0.97, pr.z);
  }
}

// ---------------- Interactables ----------------
const INTERACT_LABEL = {
  crate: 'Open Supply Crate', terminal: 'Access Terminal', med: 'Use Med Station', fab: 'Use Fabricator',
};
let nearInteract = null;

function findInteractable() {
  const p = G.player;
  let best = null, bd = 1.7;
  for (const pr of G.deck.props) {
    if (!pr.interact) continue;
    if (pr.interact === 'crate' && pr.used) continue;
    const d = Math.hypot(pr.x + 0.5 - p.x, pr.y + 0.5 - p.z);
    const reach = pr.interact === 'elevator' ? 1.5 : bd;
    if (d < reach && d < bd + 0.01) { bd = d; best = pr; }
  }
  return best;
}

function updatePrompt() {
  nearInteract = findInteractable();
  const el = $('prompt');
  if (!nearInteract || G.state !== 'play') { el.classList.add('hidden'); return; }
  let label = INTERACT_LABEL[nearInteract.interact];
  if (nearInteract.interact === 'elevator') {
    label = bossAlive() ? '<span style="color:#ff6a8a">Lift locked: hostile signal on deck</span>' : (G.depth >= FINAL_DECK ? 'Lift offline' : `Descend to Deck ${G.depth + 1}`);
  }
  if (nearInteract.interact === 'med' && nearInteract.used) label = 'Med Station (depleted)';
  if (nearInteract.interact === 'terminal' && nearInteract.used) label = 'Re-read Terminal';
  el.innerHTML = `<b>[E]</b> ${label}`;
  el.classList.remove('hidden');
}

const bossAlive = () => G.boss && G.boss.alive;

function interact() {
  const pr = nearInteract;
  if (!pr || G.state !== 'play') return;
  const p = G.player;
  switch (pr.interact) {
    case 'crate': {
      pr.used = true;
      const u = pr.obj.userData;
      u.lid.rotation.x = -1.9;
      u.light.material = Glow(0x5aff8a, 2);
      SFX.play('interact');
      const wx = pr.x + 0.5, wz = pr.y + 0.5;
      const n = 1 + Math.floor(RND() * 2);
      for (let i = 0; i < n; i++) spawnPickup('credits', wx, wz, { amount: Math.round((5 + G.depth * 4) * (0.6 + RND())) });
      if (RND() < 0.45) spawnPickup('item', wx, wz, { item: makeRandomItem(RND, G.depth, 0.15) });
      if (RND() < 0.25) spawnPickup('medkit', wx, wz);
      break;
    }
    case 'terminal':
      openTerminal(pr);
      break;
    case 'med':
      if (pr.used) { SFX.play('deny'); addLog('Med station depleted.', '#6f7f90'); return; }
      pr.used = true;
      p.hp = p.stats.maxHp;
      for (const c of pr.obj.userData.cross) c.material = Mat(0x401018);
      addText(p.x, 2, p.z, 'HULL RESTORED', '#5aff8a', 15, 1.2);
      spawnParticles(p.x, 0.5, p.z, 0x5aff8a, 30, 3, 1, 0.08, -2);
      SFX.play('heal');
      break;
    case 'fab':
      openShop(pr);
      break;
    case 'elevator':
      if (bossAlive()) { SFX.play('deny'); addLog('The lift will not move while the hostile signal persists.', '#ff6a8a'); return; }
      if (G.depth >= FINAL_DECK) { SFX.play('deny'); return; }
      descend();
      break;
  }
}

function descend() {
  G.state = 'transition';
  SFX.play('elevator');
  $('fade').style.opacity = 1;
  setTimeout(() => {
    loadDeck(G.depth + 1);
    saveRecord();
    addLog(`Arrived at Deck ${G.depth}: ${G.deck.name}.`, '#39d0ff');
    $('fade').style.opacity = 0;
    G.state = 'play';
  }, 900);
}

// ---------------- Visibility / exploration ----------------
function revealAround() {
  const p = G.player, deck = G.deck, W = deck.W;
  const R = 8, RAYS = 72;
  for (let r = 0; r < RAYS; r++) {
    const a = (r / RAYS) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    for (let t = 0; t < R; t += 0.4) {
      const cx = Math.floor(p.x + dx * t), cz = Math.floor(p.z + dz * t);
      if (cx < 0 || cz < 0 || cx >= W || cz >= deck.H) break;
      const k = cz * W + cx;
      G.explored[k] = 1;
      if (deck.grid[k] !== TILE.FLOOR) break;
    }
  }
}

function updateWalls(dt) {
  const p = G.player, lv = G.level;
  const mesh = lv.wallMesh;
  let dirty = false;
  const m = new THREE.Matrix4();
  for (let i = 0; i < lv.walls.length; i++) {
    const w = lv.walls[i];
    const dx = w.x - p.x, dz = w.z - p.z;
    const front = dx + dz, side = Math.abs(dx - dz);
    const target = front > 0.2 && front < 6.5 && side < 4.5 ? 0.14 : 1;
    if (w.h !== target) {
      w.h += (target - w.h) * Math.min(1, dt * 9);
      if (Math.abs(w.h - target) < 0.01) w.h = target;
      m.makeScale(1, w.h, 1);
      m.setPosition(w.x, 0, w.z);
      mesh.setMatrixAt(i, m);
      dirty = true;
    }
  }
  if (dirty) mesh.instanceMatrix.needsUpdate = true;
}

function updateLights(dt) {
  G.lightT -= dt;
  const fx = G.focus.x, fz = G.focus.z;
  if (G.lightT <= 0) {
    G.lightT = 0.25;
    const sorted = G.deck.fixtures.slice().sort((a, b) => dist2(a.x, a.z, fx, fz) - dist2(b.x, b.z, fx, fz));
    for (let i = 0; i < FIXTURE_LIGHTS; i++) {
      const f = sorted[i], l = fixtureLights[i];
      if (!f || dist2(f.x, f.z, fx, fz) > 22 * 22) { l.userData.f = null; l.intensity = 0; continue; }
      if (l.userData.f !== f) { l.position.set(f.x, 2.4, f.z); l.color.set(f.color); l.userData.f = f; l.userData.seed = RND() * 100; }
    }
  }
  for (const l of fixtureLights) {
    const f = l.userData.f;
    if (!f) continue;
    let k = f.intensity;
    if (f.flicker) {
      const s = Math.sin(G.time * 13 + l.userData.seed) + Math.sin(G.time * 31 + l.userData.seed * 2);
      k *= s > 1.6 ? 0.1 : 0.85 + 0.15 * Math.sin(G.time * 50);
    }
    l.intensity = lerp(l.intensity, k, Math.min(1, dt * 20));
  }
  flashFx.intensity = Math.max(0, flashFx.intensity - dt * 14);
}

// ---------------- Main loop ----------------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now;
  G.time += dt;

  if (G.state === 'play') {
    G.runTime += dt;
    updatePlayer(dt);
    for (const e of G.enemies) if (e.alive) updateEnemy(e, dt);
    G.enemies = G.enemies.filter((e) => e.alive);
    updateProjectiles(dt);
    updatePickups(dt);
    G.revealT -= dt;
    if (G.revealT <= 0) { G.revealT = 0.15; revealAround(); }
    if (G.boss && G.boss.alive && !$('bossbar').classList.contains('hidden')) $('bossfill').style.width = (100 * G.boss.hp / G.boss.maxHp) + '%';
  }
  if (G.deck) {
    if (G.state === 'title') {
      G.titleT += dt * 0.08;
      const r = G.deck.rooms[Math.floor(G.titleT) % G.deck.rooms.length];
      const r2 = G.deck.rooms[(Math.floor(G.titleT) + 1) % G.deck.rooms.length];
      const f = G.titleT % 1, ease = f * f * (3 - 2 * f);
      G.focus.x = lerp(r.cx, r2.cx, ease) + 0.5; G.focus.z = lerp(r.cy, r2.cy, ease) + 0.5;
      camTarget.set(G.focus.x, 0, G.focus.z);
      flashlight.intensity = 0; playerLight.position.set(G.focus.x, 3, G.focus.z);
    } else if (G.player) {
      flashlight.intensity = 1.9;
      updateWalls(dt);
      const p = G.player;
      const look = 0.15;
      const tx = p.x + clamp(mouse.world.x - p.x, -6, 6) * look, tz = p.z + clamp(mouse.world.z - p.z, -6, 6) * look;
      const k = 1 - Math.exp(-dt * 7);
      camTarget.x += (tx - camTarget.x) * k; camTarget.z += (tz - camTarget.z) * k;
    }
    updateLights(dt);
    for (const o of G.level.animated) {
      const u = o.userData;
      if (u.spin) { u.spin.rotation.y += dt * 1.5; u.spin.rotation.x += dt * 0.7; }
      if (u.ring) u.ring.rotation.z += dt * (bossAlive() ? 0.2 : 1.5);
      if (u.beam) u.beam.material.opacity = bossAlive() ? 0.02 : 0.06 + Math.sin(G.time * 3) * 0.03;
      if (u.arm) u.arm.rotation.y = Math.sin(G.time * 1.3) * 0.8;
    }
  }
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    f.update(k);
    if (k >= 1) { G.levelRoot && G.levelRoot.remove(f.mesh); f.mesh.material.dispose(); G.fx.splice(i, 1); }
  }
  updateParticles(dt);

  G.shake = Math.max(0, G.shake - dt * 2.5);
  const sh = G.shake * G.shake * 0.6;
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.position.x += (RND() - 0.5) * sh; camera.position.y += (RND() - 0.5) * sh; camera.position.z += (RND() - 0.5) * sh;
  camera.lookAt(camTarget.x, 0, camTarget.z);

  renderer.render(scene, camera);
  drawOverlay(dt);
  if (G.player && G.state !== 'title') updateHUD(dt);
}

// ---------------- Overlay (health bars, floating text) ----------------
const ovCtx = $('overlay').getContext('2d');
const _v = new THREE.Vector3();
function toScreen(x, y, z) {
  _v.set(x, y, z).project(camera);
  return [(_v.x + 1) / 2 * window.innerWidth, (1 - _v.y) / 2 * window.innerHeight];
}

function addText(x, y, z, text, color, size = 14, dur = 0.8) {
  G.texts.push({ x, y, z, text, color, size, dur, t: 0 });
}

function drawOverlay(dt) {
  const c = ovCtx, dpr = Math.min(window.devicePixelRatio, 2);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!G.player || G.state === 'title') { G.texts.length = 0; return; }
  c.textAlign = 'center';
  // enemy bars
  for (const e of G.enemies) {
    if (!e.alive || !e.mesh.visible || e.def.boss) continue;
    if (e.hp >= e.maxHp && !e.elite) continue;
    const h = e.type === 'sentinel' ? 2.4 : e.type === 'drone' ? 1.8 : 1.4;
    const [sx, sy] = toScreen(e.x, h * (e.elite ? 1.2 : 1), e.z);
    const w = e.elite ? 54 : 38;
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(sx - w / 2 - 1, sy - 1, w + 2, 6);
    c.fillStyle = e.elite ? '#' + ELITE_COLORS[e.eliteKind].toString(16).padStart(6, '0') : '#ff3b4a';
    c.fillRect(sx - w / 2, sy, w * Math.max(0, e.hp / e.maxHp), 4);
    if (e.stun > 0) { c.fillStyle = '#39d0ff'; c.font = '11px "Share Tech Mono", monospace'; c.fillText('STUNNED', sx, sy + 16); }
    if (e.elite) {
      c.font = '12px "Share Tech Mono", monospace';
      c.fillStyle = '#' + ELITE_COLORS[e.eliteKind].toString(16).padStart(6, '0');
      c.fillText(e.name, sx, sy - 6);
    }
  }
  // item labels
  c.font = '11px "Share Tech Mono", monospace';
  const p = G.player;
  for (const pk of G.pickups) {
    if (pk.kind !== 'item' || dist2(pk.x, pk.z, p.x, p.z) > 64) continue;
    const [sx, sy] = toScreen(pk.x, 1.1, pk.z);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    const tw = c.measureText(pk.item.name).width;
    c.fillRect(sx - tw / 2 - 4, sy - 11, tw + 8, 15);
    c.fillStyle = pk.item.rarity.css;
    c.fillText(pk.item.name, sx, sy);
  }
  // floating text
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i];
    t.t += dt;
    if (t.t >= t.dur) { G.texts.splice(i, 1); continue; }
    const k = t.t / t.dur;
    const [sx, sy] = toScreen(t.x, t.y + k * 1.2, t.z);
    c.globalAlpha = 1 - k * k;
    c.font = `bold ${t.size}px "Share Tech Mono", monospace`;
    c.fillStyle = '#000'; c.fillText(t.text, sx + 1, sy + 1);
    c.fillStyle = t.color; c.fillText(t.text, sx, sy);
    c.globalAlpha = 1;
  }
}

// ---------------- HUD ----------------
const mapCtx = $('minimap').getContext('2d');
function drawMinimap() {
  const deck = G.deck, W = deck.W, H = deck.H, p = G.player;
  const cw = 190;
  const s = cw / Math.max(W, H);
  mapCtx.fillStyle = '#05070a';
  mapCtx.fillRect(0, 0, cw, cw);
  const fl = new THREE.Color(deck.theme.floor).multiplyScalar(2.6).getStyle();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!G.explored[k]) continue;
    const t = deck.grid[k];
    if (t === TILE.VOID) continue;
    mapCtx.fillStyle = t === TILE.WALL ? '#5a6678' : deck.solid[k] ? '#2a2f38' : fl;
    mapCtx.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
  }
  for (const pr of deck.props) {
    if (!pr.interact || !G.explored[pr.y * W + pr.x]) continue;
    const col = { crate: pr.used ? '#555' : '#ffc030', terminal: '#5aff8a', med: pr.used ? '#555' : '#ff3040', fab: '#39a0ff', elevator: '#39d0ff' }[pr.interact];
    mapCtx.fillStyle = col;
    const sz = pr.interact === 'elevator' ? 3 : 1.6;
    mapCtx.fillRect((pr.x + 0.5) * s - sz, (pr.y + 0.5) * s - sz, sz * 2, sz * 2);
  }
  mapCtx.fillStyle = '#ff3b4a';
  for (const e of G.enemies) if (e.alive && e.mesh.visible) mapCtx.fillRect(e.x * s - 1.5, e.z * s - 1.5, e.def.boss ? 5 : 3, e.def.boss ? 5 : 3);
  for (const pk of G.pickups) if (pk.kind === 'item' && G.explored[Math.floor(pk.z) * W + Math.floor(pk.x)]) { mapCtx.fillStyle = pk.item.rarity.css; mapCtx.fillRect(pk.x * s - 1, pk.z * s - 1, 2, 2); }
  // player arrow
  mapCtx.save();
  mapCtx.translate(p.x * s, p.z * s);
  mapCtx.rotate(-p.facing + Math.PI);
  mapCtx.fillStyle = '#ffffff';
  mapCtx.beginPath(); mapCtx.moveTo(0, -4); mapCtx.lineTo(3, 3); mapCtx.lineTo(-3, 3); mapCtx.closePath(); mapCtx.fill();
  mapCtx.restore();
}

function updateHUD(dt) {
  const p = G.player, s = p.stats;
  $('hpfill').style.width = (100 * p.hp / s.maxHp) + '%';
  $('hptxt').textContent = `${Math.ceil(p.hp)} / ${s.maxHp}`;
  $('enfill').style.width = (100 * p.energy / s.maxEnergy) + '%';
  $('entxt').textContent = `${Math.floor(p.energy)} / ${s.maxEnergy}`;
  $('xpfill').style.width = (100 * p.xp / xpNext(p.level)) + '%';
  $('lvl').textContent = 'L' + p.level;
  $('medcount').textContent = p.medkits;
  const cd = (id, v, max, off) => {
    const el = $(id);
    el.querySelector('.cd').style.height = (100 * clamp(v / max, 0, 1)) + '%';
    el.classList.toggle('off', off);
  };
  cd('ab-dash', p.dashCd, 0.55, p.energy < 20);
  cd('ab-emp', p.empCd, 6, p.energy < 45);
  cd('ab-med', p.medCd, 1, p.medkits <= 0);
  const w = p.equip.weapon;
  $('stats').innerHTML = `<b style="color:${w.rarity.css}">${w.name}</b><br>Credits <b style="color:#ffd84a">${p.credits}</b> · Kills <b>${G.kills}</b>${p.points ? `<br><b style="color:#ffb020">${p.points} upgrade point${p.points > 1 ? 's' : ''} [U]</b>` : ''}`;
  $('vignette').style.opacity = Math.max(p.hurtFlash > 0 ? p.hurtFlash * 2 : 0, p.hp / s.maxHp < 0.3 ? 0.35 + Math.sin(G.time * 5) * 0.15 : 0);
  G.mapT -= dt;
  if (G.mapT <= 0) { G.mapT = 0.1; drawMinimap(); }
  updatePrompt();
}

const logEl = $('log');
function addLog(text, color = '#c8d4e0') {
  const d = document.createElement('div');
  d.textContent = text;
  d.style.color = color;
  logEl.prepend(d);
  while (logEl.children.length > 7) logEl.lastChild.remove();
  setTimeout(() => { d.style.opacity = 0; }, 6000);
  setTimeout(() => d.remove(), 7000);
}

// ---------------- Modals ----------------
let openModalId = null;
function openModal(id) {
  openModalId = id;
  $(id).classList.remove('hidden');
  if (G.state === 'play') G.state = 'modal';
  mouse.down = false;
}
function closeModal() {
  if (!openModalId) return;
  $(openModalId).classList.add('hidden');
  openModalId = null;
  $('tooltip').classList.add('hidden');
  if (G.state === 'modal') G.state = 'play';
}

function openLevelUp() {
  $('lvlnum').textContent = G.player.level;
  $('ptsleft').textContent = G.player.points;
  openModal('levelup');
}
function spendPoint(attr) {
  const p = G.player;
  if (p.points <= 0) return;
  p.points--;
  p.attrs[attr]++;
  const oldMax = p.stats.maxHp;
  refreshStats();
  p.hp += Math.max(0, p.stats.maxHp - oldMax);
  SFX.play('interact');
  if (p.points <= 0) closeModal(); else $('ptsleft').textContent = p.points;
}
document.querySelectorAll('#levelup .card').forEach((c) => c.addEventListener('click', () => spendPoint(c.dataset.attr)));

const KIND_ICON = { weapon: '⌐', armor: '⛨', implant: '◈' };
function showTooltip(html, ev) {
  const t = $('tooltip');
  t.innerHTML = html;
  t.classList.remove('hidden');
  const x = Math.min(ev.clientX + 16, window.innerWidth - t.offsetWidth - 8);
  const y = Math.min(ev.clientY + 16, window.innerHeight - t.offsetHeight - 8);
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
function bindTip(el, it) {
  el.addEventListener('mousemove', (ev) => showTooltip(itemTooltipHTML(it, it.slot && G.player.equip[it.slot], G.player.stats), ev));
  el.addEventListener('mouseleave', () => $('tooltip').classList.add('hidden'));
}

function renderInventory() {
  const p = G.player, s = p.stats;
  $('invcredits').textContent = p.credits + ' CR';
  const eq = $('equipslots');
  eq.innerHTML = '';
  for (const slot of ['weapon', 'armor', 'implant']) {
    const it = p.equip[slot];
    const d = document.createElement('div');
    d.className = 'slot';
    d.innerHTML = `<div class="sl">${slot.toUpperCase()}</div><div class="nm" style="color:${it ? it.rarity.css : '#555'}">${it ? it.name : '- empty -'}</div>`;
    if (it) bindTip(d, it);
    eq.appendChild(d);
  }
  const w = p.equip.weapon;
  $('statlist').innerHTML = [
    ['Level', `${p.level}  (VIT ${p.attrs.vit} · POW ${p.attrs.pow} · TECH ${p.attrs.tech})`],
    ['Max Hull', s.maxHp], ['Armor', `${s.armor} (−${Math.round(100 * s.armor / (s.armor + 60))}% dmg)`],
    ['Weapon DPS', weaponDPS(w, s).toFixed(0)], ['Crit Chance', Math.round(100 * (s.crit + affixSum(w, 'crit'))) + '%'],
    ['Lifesteal', (s.lifesteal * 100).toFixed(1) + '%'], ['Energy', `${s.maxEnergy} (+${s.regen.toFixed(1)}/s)`],
    ['Ability Power', Math.round(s.abilityMult * 100) + '%'], ['Move Speed', s.speed.toFixed(1)],
  ].map(([a, b]) => `${a} <b>${b}</b>`).join('<br>') + (p.points ? `<br><span style="color:#ffb020;cursor:pointer;pointer-events:auto" id="spendlink">▶ Spend ${p.points} upgrade point(s)</span>` : '');
  const sl = $('spendlink');
  if (sl) sl.onclick = () => { closeModal(); openLevelUp(); };
  const bp = $('backpack');
  bp.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const it = p.inventory[i];
    const d = document.createElement('div');
    if (!it) { d.className = 'cell empty'; bp.appendChild(d); continue; }
    d.className = 'cell';
    d.style.borderColor = it.rarity.css + '88';
    d.innerHTML = `<div class="ic" style="color:${it.rarity.css}">${KIND_ICON[it.kind]}</div><div style="color:${it.rarity.css}">${it.kind === 'weapon' ? it.base.toUpperCase() : it.kind.toUpperCase()}</div><div style="color:#6f7f90">iL${it.ilvl}</div>`;
    bindTip(d, it);
    d.addEventListener('click', () => {
      const old = p.equip[it.slot];
      p.equip[it.slot] = it;
      if (old) p.inventory[i] = old; else p.inventory.splice(i, 1);
      refreshStats();
      SFX.play('interact');
      $('tooltip').classList.add('hidden');
      renderInventory();
    });
    d.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const v = itemValue(it);
      p.credits += v;
      p.inventory.splice(i, 1);
      SFX.play('pickup');
      addLog(`Scrapped ${it.name} for ${v} cr.`, '#ffd84a');
      $('tooltip').classList.add('hidden');
      renderInventory();
    });
    bp.appendChild(d);
  }
}

function toggleInventory() {
  if (openModalId === 'inventory') { closeModal(); return; }
  if (openModalId || G.state !== 'play') return;
  renderInventory();
  openModal('inventory');
}

let shopProp = null;
function openShop(pr) {
  shopProp = pr;
  if (!pr.stock) {
    const d = G.depth;
    pr.stock = [
      { kind: 'medkit', price: 30 + d * 10 },
      { kind: 'item', item: makeWeapon(RND, d, rollRarity(RND, 0.5)) },
      { kind: 'item', item: makeArmor(RND, d, rollRarity(RND, 0.5)) },
      { kind: 'item', item: makeRandomItem(RND, d + 1, 0.7) },
    ];
    for (const s of pr.stock) if (s.item) s.price = itemValue(s.item) * 3;
  }
  renderShop();
  SFX.play('interact');
  openModal('shop');
}
function renderShop() {
  const p = G.player;
  $('shopcredits').textContent = p.credits + ' CR';
  const box = $('shopitems');
  box.innerHTML = '';
  shopProp.stock.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'shopitem' + (s.sold ? ' sold' : '');
    const name = s.kind === 'medkit' ? '<span style="color:#ff6a7a">✚ Medkit</span>' : `<span style="color:${s.item.rarity.css}">${KIND_ICON[s.item.kind]} ${s.item.name}</span>`;
    row.innerHTML = `<div>${name}</div>`;
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = s.sold ? 'SOLD' : `${s.price} CR`;
    b.disabled = !!s.sold;
    b.onclick = () => {
      if (s.sold) return;
      if (p.credits < s.price) { SFX.play('deny'); addLog('Insufficient credits.', '#ff6a7a'); return; }
      if (s.kind === 'item' && p.inventory.length >= 16) { SFX.play('deny'); addLog('Inventory full.', '#ff6a7a'); return; }
      p.credits -= s.price;
      if (s.kind === 'medkit') { p.medkits++; s.price = Math.round(s.price * 1.5); }
      else { p.inventory.push(s.item); s.sold = true; addLog(`Fabricated: ${s.item.name}`, s.item.rarity.css); }
      SFX.play('loot');
      renderShop();
    };
    row.appendChild(b);
    if (s.item) bindTip(row, s.item);
    box.appendChild(row);
  });
}

let termTyping = null;
function openTerminal(pr) {
  SFX.play('interact');
  $('termtitle').textContent = '> ' + pr.lore.title.toUpperCase();
  const txt = pr.lore.text;
  const el = $('termtext');
  el.textContent = '';
  let i = 0;
  clearInterval(termTyping);
  termTyping = setInterval(() => { i += 3; el.textContent = txt.slice(0, i) + (i < txt.length ? '█' : ''); if (i >= txt.length) clearInterval(termTyping); }, 16);
  let reward = '';
  if (!pr.used) {
    pr.used = true;
    const roll = RND();
    const deck = G.deck;
    if (roll < 0.4) {
      for (let k = 0; k < deck.W * deck.H; k++) if (deck.grid[k] !== TILE.VOID) G.explored[k] = 1;
      reward = '▶ Deck schematics downloaded to minimap.';
    } else if (roll < 0.75) {
      const c = 20 + G.depth * 12;
      G.player.credits += c;
      reward = `▶ Recovered ${c} credits from a crew account.`;
    } else if (roll < 0.9) {
      gainXP(Math.round(xpNext(G.player.level) * 0.25));
      reward = '▶ Combat data analyzed. Experience gained.';
    } else {
      reward = '▶ <span style="color:#ff6a7a">Security alert triggered. Drones inbound.</span>';
      setTimeout(() => {
        for (let k = 0; k < 2; k++) {
          const a = RND() * Math.PI * 2;
          const x = G.player.x + Math.cos(a) * 3, z = G.player.z + Math.sin(a) * 3;
          if (canStand(G.deck, x, z, 0.4)) { const e = spawnEnemy('drone', x, z, false); e.aware = true; spawnParticles(x, 1, z, 0xff3030, 10, 3, 0.5); }
        }
      }, 600);
    }
    pr.obj.userData.screen.material = Glow(0x2a8a4a, 0.8);
  }
  $('termreward').innerHTML = reward;
  openModal('terminal');
}

// ---------------- Run lifecycle ----------------
function randomSeedStr() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

function setSeed(str) {
  G.seedStr = (str || randomSeedStr()).toUpperCase().slice(0, 10);
  G.seed = hashString(G.seedStr);
  G.stationName = makeStationName(makeRNG(G.seed));
  $('seedinput').value = G.seedStr;
  $('stationname').textContent = `Distress beacon: ${G.stationName}`;
}

function showTitle() {
  G.state = 'title';
  G.player = null;
  playerMesh.visible = false;
  ['hud', 'gameover', 'victory'].forEach((id) => $(id).classList.add('hidden'));
  $('title').classList.remove('hidden');
  loadDeck(1, true);
  G.titleT = 0;
  const rec = loadRecord();
  $('record').textContent = rec ? `Deepest descent: Deck ${rec.depth}${rec.won ? ' · Signal silenced ' + rec.won + '×' : ''}` : '';
}

function startRun() {
  SFX.init();
  setSeed($('seedinput').value.trim() || G.seedStr);
  G.player = newPlayer();
  G.kills = 0; G.runTime = 0;
  playerMesh.visible = true;
  refreshStats();
  $('title').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('victory').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('log').innerHTML = '';
  $('fade').style.opacity = 1;
  G.state = 'transition';
  setTimeout(() => {
    loadDeck(1);
    $('fade').style.opacity = 0;
    G.state = 'play';
    addLog(`Docked with ${G.stationName}. No life signs detected.`, '#39d0ff');
    addLog('Find the descent lift on each deck. Something below is transmitting.', '#6f7f90');
  }, 650);
}

function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

function die(src) {
  G.state = 'dead';
  playerMesh.visible = false;
  spawnParticles(G.player.x, 0.8, G.player.z, 0xff3040, 40, 6, 1.2, 0.12);
  SFX.play('explode');
  saveRecord();
  closeModal();
  const p = G.player;
  $('deathsummary').innerHTML = `Killed on <span>Deck ${G.depth}</span>${src ? ` by a <span>${src.name}</span>` : ''}<br>
    Level <span>${p.level}</span> · Kills <span>${G.kills}</span> · Credits <span>${p.credits}</span> · Time <span>${fmtTime(G.runTime)}</span><br>
    Station <span>${G.stationName}</span> · Seed <span>${G.seedStr}</span>`;
  setTimeout(() => { $('gameover').classList.remove('hidden'); $('hud').classList.add('hidden'); }, 1200);
}

function victory() {
  if (G.state === 'dead') return;
  G.state = 'won';
  const rec = loadRecord() || { depth: 0, won: 0 };
  rec.won = (rec.won || 0) + 1;
  rec.depth = Math.max(rec.depth, FINAL_DECK);
  try { localStorage.setItem('nulldescent.record', JSON.stringify(rec)); } catch (e) { /* storage unavailable */ }
  const p = G.player;
  $('winsummary').innerHTML = `The Choir is silenced. ${G.stationName} drifts dark and quiet.<br>
    Level <span>${p.level}</span> · Kills <span>${G.kills}</span> · Time <span>${fmtTime(G.runTime)}</span> · Seed <span>${G.seedStr}</span>`;
  $('victory').classList.remove('hidden');
  $('hud').classList.add('hidden');
}

function loadRecord() {
  try { return JSON.parse(localStorage.getItem('nulldescent.record') || 'null'); } catch (e) { return null; }
}
function saveRecord() {
  const rec = loadRecord() || { depth: 0, won: 0 };
  if (G.depth > rec.depth) {
    rec.depth = G.depth;
    try { localStorage.setItem('nulldescent.record', JSON.stringify(rec)); } catch (e) { /* storage unavailable */ }
  }
}

// ---------------- Input ----------------
window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') { if (ev.code === 'Enter') startRun(); return; }
  keys[ev.code] = true;
  SFX.init();
  if (ev.code === 'Tab') ev.preventDefault();
  if (ev.code === 'Escape') {
    if (openModalId) closeModal();
    else if (G.state === 'play') { openModal('pause'); }
    return;
  }
  if (openModalId === 'levelup') {
    if (ev.code === 'Digit1') spendPoint('vit');
    if (ev.code === 'Digit2') spendPoint('pow');
    if (ev.code === 'Digit3') spendPoint('tech');
    return;
  }
  if (openModalId === 'terminal' && ev.code === 'KeyE') { closeModal(); return; }
  if (ev.code === 'KeyI' || ev.code === 'Tab') { toggleInventory(); return; }
  if (G.state !== 'play') return;
  switch (ev.code) {
    case 'Space': case 'ShiftLeft': case 'ShiftRight': ev.preventDefault(); dash(); break;
    case 'KeyQ': emp(); break;
    case 'KeyR': useMedkit(); break;
    case 'KeyE': interact(); break;
    case 'KeyU': if (G.player.points > 0) openLevelUp(); break;
    case 'KeyM':
      G.bigMap = !G.bigMap;
      $('minimap').style.width = $('minimap').style.height = G.bigMap ? '380px' : '';
      break;
  }
});
window.addEventListener('keyup', (ev) => { keys[ev.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
window.addEventListener('mousemove', (ev) => { mouse.x = ev.clientX; mouse.y = ev.clientY; });
renderer.domElement.addEventListener('mousedown', (ev) => { if (ev.button === 0) { mouse.down = true; SFX.init(); } });
window.addEventListener('mouseup', (ev) => { if (ev.button === 0) mouse.down = false; });
window.addEventListener('contextmenu', (ev) => ev.preventDefault());
window.addEventListener('wheel', (ev) => {
  if (G.state !== 'play') return;
  viewSize = clamp(viewSize + Math.sign(ev.deltaY) * 0.8, 6.5, 16);
  resize();
}, { passive: true });

$('startbtn').onclick = startRun;
$('reroll').onclick = () => { setSeed(); loadDeck(1, true); };
$('seedinput').addEventListener('change', () => { setSeed($('seedinput').value.trim()); loadDeck(1, true); });
$('resumebtn').onclick = closeModal;
$('abandonbtn').onclick = () => { closeModal(); saveRecord(); showTitle(); };
$('retrybtn').onclick = () => startRun();
$('newbtn').onclick = () => { setSeed(); startRun(); };
$('winnewbtn').onclick = () => { setSeed(); startRun(); };

// ---------------- Boot ----------------
resize();
setSeed();
showTitle();
requestAnimationFrame(frame);
