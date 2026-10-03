// 사본(source/, public/assets, public/characters)을 읽어 src/generated/project-data.json 을 만든다.
// 이 JSON 이 Remotion 컴포지션의 유일한 데이터 소스다. 입력이 없으면 available:false 로 기록한다.
import fs from 'node:fs';
import path from 'node:path';
import {EXPECTED, PROJECT_DATA_FILE, PUBLIC_CHAR_DIR, PUBLIC_DIR, REQUIRED_FILES, exists, readJson, sourcePath, writeJson} from './paths.mjs';
import {collectAudioCues, indexManifest, normalizeTimeline, normalizeVoiceLines, parseSrt} from './normalize.mjs';

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

/** public/ 아래 실제로 존재하는지 (assets/... 상대경로) */
const publicExists = (rel) => Boolean(rel) && exists(path.join(PUBLIC_DIR, rel));

export const generateProjectData = () => {
  const problems = [];
  const missingRequired = REQUIRED_FILES.filter((f) => !exists(sourcePath(f)));
  const manifest = tryJson('assets/manifest.json', problems);
  const timeline = tryJson('data/timeline-v1.json', problems);
  const voice = tryJson('data/voice-lines.ko.json', problems);
  const srtPath = sourcePath('data/subtitles.ko.srt');

  const manifestIndex = indexManifest(manifest ?? {});
  const empty = {
    available: false,
    missingRequired,
    problems,
    meta: {fps: EXPECTED.fps, width: EXPECTED.width, height: EXPECTED.height, durationInFrames: EXPECTED.durationInFrames, title: '성운이와 공룡 친구들의 놀이터 안전 약속'},
    shots: [],
    voiceLines: [],
    subtitles: [],
    audioCues: [],
    sprites: {},
    spriteMeta: {},
  };
  if (!timeline) {
    writeJson(PROJECT_DATA_FILE, empty);
    return empty;
  }

  const {meta, shots, issues} = normalizeTimeline(timeline, manifestIndex);
  problems.push(...issues);
  const voiceLines = voice ? normalizeVoiceLines(voice, meta.fps, manifestIndex) : [];
  // 대사 시간이 voice-lines 에 없으면 SRT 에서 같은 문구를 찾아 채운다 (문구는 바꾸지 않는다)
  const subtitles = exists(srtPath) ? parseSrt(fs.readFileSync(srtPath, 'utf8'), meta.fps) : [];
  for (const l of voiceLines) {
    if (l.from === null) {
      const cue = subtitles.find((c) => c.text.replace(/\s+/g, '') === l.text.replace(/\s+/g, '') || c.text.replace(/\s+/g, '').includes(l.text.replace(/\s+/g, '')));
      if (cue) Object.assign(l, {from: cue.from, to: cue.to, timingFrom: 'srt'});
    }
    l.audioExists = publicExists(l.audio);
  }
  const audioCues = collectAudioCues(timeline, shots, meta.fps, manifestIndex).map((c) => ({...c, exists: publicExists(c.asset)}));
  for (const s of shots) {
    s.backgroundExists = publicExists(s.background);
    for (const p of s.props) p.exists = publicExists(p.asset);
  }

  const spriteIndexFile = path.join(PUBLIC_CHAR_DIR, 'index.json');
  const spriteIndex = exists(spriteIndexFile) ? readJson(spriteIndexFile) : {sprites: {}, meta: {}};

  const data = {
    available: shots.length > 0,
    missingRequired,
    problems,
    meta,
    shots,
    voiceLines,
    subtitles,
    audioCues,
    sprites: spriteIndex.sprites,
    spriteMeta: spriteIndex.meta,
  };
  writeJson(PROJECT_DATA_FILE, data);
  return data;
};

/** 누락 오디오 (대사 · 타임라인 음악/효과음 · manifest 에 등록된 오디오). validate 와 render-final 이 같은 기준을 쓴다. */
export const computeMissingAudio = (data) => {
  const AUDIO_RE = /\.(wav|mp3|m4a|aac|ogg|flac)$/i;
  let manifestAudio = [];
  const mp = sourcePath('assets/manifest.json');
  if (exists(mp)) {
    try {
      manifestAudio = indexManifest(readJson(mp)).all.filter((a) => AUDIO_RE.test(a.path));
    } catch {
      /* validate 가 JSON 오류를 보고 */
    }
  }
  const rel = (p) => (p.startsWith('assets/') ? p : `assets/${p.replace(/^\.?\//, '')}`);
  const voice = data.voiceLines.filter((l) => !l.audioExists).map((l) => ({id: l.id, speaker: l.speaker, text: l.text, expectedPath: l.audio ?? '(voice-lines 에 파일 경로 없음)'}));
  const musicAndSfx = [
    ...data.audioCues.filter((c) => !c.exists).map((c) => ({kind: c.kind, expectedPath: c.asset, from: c.from})),
    ...manifestAudio.filter((a) => !publicExists(rel(a.path))).map((a) => ({kind: a.type ?? 'audio', expectedPath: rel(a.path), id: a.id})),
  ].filter((v, i, arr) => arr.findIndex((o) => o.expectedPath === v.expectedPath) === i);
  const allAudioPresent = data.available && data.voiceLines.length > 0 && voice.length === 0 && musicAndSfx.length === 0;
  return {voice, musicAndSfx, allAudioPresent};
};
