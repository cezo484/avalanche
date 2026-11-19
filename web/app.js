// Avalanche browser front end. Renders the game on canvas, reads input,
// and keeps the best score in localStorage. The rules live in src/game.js.

import {
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
    stripeOffset += state.speed * dt;
    const input = AUTOPLAY
      ? { moveX: WORLD_WIDTH / 2 + Math.sin(state.time * 0.7) * 150 }
      : {
          left: keys.has('ArrowLeft') || keys.has('a') || keys.has('A'),
          right: keys.has('ArrowRight') || keys.has('d') || keys.has('D'),
          moveX: pointerX,
        };
    step(state, dt, input);
    if (Math.random() < 0.6) spray(state.player.x, state.player.y - radiusOf(state.mass));
    if (state.mass < lastMass - 0.05) {
      shakeUntil = performance.now() + 250;
      burst(state.player.x, state.player.y, '#ffb020', 14);
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

canvas.addEventListener('pointerdown', (event) => {
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
  if (event.key === 'p' || event.key === 'P') {
    if (state.status === 'playing') {
      pauseGame(state);
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

document.getElementById('play-btn').addEventListener('click', startRun);
document.getElementById('again-btn').addEventListener('click', startRun);
document.getElementById('resume-btn').addEventListener('click', () => {
  resumeGame(state);
  showOverlay('playing');
});
document.getElementById('quit-btn').addEventListener('click', () => {
  resetGame(state);
  refreshMenu();
  showOverlay('menu');
});
document.getElementById('menu-btn').addEventListener('click', () => {
  resetGame(state);
  refreshMenu();
  showOverlay('menu');
});

refreshMenu();
showOverlay('menu');
requestAnimationFrame(frame);
