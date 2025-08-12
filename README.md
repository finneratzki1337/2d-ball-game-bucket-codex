# 2d-ball-game-bucket-codex
2d ball game for filling up the budget

Codex Task: Build a retro 2D browser game (no build tools)
Goal: A small character operates a cannon that shoots balls into a large vase. A left‑hand menu lets the user set number of balls and color. Everything runs in the browser with no build step (3 static files). Slight physics, retro style, simple sounds.

Deliverables (exactly 3 files)
index.html

style.css

game.js

No frameworks or bundlers. Only external library allowed: Matter.js via CDN.

Dependencies
Matter.js 0.19.0 via CDN:
https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js

Optional Google font for retro look: "Press Start 2P" (via fonts.googleapis).

Layout & Coordinates (base canvas 1024×576; responsive scale)
Left fixed menu width: 260 px. Canvas fills remaining width.

World coordinate system tied to the canvas; on resize, scale drawing but keep physics sizes constant.

World elements (in canvas coordinates):

Ground & world bounds: 40 px margin on all sides (static bodies).

Cannon base at (820, 420), barrel length 60 px, default angle 45°.
Barrel tip (“muzzle”) is where new balls spawn.

Small baseline vase (left): U‑shape with inside width 120, height 140, positioned so the inner bottom is at (220, 420).

Large target vase (center): U‑shape with inside width 180, height 180, inner bottom at (520, 380).

Target sensor: rectangle inside the large vase (width = innerWidth - 10, height = innerHeight - 10, isSensor=true) used to count caught balls.

Game Rules
Left vase shows a fixed Baseline = 250.

Large vase shows Total = 250 + caughtCount and a small (+X) showing only newly caught balls this session.

Balls bounce realistically and must not visually overlap once simulated.

Press SHOOT to fire N balls (from menu) with a short delay per ball (60–80 ms) to avoid spawn overlap.

Angle and power are adjustable via UI and keyboard.

Spacebar: hold to charge power (visual lever animation); release to shoot one ball at charged power.

UI (DOM in index.html, styled by style.css)
Left sidebar (<aside id="menu">) contains:

Label + numeric input # Balls (id="ballsInput", min 1, max 200, default 4).

Label + color input Color (id="colorInput", default e.g. #f94144).

Slider Angle 10°–80° (id="angleInput", default 45).

Slider Power 0–100 (id="powerInput", default 60).

Buttons:

SHOOT (id="shootBtn")

AUTO-FIRE toggle (id="autoBtn")

RESET (id="resetBtn")

Canvas area:

<div id="stage"><canvas id="game" width="1024" height="576"></canvas></div>

Under each vase, draw a label box:

Left: “Baseline: 250”

Center: “Total: 250 + caughtCount” and “(+X)”

Accessibility/visuals:

High-contrast, dark text on buttons; large hit targets; simple focus styles.

Visual Style (no image assets)
Use a custom canvas renderer (do not use Matter.Render).

Disable smoothing: ctx.imageSmoothingEnabled = false.

Retro palette (recommend ~6 colors): dark blue background; light gray UI; white text; bright ball color from the color picker.

Scanline overlay: pseudo‑CRT effect with a semi‑transparent repeating linear‑gradient overlay on the canvas wrapper.

Character and cannon drawn as simple shapes/lines (2–3 polygons). The character raises its arm briefly when firing.

Vases drawn as thick‑lined U‑shapes; interiors slightly darker.

Physics & Engine Setup (game.js)
Create Engine, World, Runner from Matter. Use a single requestAnimationFrame render loop.

Gravity: { x: 0, y: 0.9 }.

Engine settings: positionIterations=6, velocityIterations=4, constraintIterations=4.

Bodies:

Static world bounds (floor, left, right).

U‑shape vases built from 3 static rectangles each (left wall, right wall, bottom).
For the large vase, add the internal sensor (isSensor: true).

Balls are circles: radius 9, restitution: 0.6, friction: 0.05, frictionAir: 0.01, density: 0.001.

State variables:

js
Kopieren
Bearbeiten
let baseCount = 250;
let caughtCount = 0;       // number of balls that touched the target sensor
let newCaughtCount = 0;    // same as caughtCount for this session
let batchSize = 4;         // from UI
let ballColor = '#f94144'; // from UI
let angleDeg = 45;
let powerPct = 60;
let autoFire = false;
let balls = new Set();     // track active ball bodies
let countedIds = new Set();// ball.id that already triggered count
const MAX_ACTIVE_BALLS = 400;
Spawning & shooting:

Function spawnBall(color) creates a circle body at the muzzle point (computed from cannon base and angleDeg).

On fire, set an initial velocity:

js
Kopieren
Bearbeiten
const v = powerToVelocity(powerPct); // map 0..100 → practical speed
Body.setVelocity(ball, { x: v * Math.cos(rad), y: -v * Math.sin(rad) });
Add a tiny forward applyForce impulse to ensure separation from the barrel.

No overlap on spawn: Only spawn if distance from muzzle to nearest ball > (2*radius + 2). Otherwise delay to next frame.

Fire batchSize balls with a setInterval delay of ~70 ms, stopping early if off‑screen limit would be exceeded.

Collision handling:

Listen to Events.on(engine, 'collisionStart', handler).

When a non‑counted ball overlaps the target sensor, mark once:

js
Kopieren
Bearbeiten
if (isBall && isTargetSensor && !countedIds.has(ball.id)) {
  countedIds.add(ball.id);
  caughtCount++;
  newCaughtCount++;
  playDing();
}
Do not remove the ball on count; let it settle naturally.

Cleanup:

Each tick, remove balls that are far off‑screen (y > canvas.height + 200 or x < -200 or x > canvas.width + 200) from the world and sets.

If balls.size > MAX_ACTIVE_BALLS, remove the oldest uncounted ball(s) first (FIFO).

Input & Controls
Menu bindings: keep batchSize, ballColor, angleDeg, powerPct in sync with inputs.

Keyboard:

Left/Right arrows: adjust angleDeg by ±1°, clamp to [10, 80].

Up/Down arrows: adjust powerPct by ±1, clamp to [0, 100].

Spacebar: holding increases an internal charge 0→1 over ~0.8s (ease‑out). Lever/arm animation reflects charge. Releasing Space fires a single ball using powerPct * (0.5 + 0.5*charge).

Buttons:

SHOOT: fire batchSize balls using current angleDeg and powerPct.

AUTO-FIRE: toggle on/off; when on, fire one ball every 200 ms.

RESET: remove all dynamic balls from the world, reset caughtCount and newCaughtCount, clear countedIds.

Rendering Loop (custom)
Clear canvas; draw background.

Draw ground line and world bounds (subtle).

Draw vases as rect lines; for the large vase, draw count labels under it:

Total: ${baseCount + caughtCount}

(+${newCaughtCount})

Draw the small vase label: Baseline: 250.

Draw balls: solid fill with ball.renderColor assigned at spawn.

Draw cannon: base, barrel rotated to angleDeg; muzzle position marked.

Draw character: simple stick figure; if firing/charging, animate arm up and a tiny recoil when a ball is spawned.

Draw left HUD titles using a pixel font; ensure crisp text (integer positions).

Apply scanline overlay (via CSS on #stage::after).

Audio (WebAudio, no files)
playPew() on each shot: short blip using an oscillator (square or triangle), quick attack (0.005), decay (~0.08), slight frequency drop (e.g., 900→500 Hz).

playDing() on successful catch: short sine at ~880 Hz, decay 0.15, quieter than pew.

Create a single AudioContext resumed on first user interaction.

Resizing
Keep canvas internal size at 1024×576. For responsiveness, scale the CSS size of #stage proportionally; compute a screen scale factor and apply when converting mouse coordinates if needed. Drawing should use world coordinates; physics remains unchanged.

Program Structure (game.js)
Top‑level constants + state.

init():

Setup DOM refs, inputs, and event listeners.

Create engine, world, runner.

Build world: bounds, vases, sensor, cannon base.

Start runner and requestAnimationFrame(render).

Helper creators: makeVase(x, y, innerW, innerH), makeBall(x, y, color).

Control functions: fire(n), fireOne(powerScale=1), setAngle(deg), setPower(pct), resetGame().

Collision handler + cleanup routine in a per‑tick update.

Rendering: render(ctx, dt).

Audio helpers: playPew(), playDing().

Utility: powerToVelocity(pct) maps 0–100 to a practical range (e.g., 0→0, 100→22 px/ms).

All functions should be commented and variables named clearly.

Constraints & Validation
Clamp all numeric inputs to their ranges; ignore invalid values.

Ensure balls never double‑count: use countedIds set.

Ensure no visible overlaps: rely on physics contact resolution plus staggered spawn and initial muzzle clearance.

Keep 50–60 FPS with up to 300 active balls on a modern desktop browser.

Acceptance Criteria (must pass)
Opening index.html starts the game with no console errors.

The SHOOT button fires exactly the number of balls set in # Balls.

Newly spawned balls use the color selected in the color picker (existing balls retain their color).

Balls collide and stack without visual overlap; they can land inside the large vase.

The large vase counter shows Total = 250 + caughtCount and a (+X) for new balls.

Reset clears all balls and resets counts; menu values remain.

Keyboard controls work (angle/power arrows, Space to charge and shoot).

Auto‑fire toggle works and can be stopped.

Basic sounds play on shoot/catch (muted by browser until first interaction is acceptable).

Layout is usable on mobile landscape; left menu readable; canvas scaled; buttons tappable.

File Skeletons
index.html

<aside id="menu"> with labeled inputs and the three buttons (ids above).

<div id="stage"> wrapping <canvas id="game">.

Link to style.css, Matter.js CDN, and game.js.

style.css

Two‑column layout (left fixed menu, right canvas).

Pixel font, high contrast, large buttons/sliders.

#stage uses image-rendering: pixelated; and a scanline ::after overlay.

game.js

Initialization code and modules as described above, including custom draw code.

Nice‑to‑have (if time permits; optional)
Subtle muzzle flash (a small triangle for 1–2 frames).

Wind toggle (adds small horizontal gravity).

UI readout of angle/power values next to sliders.

Produce the complete, commented source for the three files.
