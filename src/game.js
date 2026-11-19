// Avalanche game logic. Pure functions, no DOM access, so the whole
// game can run in tests and in the browser from the same code.
//
// You are the avalanche. Absorb snow, pines and small rocks to grow.
// Size is speed and health at once: a bigger mass rolls faster but
// steers worse, and hits shrink you. Mass also melts away slowly, so
// you have to keep eating. Shrink to minimum size and the run ends.

export const WORLD_WIDTH = 480;
export const WORLD_HEIGHT = 720;
export const PLAYER_Y = 600;
export const EDGE_MARGIN = 28;

export const MIN_MASS = 1;
export const START_MASS = 5;
export const MAX_MASS = 14;
export const BASE_RADIUS = 20;

export const BASE_SPEED = 200;
export const MAX_SPEED = 560;
export const SPEED_GAIN = 4;
export const MASS_SPEED = 18;

export const PLAYER_SPEED = 340;
export const STEER_PENALTY = 0.09;

export const INVULN_SECONDS = 1.5;
export const COMBO_WINDOW = 2.5;
export const MAX_COMBO = 5;

export const ABSORB = {
  snow: { mass: 0.2, points: 10 },
  pine: { mass: 0.5, points: 25 },
  rock: { mass: 0.3, points: 15 },
};

export const DAMAGE = {
  boulder: 1.6,
  wall: 2.2,
};

export const MASS_DECAY = 0.03;

export const ENTITY_SIZES = {
  snow: { width: 36, height: 26 },
  pine: { width: 44, height: 56 },
  rock: { width: 34, height: 30 },
  boulder: { width: 56, height: 48 },
  wall: { width: 84, height: 36 },
};

const BASE_SPAWN_INTERVAL = 0.62;
const MIN_SPAWN_INTERVAL = 0.28;
const BASE_HAZARD_CHANCE = 0.16;
const MAX_HAZARD_CHANCE = 0.36;

export function radiusOf(mass) {
  return BASE_RADIUS * Math.sqrt(mass);
}

export function steeringFactor(mass) {
  return 1 / (1 + STEER_PENALTY * (mass - MIN_MASS));
}

export function speedOf(mass, time) {
  return Math.min(
    MAX_SPEED,
    BASE_SPEED + MASS_SPEED * (mass - MIN_MASS) + SPEED_GAIN * time,
  );
}

export function hazardChance(distance) {
  if (distance < 40) return 0;
  return Math.min(MAX_HAZARD_CHANCE, BASE_HAZARD_CHANCE + distance * 0.00009);
}

export function createGame(random = Math.random) {
  return {
    status: 'menu',
    time: 0,
    distance: 0,
    score: 0,
    combo: 1,
    comboTimer: 0,
    mass: START_MASS,
    maxMass: START_MASS,
    absorbed: 0,
    absorbedByKind: { snow: 0, pine: 0, rock: 0 },
    speed: speedOf(START_MASS, 0),
    spawnTimer: 0.4,
    player: {
      x: WORLD_WIDTH / 2,
      y: PLAYER_Y,
      invulnUntil: 0,
    },
    entities: [],
    random,
  };
}

export function startGame(state) {
  const fresh = createGame(state.random);
  Object.assign(state, fresh, { status: 'playing' });
  return state;
}

export function pauseGame(state) {
  if (state.status === 'playing') state.status = 'paused';
  return state;
}

export function resumeGame(state) {
  if (state.status === 'paused') state.status = 'playing';
  return state;
}

export function resetGame(state) {
  const fresh = createGame(state.random);
  Object.assign(state, fresh);
  return state;
}

export function spawnInterval(speed) {
  const t = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
  return BASE_SPAWN_INTERVAL - t * (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL);
}

export function spawnEntity(state) {
  const hazardP = hazardChance(state.distance);
  const safe = 1 - hazardP;
  const roll = state.random();
  let kind;
  if (roll < safe * 0.55) kind = 'snow';
  else if (roll < safe * 0.85) kind = 'pine';
  else if (roll < safe) kind = 'rock';
  else if (roll < safe + hazardP * 0.65) kind = 'boulder';
  else kind = 'wall';
  const size = ENTITY_SIZES[kind];
  const x =
    EDGE_MARGIN +
    state.random() * (WORLD_WIDTH - EDGE_MARGIN * 2 - size.width) +
    size.width / 2;
  state.entities.push({
    kind,
    x,
    y: -size.height,
    width: size.width,
    height: size.height,
    passed: false,
  });
  if ((kind === 'boulder' || kind === 'wall') && state.random() < 0.35) {
    const kind2 = state.random() < 0.5 ? 'boulder' : 'wall';
    const size2 = ENTITY_SIZES[kind2];
    const dir = state.random() < 0.5 ? -1 : 1;
    const offset = 70 + state.random() * 50;
    const x2 = Math.max(
      EDGE_MARGIN + size2.width / 2,
      Math.min(WORLD_WIDTH - EDGE_MARGIN - size2.width / 2, x + dir * offset),
    );
    state.entities.push({
      kind: kind2,
      x: x2,
      y: -size2.height,
      width: size2.width,
      height: size2.height,
      passed: false,
    });
  }
}

function overlaps(a, b, shrink = 0.75) {
  const aw = a.width * shrink;
  const ah = a.height * shrink;
  const bw = b.width * shrink;
  const bh = b.height * shrink;
  return (
    Math.abs(a.x - b.x) * 2 < aw + bw &&
    Math.abs(a.y - b.y) * 2 < ah + bh
  );
}

export function movePlayer(state, dt, input) {
  const player = state.player;
  const speed = PLAYER_SPEED * steeringFactor(state.mass);
  if (typeof input.moveX === 'number') {
    const diff = input.moveX - player.x;
    const maxStep = speed * 1.6 * dt;
    player.x += Math.max(-maxStep, Math.min(maxStep, diff));
  } else {
    if (input.left) player.x -= speed * dt;
    if (input.right) player.x += speed * dt;
  }
  const radius = radiusOf(state.mass);
  const minX = EDGE_MARGIN + radius;
  const maxX = WORLD_WIDTH - EDGE_MARGIN - radius;
  player.x = Math.max(minX, Math.min(maxX, player.x));
}

export function step(state, dt, input = {}) {
  if (state.status !== 'playing') return state;
  if (dt <= 0) return state;

  state.time += dt;
  state.mass = Math.max(MIN_MASS, state.mass - MASS_DECAY * dt);
  if (state.mass <= MIN_MASS) {
    state.status = 'over';
    return state;
  }
  state.speed = speedOf(state.mass, state.time);
  state.distance += (state.speed * dt) / 50;
  state.score += (state.speed * dt) / 50;

  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 1;
  }

  movePlayer(state, dt, input);

  state.spawnTimer -= dt;
  while (state.spawnTimer <= 0) {
    spawnEntity(state);
    state.spawnTimer += spawnInterval(state.speed);
  }

  const player = state.player;
  const radius = radiusOf(state.mass);
  const box = {
    x: player.x,
    y: player.y,
    width: radius * 2,
    height: radius * 2,
  };

  for (const entity of state.entities) {
    entity.y += state.speed * dt;
    if (entity.passed) continue;
    if (!overlaps(box, entity)) continue;
    const gain = ABSORB[entity.kind];
    if (gain) {
      entity.passed = true;
      state.mass = Math.min(MAX_MASS, state.mass + gain.mass);
      state.maxMass = Math.max(state.maxMass, state.mass);
      state.combo = Math.min(MAX_COMBO, state.combo + (state.comboTimer > 0 ? 1 : 0));
      state.comboTimer = COMBO_WINDOW;
      state.score += gain.points * state.combo;
      state.absorbed += 1;
      state.absorbedByKind[entity.kind] += 1;
    } else if (state.time >= player.invulnUntil) {
      entity.passed = true;
      state.mass -= DAMAGE[entity.kind];
      state.combo = 1;
      state.comboTimer = 0;
      player.invulnUntil = state.time + INVULN_SECONDS;
      if (state.mass <= MIN_MASS) {
        state.mass = MIN_MASS;
        state.status = 'over';
        return state;
      }
    }
  }

  state.entities = state.entities.filter(
    (entity) => entity.y < WORLD_HEIGHT + 80 && !entity.passed,
  );
  return state;
}

export function scorePoints(state) {
  return Math.floor(state.score);
}

export function distanceMeters(state) {
  return Math.floor(state.distance);
}

export function massPercent(state) {
  return Math.round((state.mass / MAX_MASS) * 100);
}
