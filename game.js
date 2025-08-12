/* 2D Ball Game main script */

// NOTE: UI has been restructured into two floating panels:
//  - Left: maintenance (delete/reset)
//  - Right: cannon controls (angle, power, color, player, fire)
// The original single #menu element was removed from HTML/CSS.

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
// bucket positions with unified baseline so they "stand" on same ground line
// Align buckets so their stroke (20px) sits visually ON the ground line (frame bottom). We raise by full half-thickness.
// frame bottom = HEIGHT - 40; bucket stroke extends 10px beyond path; so offset path by 10px upward.
const BUCKET_BASELINE_Y = HEIGHT - 40 - 10 - 10; // subtract wall thickness (20) for clean separation
const LEFT_BUCKET = { x: 230, y: BUCKET_BASELINE_Y, width: 225, height: 225 };
// Right bucket enlarged by ~4% from 300 -> 312 (after prior reductions)
const RIGHT_BUCKET = { x: 600, y: BUCKET_BASELINE_Y, width: 312, height: 312 };

// configure colours
const COLORS = {
  blue: '#277da1',
  yellow: '#f9c74f',
  green: '#90be6d',
  red: '#f94144',
  orange: '#f3722c'
};

// Palette for golden retro bucket borders (kept small & focused)
const GOLD_BORDER = {
  dark: '#3a2610',
  mid: '#8c5f1b',
  light: '#e7c157',
  shine: '#fff4cc',
  accent: '#f8d978'
};

// initial balls for both buckets (edit these values to change starting distribution)
const INITIAL_BLUE = 162;
const INITIAL_RED = 44;
const INITIAL_GREEN = 10;
const INITIAL_ORANGE = 30;
const INITIAL_YELLOW = 10;
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
let winShown = false; // ensure WIN overlay only triggers once

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
  stage = document.getElementById('stage'); // stage still exists; layout changed but id retained
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
  body.isPrefill = true; // mark as baseline (old) ball
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
  if (!winShown && baseCount + caughtCount >= WIN_COUNT) showWin();
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
  if (!arr.length) return;
  ctx.save();
  ctx.globalAlpha = 0.55; // slight transparency to differentiate baseline
  arr.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = b.renderColor;
    ctx.fill();
  });
  ctx.restore();
}

// remove balls only from the right bucket
function deleteBalls(colorName, num) {
  let removed = 0;
  // Prefer removing baseline (old) balls first
  for (let i = rightPrefill.length - 1; i >= 0 && removed < num; i--) {
    const b = rightPrefill[i];
    if (b.colorName === colorName) {
      removeBall(b);
      rightPrefill.splice(i, 1);
      removed++;
      baseCount--;
    }
  }
  // Then remove newly caught / fired balls
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
  // Remove all dynamic & prefilled bodies and rebuild initial state.
  [...balls, ...leftPrefill, ...rightPrefill].forEach(b => World.remove(world, b));
  balls.length = 0;
  caughtBalls.length = 0;
  leftPrefill.length = 0;
  rightPrefill.length = 0;
  pops.length = 0;
  countedIds.clear();
  caughtCount = 0;
  newCaughtCount = 0;
  baseCount = 0;
  currentBatch = 0;
  winShown = false;
  // Re-populate buckets
  prefillBuckets();
}

function handleKeyDown(e) {
  // Prevent simultaneous angle/power jitter by isolating axes.
  if (e.code === 'ArrowLeft') { setAngle(angleDeg + 1); e.preventDefault(); }
  else if (e.code === 'ArrowRight') { setAngle(angleDeg - 1); e.preventDefault(); }
  else if (e.code === 'ArrowUp') { setPower(powerPct + 1); e.preventDefault(); }
  else if (e.code === 'ArrowDown') { setPower(powerPct - 1); e.preventDefault(); }
  else if (e.code === 'Space') { fire(+ballsInput.value); e.preventDefault(); }
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
  // Draw night sky gradient (if starfield functions added later they can be invoked here)
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, '#0f2135');
  g.addColorStop(0.55, '#0b1828');
  g.addColorStop(1, '#091320');
  ctx.fillStyle = g;
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
  // Retro 2D gold bordered bucket with transparent interior.
  // We layer multiple strokes + pixel accents WITHOUT filling the body so balls remain fully visible.
  const half = b.width / 2;
  const top = b.y - b.height;
  const t = 20;              // logical wall thickness for physics bodies
  const offset = t / 2;      // visual stroke sits centered on path
  const frameBottom = HEIGHT - 40; // frame border baseline
  const bottomY = frameBottom - offset; // lift path so outer stroke edge rests on frame line

  // Helper to stroke only left side, bottom, right side (OPEN TOP)
  function strokeLayer(inset, color, width) {
    ctx.beginPath();
    const leftX = b.x - half - offset + inset;
    const rightX = b.x + half + offset - inset;
    const topY = top - offset + inset;
    const baseY = bottomY - inset;
    // Left wall
    ctx.moveTo(leftX, baseY);
    ctx.lineTo(leftX, topY + 10); // leave 10px gap from absolute top for openness
    // Bottom
    ctx.moveTo(leftX, baseY);
    ctx.lineTo(rightX, baseY);
    // Right wall
    ctx.moveTo(rightX, baseY);
    ctx.lineTo(rightX, topY + 10);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.stroke();
  }

  // Layered strokes (outer to inner) creating depth while leaving mouth open
  strokeLayer(0, GOLD_BORDER.dark, 22);   // silhouette
  strokeLayer(1, GOLD_BORDER.mid, 18);    // main body
  strokeLayer(4, GOLD_BORDER.light, 8);   // inner bevel
  strokeLayer(6, GOLD_BORDER.shine, 3);   // thin shine edge

  // Corner lip highlights to hint at a rim without closing full top
  const lipSpan = Math.min(40, b.width * 0.2);
  const lipY1 = top - offset + 4;
  const lipY2 = lipY1 + 3;
  // left lip
  ctx.fillStyle = GOLD_BORDER.shine;
  ctx.fillRect(b.x - half - offset + 6, lipY1, lipSpan, 3);
  ctx.fillStyle = GOLD_BORDER.accent;
  ctx.fillRect(b.x - half - offset + 6, lipY2, lipSpan, 2);
  // right lip
  ctx.fillStyle = GOLD_BORDER.shine;
  ctx.fillRect(b.x + half + offset - 6 - lipSpan, lipY1, lipSpan, 3);
  ctx.fillStyle = GOLD_BORDER.accent;
  ctx.fillRect(b.x + half + offset - 6 - lipSpan, lipY2, lipSpan, 2);

  // Side vertical highlight slivers
  ctx.fillStyle = GOLD_BORDER.shine;
  ctx.fillRect(b.x - half - offset + 5, top - offset + 10, 2, b.height * 0.25);
  ctx.fillRect(b.x + half + offset - 7, top - offset + 10, 2, b.height * 0.25);

  // Rivets along left & right edges (retro circular pixels)
  function rivets(xEdge) {
    const count = Math.max(4, Math.floor(b.height / 80));
    for (let i = 0; i < count; i++) {
      const ry = top + 30 + (i / (count - 1)) * (b.height - 90);
      ctx.beginPath();
      ctx.fillStyle = GOLD_BORDER.shine;
      ctx.arc(xEdge, ry, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = GOLD_BORDER.dark;
      ctx.arc(xEdge - 1, ry - 1, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  rivets(b.x - half - offset + 12);
  rivets(b.x + half + offset - 12);

  // Subtle inner wall texture stripes (very faint, keeps interior transparent)
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = GOLD_BORDER.light;
  ctx.lineWidth = 1;
  for (let y = top + 18; y < bottomY - 18; y += 10) {
    ctx.beginPath();
    ctx.moveTo(b.x - half + 4, y);
    ctx.lineTo(b.x + half - 4, y);
    ctx.stroke();
  }
  ctx.restore();
  // (No fill: interior remains transparent for full ball visibility.)
}

function drawLabels() {
  // Slim labels retained for quick glance; detailed stats in sidebar scoreboard.
  ctx.fillStyle = '#fff';
  ctx.font = '14px "Press Start 2P"';
  ctx.textAlign = 'center';
  const leftTop = LEFT_BUCKET.y - LEFT_BUCKET.height;
  const rightTop = RIGHT_BUCKET.y - RIGHT_BUCKET.height;
  ctx.fillText('Baseline: ' + baseCount, LEFT_BUCKET.x, leftTop - 18);
  ctx.fillText('Total: ' + (baseCount + caughtCount) + ' (+' + newCaughtCount + ')', RIGHT_BUCKET.x, rightTop - 18);
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

  // Retro pedestal base -------------------------------------------------
  const baseW = 74;
  const baseH = 26;
  const baseX = CANNON_X - baseW / 2;
  const baseY = CANNON_Y + 18; // slightly below pivot
  // base shadow
  ctx.fillStyle = '#091b2b';
  ctx.fillRect(baseX, baseY, baseW, baseH);
  // mid layer
  ctx.fillStyle = '#12324b';
  ctx.fillRect(baseX + 2, baseY + 2, baseW - 4, baseH - 6);
  // top plate
  ctx.fillStyle = '#1d4f72';
  ctx.fillRect(baseX + 4, baseY + 4, baseW - 8, baseH - 10);
  // highlight line
  ctx.fillStyle = '#5db3ff';
  ctx.fillRect(baseX + 4, baseY + 4, baseW - 8, 2);

  // Pivot ring ----------------------------------------------------------
  ctx.beginPath();
  ctx.fillStyle = '#d9ecff';
  ctx.arc(CANNON_X, CANNON_Y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = '#0d2030';
  ctx.arc(CANNON_X, CANNON_Y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = '#ffffff';
  ctx.arc(CANNON_X, CANNON_Y, 6, 0, Math.PI * 2);
  ctx.fill();

  // Barrel with layered shading ----------------------------------------
  const recoil = armUpTicks > 0 ? 4 : 0; // subtle recoil extension
  const barrelLen = BARREL_LEN + recoil;
  ctx.save();
  ctx.translate(CANNON_X, CANNON_Y);
  ctx.rotate(-angle);
  const barrelH = 16;
  // outer frame
  ctx.fillStyle = '#0d2030';
  ctx.fillRect(0, -barrelH / 2, barrelLen, barrelH);
  // inner gradient (manual stripes for pixel feel)
  const stripeW = barrelLen;
  ctx.fillStyle = '#1c3b55';
  ctx.fillRect(2, -barrelH / 2 + 2, stripeW - 4, barrelH - 4);
  ctx.fillStyle = '#2c5d82';
  ctx.fillRect(2, -barrelH / 2 + 2, stripeW - 4, 4);
  ctx.fillStyle = '#163048';
  ctx.fillRect(2, barrelH / 2 - 6, stripeW - 4, 4);
  // muzzle ring
  ctx.fillStyle = '#5db3ff';
  ctx.fillRect(barrelLen - 8, -barrelH / 2 + 2, 6, barrelH - 4);
  ctx.restore();

  // Muzzle tip indicator
  ctx.beginPath();
  ctx.fillStyle = '#d9ecff';
  ctx.arc(CANNON_X + Math.cos(angle) * barrelLen, CANNON_Y - Math.sin(angle) * barrelLen, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = '#5db3ff';
  ctx.arc(CANNON_X + Math.cos(angle) * barrelLen, CANNON_Y - Math.sin(angle) * barrelLen, 2, 0, Math.PI * 2);
  ctx.fill();

  // Angle & power labels ------------------------------------------------
  ctx.font = '12px "Press Start 2P"';
  ctx.textAlign = 'center';
  const displayAngle = 180 - angleDeg;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(Math.round(displayAngle) + '\u00B0', CANNON_X, CANNON_Y + 46);
  ctx.fillText('P ' + Math.round(powerPct) + '%', CANNON_X, CANNON_Y + 62);
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
  leftStatsEl.innerHTML = buildScoreHTML('LEFT', leftCounts);
  rightStatsEl.innerHTML = buildScoreHTML('RIGHT', rightCounts);
}

function countColors(arr) {
  const counts = { red: 0, blue: 0, yellow: 0, green: 0, orange: 0 };
  arr.forEach(b => counts[b.colorName]++);
  return counts;
}

function formatPercentages(counts, label) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return `${label} (0)`;
  const parts = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([c, v]) => `${c}:${v}`);
  return `${label} (${total}) ${parts.join(' ')}`;
}

function showWin() {
  if (winShown) return;
  winShown = true;
  if (winOverlay) winOverlay.classList.add('show');
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
    if (autoBtn) autoBtn.textContent = 'AUTO-FIRE';
  }
}

// Build scoreboard HTML (retro rows with color swatches)
const SCORE_COLOR_ORDER = ['red', 'blue', 'yellow', 'green', 'orange'];
function buildScoreHTML(label, counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 0;
  let html = `<div class=\"score-header\">${label} (${total})</div>`;
  if (total === 0) return html + '<div class=\"score-row empty\">—</div>';
  SCORE_COLOR_ORDER.forEach(color => {
    const v = counts[color];
    if (!v) return;
    const pct = ((v / total) * 100).toFixed(1).replace(/\.0$/, '');
    html += `<div class=\"score-row\"><span class=\"swatch\" data-color=\"${color}\"></span><span class=\"color-name\">${color.toUpperCase()}</span><span class=\"color-values\">${v} / ${pct}%</span></div>`;
  });
  return html;
}

// start
window.addEventListener('load', init);
