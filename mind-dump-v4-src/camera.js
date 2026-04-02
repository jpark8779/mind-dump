// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — Camera System
// ═══════════════════════════════════════════════════════

export let cam = { px: 0, py: 0, scale: 1.0 };

// ── FRICTION CONSTANTS ────────────────────────────────
const ZOOM_FRICTION = 0.88;
const PAN_FRICTION  = 0.92;
const MIN_VELOCITY  = 0.0005;
const MIN_PAN_V     = 0.3;

// ── ANIMATION STATE ───────────────────────────────────
const anim = {
  active: false, rafId: null,
  zoomVelocity: 0, zoomAnchorSx: 0, zoomAnchorSy: 0,
  panVx: 0, panVy: 0,
  lastPanTime: 0, lastPanX: 0, lastPanY: 0
};

// ── CANVAS DIMENSIONS ─────────────────────────────────
export let W = window.innerWidth;
export let H = window.innerHeight - 48 - 64; // minus top-bar and bottom-nav

export function updateDimensions() {
  W = window.innerWidth;
  H = document.getElementById('canvas-wrap')?.clientHeight || (window.innerHeight - 48 - 64);
}

// ── APPLY CAMERA ──────────────────────────────────────
export function applyCamera() {
  const world = document.getElementById('world');
  if (world) {
    world.setAttribute('transform',
      `translate(${cam.px.toFixed(1)},${cam.py.toFixed(1)}) scale(${cam.scale.toFixed(5)})`
    );
  }
}

// ── ZOOM AT SCREEN POINT ──────────────────────────────
export function zoomAtRaw(sx, sy, newScale) {
  const wx = (sx - cam.px) / cam.scale;
  const wy = (sy - cam.py) / cam.scale;
  cam.scale = Math.max(0.2, Math.min(6, newScale));
  cam.px = sx - wx * cam.scale;
  cam.py = sy - wy * cam.scale;
}

export function zoomAt(sx, sy, factor) {
  zoomAtRaw(sx, sy, cam.scale * factor);
  applyCamera();
}

// ── SCREEN ↔ WORLD ────────────────────────────────────
export function screenToWorld(sx, sy) {
  return { x: (sx - cam.px) / cam.scale, y: (sy - cam.py) / cam.scale };
}

// ── FIT ALL NODES ─────────────────────────────────────
export function fitAll(layouts) {
  const ids = Object.keys(layouts);
  if (ids.length === 0) { cam = {px: W/2, py: H/2, scale: 1}; applyCamera(); return; }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  ids.forEach(id => {
    const l = layouts[id];
    if (l.x < minX) minX = l.x;
    if (l.x > maxX) maxX = l.x;
    if (l.y < minY) minY = l.y;
    if (l.y > maxY) maxY = l.y;
  });

  const padding = 80;
  const rangeX = (maxX - minX) + padding * 2;
  const rangeY = (maxY - minY) + padding * 2;
  cam.scale = Math.max(0.2, Math.min(2, Math.min(W / rangeX, H / rangeY)));
  cam.px = W / 2 - ((minX + maxX) / 2) * cam.scale;
  cam.py = H / 2 - ((minY + maxY) / 2) * cam.scale;
  applyCamera();
}

// ── INERTIA ANIMATION ─────────────────────────────────
export function addZoomImpulse(sx, sy, impulse) {
  anim.zoomVelocity += impulse;
  anim.zoomAnchorSx = sx;
  anim.zoomAnchorSy = sy;
  startAnimLoop();
}

export function addPanVelocity(vx, vy) {
  anim.panVx = vx;
  anim.panVy = vy;
  startAnimLoop();
}

export function recordPanPoint(x, y) {
  anim.lastPanTime = Date.now();
  anim.lastPanX = x;
  anim.lastPanY = y;
}

function startAnimLoop() {
  if (anim.active) return;
  anim.active = true;
  anim.rafId = requestAnimationFrame(animTick);
}

function animTick() {
  let needsRender = false;

  if (Math.abs(anim.zoomVelocity) > MIN_VELOCITY) {
    zoomAtRaw(anim.zoomAnchorSx, anim.zoomAnchorSy, cam.scale * (1 + anim.zoomVelocity));
    anim.zoomVelocity *= ZOOM_FRICTION;
    needsRender = true;
  } else {
    anim.zoomVelocity = 0;
  }

  if (Math.abs(anim.panVx) > MIN_PAN_V || Math.abs(anim.panVy) > MIN_PAN_V) {
    cam.px += anim.panVx;
    cam.py += anim.panVy;
    anim.panVx *= PAN_FRICTION;
    anim.panVy *= PAN_FRICTION;
    needsRender = true;
  } else {
    anim.panVx = 0;
    anim.panVy = 0;
  }

  if (needsRender) {
    try { applyCamera(); } catch(e) {}
    anim.rafId = requestAnimationFrame(animTick);
  } else {
    anim.active = false;
    anim.rafId = null;
  }
}

export function stopAnim() {
  anim.panVx = 0; anim.panVy = 0; anim.zoomVelocity = 0;
}
