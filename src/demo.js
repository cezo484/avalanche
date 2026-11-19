// Terminal demo: plays a scripted Avalanche run with the real game
// logic and prints the result. No browser needed.

import {
  createGame,
  distanceMeters,
  massPercent,
  radiusOf,
  scorePoints,
  startGame,
  step,
} from './game.js';

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

const state = createGame(seededRandom(7));
startGame(state);

let frames = 0;
while (state.status === 'playing' && frames < 60 * 120) {
  const t = frames / 60;
  const input = { moveX: 240 + Math.sin(t * 0.7) * 150 };
  step(state, 1 / 60, input);
  frames++;
}

console.log('Avalanche demo run');
console.log('  status:   ' + state.status);
console.log('  time:     ' + state.time.toFixed(1) + 's');
console.log('  distance: ' + distanceMeters(state) + ' m');
console.log('  score:    ' + scorePoints(state));
console.log('  mass:     ' + state.mass.toFixed(2) + ' (' + massPercent(state) + '%)');
console.log('  max mass: ' + state.maxMass.toFixed(2) + ' (radius ' + Math.round(radiusOf(state.maxMass)) + ' px)');
console.log('  absorbed: ' + state.absorbed + ' (snow ' + state.absorbedByKind.snow + ', pine ' + state.absorbedByKind.pine + ', rock ' + state.absorbedByKind.rock + ')');
console.log('  speed:    ' + Math.round(state.speed) + ' px/s');
