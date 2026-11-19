// Avalanche browser front end. Renders the game on canvas, reads input,
// and keeps the best score in localStorage. The rules live in src/game.js.

import {
  MAX_MASS,
  MIN_MASS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGame,
  distanceMeters,
  massPercent,
  pauseGame,
  radiusOf,
  resetGame,
  resumeGame,
  scorePoints,
  startGame,
  step,
} from '../src/game.js';

const BEST_KEY = 'avalanche-best';
const AUTOPLAY = new URLSearchParams(location.search).has('autoplay');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hud = document.getElementById('hud');
const hudScore = document.getElementById('hud-score');
const hudDist = document.getElementById('hud-dist');
const hudCombo = document.getElementById('hud-combo');
const hudMassFill = document.getElementById('hud-mass-fill');
const menu = document.getElementById('menu');
const pauseOverlay = document.getElementById('pause');
const gameover = document.getElementById('gameover');
const menuBest = document.getElementById('menu-best');
const menuBestValue = document.getElementById('menu-best-value');
const finalScore = document.getElementById('final-score');
const finalDist = document.getElementById('final-dist');
const finalAbsorbed = document.getElementById('final-absorbed');
const newBest = document.getElementById('new-best');
const muteBtn = document.getElementById('mute-btn');

const state = createGame();
const keys = new Set();
let pointerX = null;
let lastTime = 0;
let shakeUntil = 0;
let particles = [];
let stripeOffset = 0;
let snow = [];
for (let i = 0; i < 60; i++) {
  snow.push({
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT,
    r: 1 + Math.random() * 2.5,
    speed: 40 + Math.random() * 80,
  });
}

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage is optional. The game still works without it.
  }
}

let best = loadBest();

// Sound: all effects are synthesized with the Web Audio API, no audio
// files. The AudioContext is created only on a user gesture (mobile
// autoplay policy), so in ?autoplay mode with no interaction every
// sound call is a silent no-op and nothing throws.

const SOUND_MUTED_KEY = 'avalanche-muted';
const sound = { ctx: null, master: null, musicGain: null, wind: null, music: null, muted: false, beeped: false };

function loadMuted() {
  try {
    return localStorage.getItem(SOUND_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(value) {
  try {
    localStorage.setItem(SOUND_MUTED_KEY, value ? '1' : '0');
  } catch {
    // Storage is optional.
  }
}

sound.muted = loadMuted();

function ensureAudio() {
  if (sound.ctx) {
    if (sound.ctx.state === 'suspended') sound.ctx.resume().catch(() => {});
    return;
  }
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    sound.ctx = new Ctor({ latencyHint: 'interactive' });
    sound.master = sound.ctx.createGain();
    sound.master.gain.value = sound.muted ? 0 : 0.9;
    // A compressor keeps the louder mix from clipping on phone speakers.
    const comp = sound.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 20;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    sound.master.connect(comp);
    comp.connect(sound.ctx.destination);
    // Music gets its own bus so it sits under the sound effects.
    sound.musicGain = sound.ctx.createGain();
    sound.musicGain.gain.value = 1.0;
    sound.musicGain.connect(sound.master);
    // One short beep proves sound is on: the first touch should be heard.
    if (!sound.beeped) {
      sound.beeped = true;
      if (sound.ctx.state === 'running') playBeep();
      else sound.ctx.resume().then(playBeep).catch(() => {});
    }
  } catch {
    sound.ctx = null;
    sound.master = null;
  }
}

function playBeep() {
  tone({ freq: 880, dur: 0.15, vol: 0.3 });
}

function suspendAudio() {
  if (sound.ctx && sound.ctx.state === 'running') {
    sound.ctx.suspend().catch(() => {});
  }
}

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function tone({ freq, endFreq, type = 'sine', dur = 0.1, vol = 0.3, when = 0 }) {
  if (!sound.ctx || sound.muted) return;
  const t0 = sound.ctx.currentTime + when;
  const osc = sound.ctx.createOscillator();
  const gain = sound.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(sound.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst({ dur = 0.2, vol = 0.3, filterFreq = 800, type = 'lowpass', when = 0 }) {
  if (!sound.ctx || sound.muted) return;
  const t0 = sound.ctx.currentTime + when;
  const src = sound.ctx.createBufferSource();
  src.buffer = noiseBuffer(sound.ctx, Math.max(dur, 0.1));
  const filter = sound.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = sound.ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sound.master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function playGulp(kind, combo) {
  const base = kind === 'pine' ? 320 : kind === 'rock' ? 520 : 420;
  const freq = base + (combo - 1) * 70;
  tone({ freq, endFreq: freq * 1.6, dur: 0.09, vol: 0.4 });
}

function playThud() {
  tone({ freq: 110, endFreq: 38, dur: 0.28, vol: 0.7 });
  noiseBurst({ dur: 0.18, vol: 0.4, filterFreq: 300 });
}

function playCrack() {
  noiseBurst({ dur: 0.15, vol: 0.5, filterFreq: 2400, type: 'highpass' });
  tone({ freq: 1400, endFreq: 900, type: 'triangle', dur: 0.08, vol: 0.22 });
  tone({ freq: 1900, endFreq: 1200, type: 'triangle', dur: 0.07, vol: 0.15, when: 0.05 });
}

function playCombo(level) {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const count = Math.min(level, notes.length);
  for (let i = 0; i < count; i++) {
    tone({ freq: notes[i], type: 'triangle', dur: 0.12, vol: 0.3, when: i * 0.06 });
  }
}

function playGameOver() {
  const notes = [659.25, 587.33, 523.25, 392.0];
  notes.forEach((freq, i) => {
    tone({ freq, type: 'triangle', dur: 0.22, vol: 0.32, when: i * 0.18 });
  });
}

function playWhoosh() {
  if (!sound.ctx || sound.muted) return;
  const t0 = sound.ctx.currentTime;
  const src = sound.ctx.createBufferSource();
  src.buffer = noiseBuffer(sound.ctx, 0.6);
  const filter = sound.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(300, t0);
  filter.frequency.exponentialRampToValueAtTime(1400, t0 + 0.45);
  filter.Q.value = 1.2;
  const gain = sound.ctx.createGain();
  gain.gain.setValueAtTime(0.001, t0);
  gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sound.master);
  src.start(t0);
  src.stop(t0 + 0.55);
}

function startWind() {
  if (!sound.ctx || sound.wind) return;
  const src = sound.ctx.createBufferSource();
  src.buffer = noiseBuffer(sound.ctx, 2);
  src.loop = true;
  const filter = sound.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  const gain = sound.ctx.createGain();
  gain.gain.value = 0.08;
  const lfo = sound.ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = sound.ctx.createGain();
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sound.master);
  src.start();
  lfo.start();
  sound.wind = { src, lfo };
}

function stopWind() {
  if (!sound.wind) return;
  try {
    sound.wind.src.stop();
    sound.wind.lfo.stop();
  } catch {
    // Already stopped.
  }
  sound.wind = null;
}

// Background music: a procedural loop synthesized with the Web Audio API,
// no audio files. A minor, Am-F-C-G, two bars per chord: soft pad chords,
// a flowing eighth-note arpeggio and a bass pulse on every beat. Tempo and
// layer density rise gently with the avalanche mass, so the music drives
// harder as the ball grows. Everything runs through the music bus, under
// the sound effects, and the master mute silences it along with them.

const MUSIC_CHORDS = [
  { pad: [110.0, 130.81, 164.81, 220.0], arp: [220.0, 261.63, 329.63, 440.0], bass: 55.0 },
  { pad: [87.31, 110.0, 130.81, 174.61], arp: [174.61, 220.0, 261.63, 349.23], bass: 43.65 },
  { pad: [130.81, 164.81, 196.0, 261.63], arp: [261.63, 329.63, 392.0, 523.25], bass: 65.41 },
  { pad: [98.0, 123.47, 146.83, 196.0], arp: [196.0, 246.94, 293.66, 392.0], bass: 49.0 },
];
const MUSIC_ARP_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2];
const MUSIC_BASE_BPM = 100;
const MUSIC_MAX_BPM = 118;
const MUSIC_STEPS_PER_CHORD = 16; // 2 bars of eighth notes

function musicIntensity() {
  return Math.max(0, Math.min(1, (state.mass - MIN_MASS) / (MAX_MASS - MIN_MASS)));
}

function musicBpm() {
  return MUSIC_BASE_BPM + musicIntensity() * (MUSIC_MAX_BPM - MUSIC_BASE_BPM);
}

function musicStepDur() {
  return 60 / musicBpm() / 2;
}

function musicNote({ freq, type = 'triangle', dur, vol, when }) {
  const osc = sound.ctx.createOscillator();
  const gain = sound.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.exponentialRampToValueAtTime(vol, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(gain);
  gain.connect(sound.musicGain);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function musicHat(when) {
  const src = sound.ctx.createBufferSource();
  src.buffer = noiseBuffer(sound.ctx, 0.05);
  const filter = sound.ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  const gain = sound.ctx.createGain();
  gain.gain.setValueAtTime(0.03, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sound.musicGain);
  src.start(when);
  src.stop(when + 0.06);
}

function startPad(chord, when, dur) {
  const nodes = [];
  for (const freq of chord.pad) {
    const osc = sound.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = sound.ctx.createGain();
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.linearRampToValueAtTime(0.05, when + 0.15);
    gain.gain.setValueAtTime(0.05, when + Math.max(0.15, dur - 0.5));
    gain.gain.linearRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(sound.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
    nodes.push({ osc, gain });
  }
  // The previous chord's pad ends on its own schedule; only the newest
  // chord is tracked, so stopMusic can fade it out.
  if (sound.music) sound.music.pads = nodes;
}

function scheduleMusicStep(step, when) {
  const chord = MUSIC_CHORDS[Math.floor(step / MUSIC_STEPS_PER_CHORD) % MUSIC_CHORDS.length];
  const stepInChord = step % MUSIC_STEPS_PER_CHORD;
  const stepDur = musicStepDur();
  const intensity = musicIntensity();
  if (stepInChord === 0) {
    startPad(chord, when, stepDur * MUSIC_STEPS_PER_CHORD);
  }
  // Arpeggio on every eighth note.
  const arpFreq = chord.arp[MUSIC_ARP_PATTERN[stepInChord % 8]];
  musicNote({ freq: arpFreq, dur: stepDur * 0.9, vol: 0.12, when });
  // Octave sparkle on beats 1 and 3 once the avalanche is big.
  if (intensity > 0.55 && (stepInChord % 8 === 0 || stepInChord % 8 === 4)) {
    musicNote({ freq: arpFreq * 2, dur: stepDur * 0.7, vol: 0.05, when });
  }
  // Bass pulse on every beat.
  if (stepInChord % 2 === 0) {
    musicNote({
      freq: chord.bass,
      type: 'sine',
      dur: 0.22,
      vol: 0.15 + intensity * 0.03,
      when,
    });
  }
  // Soft off-beat tick at higher intensity.
  if (intensity > 0.4 && stepInChord % 2 === 1) {
    musicHat(when);
  }
}

function musicTick() {
  const music = sound.music;
  if (!music || !sound.ctx || sound.ctx.state !== 'running') return;
  // Schedule ~0.1 s ahead; when muted the clock still advances so the
  // loop stays in time, it just stays silent.
  while (music.nextTime < sound.ctx.currentTime + 0.1) {
    if (!sound.muted) scheduleMusicStep(music.step, music.nextTime);
    music.nextTime += musicStepDur();
    music.step += 1;
  }
}

function startMusic() {
  if (!sound.ctx || sound.music) return;
  sound.music = {
    timer: setInterval(musicTick, 25),
    nextTime: sound.ctx.currentTime + 0.05,
    step: 0,
    pads: [],
  };
  musicTick();
}

function stopMusic() {
  const music = sound.music;
  if (!music) return;
  clearInterval(music.timer);
  if (sound.ctx) {
    const t = sound.ctx.currentTime;
    for (const node of music.pads) {
      try {
        node.gain.gain.cancelScheduledValues(t);
        node.gain.gain.setValueAtTime(Math.max(0.001, node.gain.gain.value), t);
        node.gain.gain.linearRampToValueAtTime(0.001, t + 0.15);
        node.osc.stop(t + 0.2);
      } catch {
        // Already stopped.
      }
    }
  }
  sound.music = null;
}

function setMuted(muted) {
  sound.muted = muted;
  saveMuted(muted);
  if (sound.master) sound.master.gain.value = muted ? 0 : 0.9;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('off', muted);
  muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}

function showOverlay(which) {
  menu.hidden = which !== 'menu';
  pauseOverlay.hidden = which !== 'pause';
  gameover.hidden = which !== 'over';
  hud.hidden = which !== 'playing';
}

function refreshMenu() {
  if (best > 0) {
    menuBest.hidden = false;
    menuBestValue.textContent = best;
  }
}

function refreshHud() {
  hudScore.textContent = scorePoints(state);
  hudDist.textContent = distanceMeters(state) + ' m';
  hudMassFill.style.width = massPercent(state) + '%';
  hudMassFill.classList.toggle('danger', state.mass <= MIN_MASS + 1);
  hudMassFill.classList.toggle('warn', state.mass > MIN_MASS + 1 && state.mass <= MIN_MASS + 2.5);
  if (state.combo > 1) {
    hudCombo.hidden = false;
    hudCombo.textContent = 'x' + state.combo + ' combo';
  } else {
    hudCombo.hidden = true;
  }
}

function startRun() {
  particles = [];
  startGame(state);
  lastMass = state.mass;
  lastAbsorbed = 0;
  playWhoosh();
  startWind();
  startMusic();
  showOverlay('playing');
  refreshHud();
}

function endRun() {
  const score = scorePoints(state);
  finalScore.textContent = score;
  finalDist.textContent = distanceMeters(state);
  finalAbsorbed.textContent = state.absorbed;
  if (score > best) {
    best = score;
    saveBest(best);
    newBest.hidden = false;
  } else {
    newBest.hidden = true;
  }
  stopWind();
  stopMusic();
  playGameOver();
  showOverlay('over');
}

function burst(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.5 + Math.random() * 0.3,
      color,
    });
  }
}

function spray(x, y) {
  particles.push({
    x: x + (Math.random() - 0.5) * 30,
    y,
    vx: (Math.random() - 0.5) * 60,
    vy: -60 - Math.random() * 80,
    life: 0.4 + Math.random() * 0.3,
    color: '#ffffff',
  });
  if (particles.length > 140) particles.splice(0, particles.length - 140);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  sky.addColorStop(0, '#0a1f38');
  sky.addColorStop(0.45, '#1b4066');
  sky.addColorStop(1, '#6fa3d4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.fillStyle = '#1d3a5c';
  for (const [x, w, h] of [[-40, 260, 220], [180, 300, 260], [380, 260, 200]]) {
    ctx.beginPath();
    ctx.moveTo(x, 300);
    ctx.lineTo(x + w / 2, 300 - h);
    ctx.lineTo(x + w, 300);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#e8f2fc';
  ctx.beginPath();
  ctx.moveTo(0, 260);
  ctx.lineTo(WORLD_WIDTH, 260);
  ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
  ctx.lineTo(0, WORLD_HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(120, 170, 215, 0.5)';
  ctx.lineWidth = 10;
  for (let y = -40 + (stripeOffset % 80); y < WORLD_HEIGHT + 40; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y + 50);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (const flake of snow) {
    ctx.beginPath();
    ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMiniPine(x, y, size) {
  ctx.fillStyle = '#2e7d4f';
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x - size * 0.7, y + size * 0.5);
  ctx.lineTo(x + size * 0.7, y + size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(x - size * 0.12, y + size * 0.5, size * 0.24, size * 0.35);
}

function drawEntity(entity) {
  const { x, y } = entity;
  if (entity.kind === 'snow') {
    ctx.fillStyle = 'rgba(160, 200, 235, 0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 18, 12, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#bfe0ff';
    ctx.beginPath();
    ctx.arc(x - 6, y - 2, 2.5, 0, Math.PI * 2);
    ctx.arc(x + 7, y + 1, 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (entity.kind === 'pine') {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(x - 4, y + 14, 8, 12);
    ctx.fillStyle = '#2e7d4f';
    for (let i = 0; i < 3; i++) {
      const w = 26 - i * 6;
      const ty = y - 18 + i * 12;
      ctx.beginPath();
      ctx.moveTo(x, ty - 12);
      ctx.lineTo(x - w / 2, ty + 8);
      ctx.lineTo(x + w / 2, ty + 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x - 6, y - 20);
    ctx.lineTo(x + 6, y - 20);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (entity.kind === 'rock') {
    ctx.fillStyle = '#5d6b7a';
    ctx.beginPath();
    ctx.moveTo(x - 16, y + 12);
    ctx.lineTo(x - 11, y - 10);
    ctx.lineTo(x + 5, y - 15);
    ctx.lineTo(x + 16, y - 2);
    ctx.lineTo(x + 13, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8b98a8';
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 10);
    ctx.lineTo(x + 5, y - 15);
    ctx.lineTo(x + 2, y - 3);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (entity.kind === 'boulder') {
    ctx.fillStyle = '#4a5766';
    ctx.beginPath();
    ctx.moveTo(x - 27, y + 20);
    ctx.lineTo(x - 22, y - 14);
    ctx.lineTo(x - 2, y - 24);
    ctx.lineTo(x + 22, y - 14);
    ctx.lineTo(x + 27, y + 8);
    ctx.lineTo(x + 18, y + 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7d8b9b';
    ctx.beginPath();
    ctx.moveTo(x - 22, y - 14);
    ctx.lineTo(x - 2, y - 24);
    ctx.lineTo(x + 8, y - 6);
    ctx.lineTo(x - 8, y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#39434f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 20);
    ctx.lineTo(x + 2, y - 2);
    ctx.lineTo(x - 6, y + 14);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#7ec8ee';
  ctx.beginPath();
  ctx.roundRect(x - 42, y - 18, 84, 36, 6);
  ctx.fill();
  ctx.strokeStyle = '#3d8fc4';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#d9f1ff';
  ctx.beginPath();
  ctx.roundRect(x - 42, y - 18, 84, 12, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 8);
  ctx.lineTo(x - 8, y + 2);
  ctx.lineTo(x - 14, y + 12);
  ctx.moveTo(x + 16, y - 8);
  ctx.lineTo(x + 26, y + 4);
  ctx.stroke();
}

function drawAvalanche() {
  const p = state.player;
  const radius = radiusOf(state.mass);
  const angle = state.distance * 0.05;
  const invulnerable = state.time < p.invulnUntil;
  const blink = invulnerable && Math.floor(state.time * 12) % 2 === 0;

  ctx.save();
  ctx.translate(p.x, p.y);
  if (blink) ctx.globalAlpha = 0.45;

  ctx.fillStyle = 'rgba(20, 50, 80, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.95, radius * 0.9, radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(
    -radius * 0.35, -radius * 0.4, radius * 0.2, 0, 0, radius,
  );
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.6, '#e8f3ff');
  grad.addColorStop(1, '#b9d6f2');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(160, 200, 235, 0.7)';
  for (const [px, py, pr] of [
    [-0.45, -0.3, 0.22],
    [0.4, 0.35, 0.18],
    [0.1, -0.55, 0.15],
    [-0.2, 0.5, 0.16],
  ]) {
    ctx.beginPath();
    ctx.arc(px * radius, py * radius, pr * radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const pines = Math.min(4, state.absorbedByKind.pine);
  for (let i = 0; i < pines; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    drawMiniPine(
      Math.cos(a) * radius * 0.55,
      Math.sin(a) * radius * 0.55,
      radius * 0.22,
    );
  }

  const rocks = Math.min(4, state.absorbedByKind.rock);
  for (let i = 0; i < rocks; i++) {
    const a = (i / 4) * Math.PI * 2 + 1.8;
    ctx.fillStyle = '#8b98a8';
    ctx.beginPath();
    ctx.arc(
      Math.cos(a) * radius * 0.6,
      Math.sin(a) * radius * 0.6,
      radius * 0.09,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawParticles(dt) {
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 160 * dt;
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw(dt) {
  ctx.save();
  if (performance.now() < shakeUntil) {
    ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  }
  drawBackground();
  for (const entity of state.entities) drawEntity(entity);
  if (state.status !== 'menu') drawAvalanche();
  drawParticles(dt);
  ctx.restore();
}

let lastMass = state.mass;
let lastAbsorbed = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;

  for (const flake of snow) {
    flake.y += flake.speed * dt;
    if (flake.y > WORLD_HEIGHT) {
      flake.y = -4;
      flake.x = Math.random() * WORLD_WIDTH;
    }
  }

  if (AUTOPLAY && state.status === 'menu') startRun();

  if (state.status === 'playing') {
    // Catches a tap mid-run (?autoplay): the AudioContext only exists
    // after a gesture, so music and wind start as soon as they can.
    startMusic();
    startWind();
    stripeOffset += state.speed * dt;
    const input = AUTOPLAY
      ? { moveX: WORLD_WIDTH / 2 + Math.sin(state.time * 0.7) * 150 }
      : {
          left: keys.has('ArrowLeft') || keys.has('a') || keys.has('A'),
          right: keys.has('ArrowRight') || keys.has('d') || keys.has('D'),
          moveX: pointerX,
        };
    const beforeKinds = { ...state.absorbedByKind };
    const beforeCombo = state.combo;
    const nearHazards = state.entities.filter(
      (e) => (e.kind === 'boulder' || e.kind === 'wall') &&
        Math.abs(e.y - state.player.y) < 90 &&
        Math.abs(e.x - state.player.x) < 130,
    );
    step(state, dt, input);
    for (const kind of ['snow', 'pine', 'rock']) {
      if (state.absorbedByKind[kind] > beforeKinds[kind]) {
        playGulp(kind, state.combo);
        break;
      }
    }
    if (state.combo > beforeCombo) playCombo(state.combo);
    if (Math.random() < 0.6) spray(state.player.x, state.player.y - radiusOf(state.mass));
    if (state.mass < lastMass - 0.05) {
      shakeUntil = performance.now() + 250;
      burst(state.player.x, state.player.y, '#ffb020', 14);
      const hit = nearHazards.find((e) => !state.entities.includes(e));
      if (hit && hit.kind === 'wall') playCrack();
      else playThud();
    }
    if (state.absorbed > lastAbsorbed) {
      burst(state.player.x, state.player.y - 10, '#7cc4f5', 8);
    }
    lastMass = state.mass;
    lastAbsorbed = state.absorbed;
    refreshHud();
    if (state.status === 'over') {
      if (AUTOPLAY) startRun();
      else endRun();
    }
  }

  draw(dt);
  requestAnimationFrame(frame);
}

function canvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * WORLD_WIDTH;
}

// Any touch anywhere on the page unlocks audio (mobile autoplay policy):
// the AudioContext must start from a user gesture, wherever it lands,
// including a tap on empty space, the menu overlay, or the canvas.
document.addEventListener('pointerdown', ensureAudio, { capture: true });
document.addEventListener('touchstart', ensureAudio, { capture: true, passive: true });

canvas.addEventListener('pointerdown', (event) => {
  ensureAudio();
  pointerX = canvasX(event.clientX);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (pointerX !== null) pointerX = canvasX(event.clientX);
});
canvas.addEventListener('pointerup', () => {
  pointerX = null;
});
canvas.addEventListener('pointercancel', () => {
  pointerX = null;
});

document.addEventListener('keydown', (event) => {
  ensureAudio();
  if (event.key === 'p' || event.key === 'P') {
    if (state.status === 'playing') {
      pauseGame(state);
      suspendAudio();
      showOverlay('pause');
    } else if (state.status === 'paused') {
      resumeGame(state);
      showOverlay('playing');
    }
    return;
  }
  if (event.key === ' ' || event.key === 'Enter') {
    if (state.status === 'menu' || state.status === 'over') {
      event.preventDefault();
      startRun();
    }
    return;
  }
  keys.add(event.key);
});
document.addEventListener('keyup', (event) => keys.delete(event.key));

document.getElementById('play-btn').addEventListener('click', () => {
  ensureAudio();
  startRun();
});
document.getElementById('again-btn').addEventListener('click', () => {
  ensureAudio();
  startRun();
});
document.getElementById('resume-btn').addEventListener('click', () => {
  ensureAudio();
  resumeGame(state);
  showOverlay('playing');
});
document.getElementById('quit-btn').addEventListener('click', () => {
  stopWind();
  stopMusic();
  resetGame(state);
  refreshMenu();
  showOverlay('menu');
});
document.getElementById('menu-btn').addEventListener('click', () => {
  stopWind();
  stopMusic();
  resetGame(state);
  refreshMenu();
  showOverlay('menu');
});
muteBtn.addEventListener('click', () => {
  ensureAudio();
  setMuted(!sound.muted);
});

setMuted(sound.muted);
refreshMenu();
showOverlay('menu');
requestAnimationFrame(frame);
