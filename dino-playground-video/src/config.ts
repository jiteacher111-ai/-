// 주요 수정 지점: 화면 안전 영역, 자막 스타일, 캐릭터 이름 별칭, 말하기 동작 강도.

/** 타이틀 세이프(90%) — 자막·약속판·안전 표시가 이 안에 들어가야 한다 */
export const SAFE = {x: 0.05, y: 0.05};

/** 자막 영역 (화면 높이 비율). 약속판·라벨은 이 위로만 배치한다. */
export const SUBTITLE_ZONE = {bottom: 0.06, height: 0.17};

export const FONT_FAMILY = "'Jua', 'WenQuanYi Zen Hei', sans-serif";

export const COLORS = {
  ivory: '#F6EFE1',
  ink: '#3B2A1E',
  safety: '#FFC93C',
  safetyStroke: '#F08A24',
  ok: '#3BB273',
  subtitleBg: 'rgba(40, 28, 20, 0.72)',
};

/**
 * voice-lines 의 speaker 와 timeline 의 character id 가 다르게 적혀 있을 때 연결한다.
 * 예: {seongun: ['성운', '성운이']}
 */
export const CHARACTER_ALIASES: Record<string, string[]> = {};

/** 그림책식 말하기 (립싱크 없음) */
export const SPEAK = {
  bobPx: 0.006, // 캐릭터 높이 대비 위아래 움직임
  bobPeriodFrames: 10,
  tiltDeg: 1.6,
  tiltPeriodFrames: 26,
  expressionCrossfade: 4,
};
