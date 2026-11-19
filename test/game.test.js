import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSORB,
  BASE_RADIUS,
  BASE_SPEED,
  COMBO_WINDOW,
  DAMAGE,
  EDGE_MARGIN,
  ENTITY_SIZES,
  MAX_COMBO,
  MAX_MASS,
  MAX_SPEED,
  MIN_MASS,
  PLAYER_SPEED,
  START_MASS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGame,
  distanceMeters,
  hazardChance,
  massPercent,
  pauseGame,
  radiusOf,
  resetGame,
  resumeGame,
  scorePoints,
  speedOf,
  spawnEntity,
  spawnInterval,
  startGame,
  steeringFactor,
  step,
} from '../src/game.js';

function fixedRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

function playingGame(random = Math.random) {
  const state = createGame(random);
  startGame(state);
  return state;
}

function putEntity(state, kind, x, y) {
  const size = ENTITY_SIZES[kind];
  const entity = { kind, x, y, width: size.width, height: size.height, passed: false };
  state.entities.push(entity);
  return entity;
}

test('createGame starts on the menu with the start mass', () => {
  const state = createGame();
  assert.equal(state.status, 'menu');
  assert.equal(state.mass, START_MASS);
  assert.equal(state.maxMass, START_MASS);
  assert.equal(state.score, 0);
  assert.equal(state.combo, 1);
  assert.equal(state.absorbed, 0);
  assert.equal(state.speed, speedOf(START_MASS, 0));
  assert.equal(state.player.x, WORLD_WIDTH / 2);
  assert.deepEqual(state.entities, []);
});

test('radius grows with the square root of mass', () => {
  assert.equal(radiusOf(MIN_MASS), BASE_RADIUS);
  assert.ok(radiusOf(START_MASS) > radiusOf(MIN_MASS));
  assert.ok(radiusOf(MAX_MASS) > radiusOf(START_MASS));
  assert.equal(radiusOf(4), BASE_RADIUS * 2);
});

test('steering gets worse as mass grows', () => {
  assert.equal(steeringFactor(MIN_MASS), 1);
  assert.ok(steeringFactor(START_MASS) < 1);
  assert.ok(steeringFactor(MAX_MASS) < steeringFactor(START_MASS));
  assert.ok(steeringFactor(MAX_MASS) > 0.3);
});

test('speed grows with mass and time and never passes the cap', () => {
  assert.ok(speedOf(START_MASS, 0) > BASE_SPEED);
  assert.ok(speedOf(MAX_MASS, 0) > speedOf(START_MASS, 0));
  assert.ok(speedOf(START_MASS, 60) > speedOf(START_MASS, 0));
  assert.equal(speedOf(MAX_MASS, 1000), MAX_SPEED);
});

test('hazard chance grows with distance and caps', () => {
  assert.equal(hazardChance(0), 0);
  assert.equal(hazardChance(39), 0);
  assert.ok(hazardChance(40) > 0);
  assert.ok(hazardChance(1000) > hazardChance(100));
  assert.ok(hazardChance(100000) <= 0.36);
});

test('startGame switches to playing and resets the run', () => {
  const state = createGame();
  state.score = 99;
  state.mass = 8;
  startGame(state);
  assert.equal(state.status, 'playing');
  assert.equal(state.score, 0);
  assert.equal(state.mass, START_MASS);
});

test('step does nothing while on the menu or paused', () => {
  const menu = createGame();
  step(menu, 1);
  assert.equal(menu.time, 0);

  const paused = playingGame();
  pauseGame(paused);
  step(paused, 1);
  assert.equal(paused.time, 0);
});

test('pause and resume only work from the matching status', () => {
  const state = createGame();
  pauseGame(state);
  assert.equal(state.status, 'menu');
  resumeGame(state);
  assert.equal(state.status, 'menu');

  startGame(state);
  pauseGame(state);
  assert.equal(state.status, 'paused');
  resumeGame(state);
  assert.equal(state.status, 'playing');
});

test('step advances time, distance and speed', () => {
  const state = playingGame(fixedRandom([0.1, 0.5]));
  step(state, 1);
  assert.equal(state.time, 1);
  assert.ok(state.distance > 0);
  assert.ok(state.speed > speedOf(START_MASS, 0));
  assert.ok(state.speed <= MAX_SPEED);
});

test('player moves left and right with keys', () => {
  const state = playingGame(fixedRandom([0.1, 0.5]));
  const start = state.player.x;
  step(state, 0.1, { left: true });
  assert.ok(state.player.x < start);
  step(state, 0.2, { right: true });
  assert.ok(state.player.x > start);
});

test('player stays inside the slope edges for its radius', () => {
  const state = playingGame(fixedRandom([0.1, 0.5]));
  step(state, 5, { left: true });
  assert.equal(state.player.x, EDGE_MARGIN + radiusOf(state.mass));
  step(state, 5, { right: true });
  assert.equal(state.player.x, WORLD_WIDTH - EDGE_MARGIN - radiusOf(state.mass));
});

test('pointer input steers toward the target', () => {
  const state = playingGame(fixedRandom([0.1, 0.5]));
  step(state, 0.1, { moveX: 100 });
  assert.ok(state.player.x < WORLD_WIDTH / 2);
  step(state, 2, { moveX: 400 });
  assert.ok(state.player.x > 350);
});

test('a heavy avalanche steers slower than a light one', () => {
  const light = playingGame(fixedRandom([0.1, 0.5]));
  light.mass = MIN_MASS + 0.5;
  const heavy = playingGame(fixedRandom([0.1, 0.5]));
  heavy.mass = MAX_MASS;
  step(light, 0.5, { right: true });
  step(heavy, 0.5, { right: true });
  const lightMove = light.player.x - WORLD_WIDTH / 2;
  const heavyMove = heavy.player.x - WORLD_WIDTH / 2;
  assert.ok(heavyMove < lightMove);
  assert.ok(heavyMove > 0);
  assert.ok(lightMove <= PLAYER_SPEED * 0.5 + 1);
});

test('entities spawn over time', () => {
  const state = playingGame(fixedRandom([0.1, 0.5, 0.9, 0.5]));
  step(state, 2);
  assert.ok(state.entities.length >= 2);
});

test('spawnEntity picks kinds from the random roll', () => {
  const snowy = createGame(fixedRandom([0.1, 0.5]));
  snowy.distance = 200;
  spawnEntity(snowy);
  assert.equal(snowy.entities[0].kind, 'snow');

  const piney = createGame(fixedRandom([0.6, 0.5]));
  piney.distance = 200;
  spawnEntity(piney);
  assert.equal(piney.entities[0].kind, 'pine');

  const rocky = createGame(fixedRandom([0.8, 0.5]));
  rocky.distance = 200;
  spawnEntity(rocky);
  assert.equal(rocky.entities[0].kind, 'rock');

  const bouldery = createGame(fixedRandom([0.92, 0.5]));
  bouldery.distance = 200;
  spawnEntity(bouldery);
  assert.equal(bouldery.entities[0].kind, 'boulder');

  const wally = createGame(fixedRandom([0.99, 0.5]));
  wally.distance = 200;
  spawnEntity(wally);
  assert.equal(wally.entities[0].kind, 'wall');
});

test('no hazards spawn during the opening stretch', () => {
  const state = createGame(fixedRandom([0.99, 0.5]));
  for (let i = 0; i < 10; i++) spawnEntity(state);
  assert.ok(state.entities.length > 0);
  assert.ok(state.entities.every((e) => e.kind === 'snow' || e.kind === 'pine' || e.kind === 'rock'));
});

test('spawn interval shrinks as speed grows', () => {
  assert.ok(spawnInterval(MAX_SPEED) < spawnInterval(BASE_SPEED));
  assert.ok(spawnInterval(MAX_SPEED) > 0);
});

test('absorbing snow grows mass and adds points', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  const before = scorePoints(state);
  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  assert.ok(Math.abs(state.mass - (START_MASS + ABSORB.snow.mass)) < 0.01);
  assert.equal(state.absorbed, 1);
  assert.equal(state.absorbedByKind.snow, 1);
  assert.equal(scorePoints(state), before + ABSORB.snow.points);
  assert.equal(state.entities.length, 0);
});

test('absorbing a pine grows mass more than snow', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  putEntity(state, 'pine', state.player.x, state.player.y);
  step(state, 0.01);
  assert.ok(Math.abs(state.mass - (START_MASS + ABSORB.pine.mass)) < 0.01);
  assert.ok(ABSORB.pine.mass > ABSORB.snow.mass);
  assert.ok(ABSORB.pine.points > ABSORB.snow.points);
});

test('mass caps at the maximum', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  state.mass = MAX_MASS - 0.1;
  putEntity(state, 'pine', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.mass, MAX_MASS);
  assert.equal(state.maxMass, MAX_MASS);
});

test('quick absorbs build the combo and raise the payout', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.combo, 1);

  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.combo, 2);

  const before = scorePoints(state);
  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.combo, 3);
  assert.ok(scorePoints(state) >= before + ABSORB.snow.points * 3);
});

test('combo caps at the maximum', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  for (let i = 0; i < 10; i++) {
    putEntity(state, 'snow', state.player.x, state.player.y);
    step(state, 0.01);
  }
  assert.equal(state.combo, MAX_COMBO);
});

test('combo resets after the window passes', () => {
  const state = playingGame(fixedRandom([0.1, 0.0]));
  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.combo, 2);
  step(state, COMBO_WINDOW + 0.1);
  assert.equal(state.combo, 1);
});

test('hitting a boulder shrinks mass and grants a shield window', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  putEntity(state, 'boulder', state.player.x, state.player.y);
  step(state, 0.01);
  assert.ok(Math.abs(state.mass - (START_MASS - DAMAGE.boulder)) < 0.01);
  assert.equal(state.status, 'playing');
  assert.ok(state.player.invulnUntil > state.time);
});

test('an ice wall shrinks more than a boulder', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  state.mass = 5;
  putEntity(state, 'wall', state.player.x, state.player.y);
  step(state, 0.01);
  assert.ok(Math.abs(state.mass - (5 - DAMAGE.wall)) < 0.01);
  assert.ok(DAMAGE.wall > DAMAGE.boulder);
});

test('no second hit lands during the shield window', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  putEntity(state, 'boulder', state.player.x, state.player.y);
  putEntity(state, 'wall', state.player.x, state.player.y);
  step(state, 0.01);
  assert.ok(Math.abs(state.mass - (START_MASS - DAMAGE.boulder)) < 0.01);

  putEntity(state, 'boulder', state.player.x, state.player.y);
  step(state, 0.01);
  assert.ok(Math.abs(state.mass - (START_MASS - DAMAGE.boulder)) < 0.01);
});

test('hits count again after the shield window ends', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  state.mass = 5;
  putEntity(state, 'boulder', state.player.x, state.player.y);
  step(state, 0.01);
  step(state, 1.6);
  putEntity(state, 'boulder', state.player.x, state.player.y);
  step(state, 0.01);
  assert.ok(Math.abs(state.mass - (5 - DAMAGE.boulder * 2)) < 0.1);
  assert.equal(state.status, 'playing');
});

test('mass melts away over time and starving ends the run', () => {
  const state = playingGame(fixedRandom([0.1, 0.0]));
  step(state, 10);
  assert.ok(Math.abs(state.mass - (START_MASS - 0.03 * 10)) < 0.01);
  assert.equal(state.status, 'playing');
  step(state, 130);
  assert.equal(state.mass, MIN_MASS);
  assert.equal(state.status, 'over');
});

test('shrinking to minimum size ends the run', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  state.mass = MIN_MASS + 0.5;
  putEntity(state, 'boulder', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.mass, MIN_MASS);
  assert.equal(state.status, 'over');
});

test('a hit resets the combo', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.combo, 2);
  putEntity(state, 'boulder', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.combo, 1);
});

test('entities that leave the screen are removed', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  putEntity(state, 'boulder', 100, WORLD_HEIGHT + 100);
  step(state, 0.01);
  assert.ok(!state.entities.some((e) => e.y >= WORLD_HEIGHT + 80));
});

test('distance grows and the meter helper floors it', () => {
  const state = playingGame(fixedRandom([0.1, 0.5]));
  step(state, 5);
  assert.ok(distanceMeters(state) > 0);
  assert.equal(distanceMeters(state), Math.floor(state.distance));
});

test('mass percent tracks the mass range', () => {
  const state = createGame();
  assert.equal(massPercent(state), Math.round((START_MASS / MAX_MASS) * 100));
  state.mass = MAX_MASS;
  assert.equal(massPercent(state), 100);
  state.mass = MIN_MASS;
  assert.equal(massPercent(state), Math.round((MIN_MASS / MAX_MASS) * 100));
});

test('resetGame returns to the menu state', () => {
  const state = playingGame(fixedRandom([0.9, 0.5]));
  step(state, 2);
  putEntity(state, 'snow', state.player.x, state.player.y);
  step(state, 0.01);
  resetGame(state);
  assert.equal(state.status, 'menu');
  assert.equal(state.score, 0);
  assert.equal(state.mass, START_MASS);
  assert.equal(state.absorbed, 0);
  assert.deepEqual(state.entities, []);
});
