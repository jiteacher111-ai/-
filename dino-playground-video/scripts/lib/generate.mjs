// 사본(source/, public/assets)을 읽어 src/generated/project-data.json 을 만든다 — Remotion 의 유일한 데이터 소스.
// 캐릭터 포즈 이름 → 컷아웃 파일 해석도 여기서 한다(React 와 QA 가 같은 결과를 쓰도록).
import fs from 'node:fs';
import path from 'node:path';
import {EXPECTED, PROJECT_DATA_FILE, PROJECT_DIR, PUBLIC_DIR, REQUIRED_FILES, exists, readJson, sourcePath, writeJson} from './paths.mjs';
import {directShot} from './director.mjs';
import {cropFallbacks, extractCrops, normalizeTimeline, normalizeVoiceLines, parseSrt, voiceProfiles} from './normalize.mjs';

export const CUTOUT_INDEX = path.join(PUBLIC_DIR, 'assets', 'characters', 'cutouts', 'index.json');
export const loadProductionConfig = () => readJson(path.join(PROJECT_DIR, 'production.config.json'));

const tryJson = (rel, problems) => {
  const p = sourcePath(rel);
  if (!exists(p)) return undefined;
  try {
    return readJson(p);
  } catch (e) {
    problems.push(`${rel}: JSON 파싱 실패 — ${e.message}`);
    return undefined;
  }
};
export const publicExists = (rel) => Boolean(rel) && exists(path.join(PUBLIC_DIR, rel));

/**
 * 타임라인의 pose 이름을 컷아웃으로 해석한다.
 * 1) crops.fallbacks ("karo.curious" → "karo.inspect") 를 반복 적용
 * 2) 목록에 없고 "-" 가 있으면 앞부분으로 재시도 ("curious-lean" → "curious")
 * 3) 전신 포즈면 그대로, 표정이면 클로즈업 숏에서만 흉상, 일반 숏에서는 expressionBodyPose 의 전신 포즈
 */
export const resolveSprite = ({character, pose, closeUp, cropsJson, cutouts, config}) => {
  const def = cropsJson?.characters?.[character];
  const trail = [pose];
  if (!def) return {file: null, kind: null, name: pose, trail, reason: `crops 에 캐릭터 ${character} 없음`};
  const fallbacks = cropFallbacks(cropsJson);
  const has = (kind, n) => (kind === 'action' ? Boolean(cutouts?.sprites?.[`${character}/action-${n}`]) : (def[`${kind}s`] ?? []).includes(n));
  // v2 동작 포즈 우선 지정 (예: karo.slide-seated → action:laugh-crouch — 낮게 웅크린 자세가 앉아서 내려오기에 가장 가깝다)
  const ov = config.poseOverrides?.[`${character}.${pose}`];
  if (ov && ov.startsWith('action:') && has('action', ov.slice(7))) return {file: cutouts.sprites[`${character}/action-${ov.slice(7)}`], kind: 'action', name: ov.slice(7), trail: [pose, `${ov}(poseOverrides)`], expression: null};
  let name = pose;
  for (let guard = 0; guard < 6; guard++) {
    if (has('pose', name) || has('expression', name)) break;
    const fb = fallbacks[`${character}.${name}`];
    if (fb) {
      name = fb.split('.').slice(1).join('.');
      trail.push(name);
      continue;
    }
    if (name.includes('-')) {
      name = name.split('-')[0];
      trail.push(name);
      continue;
    }
    break;
  }
  const file = (kind, n) => cutouts?.sprites?.[`${character}/${kind}-${n}`] ?? null;
  if (has('pose', name)) return {file: file('pose', name), kind: 'pose', name, trail, expression: null};
  if (has('expression', name) && closeUp) return {file: file('expression', name), kind: 'expression', name, trail, expression: name};
  // 일반(전신) 숏: 표정 이름이거나 해석되지 않은 감정 이름(예: tino.happy)이면 expressionBodyPose 로 전신 포즈 선택.
  // 대체 경로의 모든 이름을 원래 이름부터 차례로 확인한다 (seongun.happy → wave, karo.listen → wait).
  if (!closeUp || !has('expression', name)) {
    const map = config.expressionBodyPose ?? {};
    const isEmotion = has('expression', name) || trail.some((n) => map[n]);
    if (isEmotion) {
      const candidates = [...trail.flatMap((n) => map[n] ?? []), ...(map.default ?? ['wait'])];
      // "action:<이름>" 후보는 v2 동작 시트, 그 외는 v1 포즈
      const body = candidates.find((c) => (c.startsWith('action:') ? has('action', c.slice(7)) : has('pose', c)));
      if (body?.startsWith('action:')) return {file: file('action', body.slice(7)), kind: 'action', name: body.slice(7), trail: [...trail, `${body}(전신 숏)`], expression: name};
      if (body) return {file: file('pose', body), kind: 'pose', name: body, trail: [...trail, `${body}(전신 숏)`], expression: name};
    }
  }
  return {file: null, kind: null, name, trail, reason: `포즈/표정 ${pose} 를 해석하지 못함`};
};

export const nativeFacing = (config, character, kind, name, cutouts) => {
  if (kind === 'action') return cutouts?.meta?.[cutouts.sprites?.[`${character}/action-${name}`]]?.facing ?? 'front';
  const nf = config.nativeFacing ?? {};
  return nf[`${character}/${kind}-${name}`] ?? nf[`${character}/*`] ?? nf['*'] ?? 'front';
};

export const generateProjectData = () => {
  const problems = [];
  const config = loadProductionConfig();
  const missingRequired = REQUIRED_FILES.filter((f) => !exists(sourcePath(f)));
  const timeline = tryJson('data/timeline-v1.json', problems);
  const voice = tryJson('data/voice-lines.ko.json', problems);
  const cropsJson = tryJson('data/character-crops-v1.json', problems);
  tryJson('assets/manifest.json', problems);
  const srtPath = sourcePath('data/subtitles.ko.srt');
  const cutouts = exists(CUTOUT_INDEX) ? readJson(CUTOUT_INDEX) : {sprites: {}, meta: {}};

  const empty = {
    available: false,
    missingRequired,
    problems,
    meta: {id: 'DinoPlaygroundSafety', fps: EXPECTED.fps, width: EXPECTED.width, height: EXPECTED.height, durationInFrames: EXPECTED.durationInFrames, safeArea: 0.05, transitionFrames: 12, subtitleBottom: 0.1, subtitleMaxWidth: 0.82, title: '성운이와 공룡 친구들의 놀이터 안전 약속'},
    config,
    shots: [],
    voiceLines: [],
    subtitles: [],
    audioCues: [],
    spriteMeta: {},
    propMeta: {},
    speakerLabels: {},
  };
  if (!timeline) {
    writeJson(PROJECT_DATA_FILE, empty);
    return empty;
  }
  const {meta, shots, issues} = normalizeTimeline(timeline);
  problems.push(...issues);
  // 레이아웃 보정 (production.config.json layoutFixes) — 타이밍·대사는 건드리지 않고 위치만
  const layoutFixesApplied = [];
  for (const [shotId, fix] of Object.entries(config.layoutFixes ?? {})) {
    const s = shots.find((x) => x.id === shotId);
    if (!s || typeof fix !== 'object') continue;
    for (const [charId, vals] of Object.entries(fix.characters ?? {})) {
      const c = s.characters.find((x) => x.id === charId);
      if (!c) continue;
      const before = {};
      for (const [k, v] of Object.entries(vals)) {
        before[k] = Math.round(c[k] * 1000) / 10;
        c[k] = /^scale/.test(k) ? v : v / 100;
      }
      layoutFixesApplied.push({shot: shotId, character: charId, before, after: vals, reason: fix.reason});
    }
  }
  const closeUpTypes = config.closeUpCameraTypes ?? ['close-up'];
  for (const s of shots) {
    s.backgroundExists = publicExists(s.background);
    const closeUp = closeUpTypes.includes(s.camera.type);
    for (const c of s.characters) {
      const r = resolveSprite({character: c.id, pose: c.pose, closeUp, cropsJson, cutouts, config});
      c.sprite = r.file;
      c.spriteKind = r.kind;
      c.spriteName = r.name;
      c.resolution = r.trail.join(' → ') + (r.reason ? ` (${r.reason})` : '');
      c.flip = r.kind ? (c.facing === 'left' && nativeFacing(config, c.id, r.kind, r.name, cutouts) === 'right') || (c.facing === 'right' && nativeFacing(config, c.id, r.kind, r.name, cutouts) === 'left') : false;
    }
    for (const p of s.props) p.exists = p.asset ? publicExists(p.asset) : p.kind === 'swing';
  }
  const voiceLines = voice ? normalizeVoiceLines(voice, meta.fps) : [];
  for (const l of voiceLines) l.audio = l.audioFiles.map((f) => ({file: f, exists: publicExists(f)}));
  const subtitles = exists(srtPath) ? parseSrt(fs.readFileSync(srtPath, 'utf8'), meta.fps) : [];
  const audioCues = (config.audioCues ?? []).map((c) => ({
    kind: c.kind,
    file: c.file,
    from: Math.round(c.startSec * meta.fps),
    to: c.endSec !== undefined ? Math.round(c.endSec * meta.fps) : null,
    volume: c.volume ?? 1,
    exists: publicExists(c.file),
  }));
  // 소품 원본 크기: PNG 는 manifest 의 width/height, SVG 는 viewBox
  const propMeta = {};
  const manifest = tryJson('assets/manifest.json', []) ?? {};
  for (const a of manifest.existingAssets ?? []) {
    if (a.width && a.height) propMeta[a.path] = {width: a.width, height: a.height};
    if (/\.svg$/i.test(a.path) && publicExists(a.path)) {
      const vb = /viewBox="([\d.\s-]+)"/.exec(fs.readFileSync(path.join(PUBLIC_DIR, a.path), 'utf8'));
      if (vb) {
        const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
        propMeta[a.path] = {width: w, height: h};
      }
    }
  }

  // 스프라이트별 원본 방향 (동작 중 포즈가 바뀌어도 좌우 반전을 다시 계산하기 위해)
  const spriteFacing = {};
  for (const [key, rel] of Object.entries(cutouts.sprites ?? {})) {
    const [character, kn] = key.split('/');
    const kind = kn.split('-')[0];
    spriteFacing[rel] = nativeFacing(config, character, kind, kn.slice(kind.length + 1), cutouts);
  }
  // 멀티샷 컷 + 숏 사이 전환 (배경이 바뀔 때만 디졸브, 같은 장소는 컷)
  shots.forEach((s, i) => {
    s.transitionIn = i === 0 ? 'none' : shots[i - 1].background !== s.background || config.multiShot?.dissolveSameLocation ? 'dissolve' : 'cut';
    s.cuts = directShot(s, voiceLines, {spriteMeta: cutouts.meta ?? {}, propMeta, config, W: meta.width, H: meta.height});
  });

  const data = {
    available: shots.length > 0,
    missingRequired,
    problems,
    meta,
    config,
    shots,
    voiceLines,
    subtitles,
    audioCues,
    spriteMeta: cutouts.meta ?? {},
    propMeta,
    speakerLabels: voice ? voiceProfiles(voice) : {},
    layoutFixesApplied,
    spriteIndex: cutouts.sprites ?? {},
    spriteFacing,
  };
  writeJson(PROJECT_DATA_FILE, data);
  return data;
};

/** manifest.requiredExternalAudio + 대사 audioFiles + 설정의 audioCues 중 없는 파일. validate·render-final·qa 공통 기준. */
export const computeMissingAudio = (data) => {
  let manifest = {};
  try {
    manifest = exists(sourcePath('assets/manifest.json')) ? readJson(sourcePath('assets/manifest.json')) : {};
  } catch {
    /* validate 가 보고 */
  }
  const req = manifest.requiredExternalAudio ?? {};
  const voice = data.voiceLines.flatMap((l) => l.audio.filter((a) => !a.exists).map((a) => ({line: l.id, speaker: a.file.match(/_([a-z]+)\.wav$/i)?.[1] ?? l.speaker, text: l.text, file: a.file})));
  const music = asList(req.music).filter((f) => !publicExists(f));
  const sfx = asList(req.sfx).filter((f) => !publicExists(f));
  const cueOnly = data.audioCues.filter((c) => !c.exists && !music.includes(c.file) && !sfx.includes(c.file)).map((c) => c.file);
  const unique = (a) => [...new Set(a)];
  const allAudioPresent = data.available && data.voiceLines.length > 0 && voice.length === 0 && music.length === 0 && sfx.length === 0 && cueOnly.length === 0;
  return {voice, music: unique(music), sfx: unique(sfx), otherCues: unique(cueOnly), allAudioPresent};
};
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
