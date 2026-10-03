# 성운이와 공룡 친구들의 놀이터 안전 약속 — Remotion 프로젝트

3~6세용 2분(120초, 24fps, 2,880프레임, 28숏) 애니메이션 제작 프로젝트입니다.
Remotion + React + TypeScript로 만들었고, 모든 장면은 `data/timeline-v1.json`을 기준으로 데이터 주도 방식으로 구성됩니다.

> **현재 상태 (2026-10-03)**: 작업공간 루트에 브리프가 지정한 입력(`docs/`, `data/`, `assets/`)이 **하나도 없습니다.**
> 파이프라인은 모두 구현했고, 테스트 전용 합성 데이터로 처음부터 끝까지 검증했습니다(아래 "검증 기록" 참고).
> 하지만 실제 영상은 아직 렌더하지 않았습니다. 입력 파일을 넣고 `npm run all`을 실행하면 바로 렌더됩니다.

## 1. 설치

```bash
cd dino-playground-video
npm install          # 로컬 설치만 함. 전역 패키지 없음. postinstall 에서 sync 가 실행됨
```

- 필요 도구: Node 20 이상, `ffprobe`(QA에서 길이 확인용, 시스템 ffmpeg)
- 브라우저: `/opt/pw-browsers`의 Chromium을 자동으로 찾습니다. 다른 경로를 쓰려면 `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome`을 지정하세요. 찾지 못하면 Remotion이 기본 headless shell을 사용합니다.
- 한글 폰트: `@fontsource/jua` 로컬 패키지를 씁니다. 외부 폰트 API는 쓰지 않습니다.

## 2. 입력 파일 (작업공간 루트 기준, 읽기 전용)

| 파일 | 용도 |
|---|---|
| `docs/claude-code-production-brief.md` | 제작 브리프 |
| `assets/manifest.json` | 자산 id → 경로 |
| `data/timeline-v1.json` | **28숏·2,880프레임 데이터 소스** |
| `data/voice-lines.ko.json` | 대사(화자·문구·타이밍·오디오 경로) |
| `data/subtitles.ko.srt` | 번인 자막 원본 |
| `data/character-crops-v1.json` | 캐릭터 시트 크롭 좌표 |
| `docs/playground-safety-script-v1.md`, `docs/shot-list-v1.md`, `docs/audio-production-v1.md` | 대본·숏리스트·오디오 사양 |

원본은 절대 수정하지 않습니다. `npm run sync`는 원본을 다음 위치로 **복사**만 합니다.
- `docs/`, `data/` → `source/`
- `assets/` → `public/assets/`

원본 위치를 바꾸려면 `DINO_SOURCE_ROOT=/경로`를 지정하세요. 출력 위치는 `DINO_OUT_DIR`로 바꿀 수 있습니다.

## 3. 명령어

| 명령 | 하는 일 | 결과 |
|---|---|---|
| `npm run sync` | 원본 복사, 정규화 데이터 생성, SRT를 출력 폴더에 복사 | `src/generated/project-data.json`, `out/subtitles.ko.srt` |
| `npm run validate` | 필수 파일, JSON 유효성, 이미지 크기·알파, 참조 자산, 크롭 범위, 타임라인 연속성(28숏/2,880프레임), 대사·자막 검사 | `out/validation-report.json`, `out/missing-assets.json` (`-- --strict` 사용 시 오류가 있으면 exit 1) |
| `npm run preprocess` | Sharp로 포즈·표정 크롭 + 웜 아이보리 배경 제거 + 잘림 자동 보정 | `public/characters/*.png`, `public/characters/index.json`, `out/contact-sheet.png`, `out/preprocess-report.json` |
| `npm run dev` | Remotion Studio 미리보기 | 브라우저에서 확인 |
| `npm run stills` | 주요 시점 스틸 8장 (약속판·안전 표시 숏 포함). 추가 프레임은 `npm run stills -- 1200 1500` | `out/stills/*.png` |
| `npm run render:preview` | 960×540(50% 스케일), 정확히 120초 **무음** 프리뷰 | `out/dino-playground-preview-silent.mp4` |
| `npm run render:final` | 오디오가 **모두** 있을 때만 1920×1080 H.264 + AAC 최종본. 하나라도 없으면 건너뜀 | `out/dino-playground-final.mp4` |
| `npm run qa` | 타임라인 연속성, 자산 존재, 레이아웃(잘림·겹침·빈 프레임·안전 구역 진입·자막 충돌), 출력 길이·해상도·오디오 유무 검사 | `out/qa-report.json` |
| `npm run all` | 위 단계를 순서대로 전부 실행 | |
| `npm run typecheck` | TypeScript 검사 | |

## 4. 구조

```
scripts/
  lib/paths.mjs            경로·필수 파일 목록·기대값(24fps/2880f/28숏)
  lib/normalize.mjs        ★ 원본 JSON/SRT → 정규화 스키마 (필드명 매핑)
  lib/generate.mjs         project-data.json 생성, 누락 오디오 계산
  sync-source.mjs / validate.mjs / preprocess-characters.mjs
  render-stills.mjs / render-preview.mjs / render-final.mjs / qa.mjs
src/
  types.ts                 정규화 스키마 타입
  config.ts                ★ 안전 영역·자막 영역·색·캐릭터 이름 별칭·말하기 동작 강도
  DinoPlayground.tsx       숏 시퀀싱 (timeline → <Sequence>)
  components/
    BackgroundLayer.tsx    배경 + 카메라 줌/팬 (캐릭터도 같은 카메라를 따름)
    CharacterSprite.tsx    전처리 PNG 배치, 등장·퇴장·이동, 표정 전환 크로스페이드, 그림책식 말하기
    SafetyOverlay.tsx      안전선(line)·안전 구역(zone)·체크(check)·잠깐(stop)·라벨
    SubtitleLayer.tsx      SRT 번인 (문구·타이밍 그대로)
    PromiseBoard.tsx       약속판 (항목이 차례로 공개됨)
    AudioTimeline.tsx      실제 존재하는 대사·음악·효과음 파일만 배치
preprocess.config.json     ★ 배경 제거 임계값·여백·크롭별 overrides
```

## 5. 주요 수정 지점

1. **원본 JSON 필드명이 다를 때**: `scripts/lib/normalize.mjs`의 `pick(obj, [...후보])` 목록에 실제 키를 추가하세요. 실제 스키마를 받기 전에 작성했기 때문에 흔히 쓰는 이름을 넓게 허용하도록 만들었습니다.
   - 타이밍: `startFrame/endFrame/durationInFrames/atFrame`는 **프레임**으로, `start/end/duration/at`(숫자 또는 `"00:00:05,000"`)는 **초**로 해석합니다.
   - 좌표: `x`, `y`, `scale`이 1.5 이하이면 화면 비율로, 그보다 크면 픽셀로 봅니다. `y`는 캐릭터의 발 기준선입니다.
   - 숏: `shots|scenes`, 배경 `background|bg`, 캐릭터 `characters|cast`, 대사 `lines|dialogue`, 오버레이 `overlays|safety`, 약속판 `promiseBoard|promises`.
   - 크롭: `{x|left, y|top, w|width, h|height}`를 가진 객체(또는 `[x,y,w,h]`)를 모두 찾고, `source/character/pose/expression`은 상위 객체나 `characters/poses/expressions` 키에서 물려받습니다.
2. **배경 제거가 너무 많이/적게 될 때**: `preprocess.config.json`을 고칩니다.
   - `threshold`를 높이면 더 많이 지웁니다.
   - `feather`는 가장자리를 부드럽게 하는 폭입니다.
   - `margin`은 크롭 여백입니다.
   - 크롭별로 따로 조정하려면 `"overrides": {"<cropId>": {"threshold": 28, "margin": 30}}`를 씁니다.
   - 팔과 몸 사이처럼 닫힌 공간의 배경까지 지우려면 `removeEnclosed: true`를 씁니다. 다만 밝은 배 색깔이 함께 지워질 수 있으니 contact sheet로 확인하세요.
   - 크롭 하나만 다시 처리하려면 `npm run preprocess -- --only <cropId>`.
3. **화자 연결**: voice-lines의 `speaker`(예: `성운`)와 timeline의 캐릭터 id(예: `seongun`)가 다르면 `src/config.ts`의 `CHARACTER_ALIASES`에 추가합니다. 연결되지 않으면 말하기 동작이 나오지 않습니다.
4. **레이아웃**: `src/config.ts`의 `SAFE`(타이틀 세이프 5%), `SUBTITLE_ZONE`(하단 6%~23%). 약속판은 오른쪽 40% 영역에, 자막 영역 위에 배치됩니다. 캐릭터가 이 영역과 겹치면 QA가 `overlap-promise-board`로 알려 줍니다.

## 6. 제작 원칙 (브리프 제약 반영)

- 캐릭터는 제공된 이미지에서 크롭한 PNG만 사용합니다. SVG나 코드로 다시 그리지 않습니다. 필요한 스프라이트가 없으면 **아무것도 그리지 않고**(Studio에서만 빨간 점선 표시) QA에서 실패로 보고합니다.
- 입 모양 자산이 없으므로 립싱크는 하지 않습니다. 대사 중에는 미세한 위아래 움직임, 고개 기울기, 표정 전환(4프레임 크로스페이드)만 사용합니다.
- 자막은 SRT의 문구와 타이밍 그대로 번인하고, 원본 SRT는 `out/subtitles.ko.srt`로 복사합니다.
- 누락된 오디오는 생성·다운로드·무음 파일로 대체하지 않습니다. `out/missing-assets.json`에 기록하고 무음 프리뷰만 렌더합니다.
- 타임라인이 없으면 스틸과 프리뷰를 렌더하지 않습니다. 빈 영상은 만들지 않습니다.
- 안전 그래픽은 부드러운 노랑·초록 톤만 씁니다. 사고나 충돌 연출은 없습니다.

## 7. 검증 기록

실제 입력이 없어서, 스크래치 디렉터리에 만든 **테스트 전용 합성 입력**으로 파이프라인 전체를 검증했습니다. 아이보리 배경 위 단순 도형 시트, 28숏/2,880프레임 타임라인, 사인파 테스트 톤을 사용했으며, 이 파일들은 프로젝트에 포함하지 않았습니다.

- validate: 일부러 만든 2,848프레임 타임라인 오류를 정확히 검출했고, 수정 후 오류 0건
- preprocess: 배경 제거가 정상 동작했고 눈 흰자는 보존됨. 뿔이 잘린 크롭(y=100, margin 0)은 경계 접촉을 감지해 y=71까지 자동 확장 후 통과
- stills: 8장 렌더. 한글 자막, 안전 구역, 체크, 약속판, 표정 전환을 확인
- 프리뷰: 960×540, **120.000초**, 오디오 스트림 없음 (약 1분 30초 소요)
- 최종본: 1920×1080 H.264 + AAC, 120.02초 (약 2분 40초 소요)
- qa: pass 13 / fail 0. warn 1건은 테스트 데이터에서 캐릭터가 약속판과 겹친 것을 정상적으로 검출한 결과
