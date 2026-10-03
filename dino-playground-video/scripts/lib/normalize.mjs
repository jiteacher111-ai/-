// 원본 JSON/SRT 를 Remotion 이 읽는 단일 정규화 스키마(src/types.ts)로 변환한다.
// 원본 스키마를 아직 받지 못했기 때문에 흔히 쓰이는 필드명 여러 개를 허용한다.
// 실제 파일 필드명이 다르면 이 파일의 pick(...) 후보 목록만 고치면 된다.

export const pick = (obj, keys, fallback = undefined) => {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return fallback;
};

/** "00:01:02,500" | "01:02.5" | "62.5" → 초 */
export const parseTimecode = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(',', '.');
  if (!s.includes(':')) return Number(s);
  return s.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
};

const FRAME_KEYS = {
  start: ['startFrame', 'fromFrame', 'from', 'inFrame', 'frameStart', 'atFrame', 'frame'],
  end: ['endFrame', 'toFrame', 'outFrame', 'frameEnd'],
  dur: ['durationInFrames', 'durationFrames', 'frames', 'lengthFrames'],
};
const SEC_KEYS = {
  start: ['start', 'startSec', 'startTime', 'in', 'tStart', 'time', 'at'],
  end: ['end', 'endSec', 'endTime', 'out', 'tEnd'],
  dur: ['duration', 'durationSec', 'length'],
};

/** 프레임/초 어느 쪽으로 적혀 있어도 {from, to} 프레임 구간으로 변환 */
export const readSpan = (obj, fps) => {
  const f = (keys) => pick(obj, keys);
  const sec = (keys) => {
    const v = f(keys);
    return v === undefined ? undefined : Math.round(parseTimecode(v) * fps);
  };
  let from = f(FRAME_KEYS.start) ?? sec(SEC_KEYS.start);
  let to = f(FRAME_KEYS.end) ?? sec(SEC_KEYS.end);
  const dur = f(FRAME_KEYS.dur) ?? sec(SEC_KEYS.dur);
  if (from !== undefined && to === undefined && dur !== undefined) to = from + dur;
  if (from === undefined && to !== undefined && dur !== undefined) from = to - dur;
  return {from: from === undefined ? undefined : Number(from), to: to === undefined ? undefined : Number(to), dur};
};

export const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

export const slug = (s) =>
  String(s)
    .trim()
    .replace(/[\\/\s]+/g, '_')
    .replace(/[^\p{L}\p{N}_.-]/gu, '')
    .toLowerCase();

export const spriteKey = (character, pose, expression) =>
  [character, pose ?? 'default', expression ?? 'default'].map((x) => slug(x ?? 'default')).join('|');

// ---------------------------------------------------------------- manifest
/** manifest.json 을 재귀 탐색해 {id → 상대경로} 맵을 만든다. */
export const indexManifest = (manifest) => {
  const byId = new Map();
  const all = [];
  const walk = (node, keyHint, typeHint) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, undefined, typeHint));
    if (typeof node === 'string') {
      if (/\.(png|jpe?g|webp|svg|wav|mp3|m4a|aac|ogg|flac|mp4|webm)$/i.test(node) && keyHint) {
        const entry = {id: keyHint, path: node, type: typeHint};
        all.push(entry);
        byId.set(keyHint, entry);
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    const p = pick(node, ['path', 'file', 'src', 'filename', 'url']);
    if (typeof p === 'string') {
      const id = String(pick(node, ['id', 'key', 'name'], keyHint ?? p));
      const entry = {...node, id, path: p, type: pick(node, ['type', 'kind', 'category'], typeHint)};
      all.push(entry);
      byId.set(id, entry);
      if (keyHint && keyHint !== id) byId.set(keyHint, entry);
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, k, typeof v === 'object' && !Array.isArray(v) ? typeHint ?? k : typeHint ?? k);
  };
  walk(manifest);
  return {byId, all};
};

/** 참조 문자열(자산 id 또는 경로)을 작업공간 기준 상대경로로 */
export const resolveAssetRef = (ref, manifestIndex) => {
  if (!ref) return null;
  if (typeof ref === 'object') ref = pick(ref, ['asset', 'id', 'path', 'file', 'src']);
  if (typeof ref !== 'string') return null;
  const hit = manifestIndex.byId.get(ref);
  let p = hit ? hit.path : ref;
  p = p.replace(/^\.\//, '').replace(/^\//, '');
  if (!p.startsWith('assets/') && !/^(data|docs)\//.test(p)) p = `assets/${p}`;
  return p;
};

// ---------------------------------------------------------------- crops
/**
 * character-crops-v1.json 에서 크롭 사각형을 모두 찾는다.
 * {x|left, y|top, w|width, h|height} 를 가진 객체 = 크롭 하나.
 * source/character/pose/expression 은 가장 가까운 조상에게서 상속한다.
 */
export const extractCrops = (cropsJson) => {
  const crops = [];
  const CONTAINER_FIELD = [
    [/^characters?$/i, 'character'],
    [/^poses?$/i, 'pose'],
    [/^(expressions?|faces?|emotions?)$/i, 'expression'],
  ];
  const inheritFields = (n, c) => {
    const out = {...c};
    const src = pick(n, ['source', 'sheet', 'image', 'sourceImage', 'file', 'src']);
    if (typeof src === 'string') out.source = src;
    for (const [field, keys] of [
      ['character', ['character', 'characterId', 'char']],
      ['pose', ['pose']],
      ['expression', ['expression', 'face', 'emotion']],
    ]) {
      const v = pick(n, keys);
      if (typeof v === 'string') out[field] = v;
    }
    for (const k of ['threshold', 'margin', 'padding', 'feather']) if (typeof n[k] === 'number') out[k] = n[k];
    return out;
  };
  const readBox = (n) => {
    const b = n.box ?? n.rect ?? n.bbox ?? n.crop ?? n.region ?? n;
    if (Array.isArray(b)) return b.length === 4 && b.every((v) => typeof v === 'number') ? b : null;
    let x = pick(b, ['x', 'left']);
    let y = pick(b, ['y', 'top']);
    let w = pick(b, ['w', 'width']);
    let h = pick(b, ['h', 'height']);
    const x2 = pick(b, ['x2', 'right']);
    const y2 = pick(b, ['y2', 'bottom']);
    if (w === undefined && typeof x2 === 'number' && typeof x === 'number') w = x2 - x;
    if (h === undefined && typeof y2 === 'number' && typeof y === 'number') h = y2 - y;
    return [x, y, w, h].every((v) => typeof v === 'number') && w > 0 && h > 0 ? [x, y, w, h] : null;
  };
  // key: 이 노드의 키, container: 이 노드를 담고 있는 객체/배열의 키
  const go = (n, ctx, key, container) => {
    const numericBox = Array.isArray(n) && n.length === 4 && n.every((v) => typeof v === 'number');
    if (Array.isArray(n) && !numericBox) return n.forEach((item) => go(item, {...ctx, arrayOf: key}, undefined, container));
    if (!n || typeof n !== 'object') return;
    let c = {...ctx};
    delete c.arrayOf;
    if (key !== undefined && container !== undefined) {
      for (const [re, field] of CONTAINER_FIELD) if (re.test(container)) c[field] = key;
    }
    const box = readBox(n);
    // {characters: [{id: 'seongun', poses: ...}]} 처럼 배열 안 항목의 id 가 이름인 경우
    if (key === undefined && ctx.arrayOf && !box) {
      const name = pick(n, ['id', 'name', 'key']);
      for (const [re, field] of CONTAINER_FIELD) if (re.test(ctx.arrayOf) && typeof name === 'string') c[field] = name;
    }
    c = inheritFields(n, c);
    if (box) {
      const [x, y, w, h] = box;
      const explicitId = Array.isArray(n) ? undefined : pick(n, ['id', 'name', 'key']);
      const id = String(explicitId ?? ([c.character, c.pose, c.expression].filter(Boolean).join('_') || key));
      crops.push({
        id,
        source: c.source,
        character: c.character ?? id.split(/[_-]/)[0],
        pose: c.pose ?? 'default',
        expression: c.expression ?? 'default',
        rect: {x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h)},
        threshold: c.threshold,
        margin: c.margin ?? c.padding,
        feather: c.feather,
      });
      return;
    }
    for (const [k, v] of Object.entries(n)) if (v && typeof v === 'object') go(v, c, k, key);
  };
  // 최상위 객체의 자식은 container = 최상위 키
  if (Array.isArray(cropsJson)) go(cropsJson, {}, undefined, undefined);
  else for (const [k, v] of Object.entries(cropsJson ?? {})) if (v && typeof v === 'object') go(v, inheritFields(cropsJson, {}), k, undefined);
  return crops;
};

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
    cues.push({
      index: Number(lines[0]) || cues.length + 1,
      startSec,
      endSec,
      from: Math.round(startSec * fps),
      to: Math.round(endSec * fps),
      text: lines.slice(ti + 1).join('\n'),
    });
  }
  return cues;
};

// ---------------------------------------------------------------- timeline
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const normCharacter = (c, meta) => {
  if (typeof c === 'string') return {character: c, pose: 'default', expression: 'default', x: 0.5, y: 0.92, scale: 0.55, flip: false, enter: null, expressions: []};
  const character = String(pick(c, ['character', 'id', 'name', 'char']));
  let x = num(pick(c, ['x', 'posX', 'centerX']), 0.5);
  let y = num(pick(c, ['y', 'posY', 'baseline', 'footY']), 0.92);
  if (x > 1.5) x = x / meta.width;
  if (y > 1.5) y = y / meta.height;
  let scale = num(pick(c, ['scale', 'height', 'heightRatio', 'size']), 0.55);
  if (scale > 1.5) scale = scale / meta.height; // 픽셀 높이로 적힌 경우
  const facing = pick(c, ['facing', 'direction']);
  const flip = Boolean(pick(c, ['flip', 'flipX', 'mirror'], facing === 'left'));
  const expressions = asArray(pick(c, ['expressionChanges', 'expressionTimeline', 'faces'])).map((e) => ({
    at: readSpan(e, meta.fps).from ?? 0,
    expression: String(pick(e, ['expression', 'face', 'value'])),
  }));
  const move = pick(c, ['move', 'moveTo', 'motion']);
  return {
    character,
    sprite: pick(c, ['sprite', 'crop', 'cropId', 'cutout']) ?? null,
    pose: String(pick(c, ['pose'], 'default')),
    expression: String(pick(c, ['expression', 'face', 'emotion'], 'default')),
    x,
    y,
    scale,
    flip,
    z: num(pick(c, ['z', 'zIndex', 'layer']), 0),
    enter: pick(c, ['enter', 'entrance', 'enterFrom'], null),
    exit: pick(c, ['exit', 'exitTo'], null),
    move: move && typeof move === 'object' ? {x: num(move.x, x) > 1.5 ? move.x / meta.width : num(move.x, x), y: num(move.y, y) > 1.5 ? move.y / meta.height : num(move.y, y)} : null,
    expressions,
  };
};

const normOverlay = (o, meta) => {
  if (typeof o === 'string') return {type: o, label: null, rect: null, from: null, to: null, icon: null};
  const r = o.rect ?? o.zone ?? o.area ?? o;
  let rx = pick(r, ['x', 'left']);
  let ry = pick(r, ['y', 'top']);
  let rw = pick(r, ['w', 'width']);
  let rh = pick(r, ['h', 'height']);
  let rect = null;
  if ([rx, ry, rw, rh].every((n) => typeof n === 'number')) {
    if (rx > 1.5 || rw > 1.5) [rx, rw] = [rx / meta.width, rw / meta.width];
    if (ry > 1.5 || rh > 1.5) [ry, rh] = [ry / meta.height, rh / meta.height];
    rect = {x: rx, y: ry, w: rw, h: rh};
  }
  const span = readSpan(o, meta.fps);
  return {
    type: String(pick(o, ['type', 'kind', 'style'], 'zone')),
    label: pick(o, ['label', 'text', 'caption'], null),
    icon: pick(o, ['icon', 'symbol'], null),
    shape: pick(o, ['shape'], 'ellipse'),
    rect,
    from: span.from ?? null,
    to: span.to ?? null,
  };
};

/**
 * @returns {{meta, shots, issues}}  shots 의 from/durationInFrames 는 전체 영상 기준 절대 프레임
 */
export const normalizeTimeline = (tl, manifestIndex) => {
  const issues = [];
  const fps = num(pick(tl, ['fps', 'frameRate']), 24);
  const meta = {
    fps,
    width: num(pick(tl, ['width']), pick(tl.resolution ?? {}, ['width']) ?? 1920),
    height: num(pick(tl, ['height']), pick(tl.resolution ?? {}, ['height']) ?? 1080),
    durationInFrames: 0,
    title: pick(tl, ['title', 'name'], '성운이와 공룡 친구들의 놀이터 안전 약속'),
  };
  const rawShots = asArray(pick(tl, ['shots', 'scenes', 'timeline', 'items']));
  if (!rawShots.length) issues.push('timeline: shots/scenes 배열을 찾지 못함');
  let cursor = 0;
  const shots = rawShots.map((s, i) => {
    const span = readSpan(s, fps);
    const from = span.from ?? cursor;
    const to = span.to ?? (span.dur !== undefined ? from + span.dur : undefined);
    if (to === undefined) issues.push(`shot ${i + 1}: 길이(end/duration)를 찾지 못함`);
    const durationInFrames = (to ?? from) - from;
    cursor = from + durationInFrames;
    const bgRef = pick(s, ['background', 'bg', 'backgroundId', 'backgroundAsset', 'set']);
    const cam = pick(s, ['camera', 'cam'], {}) ?? {};
    const pb = pick(s, ['promiseBoard', 'promise_board', 'board']);
    const promises = pick(s, ['promises']);
    return {
      id: String(pick(s, ['id', 'shotId', 'shot', 'code'], `S${String(i + 1).padStart(2, '0')}`)),
      index: i,
      title: pick(s, ['title', 'name', 'beat', 'description'], ''),
      from,
      durationInFrames,
      background: resolveAssetRef(bgRef, manifestIndex),
      backgroundRef: bgRef ?? null,
      camera: {
        zoomFrom: num(pick(cam, ['zoomFrom', 'zoomStart', 'zoom']), 1),
        zoomTo: num(pick(cam, ['zoomTo', 'zoomEnd', 'zoom']), 1),
        panXFrom: num(pick(cam, ['panXFrom', 'panFrom', 'panX']), 0),
        panXTo: num(pick(cam, ['panXTo', 'panTo', 'panX']), 0),
        panYFrom: num(pick(cam, ['panYFrom', 'panY']), 0),
        panYTo: num(pick(cam, ['panYTo', 'panY']), 0),
        type: typeof cam === 'string' ? cam : pick(cam, ['type', 'move'], null),
      },
      transition: pick(s, ['transition', 'transitionIn'], null),
      characters: asArray(pick(s, ['characters', 'cast', 'actors'])).map((c) => normCharacter(c, meta)),
      props: asArray(pick(s, ['props', 'objects'])).map((p) => ({
        asset: resolveAssetRef(typeof p === 'string' ? p : pick(p, ['asset', 'id', 'src', 'path', 'file']), manifestIndex),
        x: num(p?.x, 0.5) > 1.5 ? p.x / meta.width : num(p?.x, 0.5),
        y: num(p?.y, 0.9) > 1.5 ? p.y / meta.height : num(p?.y, 0.9),
        scale: num(p?.scale, 0.25),
        flip: Boolean(p?.flip),
      })),
      overlays: asArray(pick(s, ['overlays', 'overlay', 'safety', 'safetyOverlay', 'graphics'])).map((o) => normOverlay(o, meta)),
      promiseBoard:
        pb || promises
          ? {
              title: pick(pb ?? {}, ['title'], '놀이터 안전 약속'),
              items: asArray(pick(pb ?? {}, ['items', 'promises', 'lines'], promises)).map((it) =>
                typeof it === 'string' ? it : String(pick(it, ['text', 'label', 'title'], '')),
              ),
              revealed: num(pick(pb ?? {}, ['revealed', 'revealCount', 'highlight']), undefined),
              revealFrames: asArray(pick(pb ?? {}, ['revealAt', 'revealFrames'])).map((v) => (typeof v === 'number' && Number.isInteger(v) ? v : Math.round(parseTimecode(v) * fps))),
            }
          : null,
      lineIds: asArray(pick(s, ['lines', 'lineIds', 'dialogue', 'voiceLines', 'voice'])).map((l) => (typeof l === 'string' ? l : String(pick(l, ['id', 'lineId'], '')))),
      audio: {
        music: pick(s, ['music', 'bgm'], null),
        sfx: asArray(pick(s, ['sfx', 'soundEffects'])),
      },
    };
  });
  meta.durationInFrames = num(pick(tl, ['durationInFrames', 'totalFrames']), undefined) ?? (pick(tl, ['duration', 'durationSec']) !== undefined ? Math.round(parseTimecode(pick(tl, ['duration', 'durationSec'])) * fps) : cursor);
  return {meta, shots, issues};
};

export const normalizeVoiceLines = (vl, fps, manifestIndex) => {
  const arr = asArray(Array.isArray(vl) ? vl : pick(vl, ['lines', 'voiceLines', 'items', 'dialogue']));
  return arr.map((l, i) => {
    const span = readSpan(l, fps);
    const audioRef = pick(l, ['audio', 'file', 'path', 'src', 'wav', 'voiceFile']);
    return {
      id: String(pick(l, ['id', 'lineId', 'key'], `L${String(i + 1).padStart(3, '0')}`)),
      speaker: String(pick(l, ['speaker', 'character', 'role', 'who'], '')),
      text: String(pick(l, ['text', 'line', 'ko', 'script'], '')),
      from: span.from ?? null,
      to: span.to ?? null,
      expression: pick(l, ['expression', 'face', 'emotion'], null),
      audio: audioRef ? resolveAssetRef(audioRef, manifestIndex) : null,
      shot: pick(l, ['shot', 'shotId'], null),
    };
  });
};

/** 타임라인/매니페스트에서 음악·효과음 큐를 모은다 */
export const collectAudioCues = (tl, shots, fps, manifestIndex) => {
  const cues = [];
  const top = asArray(pick(tl, ['audio', 'music', 'soundtrack', 'audioCues']));
  const flat = top.flatMap((a) => (a && typeof a === 'object' && !Array.isArray(a) && !pick(a, ['asset', 'file', 'src', 'path', 'id']) ? Object.values(a).flatMap(asArray) : [a]));
  for (const a of flat) {
    if (!a) continue;
    const span = typeof a === 'object' ? readSpan(a, fps) : {};
    cues.push({
      kind: String((typeof a === 'object' && pick(a, ['kind', 'type'])) || 'music'),
      asset: resolveAssetRef(typeof a === 'string' ? a : pick(a, ['asset', 'file', 'src', 'path', 'id']), manifestIndex),
      from: span.from ?? 0,
      to: span.to ?? null,
      volume: num(typeof a === 'object' ? a.volume : undefined, 1),
    });
  }
  for (const s of shots) {
    if (s.audio.music) cues.push({kind: 'music', asset: resolveAssetRef(s.audio.music, manifestIndex), from: s.from, to: s.from + s.durationInFrames, volume: 0.5});
    for (const fx of s.audio.sfx) {
      const span = typeof fx === 'object' ? readSpan(fx, fps) : {};
      const rel = span.from ?? 0;
      cues.push({kind: 'sfx', asset: resolveAssetRef(fx, manifestIndex), from: s.from + rel, to: null, volume: num(fx?.volume, 1)});
    }
  }
  return cues.filter((c) => c.asset);
};
