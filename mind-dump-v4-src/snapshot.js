// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — Snapshot System
// ═══════════════════════════════════════════════════════

import { state, stateSnapshot } from './state.js';
import { render } from './render.js';

const MAX_SNAPSHOTS = 30;
let isViewingSnapshot = false;
let snapshotViewData = null;

// ── SAVE SNAPSHOT ─────────────────────────────────────
export function saveSnapshot() {
  const snap = {
    ts: Date.now(),
    ...stateSnapshot()
  };
  state.snapshots.push(snap);
  if (state.snapshots.length > MAX_SNAPSHOTS) {
    state.snapshots.shift();
  }
  updateSliderUI();
}

// ── SLIDER UI ─────────────────────────────────────────
export function updateSliderUI() {
  const bar = document.getElementById('snapshot-slider-bar');
  const slider = document.getElementById('snap-slider');
  if (!bar || !slider) return;

  if (state.snapshots.length < 2) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  slider.min = 0;
  slider.max = state.snapshots.length - 1;

  if (!isViewingSnapshot) {
    slider.value = state.snapshots.length - 1;
    updateSnapLabel(state.snapshots.length - 1);
  }
}

export function initSnapshotEvents() {
  const slider = document.getElementById('snap-slider');
  const currentBtn = document.getElementById('snap-current-btn');

  slider?.addEventListener('input', () => {
    const idx = parseInt(slider.value);
    viewSnapshot(idx);
    updateSnapLabel(idx);
  });

  currentBtn?.addEventListener('click', exitSnapshot);
}

function viewSnapshot(idx) {
  const snap = state.snapshots[idx];
  if (!idx === state.snapshots.length - 1 || !snap) {
    exitSnapshot();
    return;
  }

  isViewingSnapshot = true;
  snapshotViewData = snap;

  // Temporarily render the snapshot state
  const origCats = state.categories;
  const origSubs = state.subcategories;
  const origThoughts = state.thoughts;
  const origRels = state.relationships;
  const origTRels = state.thoughtRelationships;

  state.categories = snap.categories || [];
  state.subcategories = snap.subcategories || [];
  state.thoughts = snap.thoughts || [];
  state.relationships = snap.relationships || [];
  state.thoughtRelationships = snap.thoughtRelationships || [];

  render('snapshot');

  // Restore
  state.categories = origCats;
  state.subcategories = origSubs;
  state.thoughts = origThoughts;
  state.relationships = origRels;
  state.thoughtRelationships = origTRels;
}

function exitSnapshot() {
  isViewingSnapshot = false;
  snapshotViewData = null;
  const slider = document.getElementById('snap-slider');
  if (slider) slider.value = state.snapshots.length - 1;
  updateSnapLabel(state.snapshots.length - 1);
  render('full');
}

function updateSnapLabel(idx) {
  const snap = state.snapshots[idx];
  const el = document.getElementById('snap-label');
  if (!el || !snap) return;
  const d = new Date(snap.ts);
  const isToday = d.toDateString() === new Date().toDateString();
  el.textContent = isToday
    ? d.toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})
    : d.toLocaleDateString('ko-KR', {month: 'short', day: 'numeric'}) + ' ' +
      d.toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'});
}
