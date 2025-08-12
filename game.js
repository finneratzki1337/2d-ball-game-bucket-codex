/* 2D Ball Game main script */

// Matter aliases
const Engine = Matter.Engine;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Events = Matter.Events;
const Runner = Matter.Runner;

// Canvas constants
const WIDTH = 1024;
const HEIGHT = 576;
const BARREL_LEN = 60;
const BALL_RADIUS = 8;
const CANNON_X = 900;
const CANNON_Y = 420;
// bucket positions (slightly bigger to avoid overlap)
const LEFT_BUCKET = { x: 230, y: 520, width: 225, height: 225 };
const RIGHT_BUCKET = { x: 600, y: 530, width: 333, height: 333 };

// configure colours
const COLORS = {
  blue: '#277da1',
  yellow: '#f9c74f',
  green: '#90be6d',
  red: '#f94144',
  orange: '#f3722c'
};

// initial balls for both buckets (edit these values to change starting distribution)
const INITIAL_BLUE = 120;
const INITIAL_RED = 50;
const INITIAL_GREEN = 20;
const INITIAL_ORANGE = 40;
const INITIAL_YELLOW = 20;
const PREFILL_BALLS = {
  blue: INITIAL_BLUE,
  red: INITIAL_RED,
  green: INITIAL_GREEN,
  orange: INITIAL_ORANGE,
  yellow: INITIAL_YELLOW
};

const WIN_COUNT = 500;

// State
let caughtCount = 0;
let newCaughtCount = 0;
let baseCount = 0;
const countedIds = new Set();
const balls = [];
const caughtBalls = [];
const pops = [];
const clouds = [];
let engine, world, runner, sensor;
let playerImg, player1Img, player2Img, player3Img;
let angleDeg = 135;
let powerPct = 60;
let autoInterval = null;
let armUpTicks = 0;
let selectedColor = 'red';
let selectedDeleteColor = 'red';
let currentBatch = 0;

// DOM refs
let canvas, ctx, stage, winOverlay, relaunchBtn, continueBtn;
let ballsInput, angleInput, powerInput, shootBtn, autoBtn, resetBtn, deleteCountInput, deleteBtn;
let colorBtns, deleteColorBtns, playerBtns, leftStatsEl, rightStatsEl;
const leftPrefill = [];
const rightPrefill = [];

// Audio
let audioCtx;
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}
function playPew() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(900, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.09);
}
function playDing() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.16);
}

function init() {
  // canvas & context
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  stage = document.getElementById('stage');
  winOverlay = document.getElementById('winOverlay');
  relaunchBtn = document.getElementById('relaunchBtn');
  continueBtn = document.getElementById('continueBtn');
  relaunchBtn.addEventListener('click', () => window.location.reload());
  continueBtn.addEventListener('click', () => winOverlay.classList.remove('show'));

  player1Img = new Image();
  player1Img.src = 'player.png';
  player2Img = new Image();
  player2Img.src = 'player2.png';
  player3Img = new Image();
  player3Img.src = 'player3.png';
  playerImg = player1Img;

  // inputs
  ballsInput = document.getElementById('ballsInput');
  angleInput = document.getElementById('angleInput');
  powerInput = document.getElementById('powerInput');
  shootBtn = document.getElementById('shootBtn');
  autoBtn = document.getElementById('autoBtn');
  resetBtn = document.getElementById('resetBtn');
  deleteCountInput = document.getElementById('deleteCountInput');
  deleteBtn = document.getElementById('deleteBtn');
  colorBtns = document.querySelectorAll('#colorButtons .color-btn');
  deleteColorBtns = document.querySelectorAll('#deleteColorButtons .color-btn');
  playerBtns = document.querySelectorAll('#playerButtons .player-btn');
  leftStatsEl = document.getElementById('leftStats');
  rightStatsEl = document.getElementById('rightStats');

  angleInput.addEventListener('input', () => setAngleFromInput(angleInput.value));
  powerInput.addEventListener('input', () => setPower(powerInput.value));
  ballsInput.addEventListener('change', () => {
    let v = clamp(+ballsInput.value, 1, 200);
    ballsInput.value = v;
  });

  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedColor = btn.dataset.color;
      colorBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  deleteColorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDeleteColor = btn.dataset.color;
      deleteColorBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  playerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.player;
      playerImg = name === 'player2' ? player2Img : name === 'player3' ? player3Img : player1Img;
      playerBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  shootBtn.addEventListener('click', () => {
    fire(+ballsInput.value);
  });
  autoBtn.addEventListener('click', toggleAuto);
  resetBtn.addEventListener('click', resetGame);
  deleteBtn.addEventListener('click', () => {
    const num = clamp(+deleteCountInput.value, 1, 200);
    deleteCountInput.value = num;
    deleteBalls(selectedDeleteColor, num);
  });

  document.addEventListener('keydown', handleKeyDown);

  // resume audio on first interaction
  document.addEventListener('click', () => getAudioCtx().resume(), { once: true });

  setupPhysics();
  prefillBuckets();
  initClouds();
  setAngleFromInput(angleInput.value);
  setPower(powerInput.value);
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(render);
}

function setupPhysics() {
  engine = Engine.create();
  engine.gravity.y = 0.9;
  engine.positionIterations = 6;
  engine.velocityIterations = 4;
  engine.constraintIterations = 4;
  world = engine.world;

  runner = Runner.create();
  Runner.run(runner, engine);

  // world bounds
  const wallOpts = { isStatic: true };
  const ground = Bodies.rectangle(WIDTH / 2, HEIGHT - 20, WIDTH, 40, wallOpts);
  const ceiling = Bodies.rectangle(WIDTH / 2, 20, WIDTH, 40, wallOpts);
  const leftWall = Bodies.rectangle(20, HEIGHT / 2, 40, HEIGHT, wallOpts);
  const rightWall = Bodies.rectangle(WIDTH - 20, HEIGHT / 2, 40, HEIGHT, wallOpts);
  World.add(world, [ground, ceiling, leftWall, rightWall]);

  // vases
  makeVase(LEFT_BUCKET.x, LEFT_BUCKET.y, LEFT_BUCKET.width, LEFT_BUCKET.height, false); // left bucket
  sensor = makeVase(RIGHT_BUCKET.x, RIGHT_BUCKET.y, RIGHT_BUCKET.width, RIGHT_BUCKET.height, true); // large bucket with sensor

  // collision for sensor
  Events.on(engine, 'collisionStart', evt => {
    for (const pair of evt.pairs) {
      const { bodyA, bodyB } = pair;
      if (bodyA === sensor && balls.includes(bodyB)) handleCatch(bodyB);
      else if (bodyB === sensor && balls.includes(bodyA)) handleCatch(bodyA);
    }
  });
}

function prefillBuckets() {
  prefillBucket(leftPrefill, LEFT_BUCKET, PREFILL_BALLS);
  baseCount = prefillBucket(rightPrefill, RIGHT_BUCKET, PREFILL_BALLS);
}

function prefillBucket(arr, bucket, config) {
  arr.length = 0;
  const entries = [];
  for (const [name, count] of Object.entries(config)) {
    for (let i = 0; i < count; i++) entries.push(name);
  }
  const margin = BALL_RADIUS + 2;
  const width = bucket.width - margin * 2;
  const height = bucket.height - margin * 2;
  entries.forEach(colorName => {
    const x = bucket.x - bucket.width / 2 + margin + Math.random() * width;
    const y = bucket.y - margin - Math.random() * height;
    const body = Bodies.circle(x, y, BALL_RADIUS, {
      restitution: 0.6,
      friction: 0.05,
      frictionAir: 0.01,
      density: 0.001
    });
    body.renderColor = COLORS[colorName];
    body.colorName = colorName;
    World.add(world, body);
    arr.push(body);
  });
  return entries.length;
}

function initClouds() {
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random() * WIDTH,
      y: Math.random() * 200 + 40,
      w: 60 + Math.random() * 40,
      h: 20 + Math.random() * 10,
      speed: 0.2 + Math.random() * 0.3
    });
  }
}

function drawClouds() {
  ctx.fillStyle = '#fff';
  clouds.forEach(cl => {
    ctx.beginPath();
    ctx.ellipse(cl.x, cl.y, cl.w / 2, cl.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    cl.x -= cl.speed;
    if (cl.x < -cl.w) {
      cl.x = WIDTH + cl.w;
      cl.y = Math.random() * 200 + 40;
      cl.speed = 0.2 + Math.random() * 0.3;
    }
  });
}

function handleCatch(ball) {
  if (countedIds.has(ball.id)) return;
  countedIds.add(ball.id);
  caughtCount++;
  newCaughtCount++;
  caughtBalls.push({ body: ball, color: ball.colorName, batch: currentBatch });
  playDing();
  if (baseCount + caughtCount >= WIN_COUNT) {
    showWin();
  }
}

// create vase and return sensor if requested
function makeVase(x, y, innerW, innerH, withSensor) {
  const t = 20;
  const halfW = innerW / 2;
  const bottom = Bodies.rectangle(x, y + t / 2, innerW + t * 2, t, { isStatic: true });
  const left = Bodies.rectangle(x - halfW - t / 2, y - innerH / 2, t, innerH, { isStatic: true });
  const right = Bodies.rectangle(x + halfW + t / 2, y - innerH / 2, t, innerH, { isStatic: true });
  const bodies = [bottom, left, right];
  let sensorBody = null;
  if (withSensor) {
    sensorBody = Bodies.rectangle(x, y - innerH / 2, innerW - 10, innerH - 10, {
      isStatic: true,
      isSensor: true
    });
    bodies.push(sensorBody);
  }
  World.add(world, bodies);
  return sensorBody;
}

function drawPrefilledBalls(arr) {
  arr.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = b.renderColor;
    ctx.fill();
  });
}

// remove balls only from the right bucket
function deleteBalls(colorName, num) {
  let removed = 0;
  for (let i = caughtBalls.length - 1; i >= 0 && removed < num; i--) {
    const cb = caughtBalls[i];
    if (cb.color === colorName) {
      removeBall(cb.body);
      caughtBalls.splice(i, 1);
      removed++;
      caughtCount--;
      countedIds.delete(cb.body.id);
      if (cb.batch === currentBatch && newCaughtCount > 0) newCaughtCount--;
    }
  }
  for (let i = rightPrefill.length - 1; i >= 0 && removed < num; i--) {
    const b = rightPrefill[i];
    if (b.colorName === colorName) {
      removeBall(b);
      rightPrefill.splice(i, 1);
      removed++;
      baseCount--;
    }
  }
}

function removeBall(b) {
  pops.push({ x: b.position.x, y: b.position.y, color: b.renderColor, life: 10 });
  World.remove(world, b);
  const idx = balls.indexOf(b);
  if (idx >= 0) balls.splice(idx, 1);
}

function fire(n) {
  n = clamp(n, 1, 200);
  currentBatch++;
  newCaughtCount = 0;
  for (let i = 0; i < n; i++) {
    setTimeout(() => fireOne(), i * 70);
  }
}

function fireOne(powerScale = 1) {
  const angle = angleDeg * Math.PI / 180;
  const colorName = selectedColor;
  const color = COLORS[colorName];
  const speed = powerToVelocity(powerPct * powerScale);
  const muzzle = {
    x: CANNON_X + Math.cos(angle) * BARREL_LEN,
    y: CANNON_Y - Math.sin(angle) * BARREL_LEN
  };
  const spawn = {
    x: muzzle.x + Math.cos(angle) * (BALL_RADIUS + 2),
    y: muzzle.y - Math.sin(angle) * (BALL_RADIUS + 2)
  };
  const ball = Bodies.circle(spawn.x, spawn.y, BALL_RADIUS, {
    restitution: 0.6,
    friction: 0.05,
    frictionAir: 0.01,
    density: 0.001
  });
  ball.renderColor = color;
  ball.colorName = colorName;
  Body.setVelocity(ball, { x: Math.cos(angle) * speed, y: -Math.sin(angle) * speed });
  balls.push(ball);
  World.add(world, ball);
  playPew();
  armUpTicks = 10;
}

function setAngle(val) {
  angleDeg = clamp(+val, 10, 170);
  angleInput.value = 180 - angleDeg;
}

function setAngleFromInput(val) {
  angleDeg = clamp(180 - (+val), 10, 170);
  angleInput.value = val;
}
function setPower(val) {
  powerPct = clamp(+val, 0, 100);
  powerInput.value = powerPct;
}

function toggleAuto() {
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
    autoBtn.textContent = 'AUTO-FIRE';
  } else {
    autoInterval = setInterval(() => fire(+ballsInput.value), 1200);
    autoBtn.textContent = 'STOP';
  }
}

function resetGame() {
  balls.forEach(b => World.remove(world, b));
  balls.length = 0;
  caughtBalls.length = 0;
  pops.length = 0;
  countedIds.clear();
  caughtCount = 0;
  newCaughtCount = 0;
}

function handleKeyDown(e) {
  switch (e.code) {
    case 'ArrowLeft':
      setAngle(angleDeg + 1);
      break;
    case 'ArrowRight':
      setAngle(angleDeg - 1);
      break;
    case 'ArrowDown':
      setPower(powerPct - 1);
      break;
    case 'ArrowUp':
      setPower(powerPct + 1);
      break;
    case 'Space':
      fire(+ballsInput.value);
      e.preventDefault();
      break;
  }
}

function resizeCanvas() {
  const scale = stage.clientWidth / WIDTH;
  stage.style.height = HEIGHT * scale + 'px';
}

function powerToVelocity(pct) {
  return pct * 0.22; // 100 -> ~22 px/ms
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randomColor() {
  const palette = ['#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#277da1'];
  return palette[Math.floor(Math.random() * palette.length)];
}

function render() {
  const dt = engine.timing.delta;
  if (armUpTicks > 0) armUpTicks--;

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawClouds();
  drawBounds();
  drawBalls();
  drawPrefilledBalls(leftPrefill);
  drawPrefilledBalls(rightPrefill);
  drawPops();
  drawVases();
  drawLabels();
  drawCannon();
  drawCharacter();

  updateStats();

  requestAnimationFrame(render);
}

function drawBounds() {
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, WIDTH - 80, HEIGHT - 80);
}

function drawVases() {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 20;
  drawVase(LEFT_BUCKET);
  drawVase(RIGHT_BUCKET);
}

function drawVase(b) {
  // draw walls outside the physical boundaries so balls stay visibly inside
  const half = b.width / 2;
  const top = b.y - b.height;
  const t = 20;
  const offset = t / 2;
  ctx.beginPath();
  ctx.moveTo(b.x - half - offset, top - offset);
  ctx.lineTo(b.x - half - offset, b.y + offset);
  ctx.lineTo(b.x + half + offset, b.y + offset);
  ctx.lineTo(b.x + half + offset, top - offset);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(b.x - half, top, b.width, b.height);
}

function drawLabels() {
  ctx.fillStyle = '#fff';
  ctx.font = '16px "Press Start 2P"';
  ctx.textAlign = 'center';
  const leftTop = LEFT_BUCKET.y - LEFT_BUCKET.height;
  const rightTop = RIGHT_BUCKET.y - RIGHT_BUCKET.height;
  ctx.fillText('Baseline: ' + baseCount, LEFT_BUCKET.x, leftTop - 20);
  ctx.fillText('Total: ' + (baseCount + caughtCount), RIGHT_BUCKET.x, rightTop - 20);
  ctx.fillText('(+' + newCaughtCount + ')', RIGHT_BUCKET.x, rightTop - 40);
}

function drawBalls() {
  ctx.fillStyle = '#fff';
  balls.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = b.renderColor || '#fff';
    ctx.fill();
  });
}

function drawCannon() {
  const angle = angleDeg * Math.PI / 180;
  ctx.fillStyle = '#fff';
  // base
  ctx.beginPath();
  ctx.arc(CANNON_X, CANNON_Y, 20, 0, Math.PI * 2);
  ctx.fill();
  // barrel
  ctx.save();
  ctx.translate(CANNON_X, CANNON_Y);
  ctx.rotate(-angle);
  ctx.fillRect(0, -5, BARREL_LEN, 10);
  ctx.restore();
  // muzzle mark
  ctx.beginPath();
  ctx.arc(CANNON_X + Math.cos(angle) * BARREL_LEN, CANNON_Y - Math.sin(angle) * BARREL_LEN, 3, 0, Math.PI * 2);
  ctx.fill();

  // angle & power labels
  ctx.font = '12px "Press Start 2P"';
  ctx.textAlign = 'center';
  const displayAngle = 180 - angleDeg;
  ctx.fillText(Math.round(displayAngle) + '\u00B0', CANNON_X, CANNON_Y + 40);
  ctx.fillText('P ' + Math.round(powerPct) + '%', CANNON_X, CANNON_Y + 56);
}

function drawCharacter() {
  if (!playerImg || !playerImg.complete) return;
  const imgW = 80;
  const imgH = 80;
  const centerX = CANNON_X - 50;
  const baseY = CANNON_Y + 20;
  const offsetY = armUpTicks > 0 ? -8 : 0;
  ctx.drawImage(playerImg, centerX - imgW / 2, baseY - imgH + offsetY, imgW, imgH);
}

function drawPops() {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, BALL_RADIUS * (1 + (10 - p.life) / 5), 0, Math.PI * 2);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    p.life--;
    if (p.life <= 0) pops.splice(i, 1);
  }
}

function updateStats() {
  if (!leftStatsEl || !rightStatsEl) return;
  const leftCounts = countColors(leftPrefill);
  const rightCounts = countColors(rightPrefill.concat(caughtBalls.map(cb => cb.body)));
  leftStatsEl.textContent = formatPercentages(leftCounts, 'Left');
  rightStatsEl.textContent = formatPercentages(rightCounts, 'Right');
}

function countColors(arr) {
  const counts = { red: 0, blue: 0, yellow: 0, green: 0, orange: 0 };
  arr.forEach(b => counts[b.colorName]++);
  return counts;
}

function formatPercentages(counts, label) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return `${label} (0):`;
  const parts = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([c, v]) => `${Math.round((v / total) * 100)}% ${c} (${v})`);
  return `${label} (${total}): ${parts.join(', ')}`;
}

function showWin() {
  if (winOverlay) winOverlay.classList.add('show');
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
    if (autoBtn) autoBtn.textContent = 'AUTO-FIRE';
  }
}

// start
window.addEventListener('load', init);
