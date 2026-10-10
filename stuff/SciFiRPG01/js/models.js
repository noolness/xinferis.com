'use strict';
// Low-poly models built from primitives. Geometries and materials are cached and shared.

const _geoCache = new Map();
const _matCache = new Map();

function geo(key, make) {
  let g = _geoCache.get(key);
  if (!g) { g = make(); _geoCache.set(key, g); }
  return g;
}
const Geo = {
  box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt, rb, h, s = 6) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
  cone: (r, h, s = 5) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
  ico: (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
  oct: (r) => geo(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  dodeca: (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
  torus: (r, t, rs = 4, ts = 8) => geo(`t${r},${t},${rs},${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts)),
};

function Mat(color, opts) {
  const key = color + '|' + (opts ? JSON.stringify(opts) : '');
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.75, metalness: 0.2 }, opts || {}));
    _matCache.set(key, m);
  }
  return m;
}
const Glow = (color, intensity = 1.2) => Mat(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
function Basic(color, opts) {
  const key = 'basic' + color + '|' + (opts ? JSON.stringify(opts) : '');
  let m = _matCache.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial(Object.assign({ color }, opts || {})); _matCache.set(key, m); }
  return m;
}

function part(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = null) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}

// ---------------- Player ----------------
function makePlayerModel() {
  const g = new THREE.Group();
  const suit = Mat(0x56627a), dark = Mat(0x22262f), plate = Mat(0x8a93a6, { metalness: 0.5 });
  const visor = Glow(0x39d0ff, 1.6);

  const legL = new THREE.Group(); legL.position.set(-0.14, 0.55, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.14, 0.55, 0); g.add(legR);
  for (const leg of [legL, legR]) {
    part(Geo.box(0.17, 0.5, 0.2), dark, 0, -0.25, 0, 0, 0, 0, leg);
    part(Geo.box(0.2, 0.12, 0.3), plate, 0, -0.5, 0.04, 0, 0, 0, leg);
  }
  part(Geo.cyl(0.24, 0.28, 0.55, 6), suit, 0, 0.86, 0, 0, Math.PI / 6, 0, g);
  part(Geo.box(0.38, 0.26, 0.08), plate, 0, 0.92, 0.22, 0, 0, 0, g);
  part(Geo.box(0.3, 0.04, 0.02), visor, 0, 0.84, 0.27, 0, 0, 0, g);
  part(Geo.box(0.2, 0.1, 0.32), plate, -0.3, 1.08, 0, 0, 0, 0, g); // shoulder pads
  part(Geo.box(0.2, 0.1, 0.32), plate, 0.3, 1.08, 0, 0, 0, 0, g);
  part(Geo.dodeca(0.2), suit, 0, 1.33, 0, 0, 0, 0, g);
  part(Geo.box(0.28, 0.08, 0.12), visor, 0, 1.35, 0.14, 0, 0, 0, g);
  part(Geo.box(0.36, 0.42, 0.18), dark, 0, 0.95, -0.25, 0, 0, 0, g);
  part(Geo.box(0.08, 0.08, 0.04), Glow(0x5aff8a, 2), 0.1, 1.08, -0.35, 0, 0, 0, g);
  part(Geo.cyl(0.05, 0.05, 0.3, 5), Glow(0x39d0ff, 0.8), -0.1, 0.95, -0.36, 0, 0, 0, g);

  const gun = new THREE.Group(); gun.position.set(0.28, 0.95, 0.15); g.add(gun);
  part(Geo.box(0.12, 0.12, 0.36), suit, 0, 0, 0, 0, 0, 0, gun);           // forearm
  part(Geo.box(0.1, 0.14, 0.55), dark, 0, 0.02, 0.3, 0, 0, 0, gun);        // weapon body
  part(Geo.box(0.06, 0.16, 0.1), dark, 0, -0.1, 0.18, 0, 0, 0, gun);       // grip
  const muzzle = part(Geo.box(0.07, 0.07, 0.08), Glow(0x66ccff, 2), 0, 0.03, 0.6, 0, 0, 0, gun);
  part(Geo.box(0.12, 0.12, 0.34), suit, -0.42, 0.95, 0.12, 0, 0.5, 0, g);  // left arm

  g.userData = { legL, legR, gun, muzzle };
  return g;
}

// ---------------- Enemies ----------------
// Each enemy gets one cloned "flash" material so it can blink white when hit.
function flashMat(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, metalness: 0.25, emissive: 0x000000 });
}

function makeCrawler(eliteColor) {
  const g = new THREE.Group();
  const body = flashMat(0x4a3c36);
  const shell = Mat(0x2c2522);
  const eye = Glow(eliteColor || 0xff3020, 2.5);
  part(Geo.ico(0.36, 0), body, 0, 0.36, 0, 0, 0, 0, g).scale.set(1, 0.55, 1.3);
  part(Geo.ico(0.22, 0), shell, 0, 0.52, -0.15, 0, 0, 0, g).scale.set(1.2, 0.6, 1.4);
  part(Geo.box(0.07, 0.07, 0.07), eye, -0.1, 0.42, 0.42, 0, 0, 0, g);
  part(Geo.box(0.07, 0.07, 0.07), eye, 0.1, 0.42, 0.42, 0, 0, 0, g);
  part(Geo.cone(0.05, 0.3, 4), shell, -0.12, 0.3, 0.55, Math.PI / 2, 0, 0, g);
  part(Geo.cone(0.05, 0.3, 4), shell, 0.12, 0.3, 0.55, Math.PI / 2, 0, 0, g);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const zi = (i % 3) - 1;
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25, 0.35, zi * 0.22);
    pivot.rotation.y = side * (Math.PI / 2) + zi * 0.4 * side;
    part(Geo.box(0.05, 0.05, 0.5), shell, 0, -0.12, 0.22, 0.5, 0, 0, pivot);
    g.add(pivot);
    legs.push(pivot);
  }
  g.userData = { legs, flash: [body] };
  return g;
}

function makeHusk(eliteColor) {
  const g = new THREE.Group();
  const skin = flashMat(0x6d7a5c);
  const cloth = Mat(0x2e3440);
  const growth = Glow(eliteColor || 0x9aff3a, 0.9);
  const legL = new THREE.Group(); legL.position.set(-0.13, 0.5, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.5, 0); g.add(legR);
  part(Geo.box(0.16, 0.5, 0.18), cloth, 0, -0.25, 0, 0, 0, 0, legL);
  part(Geo.box(0.16, 0.5, 0.18), cloth, 0, -0.25, 0, 0, 0, 0, legR);
  const torso = new THREE.Group(); torso.position.set(0, 0.55, 0); torso.rotation.x = 0.45; g.add(torso);
  part(Geo.box(0.42, 0.55, 0.26), cloth, 0, 0.28, 0, 0, 0, 0, torso);
  part(Geo.ico(0.19, 0), skin, 0.02, 0.7, 0.1, 0, 0, 0.3, torso);
  part(Geo.cone(0.08, 0.3, 4), growth, 0.12, 0.85, 0.0, 0.4, 0, -0.5, torso);
  part(Geo.cone(0.1, 0.35, 4), growth, -0.2, 0.5, -0.1, -0.3, 0, 0.8, torso);
  part(Geo.cone(0.07, 0.25, 4), growth, 0.15, 0.3, -0.15, -0.9, 0, 0, torso);
  const armL = new THREE.Group(); armL.position.set(-0.27, 0.5, 0); torso.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.27, 0.5, 0); torso.add(armR);
  part(Geo.box(0.1, 0.62, 0.1), skin, 0, -0.3, 0, 0, 0, 0, armL);
  part(Geo.box(0.12, 0.7, 0.12), skin, 0, -0.32, 0, 0, 0, 0, armR);
  part(Geo.box(0.05, 0.05, 0.05), Glow(0xffee55, 3), -0.06, 0.73, 0.27, 0, 0, 0, torso);
  part(Geo.box(0.05, 0.05, 0.05), Glow(0xffee55, 3), 0.08, 0.73, 0.27, 0, 0, 0, torso);
  g.userData = { legL, legR, armL, armR, flash: [skin] };
  return g;
}

function makeDrone(eliteColor) {
  const g = new THREE.Group();
  const hover = new THREE.Group(); hover.position.y = 1.1; g.add(hover);
  const body = flashMat(0x6a7380);
  part(Geo.oct(0.3), body, 0, 0, 0, 0, 0, 0, hover).scale.set(1, 0.8, 1);
  const ring = part(Geo.torus(0.48, 0.045, 3, 8), Glow(eliteColor || 0xff8a2a, 1.4), 0, 0, 0, Math.PI / 2, 0, 0, hover);
  part(Geo.box(0.1, 0.1, 0.1), Glow(0xff2a2a, 3), 0, 0.02, 0.26, 0, 0, 0, hover);
  part(Geo.box(0.5, 0.04, 0.14), Mat(0x343a44), 0, 0.1, -0.1, 0, 0, 0, hover);
  part(Geo.box(0.06, 0.06, 0.3), Mat(0x343a44), 0, -0.15, 0.25, 0, 0, 0, hover);
  g.userData = { hover, ring, flash: [body] };
  return g;
}

function makeSentinel(eliteColor) {
  const g = new THREE.Group();
  const armor = flashMat(0x5b6270);
  const dark = Mat(0x262a31);
  const visor = Glow(eliteColor || 0xff2a2a, 2.2);
  const legL = new THREE.Group(); legL.position.set(-0.28, 0.8, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.28, 0.8, 0); g.add(legR);
  for (const leg of [legL, legR]) {
    part(Geo.box(0.26, 0.42, 0.3), armor, 0, -0.2, 0, 0, 0, 0, leg);
    part(Geo.box(0.22, 0.4, 0.26), dark, 0, -0.55, 0.05, 0, 0, 0, leg);
    part(Geo.box(0.3, 0.12, 0.45), armor, 0, -0.76, 0.08, 0, 0, 0, leg);
  }
  part(Geo.box(0.7, 0.2, 0.4), dark, 0, 0.88, 0, 0, 0, 0, g);
  part(Geo.box(0.95, 0.65, 0.6), armor, 0, 1.3, 0, 0, 0, 0, g);
  part(Geo.box(0.5, 0.35, 0.08), Glow(eliteColor || 0xff5a1a, 1.4), 0, 1.32, 0.31, 0, 0, 0, g);
  part(Geo.box(0.36, 0.26, 0.36), armor, 0, 1.76, 0.05, 0, 0, 0, g);
  part(Geo.box(0.3, 0.06, 0.05), visor, 0, 1.78, 0.24, 0, 0, 0, g);
  part(Geo.box(0.26, 0.3, 0.5), dark, -0.62, 1.45, 0.05, 0, 0, 0, g);
  part(Geo.box(0.26, 0.3, 0.5), dark, 0.62, 1.45, 0.05, 0, 0, 0, g);
  part(Geo.cyl(0.07, 0.07, 0.5, 6), dark, -0.62, 1.45, 0.45, Math.PI / 2, 0, 0, g);
  part(Geo.cyl(0.07, 0.07, 0.5, 6), dark, 0.62, 1.45, 0.45, Math.PI / 2, 0, 0, g);
  part(Geo.box(0.08, 0.08, 0.05), visor, -0.62, 1.45, 0.71, 0, 0, 0, g);
  part(Geo.box(0.08, 0.08, 0.05), visor, 0.62, 1.45, 0.71, 0, 0, 0, g);
  g.userData = { legL, legR, flash: [armor] };
  return g;
}

function makeWarden() {
  const g = makeSentinel(0xff2a6a);
  g.scale.setScalar(1.9);
  const spikes = Mat(0x1c1f25);
  for (let i = 0; i < 5; i++) {
    part(Geo.cone(0.08, 0.5, 4), spikes, -0.4 + i * 0.2, 1.75, -0.2, -0.5, 0, 0, g);
  }
  const ring = part(Geo.torus(0.75, 0.04, 3, 12), Glow(0xff2a6a, 1.8), 0, 2.3, 0, Math.PI / 2, 0, 0, g);
  g.userData.ring = ring;
  return g;
}

function makeChoir() {
  const g = new THREE.Group();
  const flesh = flashMat(0x3a1f3f);
  const core = new THREE.Group(); core.position.y = 1.8; g.add(core);
  part(Geo.ico(1.1, 1), flesh, 0, 0, 0, 0, 0, 0, core);
  const glowMat = Glow(0xc04dff, 2);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, b = (i % 3 - 1) * 0.6;
    const sp = part(Geo.cone(0.18, 1.0, 4), Mat(0x1b0f20), Math.cos(a) * 1.0, Math.sin(b) * 0.9, Math.sin(a) * 1.0, 0, 0, 0, core);
    sp.lookAt(Math.cos(a) * 5, Math.sin(b) * 4.5, Math.sin(a) * 5);
    sp.rotateX(Math.PI / 2);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part(Geo.ico(0.16, 0), glowMat, Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9, 0, 0, 0, core);
  }
  part(Geo.ico(0.45, 0), Glow(0xff4dd2, 3), 0, 0, 0.85, 0, 0, 0, core);
  const orbit = new THREE.Group(); orbit.position.y = 1.8; g.add(orbit);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    part(Geo.oct(0.25), glowMat, Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1, 0, 0, 0, orbit);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(Geo.cyl(0.12, 0.3, 1.6, 5), flesh, Math.cos(a) * 1.1, 0.6, Math.sin(a) * 1.1, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5, g);
  }
  g.userData = { core, orbit, flash: [flesh] };
  return g;
}

// ---------------- Props ----------------
function makeProp(type, theme, rng) {
  const g = new THREE.Group();
  const accent = theme.light;
  switch (type) {
    case 'crate': {
      part(Geo.box(0.8, 0.55, 0.75), Mat(0x5a5442), 0, 0.28, 0, 0, 0, 0, g);
      part(Geo.box(0.84, 0.08, 0.79), Mat(0x2c2a24), 0, 0.12, 0, 0, 0, 0, g);
      const lid = new THREE.Group(); lid.position.set(0, 0.56, -0.38); g.add(lid);
      part(Geo.box(0.84, 0.1, 0.79), Mat(0x6b6450), 0, 0.05, 0.38, 0, 0, 0, lid);
      part(Geo.box(0.3, 0.04, 0.12), Mat(0xd8a020, { emissive: 0x000000 }), 0, 0.11, 0.55, 0, 0, 0, lid);
      const light = part(Geo.box(0.1, 0.1, 0.03), Glow(0xffc030, 2), 0.25, 0.4, 0.39, 0, 0, 0, g);
      g.userData = { lid, light };
      break;
    }
    case 'barrel': {
      part(Geo.cyl(0.28, 0.28, 0.8, 8), Mat(rng.pick([0x6a3a2a, 0x3a4a5a, 0x4a4a3a])), 0, 0.4, 0, 0, 0, 0, g);
      part(Geo.cyl(0.29, 0.29, 0.08, 8), Glow(0xffaa20, 0.7), 0, 0.55, 0, 0, 0, 0, g);
      break;
    }
    case 'console': {
      part(Geo.box(0.85, 0.7, 0.5), Mat(0x3a404c), 0, 0.35, 0, 0, 0, 0, g);
      part(Geo.box(0.75, 0.05, 0.45), Glow(accent, 0.9), 0, 0.74, 0.02, -0.35, 0, 0, g);
      part(Geo.box(0.1, 0.05, 0.05), Glow(0xff3030, 2), 0.3, 0.62, 0.26, 0, 0, 0, g);
      break;
    }
    case 'terminal': {
      part(Geo.box(0.4, 1.0, 0.3), Mat(0x2e333c), 0, 0.5, 0, 0, 0, 0, g);
      const screen = part(Geo.box(0.34, 0.3, 0.04), Glow(0x5aff8a, 1.6), 0, 0.82, 0.17, -0.2, 0, 0, g);
      part(Geo.box(0.36, 0.05, 0.2), Mat(0x1c1f25), 0, 0.6, 0.2, 0, 0, 0, g);
      g.userData = { screen };
      break;
    }
    case 'locker': {
      part(Geo.box(0.7, 1.6, 0.4), Mat(0x48505e), 0, 0.8, 0, 0, 0, 0, g);
      part(Geo.box(0.02, 1.4, 0.02), Mat(0x1c1f25), 0, 0.8, 0.21, 0, 0, 0, g);
      part(Geo.box(0.5, 0.04, 0.02), Mat(0x1c1f25), 0, 1.35, 0.21, 0, 0, 0, g);
      break;
    }
    case 'server': {
      part(Geo.box(0.8, 1.8, 0.55), Mat(0x1d2028), 0, 0.9, 0, 0, 0, 0, g);
      for (let i = 0; i < 6; i++) {
        const c = rng.pick([0x39d0ff, 0x5aff8a, 0xff5050, accent]);
        part(Geo.box(0.06, 0.04, 0.02), Glow(c, 2.5), rng.range(-0.3, 0.3), 0.3 + i * 0.25, 0.28, 0, 0, 0, g);
      }
      break;
    }
    case 'cryopod': {
      const pod = new THREE.Group(); pod.rotation.x = -0.35; pod.position.y = 0.1; g.add(pod);
      part(Geo.box(0.8, 0.25, 0.8), Mat(0x3a404c), 0, 0, 0, 0.35, 0, 0, g);
      part(Geo.cyl(0.32, 0.32, 1.6, 8), Mat(0x9fe8ff, { transparent: true, opacity: 0.25, emissive: 0x2a8aff, emissiveIntensity: 0.5 }), 0, 0.9, 0, 0, 0, 0, pod);
      part(Geo.box(0.22, 1.1, 0.16), Mat(0x2a2f38), 0, 0.85, 0, 0, 0, 0, pod);
      part(Geo.cyl(0.34, 0.34, 0.12, 8), Glow(0x4fb8ff, 1.2), 0, 1.7, 0, 0, 0, 0, pod);
      break;
    }
    case 'reactor': {
      part(Geo.cyl(0.9, 1.1, 0.4, 8), Mat(0x30343d), 0, 0.2, 0, 0, 0, 0, g);
      part(Geo.cyl(0.6, 0.8, 0.2, 8), Mat(0x1c1f25), 0, 0.5, 0, 0, 0, 0, g);
      const core = part(Geo.ico(0.45, 0), Glow(0xff7a20, 2.5), 0, 1.3, 0, 0, 0, 0, g);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        part(Geo.box(0.12, 1.8, 0.12), Mat(0x48505e), Math.cos(a) * 0.75, 1.1, Math.sin(a) * 0.75, 0, -a, 0, g);
      }
      part(Geo.torus(0.75, 0.06, 3, 8), Mat(0x48505e), 0, 2.0, 0, Math.PI / 2, 0, 0, g);
      g.userData = { spin: core };
      break;
    }
    case 'table': {
      part(Geo.box(1.1, 0.08, 0.7), Mat(0x48505e), 0, 0.7, 0, 0, 0, 0, g);
      for (const [x, z] of [[-0.48, -0.28], [0.48, -0.28], [-0.48, 0.28], [0.48, 0.28]]) part(Geo.box(0.06, 0.7, 0.06), Mat(0x2a2f38), x, 0.35, z, 0, 0, 0, g);
      part(Geo.box(0.3, 0.02, 0.22), Glow(accent, 0.8), rng.range(-0.3, 0.3), 0.75, 0, 0, rng.range(0, 1), 0, g);
      break;
    }
    case 'plant': {
      part(Geo.box(0.85, 0.4, 0.85), Mat(0x3a3a30), 0, 0.2, 0, 0, 0, 0, g);
      part(Geo.box(0.75, 0.05, 0.75), Mat(0x2a1f18), 0, 0.41, 0, 0, 0, 0, g);
      for (let i = 0; i < 4; i++) {
        part(Geo.cone(0.14, rng.range(0.4, 0.9), 5), Mat(rng.pick([0x3f8f3a, 0x2f6f3a, 0x5a8f2a]), { emissive: 0x1a4f10, emissiveIntensity: 0.6 }),
          rng.range(-0.25, 0.25), 0.7, rng.range(-0.25, 0.25), 0, rng.range(0, 3), 0, g);
      }
      part(Geo.box(0.85, 0.03, 0.03), Glow(0xff40ff, 1.5), 0, 1.4, 0, 0, 0, 0, g);
      break;
    }
    case 'pipes': {
      for (let i = 0; i < 3; i++) part(Geo.cyl(0.08, 0.08, 0.95, 6), Mat(i === 1 ? 0x7a5a2a : 0x4a525e, { metalness: 0.5 }), 0, 0.3 + i * 0.25, -0.25 + i * 0.05, 0, 0, Math.PI / 2, g);
      part(Geo.box(0.12, 1.0, 0.12), Mat(0x2a2f38), 0.35, 0.5, -0.25, 0, 0, 0, g);
      break;
    }
    case 'med': {
      part(Geo.box(0.8, 1.3, 0.4), Mat(0xb8c0c8), 0, 0.65, 0, 0, 0, 0, g);
      const c1 = part(Geo.box(0.3, 0.08, 0.04), Glow(0xff3040, 2.2), 0, 1.0, 0.21, 0, 0, 0, g);
      const c2 = part(Geo.box(0.08, 0.3, 0.04), Glow(0xff3040, 2.2), 0, 1.0, 0.21, 0, 0, 0, g);
      part(Geo.box(0.6, 0.3, 0.1), Mat(0x2a2f38), 0, 0.5, 0.2, 0, 0, 0, g);
      g.userData = { cross: [c1, c2] };
      break;
    }
    case 'fab': {
      part(Geo.box(0.9, 0.9, 0.6), Mat(0x2e3a4c), 0, 0.45, 0, 0, 0, 0, g);
      part(Geo.box(0.6, 0.35, 0.05), Glow(0x39a0ff, 1.6), 0, 0.62, 0.31, 0, 0, 0, g);
      part(Geo.box(0.9, 0.1, 0.6), Mat(0x48505e), 0, 0.95, 0, 0, 0, 0, g);
      const arm = new THREE.Group(); arm.position.set(0.3, 1.0, 0); g.add(arm);
      part(Geo.box(0.08, 0.6, 0.08), Mat(0x8a93a6), 0, 0.3, 0, 0, 0, 0, arm);
      part(Geo.box(0.08, 0.08, 0.4), Mat(0x8a93a6), 0, 0.6, 0.15, 0, 0, 0, arm);
      part(Geo.cone(0.06, 0.15, 4), Glow(0x39a0ff, 2), 0, 0.52, 0.35, Math.PI, 0, 0, arm);
      g.userData = { arm };
      break;
    }
    case 'elevator': {
      part(Geo.cyl(1.3, 1.4, 0.15, 8), Mat(0x30343d), 0, 0.07, 0, 0, Math.PI / 8, 0, g);
      part(Geo.cyl(1.0, 1.0, 0.17, 8), Mat(0x1c1f25), 0, 0.09, 0, 0, Math.PI / 8, 0, g);
      const ring = part(Geo.torus(1.15, 0.05, 3, 8), Glow(0x39d0ff, 2), 0, 0.18, 0, Math.PI / 2, 0, Math.PI / 8, g);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        part(Geo.box(0.18, 2.2, 0.18), Mat(0x48505e), Math.cos(a) * 1.3, 1.1, Math.sin(a) * 1.3, 0, -a, 0, g);
        part(Geo.box(0.2, 0.15, 0.2), Glow(0x39d0ff, 2), Math.cos(a) * 1.3, 2.25, Math.sin(a) * 1.3, 0, -a, 0, g);
      }
      const beam = new THREE.Mesh(Geo.cyl(0.95, 0.95, 4, 8), Basic(0x39d0ff, { transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.y = 2; g.add(beam);
      g.userData = { ring, beam };
      break;
    }
    case 'arrival': {
      part(Geo.cyl(1.3, 1.4, 0.15, 8), Mat(0x30343d), 0, 0.07, 0, 0, Math.PI / 8, 0, g);
      part(Geo.torus(1.15, 0.05, 3, 8), Glow(0x5aff8a, 1), 0, 0.18, 0, Math.PI / 2, 0, Math.PI / 8, g);
      break;
    }
    case 'debris': {
      for (let i = 0; i < 3; i++) {
        part(Geo.box(rng.range(0.1, 0.35), rng.range(0.05, 0.15), rng.range(0.1, 0.35)), Mat(0x3a3f48),
          rng.range(-0.35, 0.35), 0.05, rng.range(-0.35, 0.35), 0, rng.range(0, 3), rng.range(-0.3, 0.3), g);
      }
      break;
    }
    case 'biomass': {
      for (let i = 0; i < 3; i++) {
        const s = rng.range(0.2, 0.45);
        part(Geo.ico(1, 0), Mat(0x2a1430, { emissive: 0x5a1a6a, emissiveIntensity: 0.5 }),
          rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3), 0, rng.range(0, 3), 0, g).scale.set(s, s * 0.5, s);
      }
      break;
    }
    case 'blood': {
      const m = new THREE.Mesh(new THREE.CircleGeometry(rng.range(0.3, 0.55), 6), Mat(0x2a0808, { roughness: 0.3 }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.receiveShadow = true;
      g.add(m);
      break;
    }
  }
  return g;
}

// Loot pickup visual
function makePickupModel(kind, color) {
  const g = new THREE.Group();
  const spin = new THREE.Group(); spin.position.y = 0.45; g.add(spin);
  if (kind === 'credits') {
    part(Geo.cyl(0.14, 0.14, 0.05, 6), Glow(0xffd84a, 1.2), 0, 0, 0, Math.PI / 2, 0, 0, spin);
  } else if (kind === 'medkit') {
    part(Geo.box(0.32, 0.22, 0.24), Mat(0xd0d6dc), 0, 0, 0, 0, 0, 0, spin);
    part(Geo.box(0.16, 0.05, 0.25), Glow(0xff3040, 2), 0, 0, 0, 0, 0, 0, spin);
    part(Geo.box(0.05, 0.16, 0.25), Glow(0xff3040, 2), 0, 0, 0, 0, 0, 0, spin);
  } else {
    part(Geo.oct(0.2), Glow(color, 1.6), 0, 0, 0, 0, 0, 0, spin);
    part(Geo.torus(0.3, 0.03, 3, 6), Glow(color, 1.2), 0, 0, 0, Math.PI / 2, 0, 0, spin);
    const beam = new THREE.Mesh(Geo.cyl(0.08, 0.2, 3, 5), Basic(color, { transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 1.5; g.add(beam);
  }
  g.userData = { spin };
  return g;
}
