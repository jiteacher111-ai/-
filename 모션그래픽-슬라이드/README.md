# 100% 무료로 완성하는 클로드 모션그래픽 (HyperFrames 슬라이드)

HyperFrames(`/slideshow` 형식)로 만든 17장짜리 발표 슬라이드입니다. Google AI Studio(대본·나레이션·SRT·이미지), Gemini(배경음악), Claude 무료 버전(모션그래픽)으로 무료 모션그래픽을 만드는 과정을 정리했습니다.

## 여는 방법

**방법 1: 발표자 모드 (노트·타이머 포함, 권장)**

```bash
npx hyperframes present composition
```

화면에 나온 주소를 열고 **P**를 누르면 청중용 창이 열립니다.

**방법 2: 브라우저로 바로 보기**

이 폴더에서 간단한 웹서버를 켜고 `index.html`을 엽니다(파일을 더블클릭하면 플레이어가 동작하지 않을 수 있습니다).

```bash
npx serve .
```

- → / Space: 다음 슬라이드(또는 다음 등장 요소), ←: 이전
- 슬라이드마다 발표자 노트가 들어 있습니다.

## 파일

- `composition/index.html`: 슬라이드 본문 (HyperFrames 컴포지션 + 슬라이드쇼 JSON)
- `index.html`: 플레이어 래퍼. 안에 있는 슬라이드쇼 JSON은 `composition/index.html`의 것과 똑같아야 합니다.

> 슬라이드 덱이므로 `hyperframes render`로 MP4를 만들면 첫 장만 나옵니다.
