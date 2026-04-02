// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — State Persistence (Supabase + localStorage)
// ═══════════════════════════════════════════════════════

import { state, loadState } from './state.js';

const LOCAL_KEY = 'mind-dump-v4-state';
let supabaseClient = null;

export function setSupabaseClient(client) {
  supabaseClient = client;
}

// ── LOCAL STORAGE ─────────────────────────────────────
export function saveStateLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch(e) {
    console.warn('localStorage save failed:', e);
  }
}

export function loadStateLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      loadState(data);
      return true;
    }
  } catch(e) {
    console.warn('localStorage load failed:', e);
  }
  return false;
}

// ── SUPABASE CLOUD ────────────────────────────────────
export async function saveStateToCloud() {
  if (!supabaseClient) return;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    await supabaseClient.from('mind_states').upsert({
      user_id: user.id,
      state: state,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  } catch(e) {
    console.warn('Cloud save failed:', e);
    throw e;
  }
}

export async function loadStateFromCloud() {
  if (!supabaseClient) return false;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return false;
    const { data } = await supabaseClient
      .from('mind_states')
      .select('state')
      .eq('user_id', user.id)
      .single();
    if (data?.state) {
      loadState(data.state);
      return true;
    }
  } catch(e) {
    console.warn('Cloud load failed:', e);
  }
  return false;
}

// ── AUTO-SAVE ─────────────────────────────────────────
let autoSaveTimeout = null;
export function scheduleAutoSave() {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(async () => {
    saveStateLocal();
    if (supabaseClient) {
      try { await saveStateToCloud(); } catch(e) {}
    }
  }, 2000);
}
