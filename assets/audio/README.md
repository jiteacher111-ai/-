# 외부 오디오 준비 위치

이 폴더에는 아직 실제 음성·음악·효과음이 없습니다.

- 음성 파일명과 타이밍: `../../data/voice-lines.ko.json`
- 음악·효과음 기준: `../../docs/audio-production-v1.md`
- 필수 파일 목록: `../manifest.json`

권장 구조:

```text
assets/audio/
  voices/
  music/
    playground-theme-120s.wav
  sfx/
    footsteps-soft.wav
    bell-soft.wav
    icon-chime.wav
    pop-soft.wav
    slide-whoosh-soft.wav
    swing-creak-soft.wav
    sparkle-soft.wav
    laugh-soft.wav
```

실제 음성이 준비되기 전에는 무음 영상 프리뷰를 제작한다. 누락된 음성을 다른 캐릭터 음성이나 임의의 TTS로 대체하지 않는다.
