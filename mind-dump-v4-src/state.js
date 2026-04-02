// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — State & Constants
// ═══════════════════════════════════════════════════════

// ── COLORS (8-color palette) ──────────────────────────
export const COLORS = [
  {main:'#60a5fa', glow:'rgba(96,165,250,0.2)',  text:'#93c5fd', dim:'rgba(96,165,250,0.08)'},
  {main:'#f97316', glow:'rgba(249,115,22,0.2)',   text:'#fdba74', dim:'rgba(249,115,22,0.08)'},
  {main:'#34d399', glow:'rgba(52,211,153,0.2)',   text:'#6ee7b7', dim:'rgba(52,211,153,0.08)'},
  {main:'#f472b6', glow:'rgba(244,114,182,0.2)',  text:'#f9a8d4', dim:'rgba(244,114,182,0.08)'},
  {main:'#a78bfa', glow:'rgba(167,139,250,0.2)',  text:'#c4b5fd', dim:'rgba(167,139,250,0.08)'},
  {main:'#fbbf24', glow:'rgba(251,191,36,0.2)',   text:'#fde68a', dim:'rgba(251,191,36,0.08)'},
  {main:'#2dd4bf', glow:'rgba(45,212,191,0.2)',   text:'#99f6e4', dim:'rgba(45,212,191,0.08)'},
  {main:'#fb7185', glow:'rgba(251,113,133,0.2)',  text:'#fda4af', dim:'rgba(251,113,133,0.08)'}
];

// ── EMOTIONS ──────────────────────────────────────────
export const EMOTION = {
  anxiety:      {color:'#f87171', label:'불안',    glyph:'😟'},
  frustration:  {color:'#ef4444', label:'짜증',    glyph:'😤'},
  anticipation: {color:'#fb923c', label:'기대',    glyph:'✨'},
  conflict:     {color:'#c084fc', label:'갈등',    glyph:'⚡'},
  relief:       {color:'#34d399', label:'안도',    glyph:'😮‍💨'},
  pride:        {color:'#fbbf24', label:'뿌듯',    glyph:'🌟'},
  sadness:      {color:'#60a5fa', label:'서글픔',  glyph:'🌧️'},
  neutral:      {color:'#94a3b8', label:'중립',    glyph:'💭'}
};

// ── RELATIONSHIP TYPES ────────────────────────────────
export const REL_TYPES = {
  causes:    {color:'#fb923c', dash:'none',     width:2.5, label:'원인', arrow:true,  marker:'arrow-causes'},
  conflicts: {color:'#f87171', dash:'8 5',      width:2.5, label:'갈등', arrow:false, marker:''},
  resolves:  {color:'#34d399', dash:'none',     width:2.5, label:'해소', arrow:true,  marker:'arrow-resolves'},
  amplifies: {color:'#fbbf24', dash:'6 4',      width:2.5, label:'심화', arrow:false, marker:''},
  blocks:    {color:'#94a3b8', dash:'10 4 2 4', width:2.5, label:'방해', arrow:true,  marker:'arrow-blocks'},
  connects:  {color:'#a78bfa', dash:'5 6',      width:2.5, label:'연결', arrow:false, marker:''}
};

// ── INSIGHT TYPE LABELS ───────────────────────────────
export const INSIGHT_LABELS = {
  pattern:   '패턴',
  recurring: '반복',
  heavy:     '무게감',
  conflict:  '갈등',
  root:      '근본 고민'
};

// ── ID GENERATOR ──────────────────────────────────────
export function genId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── DEFAULT STATE ─────────────────────────────────────
function defaultState() {
  return {
    version: 2,
    createdAt: Date.now(),
    lastAnalyzed: 0,
    categories: [],
    subcategories: [],
    thoughts: [],
    relationships: [],
    thoughtRelationships: [],
    insights: [],
    hideResolved: false,
    pendingCaptures: [],
    snapshots: []
  };
}

// ── REACTIVE STATE OBJECT ─────────────────────────────
export const state = defaultState();

export function resetState() {
  const fresh = defaultState();
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, fresh);
}

export function loadState(data) {
  if (!data || typeof data !== 'object') return;
  Object.assign(state, {
    version: data.version || 2,
    createdAt: data.createdAt || Date.now(),
    lastAnalyzed: data.lastAnalyzed || 0,
    categories: data.categories || [],
    subcategories: data.subcategories || [],
    thoughts: data.thoughts || [],
    relationships: data.relationships || [],
    thoughtRelationships: data.thoughtRelationships || [],
    insights: data.insights || [],
    hideResolved: data.hideResolved || false,
    pendingCaptures: data.pendingCaptures || [],
    snapshots: data.snapshots || []
  });
}

export function stateSnapshot() {
  return JSON.parse(JSON.stringify({
    categories: state.categories,
    subcategories: state.subcategories,
    thoughts: state.thoughts,
    relationships: state.relationships,
    thoughtRelationships: state.thoughtRelationships
  }));
}
