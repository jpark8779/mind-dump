// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — Authentication (Supabase)
// ═══════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { setSupabaseClient, loadStateFromCloud, loadStateLocal, saveStateLocal } from './store.js';

// ── CONFIG ────────────────────────────────────────────
// These are public keys (safe to expose in frontend)
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || '';

let supabase = null;
let currentUser = null;

export function getSupabase() { return supabase; }
export function getCurrentUser() { return currentUser; }

// ── INIT AUTH ─────────────────────────────────────────
export async function initAuth(onSignedIn, onSignedOut) {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    // No Supabase configured → guest mode
    console.log('Supabase not configured, running in guest mode');
    return false;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  setSupabaseClient(supabase);

  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      currentUser = session.user;
      const loaded = await loadStateFromCloud();
      if (!loaded) loadStateLocal();
      onSignedIn(session.user);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      onSignedOut();
    }
  });

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    const loaded = await loadStateFromCloud();
    if (!loaded) loadStateLocal();
    return session.user;
  }

  return null;
}

// ── SIGN IN ───────────────────────────────────────────
export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase not initialized');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

// ── SIGN UP ───────────────────────────────────────────
export async function signUp(email, password) {
  if (!supabase) throw new Error('Supabase not initialized');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

// ── SIGN OUT ──────────────────────────────────────────
export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  currentUser = null;
}

// ── GET ACCESS TOKEN ──────────────────────────────────
export async function getAccessToken() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// ── AUTH UI ───────────────────────────────────────────
export function initAuthUI(onSuccess) {
  let currentTab = 'signin';

  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const submitBtn = document.getElementById('auth-submit');
      if (submitBtn) submitBtn.textContent = currentTab === 'signin' ? '로그인' : '회원가입';
      document.getElementById('auth-error').textContent = '';
    });
  });

  // Form submit
  document.getElementById('auth-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('auth-email')?.value.trim();
    const password = document.getElementById('auth-password')?.value;
    const errEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');

    if (!email || !password) return;

    submitBtn.textContent = '처리 중...';
    submitBtn.disabled = true;
    errEl.textContent = '';

    try {
      if (currentTab === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        errEl.textContent = '이메일을 확인해주세요!';
        submitBtn.textContent = '회원가입';
        submitBtn.disabled = false;
        return;
      }
      onSuccess();
    } catch(err) {
      errEl.textContent = getErrorMessage(err);
      submitBtn.textContent = currentTab === 'signin' ? '로그인' : '회원가입';
      submitBtn.disabled = false;
    }
  });

  // Guest mode
  document.getElementById('auth-guest')?.addEventListener('click', () => {
    loadStateLocal();
    onSuccess();
  });
}

function getErrorMessage(err) {
  const msg = err.message || '';
  if (msg.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 틀렸어요';
  if (msg.includes('Email not confirmed')) return '이메일 인증이 필요해요';
  if (msg.includes('already registered')) return '이미 가입된 이메일이에요';
  return msg || '오류가 발생했어요';
}
