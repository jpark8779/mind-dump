// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — Session Mode
// ═══════════════════════════════════════════════════════

import { state } from './state.js';
import { analyzeSession, applyDiff } from './ai.js';
import { render } from './render.js';
import { saveSnapshot } from './snapshot.js';
import { showInsights, showMirror, showToast, setLoading } from './ui.js';
import { saveStateToCloud, saveStateLocal } from './store.js';
import { fitAll as cameraFitAll } from './camera.js';
import { layouts } from './layout.js';

let timerInterval = null;
let timerSeconds = 0;
let timerMode = 7; // minutes (0 = free)
let sessionStarted = false;
let sessionTypingStarted = false;
let hintTimeout1 = null, hintTimeout2 = null, hintTimeout3 = null;
let accessTokenGetter = null;

export function setAccessTokenGetter(fn) {
  accessTokenGetter = fn;
}

// ── OPEN SESSION ──────────────────────────────────────
export function openSession() {
  const overlay = document.getElementById('session-overlay');
  if (!overlay) return;

  // Show pending captures
  renderPendingCaptures();

  overlay.style.display = 'flex';
  sessionStarted = false;
  sessionTypingStarted = false;

  // Reset timer display
  setTimerMode(timerMode);

  // Pre-fill pending captures text
  const input = document.getElementById('session-input');
  if (input) {
    const pendingText = state.pendingCaptures.map(c => c.text).join('\n');
    input.value = pendingText ? pendingText + '\n' : '';
    setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 100);
  }

  document.getElementById('session-hint').textContent = '';
}

// ── CLOSE SESSION ─────────────────────────────────────
export function closeSession() {
  const overlay = document.getElementById('session-overlay');
  if (overlay) overlay.style.display = 'none';
  stopTimer();
  clearHintTimeouts();
}

// ── START TIMER ───────────────────────────────────────
function startTimer() {
  if (sessionStarted) return;
  sessionStarted = true;
  timerSeconds = timerMode > 0 ? timerMode * 60 : 0;

  if (timerMode > 0) {
    timerInterval = setInterval(() => {
      timerSeconds--;
      updateTimerDisplay();
      if (timerSeconds <= 0) {
        stopTimer();
        endSession();
      }
    }, 1000);
  }

  // Hint messages
  hintTimeout1 = setTimeout(() => {
    const el = document.getElementById('session-hint');
    if (el) el.textContent = '아직 더 있지 않나요?';
  }, 40000);
  hintTimeout2 = setTimeout(() => {
    const el = document.getElementById('session-hint');
    if (el) el.textContent = '지금 몸에서 느껴지는 건요?';
  }, 180000);
  hintTimeout3 = setTimeout(() => {
    const el = document.getElementById('session-hint');
    if (el) el.textContent = '가장 쓰기 싫었던 것은요?';
  }, 300000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function clearHintTimeouts() {
  clearTimeout(hintTimeout1); clearTimeout(hintTimeout2); clearTimeout(hintTimeout3);
}

function updateTimerDisplay() {
  const el = document.getElementById('session-timer');
  if (!el) return;
  if (timerMode === 0) { el.textContent = '∞'; return; }
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  el.textContent = `${m}:${s.toString().padStart(2, '0')}`;

  // Update ring
  const ring = document.getElementById('timer-ring');
  if (ring) {
    const total = timerMode * 60;
    const circumference = 125.66;
    const offset = circumference - (timerSeconds / total) * circumference;
    ring.setAttribute('stroke-dashoffset', offset.toFixed(2));
  }
}

function setTimerMode(min) {
  timerMode = min;
  const el = document.getElementById('session-timer');
  if (el) {
    el.textContent = min === 0 ? '∞' : `${min}:00`;
  }
  const ring = document.getElementById('timer-ring');
  if (ring) ring.setAttribute('stroke-dashoffset', '0');

  // Update buttons
  document.querySelectorAll('.timer-mode-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.min) === min);
  });
}

// ── END SESSION ───────────────────────────────────────
export async function endSession() {
  const input = document.getElementById('session-input');
  if (!input) return;

  const raw = input.value.trim();
  if (!raw) { closeSession(); return; }

  const inputs = raw.split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 0);
  if (inputs.length === 0) { closeSession(); return; }

  closeSession();
  setLoading(true);

  try {
    const accessToken = accessTokenGetter ? await accessTokenGetter() : null;
    const diff = await analyzeSession(inputs, accessToken);
    const mirrorText = applyDiff(diff);

    // Clear pending captures (they were included)
    state.pendingCaptures = [];

    // Save snapshot
    saveSnapshot();

    // Save state
    saveStateLocal();
    if (accessToken) {
      try { await saveStateToCloud(accessToken); } catch(e) { console.warn('Cloud save failed', e); }
    }

    setLoading(false);
    cameraFitAll(layouts);
    render('analysis');

    // Show mirror
    if (mirrorText) showMirror(mirrorText);

    // Show insights
    if (state.insights.length > 0) showInsights(state.insights.slice(0, 3));

  } catch(err) {
    setLoading(false);
    console.error('Analysis failed:', err);
    showToast('분석 중 오류가 발생했어요: ' + err.message);
  }
}

// ── INIT SESSION EVENTS ───────────────────────────────
export function initSessionEvents() {
  // Open session from FAB
  document.querySelector('.session-nav-btn')?.addEventListener('click', openSession);
  document.addEventListener('keydown', e => { if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') openSession(); });

  // Cancel
  document.getElementById('session-cancel-btn')?.addEventListener('click', closeSession);

  // Done
  document.getElementById('session-done-btn')?.addEventListener('click', endSession);

  // Timer mode
  document.querySelectorAll('.timer-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (sessionStarted) return; // can't change after start
      setTimerMode(parseInt(btn.dataset.min));
    });
  });

  // Start timer on first keystroke
  document.getElementById('session-input')?.addEventListener('input', () => {
    if (!sessionTypingStarted) {
      sessionTypingStarted = true;
      startTimer();
    }
  });

  // Quick capture
  document.getElementById('quick-capture-btn')?.addEventListener('click', toggleQuickCapture);
  document.getElementById('quick-capture-save')?.addEventListener('click', saveQuickCapture);
}

function toggleQuickCapture() {
  const popup = document.getElementById('quick-capture-popup');
  if (!popup) return;
  const showing = popup.style.display !== 'none';
  popup.style.display = showing ? 'none' : 'block';
  if (!showing) document.getElementById('quick-capture-input')?.focus();
}

function saveQuickCapture() {
  const input = document.getElementById('quick-capture-input');
  if (!input || !input.value.trim()) return;
  state.pendingCaptures.push({
    id: `capture_${Date.now()}`,
    text: input.value.trim(),
    capturedAt: Date.now()
  });
  input.value = '';
  document.getElementById('quick-capture-popup').style.display = 'none';
  saveStateLocal();
  showToast('메모가 저장됐어요 ✦');
}

function renderPendingCaptures() {
  const wrap = document.getElementById('pending-captures-wrap');
  const list = document.getElementById('pending-list');
  if (!wrap || !list) return;
  if (state.pendingCaptures.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = state.pendingCaptures.map(c =>
    `<div class="pending-capture-item">· ${c.text}</div>`
  ).join('');
}
