# Mind Dump v4 — 완전 설계서
> 이 문서만으로 v3 파일 없이 v4를 제로베이스부터 구현 가능하도록 작성됨
> 목표: 멀티유저 웹앱, 안드로이드 포함 모든 기기, Celestial Archive 디자인

---

## 1. 프로젝트 목표

| 항목 | 내용 |
|------|------|
| 기능 | 생각을 자유롭게 쏟아내면 Claude AI가 실시간으로 분류·감정분석·관계도 생성 |
| 대상 | 처음엔 개인용, 추후 다른 사람들도 사용 |
| 기기 | 모바일(Android) 우선, 데스크탑도 지원 |
| 인증 | 이메일 로그인 (Supabase Auth) |
| 저장 | 클라우드 DB (Supabase PostgreSQL) |
| AI | Anthropic Claude API (서버 프록시를 통해 호출, 키 노출 없음) |

---

## 2. 기술 스택

```
Frontend   — Vanilla JS (ES6+) SPA, Vite 번들러
Backend    — Cloudflare Workers (API 프록시 + 인증 미들웨어)
Auth       — Supabase Auth (이메일/비밀번호, magic link)
DB         — Supabase PostgreSQL (사용자별 데이터)
배포       — Vercel (프론트) + Cloudflare (백엔드 Workers)
폰트       — Manrope (헤드라인) + Inter (본문), Google Fonts CDN
```

### 왜 이 스택인가
- Vanilla JS: v3 코드(SVG 엔진, 레이아웃 알고리즘, AI 로직)를 프레임워크 없이 그대로 이식 가능
- Vite: 빌드 도구 최소화, 개발 서버만으로도 빠른 개발
- Cloudflare Workers: API 키를 서버에만 보관, 무료 티어로 충분
- Supabase: Auth + DB를 한 곳에서 무료로, 빠른 셋업

---

## 3. 전체 아키텍처

```
[Browser / Android Chrome]
        │
        ▼
[Frontend — Vite SPA]
  index.html + main.js + style.css
        │
        ├──── Supabase Auth SDK ──────────► [Supabase Auth]
        │        (로그인/회원가입)                  │
        │                                     [JWT Token]
        │                                          │
        └──── fetch('/api/analyze') ──────► [Cloudflare Worker]
                  (JWT + inputs)                   │
                                           verify JWT (Supabase)
                                                   │
                                           fetch Anthropic API
                                           (API Key 서버에 보관)
                                                   │
                                           return diff JSON
                                                   │
        ◄─────────────────────────────────── response
        │
        ├──── Supabase JS SDK ────────────► [Supabase PostgreSQL]
               (state 저장/불러오기)           (users, states, snapshots)
```

---

## 4. 데이터베이스 스키마 (Supabase PostgreSQL)

```sql
-- 사용자별 마인드덤프 전체 상태
CREATE TABLE mind_states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  state       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Row Level Security: 본인 데이터만 접근
ALTER TABLE mind_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their state" ON mind_states
  USING (auth.uid() = user_id);
```

`state` JSONB 컬럼에 아래 섹션 6의 전체 state 객체를 JSON으로 저장.

---

## 5. Cloudflare Worker (API 프록시)

```javascript
// worker.js
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST'
        }
      });
    }

    // JWT 검증 (Supabase 공개키로)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401 });
    // Supabase JWT 검증 로직 (supabase-js 또는 jose 라이브러리)

    const body = await request.json();

    // Anthropic API 호출
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,  // ← 환경변수, 클라이언트 비노출
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
```

환경변수 `ANTHROPIC_API_KEY`는 Cloudflare 대시보드에서만 설정, 코드에 절대 노출 안 됨.

---

## 6. 핵심 데이터 구조 (State)

```javascript
const state = {
  version: 2,
  createdAt: 0,            // Date.now()
  lastAnalyzed: 0,         // 마지막 분석 시각
  categories: [],          // 대분류 배열
  subcategories: [],       // 세분류 배열
  thoughts: [],            // 생각 배열
  relationships: [],       // 대분류 간 관계
  thoughtRelationships: [],// 생각 간 관계
  insights: [],            // AI 인사이트
  hideResolved: false,     // 해결된 생각 숨기기
  pendingCaptures: [],     // 즉석 메모 (다음 세션에 포함)
  snapshots: []            // 시간 스냅샷 (최대 30개)
};

// Category 객체
{
  id: 'cat_abc123',
  name: '업무',
  description: '직장 관련 걱정들',
  colorIndex: 0,          // COLORS 배열 인덱스
  isRoot: false,          // 근본 고민 여부
  createdAt: 1234567890
}

// Subcategory 객체
{
  id: 'sub_abc123',
  name: '번아웃 걱정',
  parentId: 'cat_abc123',
  createdAt: 1234567890
}

// Thought 객체
{
  id: 'thought_abc123',
  text: '요즘 너무 지쳐있는 것 같아',
  originalTexts: ['요즘 너무 지쳐있는 것 같아'],  // merge 이력
  subcategoryId: 'sub_abc123',
  emotion: 'anxiety',      // 감정 키 (아래 EMOTION 참조)
  weight: 0.7,             // 0.0~1.0, 생각의 무게감
  urgency: 0.5,            // 0.0~1.0, 시급함
  occurrences: 1,          // 반복 언급 횟수
  firstSeen: 1234567890,
  lastSeen: 1234567890,
  resolved: false,
  manuallyEdited: false    // 사용자가 직접 편집했으면 AI 재평가 차단
}

// Relationship (대분류 간)
{
  from: 'cat_abc123',
  to: 'cat_def456',
  type: 'causes',          // REL_TYPES 키
  label: '업무 스트레스가 관계 문제를 악화시킴',
  strength: 0.7
}

// ThoughtRelationship (생각 간)
{
  from: 'thought_abc123',
  to: 'thought_def456',
  type: 'amplifies',
  label: '서로 강화하는 관계'
}

// Insight
{
  type: 'conflict',        // 'pattern'|'recurring'|'heavy'|'conflict'|'root'
  text: '휴식 필요 ↔ 더 열심히 해야 한다는 모순',
  relatedIds: ['thought_abc123'],
  createdAt: 1234567890
}

// Snapshot (분석할 때마다 저장)
{
  ts: 1234567890,
  categories: [...],       // deep copy
  subcategories: [...],
  thoughts: [...],
  relationships: [...],
  thoughtRelationships: [...]
}

// PendingCapture (즉석 메모)
{
  id: 'capture_abc123',
  text: '방금 떠오른 것',
  capturedAt: 1234567890
}
```

---

## 7. 전역 상수

```javascript
// 대분류 색상 팔레트 (8개 순환)
const COLORS = [
  {main:'#60a5fa', glow:'rgba(96,165,250,0.2)', text:'#93c5fd', dim:'rgba(96,165,250,0.08)'},
  {main:'#f97316', glow:'rgba(249,115,22,0.2)',  text:'#fdba74', dim:'rgba(249,115,22,0.08)'},
  {main:'#34d399', glow:'rgba(52,211,153,0.2)',  text:'#6ee7b7', dim:'rgba(52,211,153,0.08)'},
  {main:'#f472b6', glow:'rgba(244,114,182,0.2)', text:'#f9a8d4', dim:'rgba(244,114,182,0.08)'},
  {main:'#a78bfa', glow:'rgba(167,139,250,0.2)', text:'#c4b5fd', dim:'rgba(167,139,250,0.08)'},
  {main:'#fbbf24', glow:'rgba(251,191,36,0.2)',  text:'#fde68a', dim:'rgba(251,191,36,0.08)'},
  {main:'#2dd4bf', glow:'rgba(45,212,191,0.2)',  text:'#99f6e4', dim:'rgba(45,212,191,0.08)'},
  {main:'#fb7185', glow:'rgba(251,113,133,0.2)', text:'#fda4af', dim:'rgba(251,113,133,0.08)'}
];

// 감정 분류 시스템
const EMOTION = {
  anxiety:      {color:'#f87171', label:'불안',   glyph:'😟'},
  frustration:  {color:'#ef4444', label:'짜증',   glyph:'😤'},
  anticipation: {color:'#fb923c', label:'기대',   glyph:'✨'},
  conflict:     {color:'#c084fc', label:'갈등',   glyph:'⚡'},
  relief:       {color:'#34d399', label:'안도',   glyph:'😮‍💨'},
  pride:        {color:'#fbbf24', label:'뿌듯',   glyph:'🌟'},
  sadness:      {color:'#60a5fa', label:'서글픔', glyph:'🌧️'},
  neutral:      {color:'#94a3b8', label:'중립',   glyph:'💭'}
};

// 관계 유형
const REL_TYPES = {
  causes:   {color:'#fb923c', dash:'none',     width:2.5, label:'원인', arrow:true},
  conflicts:{color:'#f87171', dash:'8 5',      width:2.5, label:'갈등', arrow:false},
  resolves: {color:'#34d399', dash:'none',     width:2.5, label:'해소', arrow:true},
  amplifies:{color:'#fbbf24', dash:'6 4',      width:2.5, label:'심화', arrow:false},
  blocks:   {color:'#94a3b8', dash:'10 4 2 4', width:2.5, label:'방해', arrow:true},
  connects: {color:'#a78bfa', dash:'5 6',      width:2.5, label:'연결', arrow:false}
};
```

---

## 8. SVG 그래프 엔진

### 8-1. 카메라 시스템

```javascript
// 카메라 상태
let cam = { px: 0, py: 0, scale: 1.0 };

// SVG <g id="world"> 에 transform만 업데이트 (DOM 재구성 없음)
function applyCamera() {
  const world = document.getElementById('world');
  if (world) world.setAttribute('transform',
    `translate(${cam.px.toFixed(1)},${cam.py.toFixed(1)}) scale(${cam.scale.toFixed(5)})`
  );
}

// 특정 스크린 좌표를 중심으로 줌
function zoomAtRaw(sx, sy, newScale) {
  const wx = (sx - cam.px) / cam.scale;
  const wy = (sy - cam.py) / cam.scale;
  cam.scale = Math.max(0.2, Math.min(6, newScale));
  cam.px = sx - wx * cam.scale;
  cam.py = sy - wy * cam.scale;
}

// 스크린 → 월드 좌표 변환
function screenToWorld(sx, sy) {
  return { x: (sx - cam.px) / cam.scale, y: (sy - cam.py) / cam.scale };
}

// 모든 노드가 화면에 맞게 카메라 조정
function fitAll() {
  computeLayout();
  const ids = Object.keys(layouts);
  if (ids.length === 0) { cam = {px:0, py:0, scale:1}; return; }
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  ids.forEach(id => {
    const l = layouts[id];
    if (l.x < minX) minX = l.x; if (l.x > maxX) maxX = l.x;
    if (l.y < minY) minY = l.y; if (l.y > maxY) maxY = l.y;
  });
  const padding = 80;
  const rangeX = (maxX - minX) + padding * 2;
  const rangeY = (maxY - minY) + padding * 2;
  cam.scale = Math.max(0.2, Math.min(2, Math.min(W / rangeX, H / rangeY)));
  cam.px = W / 2 - ((minX + maxX) / 2) * cam.scale;
  cam.py = H / 2 - ((minY + maxY) / 2) * cam.scale;
}
```

### 8-2. 관성 애니메이션

```javascript
const anim = {
  active: false, rafId: null,
  zoomVelocity: 0, zoomAnchorSx: 0, zoomAnchorSy: 0,
  panVx: 0, panVy: 0,
  lastPanTime: 0, lastPanX: 0, lastPanY: 0
};
const ZOOM_FRICTION = 0.88;
const PAN_FRICTION  = 0.92;
const MIN_VELOCITY  = 0.0005;
const MIN_PAN_V     = 0.3;

function startAnimLoop() {
  if (anim.active) return;
  anim.active = true;
  anim.rafId = requestAnimationFrame(animTick);
}

function animTick() {
  let needsRender = false;
  // 줌 관성
  if (Math.abs(anim.zoomVelocity) > MIN_VELOCITY) {
    zoomAtRaw(anim.zoomAnchorSx, anim.zoomAnchorSy, cam.scale * (1 + anim.zoomVelocity));
    anim.zoomVelocity *= ZOOM_FRICTION;
    needsRender = true;
  } else { anim.zoomVelocity = 0; }
  // 팬 관성
  if (Math.abs(anim.panVx) > MIN_PAN_V || Math.abs(anim.panVy) > MIN_PAN_V) {
    cam.px += anim.panVx; cam.py += anim.panVy;
    anim.panVx *= PAN_FRICTION; anim.panVy *= PAN_FRICTION;
    needsRender = true;
  } else { anim.panVx = 0; anim.panVy = 0; }

  if (needsRender) {
    try { applyCamera(); } catch(e) {}
    anim.rafId = requestAnimationFrame(animTick);
  } else {
    anim.active = false; anim.rafId = null;
  }
}
```

### 8-3. 레이아웃 계산 (computeLayout)

```javascript
let layouts = {}; // id → {x, y, radius, _angle}

function computeLayout() {
  const cx = W / 2, cy = H / 2;
  layouts = {};

  // 적응형 간격 계수: 줌에 따라 노드 간격 조정
  const breathe = 0.7 + Math.min(cam.scale, 3) * 0.35;

  // Tier 1: 대분류 — 캔버스 중심 기준 원형 배치
  state.categories.forEach((cat, i) => {
    const n = state.categories.length;
    const baseRadius = Math.max(Math.min(W, H) * 0.22, n * 38);
    const radius = baseRadius * (0.85 + breathe * 0.15);
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    layouts[cat.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      radius: 22, _angle: angle
    };
  });

  // Tier 2: 세분류 — 대분류에서 방사형으로 펼침
  state.subcategories.forEach(sub => {
    const parent = state.categories.find(c => c.id === sub.parentId);
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
      radius: 12, _angle: subAngle
    };
  });

  // Tier 3: 생각 — 세분류에서 방사형으로 펼침
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
      radius: 3 + thought.weight * 7  // weight에 따라 점 크기 3~10px
    };
  });

  // Repulsion: 세분류 간 최소 거리 보장
  const subMinDist = 35 * breathe;
  state.subcategories.forEach((sub, i) => {
    if (!layouts[sub.id]) return;
    for (let j = i + 1; j < state.subcategories.length; j++) {
      const other = state.subcategories[j];
      if (!layouts[other.id]) continue;
      const dx = layouts[other.id].x - layouts[sub.id].x;
      const dy = layouts[other.id].y - layouts[sub.id].y;
      const dist = Math.sqrt(dx*dx + dy*dy);
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

  // Repulsion: 생각 점 간 최소 거리 보장
  const tMinDist = 12 * breathe;
  state.thoughts.forEach((t, i) => {
    if (!layouts[t.id]) return;
    for (let j = i + 1; j < state.thoughts.length; j++) {
      const other = state.thoughts[j];
      if (!layouts[other.id]) continue;
      const dx = layouts[other.id].x - layouts[t.id].x;
      const dy = layouts[other.id].y - layouts[t.id].y;
      const dist = Math.sqrt(dx*dx + dy*dy);
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
```

### 8-4. SVG 렌더링 (render)

render()는 상태 변경 시에만 호출. 카메라 이동 시에는 applyCamera()만 호출.

```
render() 호출 시점:
  - 'init': 앱 시작
  - 'selection': 노드 선택/해제
  - 'analysis': AI 분석 완료
  - 'delete', 'resolve', 'move': 생각 조작
  - 'snapshot': 스냅샷 탐색
  - 'deselect', 'reset', 'full': 기타 상태 변경

applyCamera() 호출 시점 (DOM 변경 없음):
  - 마우스 드래그 팬
  - 터치 팬/핀치 줌
  - 마우스 휠 줌
  - 줌 버튼 클릭
  - 키보드 +/-/0
  - animTick (관성)
```

렌더링 순서 (world.innerHTML에 html 문자열로 빌드 후 한 번에 세팅):
1. **대분류 관계 곡선** (state.relationships) — Quadratic Bezier 곡선, 다중 관계 시 곡률 분배
2. **대분류→세분류 연결선** — 희미한 점선
3. **세분류→생각 연결선** — 감정 컬러, opacity 0.2
4. **선택된 생각의 관계선** — 형제 생각 점선 + AI thoughtRelationships 색깔선
5. **생각 노드** — `<g data-thought="id">` + 히트 원 + 감정 점 + 이모지 + 텍스트
6. **세분류 노드** — `<g data-subcategory="id">` + 색깔 원 + 이름 텍스트
7. **대분류 노드** — `<g data-category="id">` + 글로우 원 + 메인 원 + 이름 + 루트 링

모든 선에 `vector-effect="non-scaling-stroke"` 적용 (줌해도 선 굵기 일정).

#### 대분류 관계 곡선 핵심 로직
```javascript
// 같은 쌍의 관계가 여러 개면 곡률 방향을 교대로 배분
const pairKey = [rel.from, rel.to].sort().join('|');
const pairRels = state.relationships.filter(r =>
  [r.from, r.to].sort().join('|') === pairKey
);
const pairIdx = pairRels.indexOf(rel);
const baseOffset = dist * 0.28;
let cp_offset;
if (pairRels.length <= 1) {
  cp_offset = baseOffset;
} else {
  const sign = pairIdx % 2 === 0 ? 1 : -1;
  const magnitude = 0.6 + Math.floor(pairIdx / 2) * 0.55;
  cp_offset = baseOffset * sign * magnitude;
}
const cpx = mx - (dy / dist) * cp_offset;
const cpy = my + (dx / dist) * cp_offset;
// path: M fp.x,fp.y Q cpx,cpy tp.x,tp.y
```

#### 생각 노드 렌더링 세부사항
```javascript
// 나이에 따른 밝기 (ageFactor: 0.25~1.0)
// 오늘=1.0, 3일=0.85, 1주=0.7, 2주=0.5, 1달=0.35, 이후=0.25
// 반복 언급 시 최대 +0.15 밝기 보너스

// baseOpacity 계산
const baseOpacity = isDimmed ? 0.12 : (isSelected ? 1.0 : ageFactor * 0.85);

// 생각 점 반지름: 3 + weight * 7 (weight 0~1 → 반지름 3~10)
// 히트 영역: Math.max(visualRadius + 6, 12)
// 히트 원: fill="transparent" pointer-events="auto"
// 실제 점: pointer-events="none"

// 나이테: occurrences > 1일 때 바깥으로 동심원 추가 (최대 5개)
// 긴급 점선 링: urgency > 0.6일 때
// 신규 펄스 애니메이션: firstSeen으로부터 2시간 이내
// 해결됨: 가로 줄긋기
```

---

## 9. 이벤트 핸들링

### 클릭 감지 (드래그와 구분)
```javascript
let isDragging = false;
let dragStart = {x:0, y:0};
let dragNode = null;
let nodeClickSuppressed = false;

// 노드 mousedown: stopPropagation + dragNode 설정 + nodeClickSuppressed=false
// document mousemove: dragNode 있고 이동 > 8px → nodeClickSuppressed=true
// 노드 click: if(nodeClickSuppressed) return; → selectNode + showDetailPanel
// document mouseup: isDragging=false, dragNode=null

// 배경 mousedown (main-svg): isDragging=true, 팬 시작
// 배경 드래그: cam.px/py 업데이트 → applyCamera() (render 아님!)
// 배경 mouseup: 속도 있으면 startAnimLoop()
```

### 마우스 휠 줌
```javascript
// deltaY → impulse = -deltaY * 0.0008 → anim.zoomVelocity에 누적
// startAnimLoop() → animTick이 관성으로 처리
```

### 터치 (Android)
```javascript
// 1손가락: 팬 (isDragging)
// 2손가락: 핀치줌 + 중점 이동으로 동시 팬
// touchState: { active, dist, cx, cy, lastScale }
```

### 키보드
```javascript
// '+'/   '=' → zoomAt(center, scale*1.2) → applyCamera()
// '-'        → zoomAt(center, scale/1.2) → applyCamera()
// '0'        → fitAll() → applyCamera()
// 'Escape'   → selected=null, 패널 닫기, render('deselect')
// '/'        → openSession()
// 'r'        → state.hideResolved 토글
```

---

## 10. AI 분석 시스템

### 10-1. 분석 요청 흐름

```javascript
function analyzeSession(inputs) {
  // inputs: string[] — 세션에서 입력된 생각들

  const request = {
    version: 2,
    existingState: {
      categories: state.categories.map(c => ({id:c.id, name:c.name, description:c.description, isRoot:c.isRoot})),
      subcategories: state.subcategories,
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
    // 최근 3개 스냅샷의 생각 텍스트 목록 (반복 패턴 감지용)
    snapshotHistory: (state.snapshots || []).slice(-4, -1).map(snap =>
      snap.thoughts.map(t => t.text)
    )
  };

  // Cloudflare Worker 프록시를 통해 호출
  fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabase.auth.session().access_token}`
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,  // 아래 10-2 참조
      messages: [{ role: 'user', content: 'Please analyze and organize these thoughts:\n' + JSON.stringify(request, null, 2) }]
    })
  })
}
```

### 10-2. 시스템 프롬프트 (전문)

```
당신은 사용자의 생각을 분류하고 감정을 분석하는 AI입니다.
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

【중요 필드명 규칙 — 정확히 지켜야 함】

카테고리 추가:
{"_ref": "_c1", "name": "카테고리명", "description": "설명"}

세분류 추가 (subcategoryUpdates.add):
{"_ref": "_s1", "parentRef": "_c1", "name": "세분류명"}
※ parentRef: 새 카테고리면 _ref값, 기존 카테고리면 실제 id값

생각 추가 (thoughtUpdates.add):
{"_ref": "_t1", "subcategoryRef": "_s1", "text": "생각 내용", "emotion": "anxiety", "weight": 0.5, "urgency": 0.3}
※ subcategoryRef: 새 세분류면 _ref값, 기존 세분류면 실제 id값

인사이트 항목:
{"type": "pattern", "text": "인사이트 내용", "relatedRefs": ["_c1"]}
※ type: "pattern" | "recurring" | "heavy" | "conflict" | "root"

【생각 간 관계 (thoughtRelationships) — 반드시 생성】
- 이번 세션에서 추가된 생각들 중 서로 연관된 쌍을 찾아 thoughtRelationships에 추가하라.
- 기준: 같은 걱정에서 비롯됨, 서로 원인-결과, 서로 모순, 서로 강화하는 관계
- 새 생각 5개 → thoughtRelationships 최소 3~5쌍
- from/to는 새 생각이면 _ref값, 기존 생각이면 실제 id값 사용
- 형식: {"from": "_t1", "to": "_t2", "type": "causes", "label": "한 줄 설명"}
- type: "causes" | "conflicts" | "amplifies" | "resolves" | "connects"
- thoughtRelationships 배열을 비워두지 말 것. 생각이 2개 이상이면 반드시 최소 1개 이상.

【대분류 간 관계 — 반드시 생성】
- 카테고리가 2개 이상이면, 의미 있는 쌍마다 관계를 추가하라. relationships 배열을 비워두지 말 것.
- fromRef/toRef는 새 카테고리면 _ref값, 기존 카테고리면 실제 id값.
- type: causes | conflicts | resolves | amplifies | blocks | connects
- 관계 항목: {"fromRef": "_c1", "toRef": "_c2", "type": "causes", "label": "설명 한 줄", "strength": 0.7}

【모순 감지 — Phase 4】
- 서로 반대되거나 긴장 관계에 있는 생각 쌍을 찾아라.
- contradictions 배열: [{"a": "생각1 원문", "b": "생각2 원문", "note": "한 줄로 이 긴장을 설명"}]
- 명확한 모순이 없으면 빈 배열. 억지로 만들지 말 것.

【반복 패턴 감지 — snapshotHistory 제공 시】
- snapshotHistory는 과거 세션들의 생각 텍스트 목록. 이번 입력과 비교해 반복 테마를 찾아라.
- recurring_patterns 배열: [{"theme": "반복되는 주제 한 줄", "note": "이 패턴이 의미하는 것"}]

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
}
```

### 10-3. AI 응답 처리 (applyDiff)

```
1. categoryUpdates.add → genId('cat'), refMap[_ref]=newId, state.categories.push
2. categoryUpdates.rename → id로 찾아 name/description 업데이트
3. categoryUpdates.setRoot → 해당 카테고리만 isRoot=true, 나머지 false
4. subcategoryUpdates.add → genId('sub'), parentRef→refMap으로 실제 id 변환
5. thoughtUpdates.add → genId('thought'), subcategoryRef→refMap으로 실제 id 변환
6. thoughtUpdates.merge → targetId 찾아 text/occurrences/originalTexts 업데이트
7. thoughtUpdates.reassess → manuallyEdited=false인 경우만 emotion/weight/urgency 업데이트
8. thoughtUpdates.move → newSubcategoryRef→refMap으로 변환해 subcategoryId 이동
9. relationships → 전체 교체 (fromRef/toRef → refMap 변환)
10. thoughtRelationships → 누적 (기존 유지, 중복 제거 후 새것 추가)
11. insights → 전체 교체
12. contradictions → conflict 타입 인사이트로 변환해 state.insights에 push
13. recurring_patterns → recurring 타입 인사이트로 변환해 state.insights에 push
14. validateReferences() → 고아 데이터 정리
15. fitAll() → 카메라 재조정
```

### 10-4. 참조 무결성 검사 (validateReferences)

```
- subcategories: parentId가 실제 category에 없으면 제거
- thoughts: subcategoryId가 없으면 첫 번째 subcategory로 이동
- relationships: from/to 모두 실제 category여야 유지
- thoughtRelationships: from/to 모두 실제 thought여야 유지
```

### 10-5. JSON 파싱 (parseJSON)

```javascript
function parseJSON(text) {
  try { return JSON.parse(text); } catch(e) {}
  // AI가 코드블록에 감싸는 경우 대비
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch(e2) {} }
  return null;
}
```

---

## 11. 세션 모드

```
세션 = 사용자가 자유롭게 생각을 쏟아내는 집중 모드
타이머: 7분(기본), 10분, 자유 모드 선택 가능
타이머 종료 or "다 나왔다" 버튼 → endSession() → analyzeSession(inputs)

입력 파싱: textarea.value.split(/[\n,]/) → trim → filter(length > 0)
pendingCaptures (즉석 메모)가 있으면 세션 시작 시 textarea에 자동 포함

힌트 메시지 (sessionStartedTyping 후):
  경과 40초: "아직 더 있지 않나요?"
  경과 180초: "지금 몸에서 느껴지는 건요?"
  경과 300초: "가장 쓰기 싫었던 것은요?"
```

---

## 12. 스냅샷 시스템

```
- analyzeSession 성공 직후 saveSnapshot() 호출
- 최대 30개 유지 (초과 시 가장 오래된 것 제거)
- 스냅샷이 2개 이상이면 슬라이더 UI 표시
- 슬라이더 드래그 시 해당 시점의 categories/subcategories/thoughts/relationships로 임시 렌더
- "현재로" 버튼 → 현재 state로 복귀
```

---

## 13. 세부 기능 목록

| 기능 | 설명 |
|------|------|
| 생각 해결됨 표시 | resolved 토글, 줄긋기 표시, "해결됨 숨기기" 필터 |
| 생각 삭제 | 확인 모달 후 state.thoughts에서 제거 |
| 생각 이동 | 다른 세분류로 subcategoryId 변경 |
| 생각 텍스트 편집 | 상세 패널에서 클릭 → textarea로 인라인 편집 |
| 즉석 메모 | + 버튼 → 팝업 → pendingCaptures에 저장 → 다음 세션에 자동 포함 |
| 데이터 내보내기 | state를 JSON으로 다운로드 |
| 데이터 가져오기 | JSON 파일 업로드 → state 덮어씌우기 |
| 초기화 | 현재 state를 백업 키로 localStorage에 저장 후 state 리셋 |
| 배경 감정 색조 | 전체 생각 중 지배적 감정(20% 이상) → canvas-wrap에 미묘한 색 오버레이 (3s transition) |
| 선택 하이라이트 | 선택된 노드의 계층(부모/자식/관련)은 밝게, 나머지는 opacity 0.12로 dimming |
| 루트 고민 링 | isRoot=true인 대분류에 골드 테두리 원 |
| 대분류 글로우 | 각 대분류마다 float-a~f 애니메이션으로 떠다니는 글로우 원 |
| 별 배경 | 90개의 반짝이는 별 SVG, twinkle 애니메이션 |
| 인사이트 카드 | 분석 후 최대 3개 카드 표시, 6초 후 fadeout, 클릭으로 닫기 |
| 거울 오버레이 | 분석 후 AI mirror_reflection 표시, 텍스트 길이에 따라 5~9초 표시 |
| 데이터 복구 | 생각은 있는데 세분류 없는 고아 데이터 → 전체 재분석 |

---

## 14. UI 레이아웃 (모바일 우선)

```
┌─────────────────────────────┐ ← 100dvh
│  #top-bar (통계: 생각N/분류N/카테고리N)  │ 48px 고정
├─────────────────────────────┤
│                             │
│   #canvas-wrap (flex:1)     │
│   ┌───────────────────────┐ │
│   │ #star-svg (배경 별)   │ │
│   │ #main-svg             │ │
│   │   <g id="world">      │ │  ← SVG transform으로 카메라
│   │   </g>                │ │
│   │ #empty-state          │ │
│   │ #snapshot-slider-bar  │ │  ← bottom 60px
│   │ #zoom-ctrl            │ │  ← bottom-right 플로팅
│   │ #insight-overlay      │ │  ← top 80px 중앙
│   └───────────────────────┘ │
│  #bottom-sheet              │  ← 노드 탭 시 슬라이드업
├─────────────────────────────┤
│  #bottom-nav (탭바)         │ 64px 고정
│  [맵] [인사이트] [세션]     │
└─────────────────────────────┘

+ 오버레이 (position:fixed, z-index 높음):
  #session-overlay (세션 입력)
  #mirror-overlay (AI 거울)
  #loading-overlay (분석 중)
  #modal-overlay (확인/이동 모달)
  #error-toast (하단 알림)
  #quick-capture-popup + #quick-capture-btn (즉석 메모)
```

### Bottom Sheet (상세 패널 — 모바일화)
- 노드 탭 → bottom sheet 슬라이드업 (`transform: translateY(0)`)
- 배경 탭 → 닫힘 (`transform: translateY(100%)`)
- 드래그 핸들 (상단 바) — 스와이프 다운으로 닫기
- 생각 상세: 브레드크럼, 감정칩, 텍스트(편집 가능), 무게/긴급 바, 관련 생각, 버튼
- 세분류 상세: 이름, 포함 생각 목록
- 대분류 상세: 이름, 설명, 관계 목록, 세분류 목록

---

## 15. 디자인 시스템 (Celestial Archive)

### 컬러 토큰
```css
:root {
  --bg:              #0c1324;  /* 우주 void 배경 */
  --surface-low:     #151b2d;  /* 컨테이너 */
  --surface:         #0c1324;  /* 기본 surface */
  --surface-high:    #23293c;  /* 활성 카드 */
  --surface-bright:  #33394c;  /* 모달 */
  --surface-variant: #2e3447;  /* glass 배경 */

  --primary:         #f9bd22;  /* 골드 — CTA, 루트 링 */
  --on-primary:      #402d00;
  --on-surface:      #dce1fb;  /* 기본 텍스트 */
  --on-surface-dim:  #909097;  /* 보조 텍스트 */
  --outline:         rgba(255,255,255,0.08); /* ghost border */

  /* 감정 컬러 — 생각 노드 전용, UI 버튼에 쓰지 말 것 */
  --emotion-anxiety:      #f87171;
  --emotion-frustration:  #ef4444;
  --emotion-anticipation: #fb923c;
  --emotion-conflict:     #c084fc;
  --emotion-relief:       #34d399;
  --emotion-pride:        #fbbf24;
  --emotion-sadness:      #60a5fa;
  --emotion-neutral:      #94a3b8;
}
```

### 핵심 디자인 규칙
- **No-Line Rule**: 1px solid 구분선 금지. 배경색 차이나 그라디언트로만 영역 구분.
- **Ghost Border**: 불가피한 경계선은 `1px solid rgba(255,255,255,0.08)`
- **Glass Rule**: 플로팅 패널은 `background: rgba(46,52,71,0.4); backdrop-filter: blur(12px)`
- **Shadow Rule**: `box-shadow: 0 20px 40px rgba(0,0,0,0.4)`
- **Transition**: 600ms ease-out (우주 물체의 움직임처럼 느리고 유체적)
- **Primary 골드**: CTA 버튼, 루트 생각 링, 포커스 인디케이터만 사용

### 컴포넌트 스타일
```css
/* Bottom Sheet */
.bottom-sheet {
  background: rgba(46,52,71,0.6);
  backdrop-filter: blur(20px);
  border-radius: 24px 24px 0 0;
  border-top: 1px solid rgba(255,255,255,0.08);
}

/* FAB (세션 시작) */
.fab {
  background: #f9bd22;
  color: #402d00;
  border-radius: 50%;
  width: 56px; height: 56px;
  box-shadow: 0 0 20px rgba(249,189,34,0.4);
}

/* 감정 칩 */
.emotion-chip {
  background: color-mix(in srgb, var(--emotion-color) 10%, transparent);
  color: var(--emotion-color);
  border-radius: 99px;
  padding: 4px 10px;
  font-size: 12px;
}

/* 입력창 */
.mind-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255,255,255,0.15);
  color: var(--on-surface);
  font-size: 18px;
}
.mind-input:focus {
  border-bottom-color: #f9bd22;
  outline: none;
}

/* 루트 생각 링 */
.root-ring {
  stroke: #f9bd22;
  stroke-width: 3px;
  filter: drop-shadow(0 0 8px rgba(249,189,34,0.6));
}
```

### 타이포그래피
```css
/* 구글 폰트 임포트 */
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;600;700;800&family=Inter:wght@300;400;500;600&display=swap');

body { font-family: 'Inter', system-ui, sans-serif; }
h1, h2, .logo { font-family: 'Manrope', system-ui, sans-serif; }
```

### 애니메이션
```css
@keyframes float-a { 0%,100%{transform:translate(0,0)} 25%{transform:translate(3px,-4px)} 50%{transform:translate(-2px,3px)} 75%{transform:translate(4px,1px)} }
/* float-b through float-f: 유사하게 다른 방향으로 */
@keyframes twinkle { 0%,100%{opacity:0.3} 50%{opacity:1} }
@keyframes newPulse { 0%{opacity:0.7;r:15} 100%{opacity:0;r:30} }
@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes mirrorFadeIn { from{opacity:0} to{opacity:1} }
```

---

## 16. 인증 흐름 (Supabase Auth)

```javascript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 로그인
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) loadStateFromDB(data.user.id);
}

// 회원가입
async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
}

// 상태 저장
async function saveStateToCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('mind_states').upsert({
    user_id: user.id,
    state: state,
    updated_at: new Date().toISOString()
  });
}

// 상태 불러오기
async function loadStateFromDB(userId) {
  const { data } = await supabase.from('mind_states').select('state').eq('user_id', userId).single();
  if (data?.state) Object.assign(state, data.state);
}

// 인증 상태 감지
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') loadStateFromDB(session.user.id);
  if (event === 'SIGNED_OUT') state = { ...defaultState };
});
```

---

## 17. 폴더 구조

```
mind-dump-v4/
├── index.html
├── src/
│   ├── main.js          ← 진입점, 앱 초기화
│   ├── state.js         ← state 객체, 상수 (COLORS, EMOTION, REL_TYPES)
│   ├── store.js         ← Supabase 연동, 저장/불러오기
│   ├── auth.js          ← 로그인/로그아웃
│   ├── camera.js        ← cam, applyCamera, zoomAt, fitAll, 관성 anim
│   ├── layout.js        ← computeLayout, layouts 객체
│   ├── render.js        ← render(), SVG 생성 로직
│   ├── events.js        ← 마우스/터치/키보드 이벤트
│   ├── ai.js            ← analyzeSession, applyDiff, parseJSON
│   ├── session.js       ← 세션 모드, 타이머
│   ├── snapshot.js      ← saveSnapshot, 슬라이더
│   ├── ui.js            ← bottom-sheet, 모달, 토스트, 인사이트 카드
│   └── style.css        ← 전체 CSS
├── worker/
│   └── index.js         ← Cloudflare Worker (API 프록시)
├── vite.config.js
└── package.json
```

---

## 18. 제작 순서 (새 세션 작업 지시)

```
Phase 1 — 뼈대
  1. Vite 프로젝트 세팅 (vanilla JS 템플릿)
  2. CSS 변수 + 전체 레이아웃 (top-bar, canvas-wrap, bottom-nav)
  3. Celestial Archive 컬러/폰트/애니메이션 적용
  4. SVG 구조 (star-svg, main-svg, world group)

Phase 2 — 핵심 엔진
  5. state.js — 상수 + 초기 state 구조
  6. camera.js — cam, applyCamera, zoomAtRaw, fitAll, animTick
  7. layout.js — computeLayout (3티어 + repulsion)
  8. render.js — 전체 SVG 렌더링 (섹션 8-4 기준)
  9. events.js — 마우스/터치/키보드 + 클릭/드래그 구분 로직

Phase 3 — AI 연동
  10. worker/index.js — Cloudflare Worker 프록시
  11. ai.js — analyzeSession, applyDiff, validateReferences
  12. session.js — 세션 타이머, openSession/endSession
  13. snapshot.js — saveSnapshot, 슬라이더

Phase 4 — 인증 + 저장
  14. auth.js — Supabase Auth 로그인/회원가입 UI
  15. store.js — Supabase DB 저장/불러오기
  16. 오프라인 fallback — localStorage

Phase 5 — UI 완성
  17. bottom-sheet — 노드 상세 패널 (슬라이드업/다운)
  18. 모달 시스템 — 확인, 이동, 인사이트
  19. 거울 오버레이, 로딩, 토스트
  20. 즉석 메모 (quick-capture)

Phase 6 — 배포
  21. Vercel 배포 (프론트)
  22. Cloudflare Worker 배포 (백엔드)
  23. 환경변수 설정 (ANTHROPIC_API_KEY, SUPABASE_URL 등)
```

---

## 19. ID 생성 함수

```javascript
function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
// 예: 'cat_m5g2xk4a', 'thought_m5g2xr8b'
```

---

## 20. 에러 처리

| 상황 | 처리 |
|------|------|
| API 401 | 토스트 "인증 실패", 로그인 모달 |
| API 429 | 토스트 "요청 한도, 60초 후 재시도", 60초 카운트다운 후 자동 재시도 |
| API 기타 오류 | 토스트 "분석 중 오류", 콘솔 로그 |
| JSON 파싱 실패 | parseJSON의 regex fallback 시도 |
| 고아 데이터 | validateReferences로 자동 정리 |
| 네트워크 없음 | 로컬 localStorage fallback으로 오프라인 동작 |

---

*작성일: 2026-04-02*
*기반: mind-dump-v3.html 전체 코드 분석 + 디자인 방향성/DESIGN.md*
*이 문서만으로 v4 전체 구현 가능*
