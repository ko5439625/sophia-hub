# Sophia Hub 디자인 리뉴얼 Phase 1 — PRD

## 1. 개요
- **프로젝트명**: Sophia Hub 디자인 리뉴얼 Phase 1
- **작성일**: 2026-02-27
- **대상**: 기존 Sophia Hub 데스크탑 위젯
- **경로**: `C:/Users/ahyun0520/Desktop/sophia-hub/`
- **목표**: 전문적이면서도 매일 쓰기 편한, Apple 생태계 수준의 디자인 품질 달성
- **타겟 사용자**: 개인용 (sophia)

## 2. 배경 & 문제 정의

### As-Is (현재)
- 보라-파랑 그라데이션 과다 사용 → 유치한 인상
- 이모지를 아이콘으로 사용 → 비전문적
- 인라인 스타일이 흩어져 있어 일관성 없음
- 단순 반투명 배경 (`rgba(0,0,0,0.70)`) → 밋밋함
- 애니메이션 없거나 불일치 → 딱딱한 느낌
- 폰트 크기/간격 매직 넘버 → 정돈 안 된 느낌

### Pain Point
- 매일 쓰는 도구인데 보는 재미가 없음
- 포트폴리오에 보여주기엔 디자인 퀄리티가 아쉬움
- 디자인 수정할 때마다 인라인 스타일 하나하나 찾아야 해서 유지보수 힘듦

### To-Be
- Apple 디자인 언어 기반의 세련된 UI
- 디자인 토큰 시스템으로 일관된 스타일 관리
- Frosted Glass 배경으로 고급스러운 느낌
- 통일된 트랜지션으로 부드러운 사용감

## 3. 핵심 기능 (MVP)

| # | 기능 | 설명 | 우선순위 |
|---|------|------|---------|
| 1 | 디자인 토큰 시스템 | 색상, 타이포, 간격, 모서리 등을 `tokens.ts`로 중앙화 | P0 (필수) |
| 2 | 컬러 팔레트 교체 | 보라 그라데이션 → 모노톤 다크 + iOS Blue(`#007AFF`) 포인트 | P0 (필수) |
| 3 | 아이콘 교체 | 이모지 → Lucide Icons 라인 아이콘 | P0 (필수) |
| 4 | 타이포그래피 계층 | Title(15px/600) / Body(13px/400) / Caption(11px/400) 3단계 정리 | P0 (필수) |
| 5 | 여백 및 간격 통일 | 4px 단위 간격 스케일 (4, 8, 12, 16, 24, 32) | P0 (필수) |
| 6 | 카드 컴포넌트 개선 | 그라데이션 → 단색 배경 + 미세한 그림자, 통일된 border-radius(14px) | P1 (중요) |
| 7 | Acrylic 블러 배경 | `backgroundMaterial: 'acrylic'` 또는 `backdrop-filter: blur(20px)` | P1 (중요) |
| 8 | 트랜지션 통일 | Apple 스프링 커브 `cubic-bezier(0.25, 0.46, 0.45, 0.94)` 전역 적용 | P1 (중요) |
| 9 | 탭 전환 애니메이션 | 탭 변경 시 콘텐츠 페이드/슬라이드 트랜지션 | P2 (있으면 좋음) |

## 4. 기술 스택
- **기존 유지**: Electron 34, React 19, TypeScript, Zustand, electron-vite
- **추가**: Lucide React (아이콘), Framer Motion (이미 설치됨, 활용 확대)
- **변경**: 인라인 스타일 → 디자인 토큰 기반 스타일 객체

## 5. 디자인 시스템 상세

### 5-1. 컬러 팔레트

**배경**
| 용도 | 현재 | 변경 |
|------|------|------|
| 앱 배경 | `rgba(0,0,0,0.70)` | Acrylic 블러 + `rgba(28,28,30,0.85)` |
| 카드 배경 | `rgba(255,255,255,0.03)` | `rgba(255,255,255,0.05)` |
| 카드 호버 | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.08)` |
| 구분선 | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.08)` |

**텍스트**
| 용도 | 현재 | 변경 |
|------|------|------|
| Primary | `rgba(255,255,255,0.92)` | `#f5f5f7` (Apple White) |
| Secondary | `rgba(255,255,255,0.5)` | `#a1a1a6` (Apple Gray) |
| Tertiary | `rgba(255,255,255,0.3)` | `#6e6e73` |

**액센트**
| 용도 | 현재 | 변경 |
|------|------|------|
| Primary | `#937afa` ~ `#60a5fa` 그라데이션 | `#007AFF` (iOS Blue) 단색 |
| Success | `#34d399` | `#30D158` (iOS Green) |
| Warning | `#fbbf24` | `#FFD60A` (iOS Yellow) |
| Error | `#f87171` | `#FF453A` (iOS Red) |

### 5-2. 타이포그래피

| 레벨 | 크기 | 굵기 | 용도 |
|------|------|------|------|
| Title | 15px | 600 | 섹션 헤더, 탭명 |
| Subtitle | 13px | 600 | 카드 제목, 강조 텍스트 |
| Body | 13px | 400 | 본문, 설명 |
| Caption | 11px | 400 | 보조 정보, 타임스탬프 |
| Overline | 10px | 600 | 라벨, 카테고리 (uppercase, letterSpacing: 1px) |

### 5-3. 간격 스케일 (4px 기준)

| 토큰 | 값 | 용도 |
|------|-----|------|
| xs | 4px | 아이콘-텍스트 간격 |
| sm | 8px | 요소 간 간격 |
| md | 12px | 카드 내부 패딩 |
| lg | 16px | 섹션 패딩 |
| xl | 24px | 섹션 간 간격 |
| xxl | 32px | 큰 영역 간격 |

### 5-4. 모서리 (Border Radius)

| 토큰 | 값 | 용도 |
|------|-----|------|
| sm | 6px | 버튼, 뱃지 |
| md | 10px | 입력 필드, 작은 카드 |
| lg | 14px | 메인 카드 |
| full | 9999px | 원형, 필 |

### 5-5. 트랜지션

| 토큰 | 값 | 용도 |
|------|-----|------|
| fast | `150ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` | 호버, 클릭 |
| normal | `250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` | 탭 전환, 카드 확장 |
| slow | `400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` | 패널 열림/닫힘 |

## 6. 영향 받는 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/src/styles/globals.css` | 배경, 스크롤바, 기본 변수 |
| `src/renderer/src/components/Dashboard.tsx` | 헤더, 탭바 스타일 |
| `src/renderer/src/components/tabs/HomeTab.tsx` | 카드, 통계, 목표 UI |
| `src/renderer/src/components/tabs/SkillsTab.tsx` | 스킬 카드, 카테고리 필터 |
| `src/renderer/src/components/tabs/ProjectsTab.tsx` | 프로젝트 카드, Git 상태 |
| `src/renderer/src/components/tabs/NotesTab.tsx` | 노트 카드, 태그 |
| `src/renderer/src/components/tabs/MoreTab.tsx` | 설정, 링크, 통계 |
| `src/main/index.ts` | Acrylic 배경 설정 |
| **신규** `src/renderer/src/styles/tokens.ts` | 디자인 토큰 중앙화 |

## 7. 사용자 흐름 (변경 없음)
기존 기능/흐름은 전혀 변경하지 않음. **순수 비주얼 리뉴얼**만 진행.

## 8. 비기능 요구사항
- **성능**: Acrylic 블러로 인한 성능 저하 최소화. GPU 가속 활용
- **호환성**: Windows 10/11 모두 동작 (Acrylic 미지원 시 fallback)
- **유지보수**: 모든 스타일 값은 `tokens.ts`에서만 관리

## 9. 마일스톤

| Phase | 목표 | 산출물 |
|-------|------|--------|
| Phase 1-1 | 디자인 토큰 + 컬러 교체 | `tokens.ts` 생성, 전 컴포넌트 색상 교체 |
| Phase 1-2 | 아이콘 + 타이포 + 여백 | Lucide 설치, 이모지 제거, 간격 통일 |
| Phase 1-3 | 블러 + 트랜지션 | Acrylic 배경, 전역 트랜지션 적용 |

## 10. 리스크 & 대응

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|----------|
| Acrylic이 transparent 윈도우와 충돌 | 높음 | `backgroundMaterial` 먼저 테스트, 안 되면 CSS `backdrop-filter` fallback |
| 인라인 스타일 전체 교체 작업량 과다 | 중간 | 탭별로 순차 적용, 한번에 전부 안 바꿈 |
| Lucide 아이콘 번들 사이즈 | 낮음 | tree-shaking으로 사용하는 것만 포함 |
