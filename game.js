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
const LEFT_BUCKET = { x: 220, y: 500, width: 260, height: 260 };
const RIGHT_BUCKET = { x: 560, y: 510, width: 380, height: 380 };

// configure colours
const COLORS = {
  blue: '#277da1',
  yellow: '#f9c74f',
  green: '#90be6d',
  red: '#f94144',
  orange: '#f3722c'
};

// initial balls per bucket (customize as desired)
const INITIAL_BALLS = {
  left: { blue: 50, yellow: 50, green: 50, red: 50, orange: 50 },
  right: { blue: 50, yellow: 50, green: 50, red: 50, orange: 50 }
};

const WIN_COUNT = 500;

// State
let caughtCount = 0;
let newCaughtCount = 0;
let baseCount = 0;
const countedIds = new Set();
const balls = [];
let engine, world, runner, sensor;
let playerImg;
let angleDeg = 135;
let powerPct = 60;
let autoInterval = null;
let charging = false;
let chargePower = 0;
let armUpTicks = 0;

// DOM refs
let canvas, ctx, stage, winOverlay, relaunchBtn;
let ballsInput, colorInput, angleInput, powerInput, shootBtn, autoBtn, resetBtn;
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
  relaunchBtn.addEventListener('click', () => window.location.reload());

  playerImg = new Image();
  playerImg.src = 'player.png';

  // inputs
  ballsInput = document.getElementById('ballsInput');
  colorInput = document.getElementById('colorInput');
  angleInput = document.getElementById('angleInput');
  powerInput = document.getElementById('powerInput');
  shootBtn = document.getElementById('shootBtn');
  autoBtn = document.getElementById('autoBtn');
  resetBtn = document.getElementById('resetBtn');

  angleInput.addEventListener('input', () => setAngle(angleInput.value));
  powerInput.addEventListener('input', () => setPower(powerInput.value));
  ballsInput.addEventListener('change', () => {
    let v = clamp(+ballsInput.value, 1, 200);
    ballsInput.value = v;
  });

  shootBtn.addEventListener('click', () => {
    newCaughtCount = 0;
    fire(+ballsInput.value);
  });
  autoBtn.addEventListener('click', toggleAuto);
  resetBtn.addEventListener('click', resetGame);

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);

  // resume audio on first interaction
  document.addEventListener('click', () => getAudioCtx().resume(), { once: true });

  setupPhysics();
  prefillBuckets();
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
  prefillBucket(leftPrefill, LEFT_BUCKET, INITIAL_BALLS.left);
  baseCount = prefillBucket(rightPrefill, RIGHT_BUCKET, INITIAL_BALLS.right);
}

function prefillBucket(arr, bucket, config) {
  arr.length = 0;
  const entries = [];
  for (const [name, count] of Object.entries(config)) {
    for (let i = 0; i < count; i++) entries.push(name);
  }
  const cols = Math.floor((bucket.width - 20) / (BALL_RADIUS * 2));
  const rows = Math.floor((bucket.height - 20) / (BALL_RADIUS * 2));
  const startX = bucket.x - (bucket.width - 20) / 2 + BALL_RADIUS;
  const startY = bucket.y - BALL_RADIUS - 10;
  let placed = 0;
  for (let r = 0; r < rows && placed < entries.length; r++) {
    for (let c = 0; c < cols && placed < entries.length; c++) {
      const colorName = entries[placed];
      const x = startX + c * BALL_RADIUS * 2;
      const y = startY - r * BALL_RADIUS * 2;
      const body = Bodies.circle(x, y, BALL_RADIUS, {
        restitution: 0.6,
        friction: 0.05,
        frictionAir: 0.01,
        density: 0.001
      });
      body.renderColor = COLORS[colorName];
      World.add(world, body);
      arr.push(body);
      placed++;
    }
  }
  return placed;
}

function handleCatch(ball) {
  if (countedIds.has(ball.id)) return;
  countedIds.add(ball.id);
  caughtCount++;
  newCaughtCount++;
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

function fire(n) {
  n = clamp(n, 1, 200);
  for (let i = 0; i < n; i++) {
    setTimeout(() => fireOne(), i * 70);
  }
}

function fireOne(powerScale = 1) {
  const angle = angleDeg * Math.PI / 180;
  const color = colorInput.value;
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
  Body.setVelocity(ball, { x: Math.cos(angle) * speed, y: -Math.sin(angle) * speed });
  balls.push(ball);
  World.add(world, ball);
  playPew();
  armUpTicks = 10;
}

function setAngle(val) {
  angleDeg = clamp(+val, 10, 170);
  angleInput.value = angleDeg;
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
  countedIds.clear();
  caughtCount = 0;
  newCaughtCount = 0;
}

function handleKeyDown(e) {
  switch (e.code) {
    case 'ArrowLeft':
      setAngle(angleDeg - 1);
      break;
    case 'ArrowRight':
      setAngle(angleDeg + 1);
      break;
    case 'ArrowDown':
      setPower(powerPct - 1);
      break;
    case 'ArrowUp':
      setPower(powerPct + 1);
      break;
    case 'Space':
      if (!charging) {
        charging = true;
        chargePower = 0;
      }
      e.preventDefault();
      break;
  }
}

function handleKeyUp(e) {
  if (e.code === 'Space' && charging) {
    charging = false;
    const scale = chargePower / 100;
    fireOne(scale);
    setPower(powerPct); // reset slider display
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
  if (charging) {
    chargePower = clamp(chargePower + dt * 0.1, 0, 100);
    powerInput.value = Math.round(chargePower);
  }
  if (armUpTicks > 0) armUpTicks--;

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#001f3f';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawBounds();
  drawBalls();
  drawPrefilledBalls(leftPrefill);
  drawPrefilledBalls(rightPrefill);
  drawVases();
  drawLabels();
  drawCannon();
  drawCharacter();

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
  const half = b.width / 2;
  const top = b.y - b.height;
  ctx.beginPath();
  ctx.moveTo(b.x - half, top);
  ctx.lineTo(b.x - half, b.y);
  ctx.lineTo(b.x + half, b.y);
  ctx.lineTo(b.x + half, top);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(b.x - half + 10, top, b.width - 20, b.height);
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
