# Claude Code 영상 제작 명세

## 1. 목표

현재 저장된 캐릭터 시트, 놀이터 배경, 안전 소품, 대본과 타임라인을 사용해 3~6세용 2분 애니메이션 **《성운이와 공룡 친구들의 놀이터 안전 약속》**을 제작한다.

이 프로젝트는 완전한 3D 모델 애니메이션이 아니라, 3D 렌더 느낌의 이미지 자산을 사용하는 2.5D 컷아웃 애니메이션이다. 캐릭터 이미지를 코드나 SVG로 다시 그리지 않는다.

## 2. 최종 영상 사양

- 해상도: 1920×1080
- 화면비: 16:9
- 프레임레이트: 24fps
- 총 길이: 2,880프레임, 정확히 120초
- 출력: H.264 MP4
- 오디오: AAC, 48kHz
- 자막: 영상 내 번인 자막 + 별도 SRT
- 언어: 한국어
- 색상: sRGB

## 3. 최종 기준 문서

충돌이 있을 경우 아래 순서로 우선한다.

1. `data/timeline-v1.json` — 프레임, 위치, 크기, 카메라, 숏 구성
2. `data/voice-lines.ko.json` — 대사 원문과 음성 타이밍
3. `data/subtitles.ko.srt` — 자막 타이밍
4. `docs/playground-safety-script-v1.md` — 연기·음향·안전 연출 의도
5. `docs/shot-list-v1.md` — 사람이 읽는 숏 요약
6. `docs/audio-production-v1.md` — 음향 생성·믹싱 기준
7. `assets/manifest.json` — 자산 목록과 누락 정책
8. `data/character-crops-v1.json` — 캐릭터 시트 전처리 규칙

## 4. 프로젝트 격리

- 현재 작업공간에는 다른 프로젝트가 많으므로 루트 구성을 변경하지 않는다.
- 새 프로젝트는 반드시 `dino-playground-video/` 안에 만든다.
- 기존 `assets/`, `data/`, `docs/` 파일을 덮어쓰거나 이동하지 않는다.
- 필요한 파일은 `dino-playground-video/public/assets/` 및 `dino-playground-video/src/data/`로 복사한다.
- 루트의 기존 `package.json`, 잠금 파일, 다른 앱은 수정하지 않는다.

## 5. 권장 기술 구성

- Remotion
- React + TypeScript
- Zod 또는 동등한 런타임 데이터 검증
- Sharp: 캐릭터 시트 크롭 및 배경 제거 전처리
- FFmpeg/ffprobe: 설치되어 있을 때 최종 미디어 검사에만 사용
- 외부 유료 API는 사용하지 않는다.
- 패키지는 새 하위 프로젝트에 로컬 설치한다.

## 6. 권장 폴더 구조

```text
dino-playground-video/
  package.json
  README.md
  public/
    assets/
      backgrounds/
      props/
      characters/
        references/
        cutouts/
      audio/
        voices/
        music/
        sfx/
  scripts/
    prepare-character-cutouts.mjs
    validate-assets.mjs
    validate-timeline.mjs
  src/
    Root.tsx
    compositions/DinoPlaygroundSafety.tsx
    components/
      CharacterSprite.tsx
      BackgroundLayer.tsx
      SafetyOverlay.tsx
      SubtitleLayer.tsx
      PromiseBoard.tsx
      AudioTimeline.tsx
    animation/
      motion.ts
      camera.ts
    data/
      timeline-v1.json
      voice-lines.ko.json
      character-crops-v1.json
    styles/
      subtitles.ts
  tests/
    timeline.test.ts
    assets.test.ts
  out/
```

## 7. 캐릭터 이미지 전처리

원본 시트에는 웜 아이보리 배경이 있으므로 전체 시트를 영상에 직접 사용하지 않는다.

1. `data/character-crops-v1.json`의 격자를 기준으로 표정과 전신 포즈를 각각 크롭한다.
2. 각 크롭 이미지의 네 모서리에서 배경색을 샘플링한다.
3. 배경색과의 색상 거리에 따라 부드러운 알파 마스크를 만든다.
4. 머리카락, 뿔, 꼬리, 신발 주변에 웜 아이보리 테두리가 남지 않도록 edge decontamination을 적용한다.
5. 원본 바닥 그림자는 제거한다.
6. 투명 PNG로 `public/assets/characters/cutouts/<character>/`에 저장한다.
7. 캐릭터별 접촉 그림자는 Remotion의 별도 타원형 레이어로 다시 만든다.
8. 전처리 결과를 한 장의 contact sheet로 만들어 시각 검수가 가능하게 한다.

표정 크롭은 가슴 위 클로즈업 숏에서 사용하고, 전신 포즈는 일반 숏에서 사용한다. 입 모양 전용 자산이 없으므로 과장된 가짜 립싱크를 만들지 않는다. 말할 때는 1~2%의 느린 상하 움직임, 미세한 고개 회전, 표정 전환으로 그림책식 대화를 표현한다.

## 8. 타임라인 구현

- `timeline-v1.json`을 직접 읽어 28개 숏을 구성한다.
- 모든 숏은 `startFrame` 포함, `endFrame` 제외로 처리한다.
- 마지막 프레임은 2,879이며 전체 길이는 2,880프레임이어야 한다.
- 좌표는 화면 왼쪽 위 기준 백분율이다.
- 캐릭터 기준점은 발밑 중앙이다.
- 배경은 1920×1080을 완전히 덮되 원본을 비정상적으로 늘이지 않는다.
- 카메라 이동은 배경과 모든 장면 레이어를 포함하는 래퍼에 적용한다.
- 전환은 기본 12프레임의 부드러운 디졸브 또는 팬 연결을 사용한다.
- 장면 사이에 검은 프레임을 만들지 않는다.

## 9. 캐릭터 움직임

- 기본 대기: 48~72프레임 주기의 1~2% 상하 움직임
- 걷기: 좌우 이동 + 최대 2.5% 바운스 + 최대 ±3도 회전
- 달리기: 최대 4% 바운스 + 최대 ±6도 회전
- 인사: 기준 포즈에 느린 좌우 회전 또는 손·앞발 방향의 미세한 흔들림
- 멈춤: 8~12프레임 감속 후 완전히 정지
- 모든 보간은 끊기지 않게 처리한다.
- 캐릭터가 서로 겹치거나 화면 밖으로 잘리지 않도록 안전영역을 검사한다.

## 10. 특별 연출

### 표지판

- 투명 PNG의 알파를 그대로 사용한다.
- 패널 강조는 원본 위에 동일 영역의 반투명 광택 레이어를 올리는 방식으로 구현한다.

### 미끄럼틀 화살표

- `slide-direction-arrows.svg`를 계단과 슬라이드 경사에 맞춰 배치한다.
- 상승 화살표가 먼저, 하강 화살표가 8프레임 뒤에 나타난다.

### 그네

- 배경 전체를 흔들지 않는다.
- 가능하면 두 좌석 영역을 별도 마스크로 복제해 상단 고정점을 기준으로 ±6도 이하 회전한다.
- 자연스럽게 마스킹하기 어렵다면 그네는 정지 상태로 유지하고 점선 경계와 캐릭터 반응만 사용한다.
- 어색한 왜곡보다 정지 연출을 우선한다.

## 11. 자막

- `subtitles.ko.srt`와 동일한 시간에 번인한다.
- 흰색 또는 웜 아이보리 글자, 짙은 갈색 반투명 외곽선/배경을 사용한다.
- 화면 하단에서 10% 이상 띄운다.
- 최대 두 줄, 화면 너비 82% 이내로 제한한다.
- 캐릭터와 겹치면 위쪽으로 이동하되 얼굴을 가리지 않는다.
- 최종 SRT는 원본 내용을 변경하지 않고 `out/subtitles.ko.srt`로 복사한다.

## 12. 오디오 정책

- `assets/audio/`가 아직 없을 수 있다.
- 누락된 오디오를 인터넷에서 다운로드하거나 임의의 음성으로 대체하지 않는다.
- 음성이 없더라도 레이아웃·자막·동작이 포함된 무음 프리뷰는 제작한다.
- 누락 파일을 `out/missing-assets.json`에 기록한다.
- 오디오가 모두 준비된 경우에만 최종 오디오 믹스 렌더를 수행한다.
- 믹싱은 `docs/audio-production-v1.md`를 따른다.

## 13. 렌더링 단계

1. 데이터와 자산 검증
2. 캐릭터 컷아웃 전처리
3. 주요 프레임 스틸 8장 렌더
4. 960×540 또는 50% 스케일 무음 프리뷰 렌더
5. 프리뷰 자동·시각 검수
6. 발견된 잘림·겹침·빈 프레임 수정
7. 오디오 존재 시 1920×1080 최종 MP4 렌더
8. SRT와 QA 보고서 복사

## 14. 출력 파일

```text
dino-playground-video/out/
  dino-playground-preview-silent.mp4
  dino-playground-final.mp4              # 오디오가 모두 있을 때
  subtitles.ko.srt
  missing-assets.json
  qa-report.json
  contact-sheets/character-cutouts.png
  keyframes/
```

## 15. 검수 기준

- 타임라인이 0~2,880프레임을 빈틈과 중복 없이 덮는가?
- 120초를 정확히 유지하는가?
- 캐릭터 얼굴·색·무늬가 장면 사이에서 바뀌지 않는가?
- 캐릭터와 자막이 잘리지 않는가?
- 잘못된 행동보다 올바른 행동을 더 오래 보여주는가?
- 미끄럼틀 계단과 그네 안전거리가 분명한가?
- 그네 장면에서 캐릭터가 경계 안으로 들어가지 않는가?
- 검은 화면, 누락 이미지, NaN 스타일 값이 없는가?
- 기존 원본 자산을 수정하거나 덮어쓰지 않았는가?
- 최종 결과와 실행 방법이 README에 기록되었는가?

## 16. 완료 조건

외부 오디오가 없는 현재 상태의 최소 완료 조건은 다음과 같다.

- Remotion 프로젝트가 오류 없이 시작된다.
- 캐릭터 컷아웃이 생성되고 contact sheet가 있다.
- 28개 숏이 정확한 시간에 재생된다.
- 자막이 모든 대사 구간에 표시된다.
- 120초 무음 프리뷰가 렌더된다.
- 누락 오디오 목록과 QA 보고서가 생성된다.

오디오 파일이 모두 추가된 이후에는 최종 MP4와 오디오 검증까지 완료해야 한다.
