'use strict';
// Procedural deck generation and scene construction.

const TILE = { VOID: 0, FLOOR: 1, WALL: 2 };
const WALL_H = 2.2;
const FINAL_DECK = 10;

const THEMES = [
  { name: 'Cryogenics', light: 0x4fb8ff, floor: 0x1c2330, wall: 0x2f3a4a },
  { name: 'Hydroponics', light: 0x7dff6a, floor: 0x1b241d, wall: 0x2c3a30 },
  { name: 'Reactor Ring', light: 0xff8a2a, floor: 0x251d18, wall: 0x3d3128 },
  { name: 'Medical Wing', light: 0x5fffe0, floor: 0x1a2526, wall: 0x2e3e40 },
  { name: 'Security Block', light: 0xff3b3b, floor: 0x241a1c, wall: 0x3a2b2e },
  { name: 'Research Labs', light: 0xb07dff, floor: 0x1e1b28, wall: 0x332e44 },
  { name: 'Cargo Hold', light: 0xffd25a, floor: 0x22211b, wall: 0x3a372c },
];
const NEXUS_THEME = { name: 'The Nexus', light: 0xd04dff, floor: 0x1a1220, wall: 0x2e1f36 };

const ROOM_TYPES = [['storage', 3], ['lab', 2], ['quarters', 2], ['reactor', 1], ['medbay', 1.2], ['hydro', 1.5], ['armory', 1], ['server', 1.5], ['cryo', 1.3]];
const ROOM_LABEL = {
  start: 'Lift Lobby', exit: 'Descent Lift', storage: 'Storage', lab: 'Laboratory', quarters: 'Crew Quarters',
  reactor: 'Power Junction', medbay: 'Med Bay', hydro: 'Grow Room', armory: 'Armory', server: 'Data Core', cryo: 'Cryo Bay',
};

function generateDeck(runSeed, depth) {
  const rng = makeRNG((runSeed ^ Math.imul(depth, 0x9E3779B1)) >>> 0);
  const size = Math.min(44 + depth * 3, 72);
  const W = size, H = size;
  const grid = new Uint8Array(W * H);
  const solid = new Uint8Array(W * H);
  const roomId = new Int16Array(W * H).fill(-1);
  const corridor = new Uint8Array(W * H);
  const I = (x, y) => y * W + x;
  const isBoss = depth % 5 === 0;
  const theme = depth === FINAL_DECK ? NEXUS_THEME : rng.pick(THEMES);

  // --- rooms ---
  const rooms = [];
  const target = Math.min(7 + Math.floor(depth * 0.8), 15);
  for (let tries = 0; tries < 800 && rooms.length < target; tries++) {
    const w = rng.int(5, 11), h = rng.int(5, 11);
    const x = rng.int(3, W - w - 4), y = rng.int(3, H - h - 4);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 4 && x + w + 4 > r.x && y < r.y + r.h + 4 && y + h + 4 > r.y) { ok = false; break; }
    }
    if (ok) rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), type: 'generic', id: rooms.length });
  }
  const carveRoom = (r) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { grid[I(x, y)] = TILE.FLOOR; roomId[I(x, y)] = r.id; }
  };
  rooms.forEach(carveRoom);

  // --- corridors (Prim's MST + a few loops), 2 tiles wide ---
  const carveC = (x, y) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const k = I(x + dx, y + dy);
      if (grid[k] !== TILE.FLOOR) { grid[k] = TILE.FLOOR; corridor[k] = 1; }
    }
  };
  const connect = (a, b) => {
    let x = a.cx, y = a.cy;
    const horizFirst = rng.chance(0.5);
    const stepX = () => { while (x !== b.cx) { carveC(x, y); x += Math.sign(b.cx - x); } };
    const stepY = () => { while (y !== b.cy) { carveC(x, y); y += Math.sign(b.cy - y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    carveC(x, y);
  };
  const inTree = [0];
  const rest = rooms.slice(1).map((r) => r.id);
  while (rest.length) {
    let best = null, bestD = Infinity;
    for (const a of inTree) for (const b of rest) {
      const d = Math.abs(rooms[a].cx - rooms[b].cx) + Math.abs(rooms[a].cy - rooms[b].cy);
      if (d < bestD) { bestD = d; best = [a, b]; }
    }
    connect(rooms[best[0]], rooms[best[1]]);
    inTree.push(best[1]);
    rest.splice(rest.indexOf(best[1]), 1);
  }
  const loops = rng.int(1, 3);
  for (let i = 0; i < loops && rooms.length > 3; i++) {
    const a = rng.pick(rooms), b = rng.pick(rooms);
    if (a !== b) connect(a, b);
  }

  // --- start / exit by BFS distance ---
  const start = rooms[rng.int(0, rooms.length - 1)];
  const dist = bfs(grid, null, W, H, start.cx, start.cy);
  let exit = start, far = -1;
  for (const r of rooms) {
    const d = dist[I(r.cx, r.cy)];
    if (r !== start && d > far) { far = d; exit = r; }
  }
  if (isBoss) { // enlarge the arena
    const nx = Math.max(3, exit.x - 2), ny = Math.max(3, exit.y - 2);
    exit.w = Math.min(W - 4, exit.x + exit.w + 2) - nx; exit.h = Math.min(H - 4, exit.y + exit.h + 2) - ny;
    exit.x = nx; exit.y = ny;
    carveRoom(exit);
  }
  start.type = 'start';
  exit.type = 'exit';
  for (const r of rooms) if (r.type === 'generic') r.type = rng.weighted(ROOM_TYPES);

  // --- walls ---
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[I(x, y)] !== TILE.VOID) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && grid[I(nx, ny)] === TILE.FLOOR) { near = true; break; }
    }
    if (near) grid[I(x, y)] = TILE.WALL;
  }

  // --- props ---
  const props = [];
  const occupied = new Uint8Array(W * H);
  const addProp = (type, x, y, opts = {}) => {
    const p = Object.assign({ type, x, y, rot: 0, blocking: true }, opts);
    props.push(p);
    occupied[I(x, y)] = 1;
    if (p.blocking) solid[I(x, y)] = 1;
    return p;
  };
  // inner-ring cells that sit against a wall (not doorways); returns {x,y,rot}
  const wallSpots = (r) => {
    const spots = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const onEdge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
      if (!onEdge || occupied[I(x, y)]) continue;
      let ok = true, rot = 0;
      if (x === r.x) { if (grid[I(x - 1, y)] !== TILE.WALL) ok = false; rot = Math.PI / 2; }
      if (x === r.x + r.w - 1) { if (grid[I(x + 1, y)] !== TILE.WALL) ok = false; rot = -Math.PI / 2; }
      if (y === r.y) { if (grid[I(x, y - 1)] !== TILE.WALL) ok = false; rot = 0; }
      if (y === r.y + r.h - 1) { if (grid[I(x, y + 1)] !== TILE.WALL) ok = false; rot = Math.PI; }
      if (ok) spots.push({ x, y, rot });
    }
    return rng.shuffle(spots);
  };
  const interiorSpot = (r) => {
    for (let t = 0; t < 30; t++) {
      const x = rng.int(r.x + 1, r.x + r.w - 2), y = rng.int(r.y + 1, r.y + r.h - 2);
      if (!occupied[I(x, y)]) return { x, y };
    }
    return null;
  };

  let fabPlaced = false;
  for (const r of rooms) {
    const spots = wallSpots(r);
    const take = (n, types, extra = {}) => {
      let placed = 0;
      for (let i = 0; i < n && spots.length; i++, placed++) {
        const s = spots.pop();
        const type = Array.isArray(types) ? rng.pick(types) : types;
        addProp(type, s.x, s.y, Object.assign({ rot: s.rot }, extra));
      }
      return placed;
    };
    const big = r.w >= 7 && r.h >= 7;
    switch (r.type) {
      case 'start':
        addProp('arrival', r.cx, r.cy, { blocking: false });
        take(2, ['locker', 'console']);
        take(1, 'terminal', { interact: 'terminal' });
        break;
      case 'exit':
        if (depth !== FINAL_DECK) addProp('elevator', r.cx, r.cy, { blocking: false, interact: 'elevator' });
        if (!isBoss) take(2, ['console', 'pipes']);
        break;
      case 'storage':
        take(rng.int(2, 4), 'crate', { interact: 'crate' });
        take(rng.int(2, 4), ['barrel', 'locker', 'pipes']);
        break;
      case 'lab':
        take(rng.int(2, 3), ['console', 'server']);
        if (big) addProp('table', r.cx, r.cy);
        if (rng.chance(0.7)) take(1, 'terminal', { interact: 'terminal' });
        if (rng.chance(0.4)) take(1, 'crate', { interact: 'crate' });
        break;
      case 'quarters':
        take(rng.int(3, 5), ['locker', 'locker', 'table']);
        if (rng.chance(0.6)) take(1, 'terminal', { interact: 'terminal' });
        if (rng.chance(0.5)) take(1, 'crate', { interact: 'crate' });
        break;
      case 'reactor':
        if (big) addProp('reactor', r.cx, r.cy);
        take(rng.int(3, 5), ['pipes', 'barrel', 'console']);
        break;
      case 'medbay':
        take(1, 'med', { interact: 'med' });
        if (!fabPlaced) fabPlaced = take(1, 'fab', { interact: 'fab' }) > 0;
        take(rng.int(1, 3), ['console', 'locker', 'table']);
        break;
      case 'hydro':
        for (let y = r.y + 2; y < r.y + r.h - 2; y += 2) for (let x = r.x + 2; x < r.x + r.w - 2; x += 2) {
          if (rng.chance(0.7) && !occupied[I(x, y)]) addProp('plant', x, y);
        }
        take(rng.int(1, 3), ['pipes', 'barrel']);
        break;
      case 'armory':
        take(rng.int(2, 3), 'crate', { interact: 'crate' });
        if (!fabPlaced) fabPlaced = take(1, 'fab', { interact: 'fab' }) > 0;
        take(rng.int(2, 3), ['locker', 'locker', 'console']);
        break;
      case 'server':
        take(rng.int(4, 7), 'server');
        if (rng.chance(0.8)) take(1, 'terminal', { interact: 'terminal' });
        break;
      case 'cryo':
        take(rng.int(3, 6), 'cryopod');
        if (rng.chance(0.5)) take(1, 'terminal', { interact: 'terminal' });
        break;
    }
    // decals
    const decals = rng.int(0, 3);
    for (let i = 0; i < decals; i++) {
      const s = interiorSpot(r);
      if (!s || (r.type === 'exit' || r.type === 'start') && Math.abs(s.x - r.cx) < 2 && Math.abs(s.y - r.cy) < 2) continue;
      const t = rng.weighted([['debris', 3], ['blood', 1 + depth * 0.2], ['biomass', depth * 0.35]]);
      addProp(t, s.x, s.y, { blocking: false, rot: rng.range(0, 6.28) });
      occupied[I(s.x, s.y)] = 0; // decals don't reserve tiles
    }
  }
  // Guarantee a fabricator on every deck
  if (!fabPlaced) {
    const candidates = rooms.filter((r) => r.type !== 'exit');
    for (const r of rng.shuffle(candidates)) {
      const s = wallSpots(r).pop();
      if (s) { addProp('fab', s.x, s.y, { rot: s.rot, interact: 'fab' }); break; }
    }
  }

  // Repair connectivity: drop blocking props that seal off floor
  for (let iter = 0; iter < 12; iter++) {
    const reach = bfs(grid, solid, W, H, start.cx, start.cy);
    const bad = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = I(x, y);
      if (grid[k] === TILE.FLOOR && !solid[k] && reach[k] < 0) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = I(x + dx, y + dy); if (solid[n]) bad.add(n); }
      }
    }
    // interactables need at least one reachable side
    for (const p of props) {
      if (!p.interact || !p.blocking) continue;
      const nb = [I(p.x + 1, p.y), I(p.x - 1, p.y), I(p.x, p.y + 1), I(p.x, p.y - 1)];
      if (nb.some((n) => reach[n] >= 0)) continue;
      for (const n of nb) if (solid[n]) bad.add(n);
    }
    if (!bad.size) break;
    for (let i = props.length - 1; i >= 0; i--) {
      const p = props[i];
      if (p.blocking && bad.has(I(p.x, p.y)) && p.type !== 'fab' && p.type !== 'med') { solid[I(p.x, p.y)] = 0; props.splice(i, 1); }
      else if (p.blocking && bad.has(I(p.x, p.y)) && iter > 6) { solid[I(p.x, p.y)] = 0; props.splice(i, 1); }
    }
  }

  // If repairs removed the fabricator, re-place it somewhere open (all 8 neighbours reachable)
  if (!props.some((p) => p.interact === 'fab')) {
    const reach = bfs(grid, solid, W, H, start.cx, start.cy);
    outer: for (const r of rng.shuffle(rooms.slice())) {
      if (r.type === 'exit') continue;
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (occupied[I(x, y)] || (x === start.cx && Math.abs(y - start.cy) <= 1)) continue;
        let open = true;
        for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++) if (reach[I(x + dx, y + dy)] < 0) { open = false; break; }
        if (open) { addProp('fab', x, y, { interact: 'fab' }); break outer; }
      }
    }
  }

  // Lore for terminals
  for (const p of props) if (p.interact === 'terminal') p.lore = makeLore(rng);

  // --- light fixtures ---
  const fixtures = [];
  for (const r of rooms) {
    const emergency = r.type !== 'start' && rng.chance(0.18 + depth * 0.03);
    const color = r.type === 'exit' ? 0x39d0ff : emergency ? 0xff2a1a : theme.light;
    const flicker = emergency || rng.chance(0.2);
    if (r.w * r.h > 60) {
      fixtures.push({ x: r.x + r.w * 0.3, z: r.y + r.h * 0.3, color, intensity: 1.3, flicker });
      fixtures.push({ x: r.x + r.w * 0.7, z: r.y + r.h * 0.7, color, intensity: 1.3, flicker });
    } else {
      fixtures.push({ x: r.cx + 0.5, z: r.cy + 0.5, color, intensity: 1.4, flicker });
    }
  }
  for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
    // sparse corridor lights
    for (let t = 0; t < 6; t++) {
      const px = x + rng.int(0, 6), py = y + rng.int(0, 6);
      if (px < W && py < H && corridor[I(px, py)] && roomId[I(px, py)] < 0) {
        fixtures.push({ x: px + 0.5, z: py + 0.5, color: rng.chance(0.3) ? 0xff2a1a : theme.light, intensity: 0.9, flicker: rng.chance(0.35) });
        break;
      }
    }
  }

  // --- enemy spawns ---
  const spawns = [];
  const typeWeights = [
    ['crawler', 5],
    ['husk', 2 + depth * 0.3],
    ['drone', depth >= 2 ? 1 + depth * 0.4 : 0.6],
    ['sentinel', depth >= 3 ? depth * 0.35 : 0],
  ];
  for (const r of rooms) {
    if (r.type === 'start') continue;
    let n = Math.floor((r.w * r.h) / 18 * rng.range(0.5, 1.3) + depth * 0.25);
    if (rng.chance(0.15)) n = 0;
    if (r.type === 'exit' && isBoss) n = 0;
    n = Math.min(n, 7);
    for (let i = 0; i < n; i++) {
      const s = interiorSpot(r);
      if (!s || solid[I(s.x, s.y)]) continue;
      const elite = rng.chance(0.08 + depth * 0.02);
      spawns.push({ type: rng.weighted(typeWeights), x: s.x + 0.5, z: s.y + 0.5, elite, eliteKind: rng.pick(['Armored', 'Swift', 'Volatile', 'Vampiric']) });
    }
  }
  // corridor ambushers
  const corrCells = [];
  for (let k = 0; k < W * H; k++) if (corridor[k] && roomId[k] < 0) corrCells.push(k);
  const ambush = Math.floor(corrCells.length / 60) + Math.floor(depth / 2);
  for (let i = 0; i < ambush && corrCells.length; i++) {
    const k = rng.pick(corrCells);
    const x = k % W, y = Math.floor(k / W);
    if (dist[k] >= 0 && dist[k] < 10) continue;
    spawns.push({ type: depth >= 2 && rng.chance(0.4) ? 'drone' : 'crawler', x: x + 0.5, z: y + 0.5, elite: false });
  }
  let boss = null;
  if (isBoss) boss = depth === FINAL_DECK
    ? { type: 'choir', x: exit.cx + 0.5, z: exit.cy + 0.5 }
    : { type: 'warden', x: exit.cx + 0.5, z: exit.y + 2.5 };

  return {
    W, H, grid, solid, roomId, corridor, rooms, props, fixtures, spawns, boss, theme, depth, isBoss,
    start, exit, name: theme.name, I,
  };
}

// BFS distance field; returns Int32Array with -1 for unreachable
function bfs(grid, solid, W, H, sx, sy, maxD = 1e9) {
  const d = new Int32Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let h = 0, t = 0;
  const s = sy * W + sx;
  d[s] = 0; q[t++] = s;
  while (h < t) {
    const k = q[h++];
    const x = k % W, y = (k / W) | 0;
    if (d[k] >= maxD) continue;
    const nb = [k - 1, k + 1, k - W, k + W];
    const ok = [x > 0, x < W - 1, y > 0, y < H - 1];
    for (let i = 0; i < 4; i++) {
      if (!ok[i]) continue;
      const n = nb[i];
      if (d[n] >= 0 || grid[n] !== TILE.FLOOR || (solid && solid[n])) continue;
      d[n] = d[k] + 1; q[t++] = n;
    }
  }
  return d;
}

// ---------- Scene construction ----------
function buildDeckScene(deck) {
  const { W, H, grid, theme, I } = deck;
  const group = new THREE.Group();
  const rng = makeRNG(deck.depth * 7919 + 13);
  const col = new THREE.Color();
  const dummy = new THREE.Object3D();
  const owned = []; // geometries/materials to dispose with the deck

  // floor
  let nFloor = 0;
  for (let k = 0; k < W * H; k++) if (grid[k] === TILE.FLOOR) nFloor++;
  const floorGeo = new THREE.BoxGeometry(0.96, 0.2, 0.96);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.85, metalness: 0.15 });
  owned.push(floorGeo, floorMat);
  const floor = new THREE.InstancedMesh(floorGeo, floorMat, nFloor);
  floor.receiveShadow = true;
  const base = new THREE.Color(theme.floor);
  let fi = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[I(x, y)] !== TILE.FLOOR) continue;
    dummy.position.set(x + 0.5, -0.1, y + 0.5);
    dummy.updateMatrix();
    floor.setMatrixAt(fi, dummy.matrix);
    const v = rng.range(0.82, 1.18);
    col.copy(base).multiplyScalar(deck.corridor[I(x, y)] && deck.roomId[I(x, y)] < 0 ? v * 0.8 : v);
    if (rng.chance(0.04)) col.multiplyScalar(1.5);
    floor.setColorAt(fi, col);
    fi++;
  }
  group.add(floor);

  // walls
  const walls = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[I(x, y)] === TILE.WALL) walls.push({ x: x + 0.5, z: y + 0.5, h: 1, t: 1 });
  const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
  wallGeo.translate(0, WALL_H / 2, 0);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.7, metalness: 0.25 });
  owned.push(wallGeo, wallMat);
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
  wallMesh.castShadow = true; wallMesh.receiveShadow = true;
  const wbase = new THREE.Color(theme.wall);
  walls.forEach((w, i) => {
    dummy.position.set(w.x, 0, w.z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    wallMesh.setMatrixAt(i, dummy.matrix);
    col.copy(wbase).multiplyScalar(rng.range(0.85, 1.15));
    wallMesh.setColorAt(i, col);
  });
  group.add(wallMesh);

  // glowing strips at the foot of walls
  const strips = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (grid[I(x, y)] !== TILE.WALL) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (grid[I(x + dx, y + dy)] === TILE.FLOOR && (x * 3 + y * 5) % 4 === 0) strips.push({ x: x + 0.5 + dx * 0.51, z: y + 0.5 + dy * 0.51, rot: dx !== 0 ? Math.PI / 2 : 0 });
    }
  }
  const stripGeo = new THREE.BoxGeometry(0.85, 0.06, 0.04);
  const stripMat = new THREE.MeshStandardMaterial({ color: theme.light, emissive: theme.light, emissiveIntensity: 1.3 });
  owned.push(stripGeo, stripMat);
  const stripMesh = new THREE.InstancedMesh(stripGeo, stripMat, Math.max(1, strips.length));
  strips.forEach((s, i) => {
    dummy.position.set(s.x, 0.22, s.z); dummy.rotation.set(0, s.rot, 0); dummy.updateMatrix();
    stripMesh.setMatrixAt(i, dummy.matrix);
  });
  stripMesh.count = strips.length;
  group.add(stripMesh);
  dummy.rotation.set(0, 0, 0);

  // glowing floor panels under fixtures
  const panelGeo = new THREE.BoxGeometry(0.7, 0.03, 0.7);
  owned.push(panelGeo);
  for (const f of deck.fixtures) {
    const m = new THREE.Mesh(panelGeo, Basic(f.color, { transparent: true, opacity: 0.35 }));
    m.position.set(Math.floor(f.x) + 0.5, 0.01, Math.floor(f.z) + 0.5);
    group.add(m);
  }

  // props
  const propRng = makeRNG(deck.depth * 104729 + 7);
  const animated = [];
  for (const p of deck.props) {
    const obj = makeProp(p.type, theme, propRng);
    obj.position.set(p.x + 0.5, 0, p.y + 0.5);
    obj.rotation.y = p.rot || 0;
    group.add(obj);
    p.obj = obj;
    if (obj.userData.spin || obj.userData.ring || obj.userData.arm) animated.push(obj);
  }

  return {
    group, walls, wallMesh, animated, owned,
    dispose() { for (const o of owned) o.dispose(); },
  };
}

// Line of sight through the grid (walls block); DDA-style sampling
function hasLOS(deck, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const steps = Math.ceil(len / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = Math.floor(x0 + dx * t), cz = Math.floor(z0 + dz * t);
    if (cx < 0 || cz < 0 || cx >= deck.W || cz >= deck.H) return false;
    if (deck.grid[cz * deck.W + cx] !== TILE.FLOOR) return false;
  }
  return true;
}

function walkable(deck, x, z) {
  const cx = Math.floor(x), cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= deck.W || cz >= deck.H) return false;
  const k = cz * deck.W + cx;
  return deck.grid[k] === TILE.FLOOR && !deck.solid[k];
}

function canStand(deck, x, z, r) {
  return walkable(deck, x - r, z - r) && walkable(deck, x + r, z - r) && walkable(deck, x - r, z + r) && walkable(deck, x + r, z + r);
}

// Axis-separated movement with wall sliding
function moveEntity(deck, e, dx, dz, r) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.2));
  const sx = dx / steps, sz = dz / steps;
  let blocked = false;
  for (let i = 0; i < steps; i++) {
    if (canStand(deck, e.x + sx, e.z, r)) e.x += sx; else blocked = true;
    if (canStand(deck, e.x, e.z + sz, r)) e.z += sz; else blocked = true;
  }
  return blocked;
}
