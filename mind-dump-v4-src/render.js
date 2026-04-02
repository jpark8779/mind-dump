// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — SVG Render Engine
// ═══════════════════════════════════════════════════════

import { state, COLORS, EMOTION, REL_TYPES } from './state.js';
import { computeLayout, layouts } from './layout.js';
import { W, H } from './camera.js';

export let selected = null;  // { type, id }

export function setSelected(sel) { selected = sel; }

// ── MAIN RENDER ───────────────────────────────────────
export function render(reason) {
  const mainSvg = document.getElementById('main-svg');
  if (!mainSvg) return;

  // Update SVG dimensions
  mainSvg.setAttribute('width', W);
  mainSvg.setAttribute('height', H);

  computeLayout();

  const world = document.getElementById('world');
  if (!world) return;

  let html = '';

  // Dimming logic
  const dimSet = getDimSet();

  // ── 1. Category relationship curves ───────────────────
  html += renderCategoryRelationships(dimSet);

  // ── 2. Category → Subcategory connector lines ──────────
  html += renderSubConnectors(dimSet);

  // ── 3. Subcategory → Thought connector lines ───────────
  html += renderThoughtConnectors(dimSet);

  // ── 4. Selected thought relationships ─────────────────
  if (selected?.type === 'thought') {
    html += renderThoughtRelationships(selected.id, dimSet);
  }

  // ── 5. Thought nodes ──────────────────────────────────
  html += renderThoughts(dimSet);

  // ── 6. Subcategory nodes ──────────────────────────────
  html += renderSubcategories(dimSet);

  // ── 7. Category nodes ────────────────────────────────
  html += renderCategories(dimSet);

  world.innerHTML = html;

  // Update empty state
  const hasContent = state.categories.length > 0 || state.thoughts.length > 0;
  const emptyEl = document.getElementById('empty-state');
  if (emptyEl) emptyEl.classList.toggle('hidden', hasContent);

  // Update stats
  updateStats();

  // Update emotion tint
  updateEmotionTint();

  // Update snapshot slider
  updateSnapshotSlider();
}

// ── DIMMING SET ───────────────────────────────────────
function getDimSet() {
  if (!selected) return null;
  const dimIds = new Set();
  const brightIds = new Set();

  if (selected.type === 'category') {
    const catId = selected.id;
    brightIds.add(catId);
    // subs under this cat
    state.subcategories.filter(s => s.parentId === catId).forEach(s => {
      brightIds.add(s.id);
      state.thoughts.filter(t => t.subcategoryId === s.id).forEach(t => brightIds.add(t.id));
    });
    // related categories
    state.relationships.forEach(r => {
      if (r.from === catId) brightIds.add(r.to);
      if (r.to === catId) brightIds.add(r.from);
    });
  } else if (selected.type === 'subcategory') {
    const subId = selected.id;
    brightIds.add(subId);
    const sub = state.subcategories.find(s => s.id === subId);
    if (sub) brightIds.add(sub.parentId);
    state.thoughts.filter(t => t.subcategoryId === subId).forEach(t => brightIds.add(t.id));
  } else if (selected.type === 'thought') {
    const thoughtId = selected.id;
    brightIds.add(thoughtId);
    const thought = state.thoughts.find(t => t.id === thoughtId);
    if (thought) {
      brightIds.add(thought.subcategoryId);
      const sub = state.subcategories.find(s => s.id === thought.subcategoryId);
      if (sub) brightIds.add(sub.parentId);
    }
    // related thoughts
    state.thoughtRelationships.forEach(r => {
      if (r.from === thoughtId) brightIds.add(r.to);
      if (r.to === thoughtId) brightIds.add(r.from);
    });
  }

  // Everything not in brightIds → dim
  [...state.categories, ...state.subcategories, ...state.thoughts].forEach(item => {
    if (!brightIds.has(item.id)) dimIds.add(item.id);
  });

  return { dimIds, brightIds };
}

// ── CATEGORY RELATIONSHIP CURVES ─────────────────────
function renderCategoryRelationships(dimSet) {
  if (state.relationships.length === 0) return '';
  let html = '';
  state.relationships.forEach(rel => {
    const fp = layouts[rel.from]; const tp = layouts[rel.to];
    if (!fp || !tp) return;
    const rt = REL_TYPES[rel.type] || REL_TYPES.connects;
    const dx = tp.x - fp.x, dy = tp.y - fp.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 1) return;
    const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;

    // Offset for multiple relations between same pair
    const pairKey = [rel.from, rel.to].sort().join('|');
    const pairRels = state.relationships.filter(r => [r.from, r.to].sort().join('|') === pairKey);
    const pairIdx = pairRels.indexOf(rel);
    const baseOffset = dist * 0.28;
    let cpOffset;
    if (pairRels.length <= 1) { cpOffset = baseOffset; }
    else {
      const sign = pairIdx % 2 === 0 ? 1 : -1;
      const magnitude = 0.6 + Math.floor(pairIdx / 2) * 0.55;
      cpOffset = baseOffset * sign * magnitude;
    }
    const cpx = mx - (dy / dist) * cpOffset;
    const cpy = my + (dx / dist) * cpOffset;

    // Shorten endpoints to node edges
    const fAngle = Math.atan2(cpy - fp.y, cpx - fp.x);
    const tAngle = Math.atan2(cpy - tp.y, cpx - tp.x);
    const fx = fp.x + fp.radius * Math.cos(fAngle);
    const fy = fp.y + fp.radius * Math.sin(fAngle);
    const tx = tp.x + tp.radius * Math.cos(tAngle);
    const ty = tp.y + tp.radius * Math.sin(tAngle);

    const dash = rt.dash === 'none' ? '' : `stroke-dasharray="${rt.dash}"`;
    const marker = rt.arrow ? `marker-end="url(#${rt.marker})"` : '';
    const isDim = dimSet && (dimSet.dimIds.has(rel.from) || dimSet.dimIds.has(rel.to));
    const opacity = isDim ? 0.08 : (rel.strength || 0.6) * 0.7;

    html += `<path d="M ${fx},${fy} Q ${cpx},${cpy} ${tx},${ty}"
      fill="none" stroke="${rt.color}" stroke-width="${rt.width}"
      ${dash} ${marker} opacity="${opacity}"
      vector-effect="non-scaling-stroke"/>`;

    // Label at midpoint of curve
    if (!isDim && rel.label) {
      const lx = 0.5*fx + 0.5*cpx*1.5 + 0.5*tx*0 - 0.5*fx*0.5 + cpx*0.5;
      // approximate quadratic bezier midpoint at t=0.5
      const bx = 0.25*fx + 0.5*cpx + 0.25*tx;
      const by = 0.25*fy + 0.5*cpy + 0.25*ty;
      html += `<text x="${bx}" y="${by-5}" text-anchor="middle" fill="${rt.color}"
        font-size="8" opacity="${opacity}" font-family="Inter,sans-serif">${rel.label}</text>`;
    }
  });
  return html;
}

// ── SUB CONNECTORS ────────────────────────────────────
function renderSubConnectors(dimSet) {
  let html = '';
  state.subcategories.forEach(sub => {
    const sp = layouts[sub.id]; const pp = layouts[sub.parentId];
    if (!sp || !pp) return;
    const cat = state.categories.find(c => c.id === sub.parentId);
    const col = cat ? COLORS[state.categories.indexOf(cat) % COLORS.length].main : '#555';
    const isDim = dimSet && dimSet.dimIds.has(sub.id);
    html += `<line x1="${pp.x}" y1="${pp.y}" x2="${sp.x}" y2="${sp.y}"
      stroke="${col}" stroke-width="1" stroke-dasharray="4 6"
      opacity="${isDim ? 0.05 : 0.25}" vector-effect="non-scaling-stroke"/>`;
  });
  return html;
}

// ── THOUGHT CONNECTORS ────────────────────────────────
function renderThoughtConnectors(dimSet) {
  let html = '';
  state.thoughts.forEach(thought => {
    if (state.hideResolved && thought.resolved) return;
    const tp = layouts[thought.id]; const sp = layouts[thought.subcategoryId];
    if (!tp || !sp) return;
    const emo = EMOTION[thought.emotion] || EMOTION.neutral;
    const isDim = dimSet && dimSet.dimIds.has(thought.id);
    html += `<line x1="${sp.x}" y1="${sp.y}" x2="${tp.x}" y2="${tp.y}"
      stroke="${emo.color}" stroke-width="1"
      opacity="${isDim ? 0.03 : 0.2}" vector-effect="non-scaling-stroke"/>`;
  });
  return html;
}

// ── THOUGHT RELATIONSHIPS (for selected thought) ───────
function renderThoughtRelationships(thoughtId, dimSet) {
  let html = '';
  // Sibling thoughts (dashed grey)
  const thought = state.thoughts.find(t => t.id === thoughtId);
  if (thought) {
    const siblings = state.thoughts.filter(t => t.subcategoryId === thought.subcategoryId && t.id !== thoughtId);
    siblings.forEach(sib => {
      const ap = layouts[thoughtId]; const bp = layouts[sib.id];
      if (!ap || !bp) return;
      html += `<line x1="${ap.x}" y1="${ap.y}" x2="${bp.x}" y2="${bp.y}"
        stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 5"
        opacity="0.3" vector-effect="non-scaling-stroke"/>`;
    });
  }
  // AI thoughtRelationships
  state.thoughtRelationships.forEach(r => {
    if (r.from !== thoughtId && r.to !== thoughtId) return;
    const ap = layouts[r.from]; const bp = layouts[r.to];
    if (!ap || !bp) return;
    const rt = REL_TYPES[r.type] || REL_TYPES.connects;
    const dash = rt.dash === 'none' ? '' : `stroke-dasharray="${rt.dash}"`;
    html += `<line x1="${ap.x}" y1="${ap.y}" x2="${bp.x}" y2="${bp.y}"
      stroke="${rt.color}" stroke-width="1.5" ${dash}
      opacity="0.7" vector-effect="non-scaling-stroke"/>`;
    // midpoint label
    const mx = (ap.x + bp.x) / 2, my = (ap.y + bp.y) / 2;
    if (r.label) {
      html += `<text x="${mx}" y="${my-4}" text-anchor="middle" fill="${rt.color}"
        font-size="7" opacity="0.8" font-family="Inter,sans-serif">${r.label}</text>`;
    }
  });
  return html;
}

// ── THOUGHT NODES ─────────────────────────────────────
function renderThoughts(dimSet) {
  let html = '';
  const now = Date.now();

  state.thoughts.forEach(thought => {
    if (state.hideResolved && thought.resolved) return;
    const l = layouts[thought.id];
    if (!l) return;

    const emo = EMOTION[thought.emotion] || EMOTION.neutral;
    const r = l.radius;
    const hitR = Math.max(r + 6, 12);
    const isSelected = selected?.type === 'thought' && selected?.id === thought.id;
    const isDim = dimSet && dimSet.dimIds.has(thought.id);

    // Age factor
    const ageDays = (now - (thought.lastSeen || thought.firstSeen || now)) / 86400000;
    let ageFactor;
    if (ageDays < 1) ageFactor = 1.0;
    else if (ageDays < 3) ageFactor = 0.85;
    else if (ageDays < 7) ageFactor = 0.7;
    else if (ageDays < 14) ageFactor = 0.5;
    else if (ageDays < 30) ageFactor = 0.35;
    else ageFactor = 0.25;

    // Bonus for repeated occurrences
    if (thought.occurrences > 1) ageFactor = Math.min(1, ageFactor + 0.15);

    const baseOpacity = isDim ? 0.12 : (isSelected ? 1.0 : ageFactor * 0.85);

    html += `<g class="thought-node${isDim ? ' dimmed' : ''}" data-thought="${thought.id}" opacity="${baseOpacity}">`;

    // Hit area
    html += `<circle cx="${l.x}" cy="${l.y}" r="${hitR}" fill="transparent" pointer-events="all"/>`;

    // Glow for selected
    if (isSelected) {
      html += `<circle cx="${l.x}" cy="${l.y}" r="${r + 8}" fill="${emo.color}" opacity="0.15"/>`;
    }

    // Urgency dashed ring
    if ((thought.urgency || 0) > 0.6) {
      html += `<circle cx="${l.x}" cy="${l.y}" r="${r + 4}" fill="none"
        stroke="${emo.color}" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"
        vector-effect="non-scaling-stroke"/>`;
    }

    // Occurrence rings (concentric, max 5)
    if ((thought.occurrences || 1) > 1) {
      const rings = Math.min(thought.occurrences - 1, 5);
      for (let i = 1; i <= rings; i++) {
        html += `<circle cx="${l.x}" cy="${l.y}" r="${r + i * 3}" fill="none"
          stroke="${emo.color}" stroke-width="0.5" opacity="${0.15 - i * 0.025}"
          vector-effect="non-scaling-stroke"/>`;
      }
    }

    // Main dot
    html += `<circle cx="${l.x}" cy="${l.y}" r="${r}" fill="${emo.color}" pointer-events="none"/>`;

    // New pulse animation (within 2 hours)
    const isNew = (now - (thought.firstSeen || now)) < 7200000;
    if (isNew && !isDim) {
      html += `<circle cx="${l.x}" cy="${l.y}" r="${r}" fill="none"
        stroke="${emo.color}" stroke-width="1.5" opacity="0"
        vector-effect="non-scaling-stroke">
        <animate attributeName="r" from="${r}" to="${r + 18}" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite"/>
      </circle>`;
    }

    // Resolved strikethrough
    if (thought.resolved) {
      html += `<line x1="${l.x - r}" y1="${l.y}" x2="${l.x + r}" y2="${l.y}"
        stroke="rgba(255,255,255,0.4)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    }

    // Emotion glyph (when selected or large enough)
    if (isSelected || r >= 7) {
      html += `<text x="${l.x}" y="${l.y - r - 6}" text-anchor="middle"
        font-size="${isSelected ? 12 : 9}" pointer-events="none">${emo.glyph}</text>`;
    }

    // Text label (when selected)
    if (isSelected && thought.text) {
      const words = thought.text.split(' ');
      const lines = [];
      let line = '';
      words.forEach(w => {
        if ((line + w).length > 20) { lines.push(line.trim()); line = w + ' '; }
        else line += w + ' ';
      });
      if (line.trim()) lines.push(line.trim());
      const startY = l.y + r + 14;
      lines.slice(0, 3).forEach((ln, i) => {
        html += `<text x="${l.x}" y="${startY + i * 13}" text-anchor="middle"
          fill="#dce1fb" font-size="9" pointer-events="none"
          font-family="Inter,sans-serif">${ln}</text>`;
      });
    }

    html += '</g>';
  });
  return html;
}

// ── SUBCATEGORY NODES ─────────────────────────────────
function renderSubcategories(dimSet) {
  let html = '';
  state.subcategories.forEach(sub => {
    const l = layouts[sub.id];
    if (!l) return;
    const cat = state.categories.find(c => c.id === sub.parentId);
    const colorIdx = cat ? state.categories.indexOf(cat) % COLORS.length : 0;
    const col = COLORS[colorIdx];
    const isSelected = selected?.type === 'subcategory' && selected?.id === sub.id;
    const isDim = dimSet && dimSet.dimIds.has(sub.id);

    html += `<g class="sub-node${isDim ? ' dimmed' : ''}" data-subcategory="${sub.id}" opacity="${isDim ? 0.12 : 1}">`;

    // Glow for selected
    if (isSelected) {
      html += `<circle cx="${l.x}" cy="${l.y}" r="20" fill="${col.glow}" opacity="0.8"/>`;
    }

    // Main circle
    html += `<circle cx="${l.x}" cy="${l.y}" r="${l.radius}"
      fill="${isSelected ? col.main : col.dim}"
      stroke="${col.main}" stroke-width="${isSelected ? 2 : 1.5}"
      opacity="${isDim ? 0.4 : 1}"
      vector-effect="non-scaling-stroke"/>`;

    // Name
    html += `<text x="${l.x}" y="${l.y + 20}" text-anchor="middle"
      fill="${col.text}" font-size="9" pointer-events="none"
      font-family="Inter,sans-serif" opacity="${isDim ? 0.3 : 0.8}">${sub.name}</text>`;

    html += '</g>';
  });
  return html;
}

// ── CATEGORY NODES ────────────────────────────────────
function renderCategories(dimSet) {
  let html = '';
  state.categories.forEach((cat, idx) => {
    const l = layouts[cat.id];
    if (!l) return;
    const col = COLORS[idx % COLORS.length];
    const isSelected = selected?.type === 'category' && selected?.id === cat.id;
    const isDim = dimSet && dimSet.dimIds.has(cat.id);

    html += `<g class="cat-node${isDim ? ' dimmed' : ''}" data-category="${cat.id}" opacity="${isDim ? 0.12 : 1}">`;

    // Floating glow
    const floatClass = ['float-a','float-b','float-c','float-d','float-e','float-f'][idx % 6];
    html += `<g class="cat-glow ${floatClass}">
      <circle cx="${l.x}" cy="${l.y}" r="${l.radius * 2.5}"
        fill="${col.glow}" opacity="${isDim ? 0.3 : 0.6}"/>
    </g>`;

    // Root ring
    if (cat.isRoot) {
      html += `<circle cx="${l.x}" cy="${l.y}" r="${l.radius + 6}"
        fill="none" stroke="#f9bd22" stroke-width="2"
        filter="url(#rootGlow)" vector-effect="non-scaling-stroke"
        style="filter:drop-shadow(0 0 6px rgba(249,189,34,0.6))"/>`;
    }

    // Selected ring
    if (isSelected) {
      html += `<circle cx="${l.x}" cy="${l.y}" r="${l.radius + 3}"
        fill="none" stroke="${col.main}" stroke-width="2" opacity="0.7"
        vector-effect="non-scaling-stroke"/>`;
    }

    // Main circle
    html += `<circle cx="${l.x}" cy="${l.y}" r="${l.radius}"
      fill="${col.dim}" stroke="${col.main}" stroke-width="2"
      vector-effect="non-scaling-stroke"/>`;

    // Name
    html += `<text x="${l.x}" y="${l.y + l.radius + 15}" text-anchor="middle"
      fill="${col.text}" font-size="11" font-weight="600" pointer-events="none"
      font-family="Manrope,sans-serif" opacity="${isDim ? 0.3 : 1}">${cat.name}</text>`;

    html += '</g>';
  });
  return html;
}

// ── STAR BACKGROUND ───────────────────────────────────
export function renderStars() {
  const svg = document.getElementById('star-svg');
  if (!svg) return;
  const sw = window.innerWidth, sh = window.innerHeight;
  svg.setAttribute('viewBox', `0 0 ${sw} ${sh}`);
  let html = '';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * sw;
    const y = Math.random() * sh;
    const r = Math.random() * 1.2 + 0.3;
    const delay = (Math.random() * 4).toFixed(1);
    const dur = (2 + Math.random() * 3).toFixed(1);
    html += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"
      fill="white" opacity="0.3" style="animation:twinkle ${dur}s ${delay}s ease-in-out infinite"/>`;
  }
  svg.innerHTML = html;
}

// ── STATS ─────────────────────────────────────────────
function updateStats() {
  const el = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  el('stat-thoughts', `생각 ${state.thoughts.filter(t => !t.resolved).length}`);
  el('stat-categories', `분류 ${state.subcategories.length}`);
  el('stat-cats', `카테고리 ${state.categories.length}`);
}

// ── EMOTION TINT ──────────────────────────────────────
function updateEmotionTint() {
  const tint = document.getElementById('emotion-tint');
  if (!tint) return;
  const active = state.thoughts.filter(t => !t.resolved);
  if (active.length === 0) { tint.style.background = 'none'; return; }

  const counts = {};
  active.forEach(t => { counts[t.emotion] = (counts[t.emotion] || 0) + 1; });
  const dominant = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
  if (!dominant || dominant[1] / active.length < 0.2) { tint.style.background = 'none'; return; }

  const { EMOTION: EMO } = { EMOTION };
  // We can't import inside function, use hardcoded colors
  const emotionColors = {
    anxiety:'#f87171',frustration:'#ef4444',anticipation:'#fb923c',
    conflict:'#c084fc',relief:'#34d399',pride:'#fbbf24',
    sadness:'#60a5fa',neutral:'#94a3b8'
  };
  const color = emotionColors[dominant[0]] || '#94a3b8';
  tint.style.background = `radial-gradient(ellipse at 50% 50%, ${color}08 0%, transparent 70%)`;
}

// ── SNAPSHOT SLIDER ───────────────────────────────────
function updateSnapshotSlider() {
  const bar = document.getElementById('snapshot-slider-bar');
  if (!bar) return;
  bar.style.display = state.snapshots.length >= 2 ? 'flex' : 'none';
}
