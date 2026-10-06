# 성운이와 공룡 친구들의 놀이터 안전 약속 — Remotion 프로젝트

3~6세용 2분 2.5D 컷아웃 애니메이션입니다.
- 1920×1080, 24fps, 2,880프레임(정확히 120초), 28숏
- 작업공간 루트의 `docs/`, `data/`, `assets/` 원본만 읽고, 원본은 수정하지 않습니다.

## 현재 결과 (2026-10-04)

| 파일 | 상태 |
|---|---|
| `out/dino-playground-preview-silent.mp4` | ✅ 960×540, 2,880프레임, 120.000초, 오디오 없음, 검은 프레임 0 |
| `out/dino-playground-final.mp4` | ⏸ 외부 오디오(음성 46개, 음악 1개, 효과음 8개)가 없어서 렌더하지 않음 |
| `out/keyframes/*.png` | ✅ 레이아웃 확인용 스틸 8장 (S03, S07, S09, S10, S16, S22, S27, S28) |
| `out/contact-sheets/character-cutouts.png` | ✅ 컷아웃 84장 검수 시트 (4캐릭터 × 표정 7 + 포즈 6 + 동작 8) |
| `out/subtitles.ko.srt` | ✅ 원본 SRT를 바꾸지 않고 복사 |
| `out/missing-assets.json` | 누락 오디오 목록 |
| `out/qa-report.json` | QA 결과: pass 16 / fail 0 / warn 4 / skip 1 (최종본) |
| `out/validation-report.json`, `out/preprocess-report.json` | 입력 검증, 전처리 상세 |

## v2 — 역동 동작 + 멀티샷 (2026-10-06)

새 동작 포즈 시트 4장(캐릭터당 8포즈, 투명 배경)을 추가해 캐릭터가 실제로 움직이고, 숏마다 여러 카메라 컷으로 장면을 보여 주도록 바꿨습니다.

- **원본 추가 (기존 파일 수정 없음)**
  - `assets/characters/<캐릭터>/<캐릭터>-action-pose-sheet-v2.webp`
  - `data/character-action-crops-v2.json` (포즈 이름·박스·방향·기준 포즈)
- **동작 컷아웃 32장** `cutouts/<캐릭터>/action-*.png`: ready(웅크림), run-a/run-b(달리기·걷기 2프레임), jump, laugh-crouch, present(손 내밀기), surprised, 그리고 캐릭터별 서 있는 포즈(proud/happy/calm/point-up/balance)
- **크기 일관성**: 같은 시트의 서 있는 기준 포즈 키(`refHeight`)를 timeline `scale` 에 맞춘다. 그래서 웅크림·점프가 서 있는 포즈와 같은 비율로 보인다 (v1 포즈도 wait 기준).
- **역동 연기** `src/animation/perform.ts` (`production.config.json` → `acting`)
  - 이동: run-a ↔ run-b 교대(달리기 5프레임, 걷기 7프레임) + 보폭 바운스, 기울기 ±6° 이내
  - 등장(pop-in): 웅크림 → 점프 → 착지 찌그러짐 → 인사 포즈, 캐릭터마다 지연
  - 합창 구호: 쉼표 구절마다 웅크림 → 점프 → 착지 (지연을 두어 물결처럼)
  - 혼자 설명하는 대사: 서 있는 기본 포즈면 present 포즈
  - 놀람: action-surprised + 뒤로 살짝 튀는 반응. 미끄럼틀 내려오기(S18)는 웅크린 laugh-crouch
- **멀티샷 연출** `scripts/lib/director.mjs` (`production.config.json` → `multiShot`)
  - 28숏을 컷 49개로 나눔. 숏 시작·끝 프레임과 대사 시간은 그대로
  - 숏 첫 컷: 설정 와이드 (장소가 바뀌면 40프레임)
  - 대사: 화자 미디엄 (1.18~1.45배). 발자국·화살표·안전선·표지판이 있는 숏은 소품까지 담는 투샷
  - 합창(all) 대사: 그룹 샷. 등장 장면은 모두 착지할 때까지 그룹 샷
  - 화자가 화면에 없는 대사(예: S14 성운의 "잠깐!", S20 뿔리의 "멈춰!"): 듣는 캐릭터의 리액션 샷
  - 대사 없는 긴 숏: 와이드 → 주인공 미디엄
  - S25~S27: 화자+표지판 → 빛나는 패널 인서트 클로즈업
  - 장소가 바뀔 때만 12프레임 디졸브, 같은 장소 안은 컷 편집. 구도가 거의 같은 연속 컷은 합쳐서 점프 컷을 막음
  - 컷 목록은 `out/qa-report.json` 의 `multi-shot-cuts` 에 있음
- QA 는 컷마다 해당 컷 카메라로 검사합니다. 잘림은 그 컷이 담는 캐릭터만 보고, 미디엄에서 화자 얼굴이 자막 띠를 피하는지도 확인합니다.

## 1. 설치

```bash
cd dino-playground-video
npm install        # 로컬 설치만 함. 전역 패키지 없음. postinstall 에서 sync 실행
```

- 필요 도구: Node 20 이상, ffmpeg/ffprobe (QA에서 길이·검은 프레임 검사에 사용)
- 브라우저: `/opt/pw-browsers`의 Chromium을 자동으로 찾습니다. 다른 경로를 쓰려면 `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome`을 지정하세요.
- 한글 자막 폰트: `@fontsource/jua` 로컬 패키지를 씁니다. 외부 API는 쓰지 않습니다.

## 2. 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run sync` | 원본 `docs/`, `data/`를 `source/`로, `assets/`를 `public/assets/`로 **복사**합니다. 그다음 `src/generated/project-data.json`을 만들고 SRT를 `out/`에 복사합니다. |
| `npm run validate` | 다음을 검사합니다: 필수 파일, JSON 유효성, 이미지 크기·알파(manifest 선언과 비교), 크롭 범위, 타임라인 연속성(0~2,879), SRT와 voice-lines의 문구·시간 일치, 누락 오디오. 결과는 `out/validation-report.json`, `out/missing-assets.json`에 씁니다. |
| `npm run preprocess` | Sharp로 컷아웃 52장과 contact sheet를 만듭니다. 크롭 하나만 다시 하려면 `-- --only karo-pose-walk` |
| `npm run dev` | Remotion Studio 미리보기 (http://localhost:3000) |
| `npm run stills` | 키프레임 8장을 렌더합니다. 특정 프레임을 추가하려면 `npm run stills -- 660 2430` |
| `npm run render:preview` | 50% 스케일 무음 프리뷰를 렌더합니다 (약 1분 30초 소요). |
| `npm run render:final` | 오디오가 **모두** 있을 때만 1920×1080 H.264 + AAC 48kHz로 렌더하고, 없으면 건너뜁니다. |
| `npm run qa` | `out/qa-report.json` 생성 |
| `npm run all` | 위 순서대로 전부 실행 |
| `npm run typecheck` | TypeScript 검사 |

**오디오가 준비되면** 파일을 작업공간 루트의 아래 경로에 넣고 `npm run all`을 실행하세요.
- `assets/audio/voices/L01_seongun.wav` … (전체 목록은 `out/missing-assets.json`)
- `assets/audio/music/playground-theme-120s.wav`
- `assets/audio/sfx/*.wav`

## 3. 구조

```
scripts/
  lib/paths.mjs            경로, 필수 파일, 기대값(24fps / 2,880f / 28숏)
  lib/normalize.mjs        timeline·voice-lines·crops·SRT → 정규화 (백분율 → 0~1)
  lib/generate.mjs         project-data.json 생성, pose 이름 → 컷아웃 해석, layoutFixes 적용, 누락 오디오 계산
  sync-source.mjs  validate.mjs  preprocess-characters.mjs
  render-stills.mjs  render-preview.mjs  render-final.mjs  qa.mjs
src/
  Root.tsx                         컴포지션 DinoPlaygroundSafety (timeline composition.id)
  compositions/DinoPlaygroundSafety.tsx  숏 시퀀싱, 12프레임 디졸브, 깊이 정렬, 엔딩 페이드
  animation/motion.ts              대기·걷기·등장·인사·끄덕임·말하기 동작 (브리프 9절 수치)
  animation/camera.ts              줌/팬. 배경이 항상 화면을 덮도록 이동량 제한
  components/CharacterSprite.tsx   컷아웃 배치(발밑 중앙 기준) + 접촉 그림자
  components/BackgroundLayer.tsx   배경 + 카메라 래퍼
  components/SafetyOverlay.tsx     발자국·화살표·그네 경계 SVG와 그 등장 애니메이션
  components/PromiseBoard.tsx      표지판 PNG + 패널 광택 강조
  components/SubtitleLayer.tsx     SRT 번인
  components/AudioTimeline.tsx     존재하는 오디오만 배치, 대사 중 BGM −4dB 덕킹
  styles/subtitles.ts              자막 스타일
production.config.json   ★ 타임라인에 명시되지 않은 부분의 해석값과 레이아웃 보정
preprocess.config.json   ★ 배경 제거·그림자 제거·크롭 확장 조정값
```

## 4. 주요 수정 지점

### `production.config.json` (타임라인 해석)
- **`expressionBodyPose`**: 타임라인 `pose` 자리에 표정 이름(`friendly`, `curious`, `happy`, `listen` …)이 오는 경우의 처리입니다.
  - 일반(전신) 숏에서는 흉상 대신 이 표에 적힌 같은 캐릭터의 전신 포즈를 씁니다. 예: `happy` → greet/wave, 나머지 → wait.
  - 클로즈업(`camera.type: "close-up"`) 숏에서만 표정 흉상을 씁니다.
  - 해석 순서는 이렇습니다: crops `fallbacks` → `"curious-lean"` → `"curious"` → 이 표.
  - 숏별 해석 결과는 `qa-report.json`의 `pose-name-resolution` 항목에서 확인할 수 있습니다.
- **`nativeFacing`**: 컷아웃 원본이 바라보는 방향(contact sheet로 확인한 값). 타임라인 `facing`과 반대면 좌우 반전합니다.
- **`bustScaleMultiplier`** (1.2): 클로즈업 흉상을 키워 얼굴이 자막 띠보다 위에 오게 합니다.
- **`propScaleUnit`**:
  - SVG 소품의 `scale`은 화면 **너비** 비율로 봅니다. S11 발자국 세 쌍이 캐릭터 위치(51/65/80%)와 정확히 맞는 것으로 확인했습니다.
  - 표지판 PNG의 `scale`은 화면 **높이** 비율로 봅니다.
  - 모든 소품의 `(x, y)`는 바닥 중앙 기준입니다.
- **`propOverrides`**:
  - `slide-arrows.flipX`: 원본 SVG는 상승 화살표가 왼쪽에 있지만, 미끄럼틀 배경은 계단이 오른쪽, 슬라이드가 왼쪽입니다. 좌우 반전해 숏 메모("초록 상승은 계단, 코럴 하강은 슬라이드")에 맞춥니다.
  - `swing-boundary.groundSquash` (0.45): 점선 타원이 공중의 고리가 아니라 그네 앞뒤 바닥에 눕도록 세로로 압축합니다.
- **`keepInSafeArea`**: 표지판이 5% 안전영역 밖으로 나가면 안쪽으로 밉니다 (S05·S06·S07·S28).
- **`layoutFixes`**: QA로 확인한 최소 위치 보정입니다. 현재 1건(S08 티노)이며, 이유는 설정 파일과 QA 보고서에 기록되어 있습니다.
- **`audioCues`**: 음악·효과음 배치 시점입니다. `audio-production-v1.md`의 사용 위치를 초 단위로 옮긴 값입니다.
- **`keyframes`**: 스틸로 렌더할 숏과 위치입니다.

### `preprocess.config.json` (컷아웃)
- `floodThreshold` 24: 테두리와 이어진 배경으로 판정할 색 거리입니다. 밝은 배·흰자를 보호하려고 json의 42보다 작게 잡았습니다.
- 경계 띠(`edgeBand` 3px): 이 안에서는 json 값 `colorDistanceSoftStart` 18 → `edgeFullAlpha` 72로 부드러운 알파와 edge decontamination을 적용해 머리카락 끝의 아이보리 테두리를 없앱니다.
- `shadowRG` / `shadowGB` / `shadowMinLuma`: 바닥 그림자 판정 범위입니다. 그림자는 배경보다 약간 따뜻하고 어둡습니다. 흰 양말과 크림색 발톱은 이 범위 밖입니다.
- `enclosedMeanDist`: 다리 사이처럼 갇힌 배경 중, 배경색과 거의 같은 영역만 지웁니다.
- `overrides`: 크롭별 값입니다. 현재 `karo-pose-walk`(꼬리)와 `karo-pose-inspect`(머리)가 셀 밖으로 나가서 확장 횟수를 늘렸습니다.

## 5. 제작 원칙

- 캐릭터는 제공된 시트에서 자른 PNG만 씁니다. SVG나 코드로 다시 그리지 않습니다.
- 립싱크는 하지 않습니다. 대사 중에는 1% 상하 움직임, ±1.5° 고개 기울기만 씁니다. 회전은 최대 ±3°입니다.
- 타이밍과 대사 문구는 원본 그대로입니다. 자막은 SRT와 같은 문구·시간으로 번인합니다.
- 그네는 배경을 마스킹해 움직이면 이중 이미지가 생깁니다. 브리프 10절의 "어색한 왜곡보다 정지 연출 우선"에 따라 **정지 상태**로 두고, 점선 경계와 캐릭터 반응으로 표현합니다 (`swingMotion: "static"`).
- 누락 오디오는 생성하거나 대체하지 않습니다.
- 숏 사이에는 12프레임 디졸브만 씁니다(검은 프레임 없음). 119.6초부터 웜 아이보리로 페이드합니다.

## 6. 알려진 데이터 이슈 (수정하지 않고 보고)

- **대사 시간과 숏 배정 불일치 11건**: voice-lines/SRT 시간이 timeline의 `dialogue` 배정 숏 밖에 있습니다 (`qa-report.json`의 `dialogue-within-assigned-shot`). 예: L13 "잠깐! 여기는 내려오는 길이야."(성운)는 55.0~58.1초라서 성운이 없는 S14 동안 재생됩니다. 화면에 화자가 없으면 화면 밖 목소리처럼 들립니다.
  - 해결 방법 ①: 숏 경계를 대사에 맞춥니다 (timeline 수정).
  - 해결 방법 ②: voice-lines와 SRT의 start/end를 배정 숏 안으로 옮깁니다.
  - 기준 문서 우선순위상 timeline이 1순위라서, ②가 원칙에 맞습니다.
- **S18 `slide-seated`**: 앉은 포즈가 없어서 v2 의 웅크린 `laugh-crouch` 로 대신합니다 (`poseOverrides`). 앉은 포즈가 생기면 그 이름으로 바꾸면 됩니다.
- **S28 표지판**: 오른쪽 끝(x 91%)이라 카로 뒤에 일부 가려집니다. 깊이 정렬 때문인데, 세 패널 중 둘은 보입니다.
