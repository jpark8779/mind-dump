// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — UI Components
// ═══════════════════════════════════════════════════════

import { state, COLORS, EMOTION, INSIGHT_LABELS, genId } from './state.js';
import { render, setSelected } from './render.js';
import { saveStateLocal } from './store.js';
import { validateReferences } from './ai.js';

// ── BOTTOM SHEET ──────────────────────────────────────
let sheetSwipeStart = null;

export function initBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  const handle = document.getElementById('sheet-handle');
  if (!sheet || !handle) return;

  // Swipe down to close
  handle.addEventListener('touchstart', e => {
    sheetSwipeStart = e.touches[0].clientY;
  }, { passive: true });
  handle.addEventListener('touchmove', e => {
    if (!sheetSwipeStart) return;
    const dy = e.touches[0].clientY - sheetSwipeStart;
    if (dy > 60) { hideBottomSheet(); setSelected(null); render('deselect'); }
  }, { passive: true });
  handle.addEventListener('touchend', () => { sheetSwipeStart = null; });

  // Mouse drag handle
  handle.addEventListener('mousedown', e => { sheetSwipeStart = e.clientY; });
  window.addEventListener('mousemove', e => {
    if (sheetSwipeStart === null) return;
    if (e.clientY - sheetSwipeStart > 60) { hideBottomSheet(); setSelected(null); render('deselect'); sheetSwipeStart = null; }
  });
  window.addEventListener('mouseup', () => { sheetSwipeStart = null; });
}

export function showBottomSheet(hit) {
  const sheet = document.getElementById('bottom-sheet');
  const content = document.getElementById('sheet-content');
  if (!sheet || !content) return;

  content.innerHTML = buildSheetContent(hit);
  sheet.classList.add('open');
  bindSheetEvents(hit);
}

export function hideBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  if (sheet) sheet.classList.remove('open');
}

function buildSheetContent(hit) {
  if (hit.type === 'thought') return buildThoughtSheet(hit.id);
  if (hit.type === 'subcategory') return buildSubSheet(hit.id);
  if (hit.type === 'category') return buildCategorySheet(hit.id);
  return '';
}

// ── THOUGHT DETAIL SHEET ──────────────────────────────
function buildThoughtSheet(id) {
  const thought = state.thoughts.find(t => t.id === id);
  if (!thought) return '';
  const sub = state.subcategories.find(s => s.id === thought.subcategoryId);
  const cat = sub ? state.categories.find(c => c.id === sub.parentId) : null;
  const catIdx = cat ? state.categories.indexOf(cat) : 0;
  const col = COLORS[catIdx % COLORS.length];
  const emo = EMOTION[thought.emotion] || EMOTION.neutral;

  // Related thoughts (thoughtRelationships)
  const related = state.thoughtRelationships
    .filter(r => r.from === id || r.to === id)
    .map(r => {
      const otherId = r.from === id ? r.to : r.from;
      return state.thoughts.find(t => t.id === otherId);
    })
    .filter(Boolean);

  return `
    <div class="sheet-breadcrumb">${cat?.name || ''} › ${sub?.name || ''}</div>
    <div id="thought-text-display" class="sheet-title" style="cursor:pointer">${escHtml(thought.text)}</div>
    <div id="thought-text-edit" style="display:none">
      <textarea class="thought-edit-area" id="thought-edit-textarea">${escHtml(thought.text)}</textarea>
      <button class="sheet-btn" id="thought-edit-save">저장</button>
      <button class="sheet-btn" id="thought-edit-cancel">취소</button>
    </div>

    <div style="margin-top:10px">
      <span class="emotion-chip" style="--emotion-color:${emo.color};background:${emo.color}18;color:${emo.color}">
        ${emo.glyph} ${emo.label}
      </span>
      ${thought.resolved ? '<span class="emotion-chip" style="background:rgba(255,255,255,0.08);color:#909097;margin-left:6px">✓ 해결됨</span>' : ''}
    </div>

    <div class="sheet-section">
      <div class="sheet-section-label">무게감</div>
      <div class="bar-wrap">
        <span class="bar-label">${((thought.weight || 0.5) * 100).toFixed(0)}%</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(thought.weight || 0.5) * 100}%"></div></div>
      </div>
      <div class="sheet-section-label" style="margin-top:8px">긴급함</div>
      <div class="bar-wrap">
        <span class="bar-label">${((thought.urgency || 0.5) * 100).toFixed(0)}%</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(thought.urgency || 0.5) * 100}%;background:#fb923c"></div></div>
      </div>
    </div>

    ${related.length > 0 ? `
    <div class="sheet-section">
      <div class="sheet-section-label">연결된 생각</div>
      ${related.map(t => {
        const rel = state.thoughtRelationships.find(r => (r.from === id && r.to === t.id) || (r.to === id && r.from === t.id));
        const tEmo = EMOTION[t.emotion] || EMOTION.neutral;
        return `<div class="thought-list-item">
          <div class="thought-dot" style="background:${tEmo.color}"></div>
          <div><div>${escHtml(t.text)}</div><div style="font-size:11px;color:#909097;margin-top:2px">${rel?.label || ''}</div></div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div class="sheet-actions">
      <button class="sheet-btn" id="sheet-resolve">${thought.resolved ? '해결 취소' : '해결됨'}</button>
      <button class="sheet-btn" id="sheet-move">이동</button>
      <button class="sheet-btn danger" id="sheet-delete">삭제</button>
    </div>
  `;
}

// ── SUBCATEGORY DETAIL SHEET ──────────────────────────
function buildSubSheet(id) {
  const sub = state.subcategories.find(s => s.id === id);
  if (!sub) return '';
  const cat = state.categories.find(c => c.id === sub.parentId);
  const catIdx = cat ? state.categories.indexOf(cat) : 0;
  const col = COLORS[catIdx % COLORS.length];
  const thoughts = state.thoughts.filter(t => t.subcategoryId === id);

  return `
    <div class="sheet-breadcrumb">${cat?.name || ''}</div>
    <div class="sheet-title" style="color:${col.text}">${escHtml(sub.name)}</div>
    <div class="sheet-section">
      <div class="sheet-section-label">생각 ${thoughts.length}개</div>
      ${thoughts.map(t => {
        const emo = EMOTION[t.emotion] || EMOTION.neutral;
        return `<div class="thought-list-item">
          <div class="thought-dot" style="background:${emo.color}"></div>
          <div>${escHtml(t.text)}${t.resolved ? ' <span style="color:#909097;font-size:11px">(해결됨)</span>' : ''}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

// ── CATEGORY DETAIL SHEET ─────────────────────────────
function buildCategorySheet(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return '';
  const catIdx = state.categories.indexOf(cat);
  const col = COLORS[catIdx % COLORS.length];
  const subs = state.subcategories.filter(s => s.parentId === id);
  const thoughtCount = state.thoughts.filter(t => subs.some(s => s.id === t.subcategoryId)).length;

  const rels = state.relationships.filter(r => r.from === id || r.to === id).map(r => {
    const otherId = r.from === id ? r.to : r.from;
    const other = state.categories.find(c => c.id === otherId);
    return { ...r, otherName: other?.name || '?' };
  });

  return `
    <div class="sheet-title" style="color:${col.text}">
      ${cat.isRoot ? '✦ ' : ''}${escHtml(cat.name)}
    </div>
    ${cat.description ? `<div style="font-size:13px;color:#909097;margin-top:4px">${escHtml(cat.description)}</div>` : ''}
    <div style="font-size:12px;color:#909097;margin-top:8px">생각 ${thoughtCount}개 · 세분류 ${subs.length}개</div>

    ${rels.length > 0 ? `
    <div class="sheet-section">
      <div class="sheet-section-label">관계</div>
      ${rels.map(r => `<div style="font-size:13px;padding:4px 0">${r.otherName}: ${r.label || r.type}</div>`).join('')}
    </div>` : ''}

    <div class="sheet-section">
      <div class="sheet-section-label">세분류</div>
      ${subs.map(s => `<div style="font-size:13px;padding:3px 0;color:${col.text}">${escHtml(s.name)}</div>`).join('')}
    </div>
  `;
}

// ── BIND SHEET EVENTS ─────────────────────────────────
function bindSheetEvents(hit) {
  if (hit.type !== 'thought') return;
  const id = hit.id;
  const thought = state.thoughts.find(t => t.id === id);
  if (!thought) return;

  // Inline edit
  document.getElementById('thought-text-display')?.addEventListener('click', () => {
    document.getElementById('thought-text-display').style.display = 'none';
    document.getElementById('thought-text-edit').style.display = 'block';
    document.getElementById('thought-edit-textarea')?.focus();
  });

  document.getElementById('thought-edit-save')?.addEventListener('click', () => {
    const newText = document.getElementById('thought-edit-textarea')?.value.trim();
    if (newText && newText !== thought.text) {
      thought.text = newText;
      thought.manuallyEdited = true;
      saveStateLocal();
      render('selection');
      showBottomSheet(hit);
    } else {
      document.getElementById('thought-text-display').style.display = 'block';
      document.getElementById('thought-text-edit').style.display = 'none';
    }
  });

  document.getElementById('thought-edit-cancel')?.addEventListener('click', () => {
    document.getElementById('thought-text-display').style.display = 'block';
    document.getElementById('thought-text-edit').style.display = 'none';
  });

  // Resolve toggle
  document.getElementById('sheet-resolve')?.addEventListener('click', () => {
    thought.resolved = !thought.resolved;
    saveStateLocal();
    render('resolve');
    showBottomSheet(hit);
  });

  // Move to another subcategory
  document.getElementById('sheet-move')?.addEventListener('click', () => {
    showMoveModal(id);
  });

  // Delete
  document.getElementById('sheet-delete')?.addEventListener('click', () => {
    showConfirmModal(
      `"${thought.text.slice(0, 40)}..." 를 삭제할까요?`,
      '삭제',
      () => {
        const idx = state.thoughts.findIndex(t => t.id === id);
        if (idx >= 0) state.thoughts.splice(idx, 1);
        setSelected(null);
        hideBottomSheet();
        saveStateLocal();
        validateReferences();
        render('delete');
      }
    );
  });
}

// ── MOVE MODAL ────────────────────────────────────────
function showMoveModal(thoughtId) {
  const options = state.subcategories.map(s => {
    const cat = state.categories.find(c => c.id === s.parentId);
    return `<option value="${s.id}">${cat?.name || ''} › ${s.name}</option>`;
  }).join('');

  showModal(
    `<div class="sheet-section-label" style="margin-bottom:8px">이동할 세분류 선택</div>
     <select class="modal-select" id="move-select">${options}</select>`,
    [
      { text: '이동', cls: 'primary', action: () => {
        const sel = document.getElementById('move-select')?.value;
        if (sel) {
          const thought = state.thoughts.find(t => t.id === thoughtId);
          if (thought) { thought.subcategoryId = sel; saveStateLocal(); render('move'); }
        }
      }},
      { text: '취소', cls: 'secondary', action: null }
    ]
  );
}

// ── MODAL SYSTEM ──────────────────────────────────────
export function showConfirmModal(text, confirmLabel, onConfirm) {
  showModal(text, [
    { text: confirmLabel, cls: 'danger', action: onConfirm },
    { text: '취소', cls: 'secondary', action: null }
  ]);
}

function showModal(html, buttons) {
  const overlay = document.getElementById('modal-overlay');
  const textEl = document.getElementById('modal-text');
  const btnEl = document.getElementById('modal-buttons');
  if (!overlay || !textEl || !btnEl) return;

  textEl.innerHTML = html;
  btnEl.innerHTML = buttons.map((b, i) =>
    `<button class="modal-btn ${b.cls}" data-idx="${i}">${b.text}</button>`
  ).join('');

  overlay.style.display = 'flex';

  btnEl.querySelectorAll('.modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.style.display = 'none';
      const idx = parseInt(btn.dataset.idx);
      buttons[idx]?.action?.();
    });
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.style.display = 'none';
  }, { once: true });
}

// ── TOAST ─────────────────────────────────────────────
let toastTimeout = null;
export function showToast(msg, duration = 3000) {
  const el = document.getElementById('error-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.style.display = 'none'; }, duration);
}

// ── LOADING ───────────────────────────────────────────
export function setLoading(on) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = on ? 'flex' : 'none';
}

// ── INSIGHTS OVERLAY (3 cards after analysis) ─────────
export function showInsights(insights) {
  const overlay = document.getElementById('insight-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.innerHTML = insights.slice(0, 3).map(i => `
    <div class="insight-card">
      <div class="i-type">${INSIGHT_LABELS[i.type] || i.type}</div>
      <div class="i-text">${escHtml(i.text)}</div>
    </div>
  `).join('');

  // Auto-hide after 6s
  setTimeout(() => { overlay.style.display = 'none'; }, 6000);

  // Click to dismiss
  overlay.querySelectorAll('.insight-card').forEach(card => {
    card.addEventListener('click', () => { card.remove(); });
  });
}

// ── MIRROR OVERLAY ────────────────────────────────────
export function showMirror(text) {
  const overlay = document.getElementById('mirror-overlay');
  const textEl = document.getElementById('mirror-text');
  if (!overlay || !textEl) return;
  textEl.textContent = text;
  overlay.style.display = 'flex';
  const duration = Math.max(5000, Math.min(9000, text.length * 60));
  setTimeout(() => { overlay.style.display = 'none'; }, duration);
  overlay.addEventListener('click', () => { overlay.style.display = 'none'; }, { once: true });
}

// ── INSIGHTS PANEL (tab) ──────────────────────────────
export function showInsightsPanel() {
  const panel = document.getElementById('insights-panel');
  const list = document.getElementById('insights-list');
  if (!panel || !list) return;

  if (state.insights.length === 0) {
    list.innerHTML = '<div class="no-insights">아직 인사이트가 없어요<br>세션을 진행해보세요</div>';
  } else {
    list.innerHTML = state.insights.map(i => `
      <div class="insight-full-card">
        <div class="insight-full-type">${INSIGHT_LABELS[i.type] || i.type}</div>
        <div class="insight-full-text">${escHtml(i.text)}</div>
      </div>
    `).join('');
  }
  panel.style.display = 'block';
}

export function hideInsightsPanel() {
  const panel = document.getElementById('insights-panel');
  if (panel) panel.style.display = 'none';
}

// ── MENU ──────────────────────────────────────────────
export function initMenu(onSignOut, onReanalyze) {
  const menuBtn = document.getElementById('menu-btn');
  const dropdown = document.getElementById('menu-dropdown');

  menuBtn?.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { if (dropdown) dropdown.style.display = 'none'; });

  document.getElementById('menu-export')?.addEventListener('click', exportJSON);
  document.getElementById('menu-import')?.addEventListener('click', () => {
    document.getElementById('import-file-input')?.click();
  });
  document.getElementById('import-file-input')?.addEventListener('change', importJSON);
  document.getElementById('menu-reset')?.addEventListener('click', () => {
    showConfirmModal('모든 데이터를 초기화할까요?', '초기화', () => {
      // backup first
      localStorage.setItem('mind-dump-backup', JSON.stringify(state));
      const { resetState } = require('./state.js');
      resetState();
      saveStateLocal();
      setSelected(null);
      hideBottomSheet();
      render('reset');
      showToast('초기화되었어요. (백업이 로컬에 저장됨)');
    });
  });
  document.getElementById('menu-signout')?.addEventListener('click', onSignOut);
  document.getElementById('menu-reanalyze')?.addEventListener('click', onReanalyze);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mind-dump-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      const { loadState } = require('./state.js');
      loadState(data);
      saveStateLocal();
      render('full');
      showToast('가져오기 완료!');
    } catch(err) {
      showToast('파일을 읽을 수 없어요');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── NAV TABS ──────────────────────────────────────────
export function initNavTabs() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'session') return; // handled by session.js
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (tab === 'map') {
        hideInsightsPanel();
        document.getElementById('main-svg').style.pointerEvents = '';
      } else if (tab === 'insights') {
        showInsightsPanel();
      }
    });
  });
}

// ── HELPERS ───────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
