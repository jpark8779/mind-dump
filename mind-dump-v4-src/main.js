// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — App Entry Point
// ═══════════════════════════════════════════════════════

import './style.css';
import { state, loadState, resetState } from './state.js';
import { updateDimensions, fitAll as cameraFitAll } from './camera.js';
import { layouts } from './layout.js';
import { render, renderStars } from './render.js';
import { initEvents } from './events.js';
import {
  initBottomSheet, initMenu, initNavTabs,
  showToast, setLoading, showInsightsPanel, hideInsightsPanel
} from './ui.js';
import { initSessionEvents, setAccessTokenGetter, openSession } from './session.js';
import { initSnapshotEvents, updateSliderUI } from './snapshot.js';
import { saveStateLocal, loadStateLocal, saveStateToCloud } from './store.js';
import { initAuth, initAuthUI, signOut, getAccessToken, getCurrentUser } from './auth.js';
import { validateReferences } from './ai.js';

// ── BOOT ──────────────────────────────────────────────
async function boot() {
  // Render stars
  renderStars();

  // Try Supabase auth
  const user = await initAuth(
    (u) => { /* signed in */ },
    () => { /* signed out — show auth screen */ showAuthScreen(); }
  );

  if (user) {
    // Already logged in
    showApp();
  } else {
    // No session → check localStorage
    const hasLocal = loadStateLocal();
    if (hasLocal && (state.categories.length > 0 || state.thoughts.length > 0)) {
      // Has local data → go straight to app (guest mode)
      showApp();
    } else {
      // Show auth screen
      initAuthUI(() => {
        document.getElementById('auth-screen').style.display = 'none';
        showApp();
      });
    }
  }
}

// ── SHOW APP ──────────────────────────────────────────
function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';

  // Setup
  updateDimensions();
  initEvents();
  initBottomSheet();
  initSessionEvents();
  initSnapshotEvents();
  initNavTabs();

  // Set access token getter for AI calls
  setAccessTokenGetter(getAccessToken);

  // Menu
  initMenu(
    async () => {
      // Sign out
      await signOut();
      resetState();
      showAuthScreen();
      showApp_cleanup();
    },
    async () => {
      // Re-analyze all thoughts
      if (state.thoughts.length === 0) { showToast('생각이 없어요'); return; }
      const allTexts = state.thoughts.map(t => t.text);
      resetState();
      openSession();
      const input = document.getElementById('session-input');
      if (input) input.value = allTexts.join('\n');
    }
  );

  // Initial render
  render('init');

  // Fit camera if has content
  if (state.categories.length > 0) {
    setTimeout(() => { cameraFitAll(layouts); render('fit'); }, 100);
  }

  // Update snapshot slider
  updateSliderUI();

  // Auto-save on state changes (via render hook)
  setupAutoSave();

  // Orphan check
  checkOrphans();
}

function showAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'flex';
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
  // Re-init auth UI
  initAuthUI(() => {
    authScreen.style.display = 'none';
    showApp();
  });
}

function showApp_cleanup() {
  // Hide app
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
}

// ── AUTO-SAVE HOOK ────────────────────────────────────
let saveTimer = null;
function setupAutoSave() {
  // Patch render to trigger save
  const originalRender = render;
  // We intercept state mutations via a polling approach
  setInterval(() => {
    if (state.lastAnalyzed > 0) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        saveStateLocal();
        const token = await getAccessToken();
        if (token) {
          try { await saveStateToCloud(); } catch(e) {}
        }
      }, 3000);
    }
  }, 5000);
}

// ── ORPHAN CHECK ──────────────────────────────────────
function checkOrphans() {
  // Thoughts with no valid subcategory
  const subIds = new Set(state.subcategories.map(s => s.id));
  const orphans = state.thoughts.filter(t => !subIds.has(t.subcategoryId));
  if (orphans.length > 0 && state.subcategories.length === 0) {
    showToast(`고아 생각 ${orphans.length}개 발견. 재분석을 권장합니다.`, 5000);
  } else {
    validateReferences();
  }
}

// ── HANDLE RESIZE ─────────────────────────────────────
window.addEventListener('resize', () => {
  renderStars();
});

// ── START ─────────────────────────────────────────────
boot().catch(err => {
  console.error('Boot failed:', err);
  // Fallback: load local state and show app
  loadStateLocal();
  showApp();
});
