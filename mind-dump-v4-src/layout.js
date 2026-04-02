// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — Layout Engine
// ═══════════════════════════════════════════════════════

import { state } from './state.js';
import { cam, W, H } from './camera.js';

// layouts: id → { x, y, radius, _angle }
export let layouts = {};

export function computeLayout() {
  const cx = W / 2;
  const cy = H / 2;
  layouts = {};

  // Adaptive spacing factor based on zoom
  const breathe = 0.7 + Math.min(cam.scale, 3) * 0.35;

  // ── Tier 1: Categories — circular around center ───────
  const activeCats = state.categories;
  activeCats.forEach((cat, i) => {
    const n = activeCats.length;
    const baseRadius = Math.max(Math.min(W, H) * 0.22, n * 38);
    const radius = baseRadius * (0.85 + breathe * 0.15);
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    layouts[cat.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      radius: 22,
      _angle: angle
    };
  });

  // ── Tier 2: Subcategories — radiate from parent ───────
  state.subcategories.forEach(sub => {
    const parent = activeCats.find(c => c.id === sub.parentId);
    if (!parent || !layouts[parent.id]) return;
    const parentLoc = layouts[parent.id];
    const siblings = state.subcategories.filter(s => s.parentId === sub.parentId);
    const parentAngle = Math.atan2(parentLoc.y - cy, parentLoc.x - cx);
    const spread = Math.min(Math.PI * 0.7, siblings.length * 0.4);
    const subIdx = siblings.findIndex(s => s.id === sub.id);
    const t = siblings.length > 1 ? subIdx / (siblings.length - 1) : 0.5;
    const subAngle = parentAngle - spread / 2 + spread * t;
    const baseDistance = Math.max(Math.min(W, H) * 0.09, siblings.length * 24);
    layouts[sub.id] = {
      x: parentLoc.x + baseDistance * breathe * Math.cos(subAngle),
      y: parentLoc.y + baseDistance * breathe * Math.sin(subAngle),
      radius: 12,
      _angle: subAngle
    };
  });

  // ── Tier 3: Thoughts — radiate from subcategory ───────
  state.thoughts.forEach(thought => {
    if (state.hideResolved && thought.resolved) return;
    const sub = state.subcategories.find(s => s.id === thought.subcategoryId);
    if (!sub || !layouts[sub.id]) return;
    const subLoc = layouts[sub.id];
    const siblings = state.thoughts.filter(t =>
      t.subcategoryId === thought.subcategoryId && (!state.hideResolved || !t.resolved)
    );
    const thoughtIdx = siblings.findIndex(t => t.id === thought.id);
    if (thoughtIdx < 0) return;
    const baseAngle = subLoc._angle || 0;
    const spread = Math.min(Math.PI * 0.8, siblings.length * 0.5);
    const t = siblings.length > 1 ? thoughtIdx / (siblings.length - 1) : 0.5;
    const angle = baseAngle - spread / 2 + spread * t;
    const baseDistance = Math.max(Math.min(W, H) * 0.045, siblings.length * 12);
    layouts[thought.id] = {
      x: subLoc.x + baseDistance * breathe * 1.1 * Math.cos(angle),
      y: subLoc.y + baseDistance * breathe * 1.1 * Math.sin(angle),
      radius: 3 + thought.weight * 7  // weight 0→1 maps to radius 3→10
    };
  });

  // ── Repulsion: subcategories ──────────────────────────
  const subMinDist = 35 * breathe;
  state.subcategories.forEach((sub, i) => {
    if (!layouts[sub.id]) return;
    for (let j = i + 1; j < state.subcategories.length; j++) {
      const other = state.subcategories[j];
      if (!layouts[other.id]) continue;
      const dx = layouts[other.id].x - layouts[sub.id].x;
      const dy = layouts[other.id].y - layouts[sub.id].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < subMinDist && dist > 0) {
        const force = (subMinDist - dist) / 2;
        const ra = Math.atan2(dy, dx);
        layouts[sub.id].x -= force * Math.cos(ra);
        layouts[sub.id].y -= force * Math.sin(ra);
        layouts[other.id].x += force * Math.cos(ra);
        layouts[other.id].y += force * Math.sin(ra);
      }
    }
  });

  // ── Repulsion: thoughts ───────────────────────────────
  const tMinDist = 12 * breathe;
  state.thoughts.forEach((t, i) => {
    if (!layouts[t.id]) return;
    for (let j = i + 1; j < state.thoughts.length; j++) {
      const other = state.thoughts[j];
      if (!layouts[other.id]) continue;
      const dx = layouts[other.id].x - layouts[t.id].x;
      const dy = layouts[other.id].y - layouts[t.id].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < tMinDist && dist > 0) {
        const force = (tMinDist - dist) / 2;
        const ra = Math.atan2(dy, dx);
        layouts[t.id].x -= force * Math.cos(ra);
        layouts[t.id].y -= force * Math.sin(ra);
        layouts[other.id].x += force * Math.cos(ra);
        layouts[other.id].y += force * Math.sin(ra);
      }
    }
  });
}

// ── HIT TEST ──────────────────────────────────────────
export function hitTest(wx, wy) {
  // thoughts (smallest, check first)
  for (const thought of [...state.thoughts].reverse()) {
    if (state.hideResolved && thought.resolved) continue;
    const l = layouts[thought.id];
    if (!l) continue;
    const hitR = Math.max(l.radius + 6, 12);
    if (Math.hypot(wx - l.x, wy - l.y) < hitR) {
      return { type: 'thought', id: thought.id };
    }
  }
  // subcategories
  for (const sub of state.subcategories) {
    const l = layouts[sub.id];
    if (!l) continue;
    if (Math.hypot(wx - l.x, wy - l.y) < 20) {
      return { type: 'subcategory', id: sub.id };
    }
  }
  // categories
  for (const cat of state.categories) {
    const l = layouts[cat.id];
    if (!l) continue;
    if (Math.hypot(wx - l.x, wy - l.y) < 30) {
      return { type: 'category', id: cat.id };
    }
  }
  return null;
}
