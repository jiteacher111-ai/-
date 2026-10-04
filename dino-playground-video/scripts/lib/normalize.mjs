// 원본 JSON/SRT → Remotion 이 읽는 정규화 스키마(src/types.ts).
// 기준 스키마: data/timeline-v1.json, data/voice-lines.ko.json, data/character-crops-v1.json (schemaVersion 1)
// 좌표는 화면 왼쪽 위 기준 백분율 → 여기서 0~1 비율로 바꾼다. startFrame 포함, endFrame 제외.

export const pick = (obj, keys, fallback = undefined) => {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return fallback;
};
export const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/** "00:01:02,500" | "01:02.5" | 62.5 → 초 */
export const parseTimecode = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(',', '.');
  if (!s.includes(':')) return Number(s);
  return s.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
};

export const slug = (s) =>
  String(s)
    .trim()
    .replace(/[\\/\s]+/g, '_')
    .replace(/[^\p{L}\p{N}_.-]/gu, '')
    .toLowerCase();

const pct = (v) => (typeof v === 'number' ? v / 100 : undefined);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** {xFrom,xTo} 또는 {x} → [from, to] */
const range = (o, key, fallback, map = (v) => v) => {
  const single = o[key];
  const from = o[`${key}From`] ?? single ?? fallback;
  const to = o[`${key}To`] ?? single ?? from;
  return [map(from), map(to)];
};

// ---------------------------------------------------------------- crops
/**
 * character-crops-v1.json → 크롭 목록.
 * grids.expressions / grids.poses 의 xBoundaries 로 셀을 나누고, characters.<id>.expressions/poses 순서대로 이름을 붙인다.
 * 표정 행(0~410)과 포즈 행(365~887)은 세로로 겹친다 → 겹친 띠에 들어온 이웃 조각은 전처리에서 제거한다.
 */
export const extractCrops = (json) => {
  const crops = [];
  const grids = json?.grids ?? {};
  const g = {expression: grids.expressions, pose: grids.poses};
  for (const [character, def] of Object.entries(json?.characters ?? {})) {
    for (const kind of ['expression', 'pose']) {
      const grid = g[kind];
      const names = def[`${kind}s`] ?? [];
      if (!grid) continue;
      const xb = grid.xBoundaries;
      const top = grid.y;
      const bottom = grid.y + grid.height; // 행이 겹치는 부분의 이웃 조각은 전처리에서 제거
      names.forEach((name, i) => {
        if (xb[i + 1] === undefined) return;
        crops.push({
          id: `${character}-${kind}-${name}`,
          character,
          kind,
          name,
          source: def.sheet,
          rect: {x: xb[i], y: top, w: xb[i + 1] - xb[i], h: bottom - top},
          // 표정은 가슴 위에서 잘린 흉상이라 아래쪽 경계 접촉이 정상
          openBottom: kind === 'expression',
        });
      });
    }
  }
  return crops;
};

export const cropSettings = (json) => {
  const br = json?.backgroundRemoval ?? {};
  return {
    softStart: num(br.colorDistanceSoftStart, 18),
    fullAlpha: num(br.colorDistanceFullAlpha, 42),
    edgeDecontaminate: br.edgeDecontaminate !== false,
    preserveContactShadow: Boolean(br.preserveContactShadow),
  };
};

/** "seongun.happy" → "seongun.friendly" 형태의 대체 규칙 */
export const cropFallbacks = (json) => json?.fallbacks ?? {};

// ---------------------------------------------------------------- SRT
export const parseSrt = (text, fps) => {
  const blocks = text.replace(/\r/g, '').replace(/^﻿/, '').trim().split(/\n\s*\n/);
  const cues = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, z] = lines[ti].split('-->').map((s) => s.trim().split(/\s+/)[0]);
    const startSec = parseTimecode(a);
    const endSec = parseTimecode(z);
    cues.push({index: Number(lines[0]) || cues.length + 1, startSec, endSec, from: Math.round(startSec * fps), to: Math.round(endSec * fps), text: lines.slice(ti + 1).join('\n')});
  }
  return cues;
};

// ---------------------------------------------------------------- timeline
/** 애니메이션 이름에서 지연·위상 추출: "pop-in-delay-4" → {base:'pop-in', delay:4} */
export const parseAnimation = (name) => {
  const s = String(name ?? 'idle');
  const delay = /-delay-(\d+)$/.exec(s);
  const offset = /-offset-(\d+)$/.exec(s);
  const base = s.replace(/-(delay|offset)-\d+$/, '');
  return {name: s, base, delay: delay ? Number(delay[1]) : 0, offset: offset ? Number(offset[1]) : 0};
};

const PROP_KIND = {
  'promise-board': 'board',
  'queue-footprints': 'footprints',
  'slide-arrows': 'arrows',
  'swing-boundary': 'boundary',
  'swing-motion': 'swing',
};

export const normalizeTimeline = (tl) => {
  const issues = [];
  const comp = tl.composition ?? {};
  const meta = {
    id: comp.id ?? 'DinoPlaygroundSafety',
    fps: num(comp.fps, 24),
    width: num(comp.width, 1920),
    height: num(comp.height, 1080),
    durationInFrames: num(comp.durationInFrames, 0),
    audioSampleRate: num(comp.audioSampleRate, 48000),
    safeArea: num(comp.safeAreaPercent, 5) / 100,
    transitionFrames: num(tl.defaults?.transitionFrames, 12),
    subtitleBottom: num(tl.defaults?.subtitleBottomPercent, 10) / 100,
    subtitleMaxWidth: num(tl.defaults?.subtitleMaxWidthPercent, 82) / 100,
    title: '성운이와 공룡 친구들의 놀이터 안전 약속',
  };
  const shots = asArray(tl.shots).map((s, index) => {
    if (typeof s.startFrame !== 'number' || typeof s.endFrame !== 'number') issues.push(`shot ${s.id ?? index + 1}: startFrame/endFrame 없음`);
    const cam = s.camera ?? {};
    const [scaleFrom, scaleTo] = range(cam, 'scale', 1);
    const [xFrom, xTo] = range(cam, 'x', 50, pct);
    const [yFrom, yTo] = range(cam, 'y', 50, pct);
    return {
      id: String(s.id),
      scene: s.scene ?? null,
      index,
      from: s.startFrame,
      durationInFrames: s.endFrame - s.startFrame,
      background: s.background ? String(s.background).replace(/^\.?\//, '') : null,
      camera: {type: cam.type ?? 'static', scaleFrom, scaleTo, xFrom, xTo, yFrom, yTo},
      characters: asArray(s.characters).map((c) => {
        const [xF, xT] = range(c, 'x', 50, pct);
        const [yF, yT] = range(c, 'y', 92, pct);
        const [sF, sT] = range(c, 'scale', 0.5);
        return {id: String(c.id), pose: String(c.pose ?? 'wait'), xFrom: xF, xTo: xT, yFrom: yF, yTo: yT, scaleFrom: sF, scaleTo: sT, facing: c.facing ?? 'front', animation: parseAnimation(c.animation)};
      }),
      props: asArray(s.props).map((p) => {
        const [oF, oT] = range(p, 'opacity', 1);
        const [aF, aT] = range(p, 'amplitude', num(p.amplitudeDegrees, 0));
        return {
          id: String(p.id),
          kind: PROP_KIND[p.id] ?? (p.type === 'background-region' ? 'swing' : 'image'),
          asset: p.asset ? String(p.asset).replace(/^\.?\//, '') : null,
          x: pct(num(p.x, 50)),
          y: pct(num(p.y, 90)),
          scale: num(p.scale, 0.3),
          opacityFrom: oF,
          opacityTo: oT,
          animation: parseAnimation(p.animation ?? 'idle'),
          amplitudeFrom: aF,
          amplitudeTo: aT,
          periodFrames: num(p.periodFrames, 84),
        };
      }),
      dialogue: asArray(s.dialogue).map(String),
      notes: s.notes ?? '',
    };
  });
  return {meta, shots, issues};
};

export const normalizeVoiceLines = (vl, fps) =>
  asArray(vl?.lines ?? vl).map((l) => ({
    id: String(l.id),
    speaker: String(l.speaker),
    speakers: asArray(l.renderAs).length ? asArray(l.renderAs).map(String) : [String(l.speaker)],
    text: String(l.text),
    emotion: l.emotion ?? null,
    from: Math.round(parseTimecode(l.start) * fps),
    to: Math.round(parseTimecode(l.end) * fps),
    startSec: parseTimecode(l.start),
    endSec: parseTimecode(l.end),
    audioFiles: asArray(l.audioFiles).map((p) => String(p).replace(/^\.?\//, '')),
  }));

export const voiceProfiles = (vl) => Object.fromEntries(Object.entries(vl?.profiles ?? {}).map(([k, v]) => [k, v.label ?? k]));
