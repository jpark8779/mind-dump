// ═══════════════════════════════════════════════════════
// MIND DUMP v4 — AI Analysis System
// ═══════════════════════════════════════════════════════

import { state, genId, EMOTION } from './state.js';
import { saveStateLocal } from './store.js';

const SYSTEM_PROMPT = `당신은 사용자의 생각을 분류하고 감정을 분석하는 AI입니다.
반드시 순수 JSON만 반환하세요. 마크다운이나 설명 텍스트를 절대 포함하지 마세요.

핵심 원칙:
1. 기존 항목의 ID는 절대 변경하지 마세요. 그대로 참조하세요.
2. 새 항목은 _ref로 임시 참조를 만드세요 (_c1, _s1, _t1 등).
3. _protected: true인 생각은 emotion/weight/urgency를 재평가하지 마세요.
4. 모든 새 입력이 반드시 어딘가에 포함되어야 합니다. 누락 금지.
5. mirror_reflection 필드를 추가하세요: 3~4문장, 판단 없음, 패턴/변화/긴장/모순/반복 설명, 선택사항으로 부드러운 질문 포함 가능. snapshotHistory가 있으면 이전 세션과의 흐름 변화도 반영하세요.

감정 분류:
- anxiety: 불안, 걱정, 두려움 (미래 지향적 부정)
- frustration: 짜증, 화남, 답답, 분노 (현재 상황 저항)
- anticipation: 기대, 설렘, 흥분 (미래 지향적 긍정)
- conflict: 갈등, 딜레마, 선택 어려움
- relief: 안도, 해소, 편안함 (긴장 해제)
- pride: 뿌듯, 성취감, 자부심 (자기 긍정)
- sadness: 슬픔, 상실, 그리움, 허무 (과거 지향적 부정)
- neutral: 단순 사실, 메모, 할 일

weight 기준: 0.1~0.2 단순메모, 0.3~0.5 일반고민, 0.6~0.7 중요걱정, 0.8~1.0 깊은근심
urgency 기준: 0.1 장기계획, 0.5 이번주, 0.9 오늘당장

근본 고민(setRoot): 여러 카테고리의 감정적 원천이 되는 카테고리 1개. 확실하지 않으면 null.

생각 통합(merge): 80% 이상 동일할 때만. absorbedInputs에 원문 기록.

【세분류 구조 규칙 — 필수】
- 세분류는 최대한 세분화할 것. 비슷해 보여도 주제/감정/상황이 다르면 나눠라.
- 세분류당 생각은 1~3개가 이상적. 4개 이상이면 반드시 더 쪼갤 것.
- 생각 개수별 세분류 기준: 3개→2~3개, 5개→3~4개, 8개→5~6개, 12개→7~9개
- 대분류당 세분류 최소 3개 이상. 생각이 충분하면 5~8개도 OK.
- 세분류 이름은 구체적이고 짧게: "번아웃 걱정" "발표 불안" "관계 피로" "방향 혼란" 등
- 절대 금지: 생각 전부를 1~2개 세분류에 몰아넣기.

【중요 필드명 규칙】
카테고리: {"_ref": "_c1", "name": "카테고리명", "description": "설명"}
세분류: {"_ref": "_s1", "parentRef": "_c1", "name": "세분류명"}
  ※ parentRef: 새 카테고리면 _ref값, 기존이면 실제 id값
생각: {"_ref": "_t1", "subcategoryRef": "_s1", "text": "생각 내용", "emotion": "anxiety", "weight": 0.5, "urgency": 0.3}
  ※ subcategoryRef: 새 세분류면 _ref값, 기존이면 실제 id값
인사이트: {"type": "pattern", "text": "인사이트 내용", "relatedRefs": ["_c1"]}
  ※ type: "pattern" | "recurring" | "heavy" | "conflict" | "root"

【생각 간 관계 — 반드시 생성】
- from/to: 새 생각이면 _ref값, 기존이면 실제 id값
- 형식: {"from": "_t1", "to": "_t2", "type": "causes", "label": "한 줄 설명"}
- type: causes | conflicts | amplifies | resolves | connects
- 생각이 2개 이상이면 최소 1개 이상 반드시.

【대분류 간 관계 — 반드시 생성】
- fromRef/toRef: 새 카테고리면 _ref값, 기존이면 실제 id값
- type: causes | conflicts | resolves | amplifies | blocks | connects
- {"fromRef": "_c1", "toRef": "_c2", "type": "causes", "label": "설명", "strength": 0.7}

JSON 응답 형식:
{
  "categoryUpdates": {"add": [], "rename": [], "setRoot": null},
  "subcategoryUpdates": {"add": []},
  "thoughtUpdates": {"add": [], "merge": [], "reassess": [], "move": []},
  "relationships": [],
  "thoughtRelationships": [],
  "insights": [],
  "contradictions": [],
  "recurring_patterns": [],
  "mirror_reflection": "거울 문장 (한국어, 3~4문장)"
}`;

// ── PARSE JSON SAFELY ─────────────────────────────────
export function parseJSON(text) {
  try { return JSON.parse(text); } catch(e) {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch(e2) {} }
  return null;
}

// ── MAIN ANALYZE FUNCTION ─────────────────────────────
export async function analyzeSession(inputs, accessToken) {
  const request = {
    version: 2,
    existingState: {
      categories: state.categories.map(c => ({id: c.id, name: c.name, description: c.description, isRoot: c.isRoot})),
      subcategories: state.subcategories.map(s => ({id: s.id, name: s.name, parentId: s.parentId})),
      thoughts: state.thoughts.map(t => ({
        id: t.id,
        text: t.text,
        subcategoryId: t.subcategoryId,
        emotion: t.manuallyEdited ? t.emotion : undefined,
        weight: t.manuallyEdited ? t.weight : undefined,
        urgency: t.manuallyEdited ? t.urgency : undefined,
        _protected: t.manuallyEdited
      })),
      rootCategoryId: state.categories.find(c => c.isRoot)?.id || null
    },
    newInputs: inputs,
    snapshotHistory: (state.snapshots || []).slice(-4, -1).map(snap =>
      snap.thoughts.map(t => t.text)
    )
  };

  const headers = {
    'Content-Type': 'application/json'
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Please analyze and organize these thoughts:\n' + JSON.stringify(request, null, 2) }]
    })
  });

  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  const data = await resp.json();

  const raw = data?.content?.[0]?.text || '';
  const diff = parseJSON(raw);
  if (!diff) throw new Error('AI 응답을 파싱할 수 없어요');

  return diff;
}

// ── APPLY DIFF ────────────────────────────────────────
export function applyDiff(diff) {
  const refMap = {};  // _ref → real id
  const now = Date.now();

  // 1. Add categories
  (diff.categoryUpdates?.add || []).forEach(c => {
    const id = genId('cat');
    refMap[c._ref] = id;
    state.categories.push({
      id, name: c.name, description: c.description || '',
      colorIndex: state.categories.length,
      isRoot: false, createdAt: now
    });
  });

  // 2. Rename categories
  (diff.categoryUpdates?.rename || []).forEach(r => {
    const cat = state.categories.find(c => c.id === r.id);
    if (cat) {
      if (r.name) cat.name = r.name;
      if (r.description) cat.description = r.description;
    }
  });

  // 3. Set root category
  if (diff.categoryUpdates?.setRoot) {
    const rootId = refMap[diff.categoryUpdates.setRoot] || diff.categoryUpdates.setRoot;
    state.categories.forEach(c => { c.isRoot = (c.id === rootId); });
  } else if (diff.categoryUpdates?.setRoot === null) {
    // explicit null = clear root
    state.categories.forEach(c => { c.isRoot = false; });
  }

  // 4. Add subcategories
  (diff.subcategoryUpdates?.add || []).forEach(s => {
    const id = genId('sub');
    refMap[s._ref] = id;
    const parentId = refMap[s.parentRef] || s.parentRef;
    state.subcategories.push({ id, name: s.name, parentId, createdAt: now });
  });

  // 5. Add thoughts
  (diff.thoughtUpdates?.add || []).forEach(t => {
    const id = genId('thought');
    refMap[t._ref] = id;
    const subcategoryId = refMap[t.subcategoryRef] || t.subcategoryRef;
    state.thoughts.push({
      id, text: t.text, originalTexts: [t.text],
      subcategoryId,
      emotion: t.emotion || 'neutral',
      weight: t.weight ?? 0.5,
      urgency: t.urgency ?? 0.5,
      occurrences: 1,
      firstSeen: now, lastSeen: now,
      resolved: false, manuallyEdited: false
    });
  });

  // 6. Merge thoughts
  (diff.thoughtUpdates?.merge || []).forEach(m => {
    const target = state.thoughts.find(t => t.id === m.targetId);
    if (!target) return;
    target.occurrences = (target.occurrences || 1) + 1;
    target.lastSeen = now;
    if (m.absorbedInputs) {
      target.originalTexts = [...(target.originalTexts || [target.text]), ...m.absorbedInputs];
    }
  });

  // 7. Reassess thoughts
  (diff.thoughtUpdates?.reassess || []).forEach(r => {
    const target = state.thoughts.find(t => t.id === r.id);
    if (!target || target.manuallyEdited) return;
    if (r.emotion) target.emotion = r.emotion;
    if (r.weight !== undefined) target.weight = r.weight;
    if (r.urgency !== undefined) target.urgency = r.urgency;
  });

  // 8. Move thoughts
  (diff.thoughtUpdates?.move || []).forEach(m => {
    const target = state.thoughts.find(t => t.id === m.thoughtId);
    if (!target) return;
    const newSubId = refMap[m.newSubcategoryRef] || m.newSubcategoryRef;
    if (newSubId) target.subcategoryId = newSubId;
  });

  // 9. Relationships (full replace, resolve refs)
  state.relationships = (diff.relationships || []).map(r => ({
    from: refMap[r.fromRef] || r.fromRef || r.from,
    to: refMap[r.toRef] || r.toRef || r.to,
    type: r.type || 'connects',
    label: r.label || '',
    strength: r.strength ?? 0.6
  })).filter(r => r.from && r.to);

  // 10. ThoughtRelationships (accumulate, deduplicate)
  const newTRels = (diff.thoughtRelationships || []).map(r => ({
    from: refMap[r.from] || r.from,
    to: refMap[r.to] || r.to,
    type: r.type || 'connects',
    label: r.label || ''
  })).filter(r => r.from && r.to);

  // Deduplicate
  const existingKeys = new Set(state.thoughtRelationships.map(r => `${r.from}|${r.to}`));
  newTRels.forEach(r => {
    const k = `${r.from}|${r.to}`;
    if (!existingKeys.has(k)) {
      state.thoughtRelationships.push(r);
      existingKeys.add(k);
    }
  });

  // 11. Insights (replace)
  state.insights = (diff.insights || []).map(i => ({
    type: i.type || 'pattern',
    text: i.text,
    relatedIds: (i.relatedRefs || []).map(ref => refMap[ref] || ref),
    createdAt: now
  }));

  // 12. Contradictions → conflict insights
  (diff.contradictions || []).forEach(c => {
    state.insights.push({ type: 'conflict', text: `${c.a} ↔ ${c.b}: ${c.note}`, relatedIds: [], createdAt: now });
  });

  // 13. Recurring patterns → recurring insights
  (diff.recurring_patterns || []).forEach(p => {
    state.insights.push({ type: 'recurring', text: `${p.theme}: ${p.note}`, relatedIds: [], createdAt: now });
  });

  // 14. Validate references
  validateReferences();

  // 15. Update timestamps
  state.lastAnalyzed = now;

  return diff.mirror_reflection || null;
}

// ── VALIDATE REFERENCES ───────────────────────────────
export function validateReferences() {
  const catIds = new Set(state.categories.map(c => c.id));
  const subIds = new Set(state.subcategories.map(s => s.id));
  const thoughtIds = new Set(state.thoughts.map(t => t.id));

  // Remove orphan subcategories
  state.subcategories = state.subcategories.filter(s => catIds.has(s.parentId));
  // Rebuild subIds after cleanup
  const validSubIds = new Set(state.subcategories.map(s => s.id));

  // Fix orphan thoughts
  state.thoughts.forEach(t => {
    if (!validSubIds.has(t.subcategoryId)) {
      const firstSub = state.subcategories[0];
      if (firstSub) t.subcategoryId = firstSub.id;
    }
  });

  // Validate relationships
  state.relationships = state.relationships.filter(r => catIds.has(r.from) && catIds.has(r.to));

  // Validate thoughtRelationships
  state.thoughtRelationships = state.thoughtRelationships.filter(r =>
    thoughtIds.has(r.from) && thoughtIds.has(r.to)
  );
}
