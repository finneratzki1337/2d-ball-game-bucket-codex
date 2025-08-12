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
const BALL_RADIUS = 9;
const BASE_COUNT = 250;
const PREFILL_COUNT = 250;

// State
let caughtCount = 0;
let newCaughtCount = 0;
const countedIds = new Set();
const balls = [];
let engine, world, runner, sensor;
let angleDeg = 135;
let powerPct = 60;
let autoInterval = null;
let charging = false;
let chargePower = 0;
let armUpTicks = 0;

// DOM refs
let canvas, ctx, stage;
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
  makeVase(220, 420, 260, 260, false); // left bucket
  sensor = makeVase(600, 380, 360, 300, true); // large bucket with sensor

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
  leftPrefill.length = 0;
  rightPrefill.length = 0;
  for (let i = 0; i < PREFILL_COUNT; i++) {
    const color = randomColor();
    leftPrefill.push({
      x: randomRange(90 + BALL_RADIUS, 350 - BALL_RADIUS),
      y: randomRange(160 + BALL_RADIUS, 420 - BALL_RADIUS),
      color
    });
    rightPrefill.push({
      x: randomRange(420 + BALL_RADIUS, 780 - BALL_RADIUS),
      y: randomRange(380 - BALL_RADIUS - 150, 380 - BALL_RADIUS),
      color
    });
  }
}

function handleCatch(ball) {
  if (countedIds.has(ball.id)) return;
  countedIds.add(ball.id);
  caughtCount++;
  newCaughtCount++;
  playDing();
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
    ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
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
    x: 820 + Math.cos(angle) * BARREL_LEN,
    y: 420 - Math.sin(angle) * BARREL_LEN
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

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
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
  drawPrefilledBalls(leftPrefill);
  drawPrefilledBalls(rightPrefill);
  drawVases();
  drawLabels();
  drawBalls();
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
  // left bucket
  ctx.beginPath();
  ctx.moveTo(90, 160);
  ctx.lineTo(90, 420);
  ctx.lineTo(350, 420);
  ctx.lineTo(350, 160);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(100, 160, 260 - 20, 260);

  // right bucket
  ctx.beginPath();
  ctx.moveTo(420, 80);
  ctx.lineTo(420, 380);
  ctx.lineTo(780, 380);
  ctx.lineTo(780, 80);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(430, 80, 360 - 20, 300);
}

function drawLabels() {
  ctx.fillStyle = '#fff';
  ctx.font = '16px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('2024', 220, 480);
  ctx.fillText('Total: ' + (BASE_COUNT + caughtCount), 600, 420);
  ctx.fillText('(+' + newCaughtCount + ')', 600, 440);
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
  ctx.arc(820, 420, 20, 0, Math.PI * 2);
  ctx.fill();
  // barrel
  ctx.save();
  ctx.translate(820, 420);
  ctx.rotate(-angle);
  ctx.fillRect(0, -5, BARREL_LEN, 10);
  ctx.restore();
  // muzzle mark
  ctx.beginPath();
  ctx.arc(820 + Math.cos(angle) * BARREL_LEN, 420 - Math.sin(angle) * BARREL_LEN, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCharacter() {
  const x = 770;
  const y = 420;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y - 30, 10, 0, Math.PI * 2); // head
  ctx.moveTo(x, y - 20);
  ctx.lineTo(x, y + 20); // body
  ctx.moveTo(x, y);
  ctx.lineTo(x - 15, y + 25); // left leg
  ctx.moveTo(x, y);
  ctx.lineTo(x + 15, y + 25); // right leg
  // arms
  if (armUpTicks > 0) {
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x + 20, y - 30);
  } else {
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x + 25, y + 5);
  }
  ctx.stroke();
}

// start
window.addEventListener('load', init);
