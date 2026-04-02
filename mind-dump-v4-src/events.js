// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — Event Handling
// ═══════════════════════════════════════════════════════

import { cam, applyCamera, zoomAtRaw, addZoomImpulse, addPanVelocity, stopAnim, screenToWorld, updateDimensions, fitAll as cameraFitAll } from './camera.js';
import { hitTest, layouts } from './layout.js';
import { render, selected, setSelected } from './render.js';
import { state } from './state.js';
import { showBottomSheet, hideBottomSheet } from './ui.js';

// ── DRAG STATE ────────────────────────────────────────
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let lastPanX = 0, lastPanY = 0, lastPanTime = 0;
let panVx = 0, panVy = 0;
let nodeClickSuppressed = false;
let movedPixels = 0;

// ── TOUCH STATE ───────────────────────────────────────
const touchState = { active: false, dist: 0, cx: 0, cy: 0, lastScale: 1 };
let touches = [];

export function initEvents() {
  const svg = document.getElementById('main-svg');
  if (!svg) return;

  // ── Mouse Events ──────────────────────────────────────
  svg.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('click', onSvgClick);

  // ── Touch Events ──────────────────────────────────────
  svg.addEventListener('touchstart', onTouchStart, { passive: false });
  svg.addEventListener('touchmove', onTouchMove, { passive: false });
  svg.addEventListener('touchend', onTouchEnd, { passive: false });

  // ── Keyboard ──────────────────────────────────────────
  window.addEventListener('keydown', onKeyDown);

  // ── Zoom Buttons ──────────────────────────────────────
  document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
    zoomAtCenter(1.3);
  });
  document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
    zoomAtCenter(1 / 1.3);
  });
  document.getElementById('zoom-fit-btn')?.addEventListener('click', () => {
    cameraFitAll(layouts);
    render('fit');
  });

  // ── Window Resize ─────────────────────────────────────
  window.addEventListener('resize', () => {
    // Skip rerender when session is open (keyboard popup on mobile)
    if (document.getElementById('session-overlay')?.style.display === 'flex') return;
    updateDimensions();
    render('resize');
  });
}

function zoomAtCenter(factor) {
  const w = document.getElementById('canvas-wrap');
  const cx = (w?.clientWidth || window.innerWidth) / 2;
  const cy = (w?.clientHeight || window.innerHeight) / 2;
  zoomAtRaw(cx, cy, cam.scale * factor);
  applyCamera();
}

// ── MOUSE DOWN ────────────────────────────────────────
function onMouseDown(e) {
  if (e.button !== 0) return;
  stopAnim();
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  lastPanX = e.clientX;
  lastPanY = e.clientY;
  lastPanTime = Date.now();
  panVx = 0; panVy = 0;
  movedPixels = 0;
  nodeClickSuppressed = false;
}

// ── MOUSE MOVE ────────────────────────────────────────
function onMouseMove(e) {
  if (!isDragging) return;
  const dx = e.clientX - lastPanX;
  const dy = e.clientY - lastPanY;
  const now = Date.now();
  const dt = now - lastPanTime;

  cam.px += dx;
  cam.py += dy;
  applyCamera();

  movedPixels += Math.abs(dx) + Math.abs(dy);
  if (movedPixels > 8) nodeClickSuppressed = true;

  if (dt > 0) {
    panVx = dx;
    panVy = dy;
  }
  lastPanX = e.clientX;
  lastPanY = e.clientY;
  lastPanTime = now;
}

// ── MOUSE UP ──────────────────────────────────────────
function onMouseUp(e) {
  if (!isDragging) return;
  isDragging = false;
  if (movedPixels > 8 && (Math.abs(panVx) > 1 || Math.abs(panVy) > 1)) {
    addPanVelocity(panVx * 1.5, panVy * 1.5);
  }
}

// ── SVG CLICK (node selection) ────────────────────────
function onSvgClick(e) {
  if (nodeClickSuppressed) { nodeClickSuppressed = false; return; }
  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const { x: wx, y: wy } = screenToWorld(sx, sy);

  const hit = hitTest(wx, wy);
  if (hit) {
    setSelected(hit);
    showBottomSheet(hit);
    render('selection');
  } else {
    // Click on background → deselect
    if (selected) {
      setSelected(null);
      hideBottomSheet();
      render('deselect');
    }
  }
}

// ── WHEEL ZOOM ────────────────────────────────────────
function onWheel(e) {
  e.preventDefault();
  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const impulse = -e.deltaY * 0.0008;
  addZoomImpulse(sx, sy, impulse);
}

// ── TOUCH EVENTS ──────────────────────────────────────
function onTouchStart(e) {
  e.preventDefault();
  stopAnim();
  touches = Array.from(e.touches);

  if (touches.length === 1) {
    isDragging = true;
    dragStartX = touches[0].clientX;
    dragStartY = touches[0].clientY;
    lastPanX = touches[0].clientX;
    lastPanY = touches[0].clientY;
    lastPanTime = Date.now();
    panVx = 0; panVy = 0;
    movedPixels = 0;
    nodeClickSuppressed = false;
    touchState.active = false;
  } else if (touches.length === 2) {
    isDragging = false;
    touchState.active = true;
    touchState.dist = getTouchDist(touches);
    touchState.cx = (touches[0].clientX + touches[1].clientX) / 2;
    touchState.cy = (touches[0].clientY + touches[1].clientY) / 2;
    touchState.lastScale = cam.scale;
  }
}

function onTouchMove(e) {
  e.preventDefault();
  touches = Array.from(e.touches);

  if (touches.length === 1 && isDragging) {
    const dx = touches[0].clientX - lastPanX;
    const dy = touches[0].clientY - lastPanY;
    const now = Date.now();

    cam.px += dx; cam.py += dy;
    applyCamera();

    movedPixels += Math.abs(dx) + Math.abs(dy);
    if (movedPixels > 8) nodeClickSuppressed = true;

    panVx = dx; panVy = dy;
    lastPanX = touches[0].clientX;
    lastPanY = touches[0].clientY;
    lastPanTime = now;

  } else if (touches.length === 2 && touchState.active) {
    const newDist = getTouchDist(touches);
    const newCx = (touches[0].clientX + touches[1].clientX) / 2;
    const newCy = (touches[0].clientY + touches[1].clientY) / 2;
    const wrap = document.getElementById('canvas-wrap');
    const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
    const sx = newCx - rect.left;
    const sy = newCy - rect.top;

    if (touchState.dist > 0) {
      const newScale = cam.scale * (newDist / touchState.dist);
      zoomAtRaw(sx, sy, newScale);

      // Pan from centroid movement
      const panDx = newCx - touchState.cx;
      const panDy = newCy - touchState.cy;
      cam.px += panDx; cam.py += panDy;
    }

    applyCamera();
    touchState.dist = newDist;
    touchState.cx = newCx;
    touchState.cy = newCy;
    nodeClickSuppressed = true;
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  const remainingTouches = Array.from(e.touches);

  if (remainingTouches.length === 0) {
    if (isDragging && movedPixels <= 8) {
      // Treat as tap
      const wrap = document.getElementById('canvas-wrap');
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
      const sx = dragStartX - rect.left;
      const sy = dragStartY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const hit = hitTest(wx, wy);
      if (hit) {
        setSelected(hit);
        showBottomSheet(hit);
        render('selection');
      } else if (selected) {
        setSelected(null);
        hideBottomSheet();
        render('deselect');
      }
    } else if (isDragging && (Math.abs(panVx) > 1 || Math.abs(panVy) > 1)) {
      addPanVelocity(panVx * 2, panVy * 2);
    }
    isDragging = false;
    touchState.active = false;
  } else if (remainingTouches.length === 1) {
    touchState.active = false;
    isDragging = true;
    lastPanX = remainingTouches[0].clientX;
    lastPanY = remainingTouches[0].clientY;
    lastPanTime = Date.now();
    panVx = 0; panVy = 0;
    movedPixels = 99; // prevent tap detection
    nodeClickSuppressed = true;
  }
  touches = remainingTouches;
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

// ── KEYBOARD ──────────────────────────────────────────
function onKeyDown(e) {
  // Don't intercept when in input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case '+': case '=':
      e.preventDefault(); zoomAtCenter(1.2); break;
    case '-':
      e.preventDefault(); zoomAtCenter(1 / 1.2); break;
    case '0':
      e.preventDefault(); cameraFitAll(layouts); render('fit'); break;
    case 'Escape':
      if (selected) { setSelected(null); hideBottomSheet(); render('deselect'); }
      break;
    case '/':
      // Open session overlay
      document.getElementById('session-overlay')?.dispatchEvent(new CustomEvent('open'));
      break;
    case 'r': case 'R':
      state.hideResolved = !state.hideResolved;
      render('toggle-resolved');
      break;
  }
}
